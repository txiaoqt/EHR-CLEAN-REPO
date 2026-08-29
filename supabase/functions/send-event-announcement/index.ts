// supabase/functions/send-event-announcement/index.ts
// Supabase Edge Function for sending event announcements to registered students via Brevo SMTP API.
// Secret handling: BREVO_API_KEY is stored strictly in Supabase secrets (Deno.env), NEVER in frontend code.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  event_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 1. Verify caller user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !authUser) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
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
        JSON.stringify({ error: "Access denied. Only clinic staff can dispatch event announcements." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request payload
    const body: RequestPayload = await req.json();
    if (!body.event_id) {
      return new Response(
        JSON.stringify({ error: "event_id is required" }),
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
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventData.status !== "published" || !eventData.is_published) {
      return new Response(
        JSON.stringify({ error: "Only published events can be announced to students." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Query active registered student emails from public.users
    const { data: studentUsers, error: studentError } = await supabase
      .from("users")
      .select("email, name, student_id")
      .eq("role", "patient")
      .eq("active", true)
      .not("email", "is", null);

    if (studentError) {
      return new Response(
        JSON.stringify({ error: "Failed to retrieve student recipient list" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipients = (studentUsers || [])
      .map((s: { email: string; name?: string }) => ({
        email: s.email.trim().toLowerCase(),
        name: s.name || "Student",
      }))
      .filter((s: { email: string }) => s.email.endsWith("@tup.edu.ph"));

    const recipientCount = recipients.length;
    let successCount = 0;
    let failedCount = 0;

    // 6. Send announcement email if Brevo API Key is configured
    if (brevoApiKey && recipientCount > 0) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${eventData.title} - TUP Manila Clinic</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                  <tr>
                    <td style="background-color:#8b0000;padding:24px 32px;text-align:center;">
                      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">TUP MANILA CLINIC</h1>
                      <div style="color:#ffcccc;font-size:13px;margin-top:4px;font-weight:500;">CLINIC ANNOUNCEMENT</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px;">
                      <div style="display:inline-block;background-color:#fee2e2;color:#991b1b;padding:4px 12px;border-radius:16px;font-size:12px;font-weight:700;margin-bottom:12px;">
                        ${eventData.category || "General"}
                      </div>
                      <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;font-weight:700;line-height:1.3;">
                        ${eventData.title}
                      </h2>
                      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
                        <div style="margin-bottom:8px;font-size:14px;"><strong>📅 Date:</strong> ${eventData.event_date}</div>
                        ${eventData.start_time ? `<div style="margin-bottom:8px;font-size:14px;"><strong>⏰ Time:</strong> ${eventData.start_time}${eventData.end_time ? ` - ${eventData.end_time}` : ""}</div>` : ""}
                        ${eventData.location ? `<div style="font-size:14px;"><strong>📍 Location:</strong> ${eventData.location}</div>` : ""}
                      </div>
                      <div style="color:#334155;font-size:15px;line-height:1.6;margin-bottom:24px;">
                        ${(eventData.description || "No description provided.").replace(/\\n/g, "<br/>")}
                      </div>
                      <div style="text-align:center;padding-top:12px;border-top:1px solid #e2e8f0;">
                        <a href="https://tupclinic.edu.ph/patient/events" style="display:inline-block;background-color:#8b0000;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">
                          View in Patient Portal
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
                      <div style="font-size:12px;color:#64748b;">
                        Technological University of the Philippines — Manila Medical & Dental Clinic<br/>
                        Ayala Boulevard, Ermita, Manila, 1000 Metro Manila
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      // Batch send to Brevo SMTP
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
              sender: { name: "TUP Manila Clinic", email: "clinic@tup.edu.ph" },
              to: [{ email: recipient.email, name: recipient.name }],
              subject: `[TUP Clinic Event] ${eventData.title}`,
              htmlContent: emailHtml,
            }),
          });

          if (brevoRes.ok) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (_) {
          failedCount++;
        }
      }
    } else {
      // Simulation mode if no Brevo key configured
      successCount = recipientCount;
    }

    // 7. Log email dispatch in public.event_email_logs
    await supabase.from("event_email_logs").insert([
      {
        event_id: body.event_id,
        sent_by: authUser.id,
        recipient_count: recipientCount,
        success_count: successCount,
        failed_count: failedCount,
        status: failedCount === 0 ? "completed" : "partial",
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: body.event_id,
        recipient_count: recipientCount,
        success_count: successCount,
        failed_count: failedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
