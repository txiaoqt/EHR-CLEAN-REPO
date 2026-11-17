// Emails the sign-in verification code for the caller's current session.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MESSAGES: Record<string, string> = {
  too_soon: "A code was just sent. Wait a minute before asking for another.",
  too_many: "Too many codes were requested for this sign-in. Sign in again.",
  no_session: "Your sign-in has expired. Sign in again.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { error: "Sign in again." });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return reply(401, { error: "Sign in again." });
    // getUser verified the token, so its session_id claim can be trusted.
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

    const { data, error } = await supabase.rpc("issue_login_code", { p_user: user.id, p_session: claims.session_id });
    if (error) throw error;
    if (data?.error === "already_verified") return reply(200, { sent: false, verified: true });
    if (data?.error) return reply(429, { error: MESSAGES[data.error] || "Could not send a code." });

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "api-key": Deno.env.get("BREVO_API_KEY") ?? "" },
      body: JSON.stringify({
        sender: { name: Deno.env.get("BREVO_SENDER_NAME") ?? "TUP Manila Clinic", email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "no-reply@tup-icare.tech" },
        to: [{ email: data.email }],
        subject: `Your iCARE sign-in code: ${data.code}`,
        htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:480px">
          <p>Use this code to finish signing in to TUP iCARE:</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#931b1b">${data.code}</p>
          <p>It expires in 10 minutes. If you did not just sign in, change your password and tell the clinic administrator.</p>
          <p style="font-size:12px;color:#64748b">Technological University of the Philippines &mdash; Manila Medical &amp; Dental Clinic</p></div>`,
      }),
    });
    if (!brevoRes.ok) {
      console.error("Brevo rejected login code", brevoRes.status, await brevoRes.text());
      return reply(502, { error: "The code email could not be sent. Try again in a moment." });
    }
    return reply(200, { sent: true });
  } catch (e) {
    console.error("send-login-code failed", e);
    return reply(500, { error: "Could not send a code. Try again." });
  }
});
