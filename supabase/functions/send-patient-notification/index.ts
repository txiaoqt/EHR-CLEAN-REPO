// supabase/functions/send-patient-notification/index.ts
// Supabase Edge Function for sending transactional patient notifications via Brevo SMTP API,
// strictly respecting public.patient_settings preferences (email_notifications, appointment_reminders, message_alerts).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AppointmentDetails {
  patient_name?: string;
  appointment_date: string;
  appointment_time: string;
  department: string;
  service_type?: string;
  appointment_type?: string;
  queue_number?: number | null;
  reference_code?: string | null;
  clinician_name?: string;
}

interface MessageDetails {
  patient_name?: string;
  sender_name: string;
  sender_role?: string;
  concern_type?: string;
  message_preview?: string;
  conversation_id?: string;
}

interface NotificationPayload {
  type: "appointment_confirmation" | "message_reply";
  patient_id: string;
  user_id?: string;
  recipient_email?: string;
  appointment_data?: AppointmentDetails;
  message_data?: MessageDetails;
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
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") ?? "TUP Manila Clinic";

    if (!brevoApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email delivery service is not configured (missing BREVO_API_KEY).",
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

    // 2. Parse request payload
    let body: NotificationPayload;
    try {
      body = await req.json();
    } catch (_) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON payload in request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body?.type || !body?.patient_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Fields 'type' and 'patient_id' are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPatientId = String(body.patient_id).trim();

    // 3. Query patient profile and recipient email
    let recipientEmail = body.recipient_email ? String(body.recipient_email).trim().toLowerCase() : "";
    let recipientName =
      body.appointment_data?.patient_name ||
      body.message_data?.patient_name ||
      "";

    // Query public.users
    const { data: userData } = await supabase
      .from("users")
      .select("id, name, email, patient_id")
      .or(`patient_id.eq.${cleanPatientId},id.eq.${cleanPatientId}`)
      .maybeSingle();

    if (userData) {
      if (!recipientEmail && userData.email) {
        recipientEmail = userData.email.trim().toLowerCase();
      }
      if (!recipientName && userData.name) {
        recipientName = userData.name.trim();
      }
    }

    // Fallback: Query public.patients
    if (!recipientName) {
      const { data: patientData } = await supabase
        .from("patients")
        .select("id, name")
        .eq("id", cleanPatientId)
        .maybeSingle();

      if (patientData?.name) {
        recipientName = patientData.name.trim();
      }
    }

    if (!recipientName) {
      recipientName = "Valued Student";
    }

    // 4. Query public.patient_settings for preference evaluation
    const { data: settings } = await supabase
      .from("patient_settings")
      .select("email_notifications, appointment_reminders, message_alerts, clinic_announcements")
      .eq("patient_id", cleanPatientId)
      .maybeSingle();

    // Default settings are true if record does not yet exist
    const emailNotificationsEnabled = settings ? Boolean(settings.email_notifications) : true;
    const appointmentRemindersEnabled = settings ? Boolean(settings.appointment_reminders) : true;
    const messageAlertsEnabled = settings ? Boolean(settings.message_alerts) : true;

    // Check Master Gate: email_notifications
    if (!emailNotificationsEnabled) {
      console.log(`Notification suppressed: email_notifications is disabled for patient ${cleanPatientId}`);
      return new Response(
        JSON.stringify({
          success: true,
          delivered: false,
          suppressed: true,
          reason: "Patient has disabled all email notifications in settings preferences.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check Specific Preference Gates
    if (body.type === "appointment_confirmation") {
      if (!appointmentRemindersEnabled) {
        console.log(`Notification suppressed: appointment_reminders is disabled for patient ${cleanPatientId}`);
        return new Response(
          JSON.stringify({
            success: true,
            delivered: false,
            suppressed: true,
            reason: "Patient has disabled appointment reminder notifications in settings preferences.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (body.type === "message_reply") {
      if (!messageAlertsEnabled) {
        console.log(`Notification suppressed: message_alerts is disabled for patient ${cleanPatientId}`);
        return new Response(
          JSON.stringify({
            success: true,
            delivered: false,
            suppressed: true,
            reason: "Patient has disabled direct inquiry and message alert notifications in settings preferences.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported notification type: ${body.type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Ensure valid recipient email
    if (!recipientEmail || !recipientEmail.includes("@")) {
      return new Response(
        JSON.stringify({
          success: false,
          delivered: false,
          error: `No valid email address found for patient ID ${cleanPatientId}.`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Build Branded Responsive HTML Content
    const tupLogoUrl = "https://bvvzrrcyulbezzexlmav.supabase.co/storage/v1/object/public/TUP-LOGO/tupehrlogo.jpg";
    let emailSubject = "";
    let emailHtml = "";

    if (body.type === "appointment_confirmation") {
      const appt = body.appointment_data || {
        appointment_date: "Scheduled Date",
        appointment_time: "Scheduled Time",
        department: "Medical Clinic",
      };

      emailSubject = `[TUP Manila Clinic] Appointment Confirmed - ${appt.appointment_date}`;

      const referenceOrQueueBlock = appt.queue_number
        ? `<tr>
            <td style="padding-bottom:12px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">QUEUE NUMBER</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:#8B0000;margin-top:2px;">#${appt.queue_number}</div>
            </td>
          </tr>`
        : appt.reference_code
        ? `<tr>
            <td style="padding-bottom:12px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">REFERENCE CODE</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#8B0000;margin-top:2px;">${appt.reference_code}</div>
            </td>
          </tr>`
        : "";

      emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
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
                APPOINTMENT CONFIRMATION &amp; REMINDER
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                Hello <strong>${recipientName}</strong>,
              </p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">
                Your clinic appointment has been successfully scheduled. Here are the details of your visit:
              </p>

              <!-- Appointment Details Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:18px 0 22px 0;border-collapse:separate;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      ${referenceOrQueueBlock}
                      <tr>
                        <td style="padding-bottom:12px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">DATE</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#1e293b;margin-top:2px;">${appt.appointment_date}</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">TIME SLOT</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#1e293b;margin-top:2px;">${appt.appointment_time}</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">DEPARTMENT / SERVICE</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#1e293b;margin-top:2px;">${appt.department} &mdash; ${appt.service_type || "General Consultation"}</div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">STATUS</div>
                          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#047857;margin-top:2px;">Scheduled</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#64748b;">
                Please arrive at the clinic 10-15 minutes before your scheduled slot. Bring your student ID and any relevant health records.
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;border-top:1px solid #e2e8f0;padding-top:20px;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" bgcolor="#8B0000" style="border-radius:6px;background-color:#8B0000;">
                          <a href="https://tup-icare.tech/patient/schedule" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;padding:12px 28px;display:inline-block;border-radius:6px;line-height:1.2;">
                            View Schedule in Portal
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
                Ayala Boulevard, Ermita, Manila, 1000 Metro Manila<br/>
                <span style="font-size:11px;color:#94a3b8;margin-top:4px;display:inline-block;">
                  You received this because appointment reminders are enabled in your <a href="https://tup-icare.tech/patient/settings" style="color:#64748b;text-decoration:underline;">Settings Preferences</a>.
                </span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    } else {
      // type === "message_reply"
      const msg = body.message_data || {
        sender_name: "Clinic Personnel",
        sender_role: "Staff",
        concern_type: "Clinic Inquiry",
        message_preview: "You have a new message from the clinic staff.",
      };

      emailSubject = `[TUP Manila Clinic] New Message: ${msg.concern_type || "Clinic Inquiry"}`;

      emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
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
                DIRECT INQUIRY &amp; MESSAGE ALERT
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                Hello <strong>${recipientName}</strong>,
              </p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">
                A clinic healthcare provider has responded to your consultation inquiry regarding <strong>${msg.concern_type || "Clinic Inquiry"}</strong>.
              </p>

              <!-- Message Preview Box -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:18px 0 22px 0;border-collapse:separate;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">FROM</div>
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#1e293b;margin-top:2px;">
                      ${msg.sender_name} <span style="font-weight:500;color:#64748b;font-size:13px;">(${msg.sender_role || "Staff"})</span>
                    </div>

                    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">MESSAGE EXCERPT</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#334155;line-height:1.6;font-style:italic;background-color:#ffffff;padding:12px 14px;border-radius:6px;border:1px solid #e2e8f0;">
                        &ldquo;${(msg.message_preview || "You have a new message.").replace(/\n/g, "<br/>")}&rdquo;
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;border-top:1px solid #e2e8f0;padding-top:20px;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" bgcolor="#8B0000" style="border-radius:6px;background-color:#8B0000;">
                          <a href="https://tup-icare.tech/patient/messages" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;padding:12px 28px;display:inline-block;border-radius:6px;line-height:1.2;">
                            Open Patient Messages
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
                Ayala Boulevard, Ermita, Manila, 1000 Metro Manila<br/>
                <span style="font-size:11px;color:#94a3b8;margin-top:4px;display:inline-block;">
                  You received this because message alerts are enabled in your <a href="https://tup-icare.tech/patient/settings" style="color:#64748b;text-decoration:underline;">Settings Preferences</a>.
                </span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    }

    // 7. Dispatch via Brevo SMTP API
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: brevoSenderName, email: brevoSenderEmail },
        to: [{ email: recipientEmail, name: recipientName }],
        subject: emailSubject,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoRes.ok) {
      const errorText = await brevoRes.text();
      console.error("Brevo notification delivery rejected:", {
        status: brevoRes.status,
        error: errorText,
        recipient: recipientEmail,
      });
      return new Response(
        JSON.stringify({
          success: false,
          delivered: false,
          error: "Brevo rejected notification delivery.",
          details: errorText,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brevoData = await brevoRes.json().catch(() => ({}));
    return new Response(
      JSON.stringify({
        success: true,
        delivered: true,
        type: body.type,
        patient_id: cleanPatientId,
        recipient_email: recipientEmail,
        messageId: brevoData?.messageId || null,
        message: "Patient notification delivered successfully.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-patient-notification uncaught error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "An internal server error occurred while processing patient notification.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
