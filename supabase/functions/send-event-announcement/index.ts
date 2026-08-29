// supabase/functions/send-event-announcement/index.ts
// Supabase Edge Function for sending event announcements to registered students via Brevo SMTP API.
// Secret handling: BREVO_API_KEY is stored strictly in Supabase secrets (Deno.env), NEVER in frontend code.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  event_id: string;
  selected_user_ids?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "no-reply@tup-icare.tech";
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") ?? "TUP iCare Clinic";

    // Validation: BREVO_API_KEY must be configured
    if (!brevoApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service is not configured.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 1. Verify caller user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !authUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify caller is Staff (Admin, Physician, or Nurse)
    const { data: adminRecord } = await supabase
      .from("admins")
      .select("id, name, role, email")
      .or(`auth_user_id.eq.${authUser.id},email.eq.${authUser.email}`)
      .maybeSingle();

    if (!adminRecord || !["admin", "physician", "nurse"].includes(adminRecord.role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Access denied. Only clinic staff can dispatch event announcements." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request payload
    let body: RequestPayload;
    try {
      body = await req.json();
    } catch (_) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON payload in request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body?.event_id) {
      return new Response(
        JSON.stringify({ success: false, error: "event_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Fetch event details
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", body.event_id)
      .single();

    if (eventError || !eventData) {
      return new Response(
        JSON.stringify({ success: false, error: "Event not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventData.status !== "published" || !eventData.is_published) {
      return new Response(
        JSON.stringify({ success: false, error: "Only published events can be announced." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Query active registered student emails from public.users (authoritative source)
    let userQuery = supabase
      .from("users")
      .select("id, email, name, student_id")
      .eq("role", "patient")
      .eq("active", true)
      .not("email", "is", null);

    if (Array.isArray(body.selected_user_ids) && body.selected_user_ids.length > 0) {
      userQuery = userQuery.in("id", body.selected_user_ids);
    }

    const { data: studentUsers, error: studentError } = await userQuery;

    if (studentError) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to retrieve student recipient list." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipients = (studentUsers || [])
      .map((s: { id: string; email: string; name?: string }) => ({
        id: s.id,
        email: s.email.trim().toLowerCase(),
        name: s.name || "Student",
      }))
      .filter((s: { email: string }) => s.email.endsWith("@tup.edu.ph"));

    const recipientCount = recipients.length;

    // Validation: Must have at least 1 eligible recipient
    if (recipientCount === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No registered TUP.edu.ph students are eligible to receive this announcement.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let successCount = 0;
    let failedCount = 0;
    const acceptedMessageIds: string[] = [];

    // Helper: format ISO date "YYYY-MM-DD" -> "Month DD, YYYY" (e.g. "September 16, 2026")
    const formatHumanDate = (dateStr: string): string => {
      if (!dateStr) return "";
      try {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
          ];
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1900) {
            return `${months[month - 1]} ${day}, ${year}`;
          }
        }
      } catch {
        // fallback to original string
      }
      return dateStr;
    };

    // Helper: format time "13:30:00" -> "1:30 PM"
    const formatTimePart = (timeStr: string): string => {
      if (!timeStr) return "";
      const parts = timeStr.split(":");
      if (parts.length >= 2) {
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        if (isNaN(hours)) return timeStr;
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}:${minutes} ${ampm}`;
      }
      return timeStr;
    };

    // Helper: format time range "13:30:00", "17:00:00" -> "1:30 PM – 5:00 PM"
    const formatHumanTimeRange = (startTime?: string, endTime?: string): string => {
      if (!startTime) return "";
      const formattedStart = formatTimePart(startTime);
      if (!endTime) return formattedStart;
      const formattedEnd = formatTimePart(endTime);
      return `${formattedStart} – ${formattedEnd}`;
    };

    const formattedDate = formatHumanDate(eventData.event_date);
    const formattedTime = formatHumanTimeRange(eventData.start_time, eventData.end_time);

    // 6. Build Branded, Email-Safe HTML Template
    const tupLogoUrl = "https://bvvzrrcyulbezzexlmav.supabase.co/storage/v1/object/public/TUP-LOGO/tupehrlogo.jpg";

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${eventData.title} - TUP Manila Clinic</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;color:#1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f4f6f9" style="background-color:#f4f6f9;padding:32px 16px;margin:0;">
    <tr>
      <td align="center" valign="top">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin:0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding:32px 24px 20px 24px;border-bottom:1px solid #f1f5f9;">
              <img src="${tupLogoUrl}" alt="TUP Manila Clinic" width="56" style="width:56px;max-width:56px;height:auto;display:block;margin:0 auto 14px auto;border-radius:6px;" />
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#8B0000;letter-spacing:0.5px;margin:0;line-height:1.2;">
                TUP MANILA CLINIC
              </div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-top:6px;">
                CLINIC ANNOUNCEMENT
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:28px 32px;">
              <!-- Category Badge -->
              <div style="display:inline-block;background-color:#f1f5f9;color:#475569;padding:4px 10px;border-radius:4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;margin-bottom:14px;">
                ${eventData.category || "General"}
              </div>

              <!-- Event Title -->
              <h1 style="margin:0 0 16px 0;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:1.3;word-break:break-word;">
                ${eventData.title}
              </h1>

              <!-- Event Details Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:18px 0 22px 0;border-collapse:separate;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <!-- Date -->
                      <tr>
                        <td style="padding-bottom:${formattedTime || eventData.location ? "12px" : "0"};">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">DATE</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1e293b;margin-top:2px;">${formattedDate}</div>
                        </td>
                      </tr>
                      ${formattedTime ? `
                      <!-- Time -->
                      <tr>
                        <td style="padding-bottom:${eventData.location ? "12px" : "0"};">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">TIME</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1e293b;margin-top:2px;">${formattedTime}</div>
                        </td>
                      </tr>` : ""}
                      ${eventData.location ? `
                      <!-- Location -->
                      <tr>
                        <td>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">LOCATION</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1e293b;margin-top:2px;word-break:break-word;">${eventData.location}</div>
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Description -->
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#334155;line-height:1.6;margin:0 0 24px 0;">
                ${(eventData.description || "No description provided.").replace(/\n/g, "<br/>")}
              </div>

              <!-- Call To Action Button -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;border-top:1px solid #e2e8f0;padding-top:20px;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" bgcolor="#8B0000" style="border-radius:6px;background-color:#8B0000;">
                          <a href="https://tupclinic.edu.ph/patient/events" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;padding:12px 28px;display:inline-block;border-radius:6px;line-height:1.2;">
                            View in Patient Portal
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" bgcolor="#f8fafc" style="background-color:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.5;margin:0;">
                Technological University of the Philippines &mdash; Manila Medical &amp; Dental Clinic<br/>
                Ayala Boulevard, Ermita, Manila, 1000 Metro Manila
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // 7. Dispatch to Brevo SMTP API with strict per-recipient accounting & messageId tracking
    for (const recipient of recipients) {
      try {
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "api-key": brevoApiKey,
          },
          body: JSON.stringify({
            sender: { name: brevoSenderName, email: brevoSenderEmail },
            to: [{ email: recipient.email, name: recipient.name }],
            subject: `[TUP Clinic Event] ${eventData.title}`,
            htmlContent: emailHtml,
          }),
        });

        if (brevoRes.ok) {
          const brevoData = await brevoRes.json().catch(() => null);
          if (brevoData?.messageId) {
            acceptedMessageIds.push(brevoData.messageId);
          }
          successCount++;
        } else {
          failedCount++;
          console.error("Brevo delivery submission rejected", {
            status: brevoRes.status,
            recipient: recipient.email,
          });
        }
      } catch (fetchErr) {
        failedCount++;
        console.error("Network / fetch exception for recipient", {
          recipient: recipient.email,
          error: fetchErr instanceof Error ? fetchErr.message : "Fetch exception",
        });
      }
    }

    // 8. Determine honest status & explicitly log in public.event_email_logs
    const logStatus =
      successCount === recipientCount && failedCount === 0
        ? "completed"
        : successCount > 0
          ? "partial"
          : "failed";

    let auditLogPersisted = false;

    try {
      const { error: insertError } = await supabase.from("event_email_logs").insert([
        {
          event_id: body.event_id,
          sent_by: authUser.id,
          recipient_count: recipientCount,
          success_count: successCount,
          failed_count: failedCount,
          status: logStatus,
        },
      ]);

      if (insertError) {
        console.error("Failed to persist event email audit log", {
          eventId: body.event_id,
          sentBy: authUser.id,
          error: insertError.message,
        });
      } else {
        auditLogPersisted = true;
      }
    } catch (dbErr) {
      console.error("Exception while persisting event email audit log", {
        eventId: body.event_id,
        sentBy: authUser.id,
        error: dbErr instanceof Error ? dbErr.message : "Database error",
      });
    }

    // 9. Return honest API response with explicit audit_log_persisted state and accepted submission semantics
    if (successCount === 0) {
      const responsePayload: Record<string, unknown> = {
        success: false,
        partial: false,
        event_id: body.event_id,
        recipient_count: recipientCount,
        success_count: 0,
        failed_count: failedCount,
        audit_log_persisted: auditLogPersisted,
        error: "Unable to submit the announcement. No messages were accepted by Brevo.",
      };
      if (!auditLogPersisted) {
        responsePayload.warning = "The delivery audit log could not be saved.";
      }
      return new Response(
        JSON.stringify(responsePayload),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (failedCount > 0) {
      const responsePayload: Record<string, unknown> = {
        success: false,
        partial: true,
        event_id: body.event_id,
        recipient_count: recipientCount,
        success_count: successCount,
        failed_count: failedCount,
        audit_log_persisted: auditLogPersisted,
        message: `Email announcement partially submitted. ${successCount} of ${recipientCount} messages were accepted by Brevo, ${failedCount} rejected.`,
      };
      if (!auditLogPersisted) {
        responsePayload.warning = "The email delivery result was recorded in memory, but the event audit log could not be saved.";
      }
      return new Response(
        JSON.stringify(responsePayload),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responsePayload: Record<string, unknown> = {
      success: true,
      partial: false,
      event_id: body.event_id,
      recipient_count: recipientCount,
      success_count: successCount,
      failed_count: 0,
      audit_log_persisted: auditLogPersisted,
      message: `Email announcement submitted successfully. ${successCount} of ${recipientCount} messages accepted by Brevo.`,
    };
    if (!auditLogPersisted) {
      responsePayload.warning = "Email delivery succeeded, but the event audit log could not be saved.";
    }

    return new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-event-announcement top-level error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected server error occurred while sending the announcement.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
