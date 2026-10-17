// supabase/functions/backup-control/index.ts
//
// Lists and dispatches the manual backup workflow, so the Backup & Recovery page
// can show real run history and start a run without anyone opening GitHub.
//
// Adapted from the reference implementation, keeping the properties that matter:
//
//  - The GitHub token never reaches the browser. It lives only in this function's
//    environment, and the browser only ever sees normalised run records.
//  - The run link is CONSTRUCTED from validated identifiers rather than relayed
//    from the API response. A relayed URL is an open redirect waiting to happen.
//  - Config is validated before use: the repository must look like owner/name,
//    the workflow like a filename, and the ref must be free of git revision
//    syntax. A typo in an environment variable should fail loudly, not fetch
//    something unexpected.
//  - Dispatch is off unless explicitly enabled, so the page can be deployed and
//    reviewed before anyone can start a backup from it.
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   GITHUB_BACKUP_TOKEN         fine-grained PAT with Actions: read and write
//   GITHUB_BACKUP_REPOSITORY    owner/repo
//   GITHUB_BACKUP_WORKFLOW      backup.yml
//   GITHUB_BACKUP_REF           main
//   GITHUB_BACKUP_DISPATCH_ENABLED   'true' to allow starting runs

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const ACTIVE_STATUSES = ["queued", "in_progress", "requested", "waiting", "pending"];
const CONCLUSIONS = [
  "success", "failure", "cancelled", "timed_out",
  "action_required", "neutral", "skipped", "stale", "startup_failure",
];

const fail = (code: string, message: string, status: number) => json({ code, error: message }, status);

type Config = { token: string; repository: string; workflow: string; ref: string; dispatchEnabled: boolean };

function readConfig(): Config {
  const token = Deno.env.get("GITHUB_BACKUP_TOKEN")?.trim();
  const repository = Deno.env.get("GITHUB_BACKUP_REPOSITORY")?.trim();
  const workflow = Deno.env.get("GITHUB_BACKUP_WORKFLOW")?.trim();
  const ref = Deno.env.get("GITHUB_BACKUP_REF")?.trim();
  const dispatchEnabled = Deno.env.get("GITHUB_BACKUP_DISPATCH_ENABLED") === "true";

  const okRepo = Boolean(repository) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository!);
  const okWorkflow = Boolean(workflow) && /^[A-Za-z0-9_-]+\.ya?ml$/.test(workflow!);
  const okRef = Boolean(ref) && ref!.length <= 200 &&
    !/[\s~^:?*[\\]/.test(ref!) && !ref!.includes("..") && !ref!.startsWith("-") && !ref!.endsWith("/");

  if (!token || !okRepo || !okWorkflow || !okRef) {
    throw new Error("not_configured");
  }
  return { token: token!, repository: repository!, workflow: workflow!, ref: ref!, dispatchEnabled };
}

/** A normalised run — the only shape the browser ever receives. */
function normalizeRun(run: Record<string, unknown>, config: Config, workflowId: number) {
  const repo = (run.repository ?? {}) as Record<string, unknown>;
  const id = run.id;
  if (
    typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 ||
    typeof run.run_number !== "number" || run.workflow_id !== workflowId ||
    repo.full_name !== config.repository ||
    run.event !== "workflow_dispatch" ||
    typeof run.head_sha !== "string" || !/^[a-f0-9]{40}$/i.test(run.head_sha)
  ) {
    return null;
  }
  return {
    id,
    runNumber: run.run_number,
    status: [...ACTIVE_STATUSES, "completed"].includes(String(run.status)) ? String(run.status) : "unknown",
    conclusion: CONCLUSIONS.includes(String(run.conclusion)) ? String(run.conclusion) : null,
    createdAt: new Date(String(run.created_at)).toISOString(),
    updatedAt: new Date(String(run.updated_at)).toISOString(),
    // Built here, never taken from the response.
    htmlUrl: `https://github.com/${config.repository}/actions/runs/${id}`,
    headSha: String(run.head_sha).toLowerCase(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return fail("invalid_request", "Invalid request.", 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("unauthorized", "Sign in required.", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return fail("not_configured", "Backup service is not configured.", 503);

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return fail("unauthorized", "Your session is invalid or expired.", 401);

    // Staff only. The sidebar hides the page, but a hidden link is not access
    // control — this is.
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const role = String(profile?.role ?? "").toLowerCase();
    if (!["admin", "physician"].includes(role)) {
      return fail("forbidden", "You do not have permission to view backups.", 403);
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(await req.text());
    } catch {
      return fail("invalid_request", "Invalid request.", 400);
    }
    const action = String(body.action ?? "");
    if (!["list_runs", "dispatch"].includes(action)) {
      return fail("invalid_request", "Invalid request.", 400);
    }

    let config: Config;
    try {
      config = readConfig();
    } catch {
      return fail("not_configured", "Backup service is not configured.", 503);
    }

    const base = `https://api.github.com/repos/${config.repository}`;
    const workflowRoute = `/actions/workflows/${encodeURIComponent(config.workflow)}`;

    async function github(route: string, payload?: unknown): Promise<Record<string, unknown>> {
      let res: Response;
      try {
        res = await fetch(`${base}${route}`, {
          method: payload ? "POST" : "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${config.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(payload ? { "Content-Type": "application/json" } : {}),
          },
          ...(payload ? { body: JSON.stringify(payload) } : {}),
        });
      } catch {
        throw new Error(payload ? "dispatch_uncertain" : "github_unavailable");
      }
      if (!res.ok) {
        if (res.status === 404) throw new Error("workflow_unavailable");
        throw new Error(payload ? "dispatch_uncertain" : "github_unavailable");
      }
      if (res.status === 204) return {};
      try {
        return await res.json();
      } catch {
        throw new Error(payload ? "dispatch_uncertain" : "github_unavailable");
      }
    }

    const workflow = await github(workflowRoute);
    if (typeof workflow.id !== "number" || workflow.state !== "active") {
      throw new Error("workflow_unavailable");
    }
    const workflowId = workflow.id as number;

    async function anyActiveRun(): Promise<boolean> {
      // Query each active status directly: with a long history, a single page of
      // recent runs could miss an older queued one.
      for (const status of ACTIVE_STATUSES) {
        const result = await github(`${workflowRoute}/runs?status=${status}&per_page=1`);
        if (!Array.isArray(result.workflow_runs)) throw new Error("github_unavailable");
        if (result.workflow_runs.length > 0) return true;
      }
      return false;
    }

    if (action === "list_runs") {
      const result = await github(
        `${workflowRoute}/runs?event=workflow_dispatch&branch=${encodeURIComponent(config.ref)}&per_page=25`
      );
      if (!Array.isArray(result.workflow_runs)) throw new Error("github_unavailable");
      const runs = result.workflow_runs
        .map((run: Record<string, unknown>) => normalizeRun(run, config, workflowId))
        .filter(Boolean);
      const active = runs.some((r: { status: string }) => ACTIVE_STATUSES.includes(r.status)) || (await anyActiveRun());
      return json({ runs, activeBackup: active, dispatchEnabled: config.dispatchEnabled });
    }

    // dispatch
    if (!config.dispatchEnabled) {
      return fail(
        "dispatch_disabled",
        "Backup requests are not enabled yet. Run the workflow once from GitHub to validate it, then enable dispatch.",
        503
      );
    }
    if (await anyActiveRun()) {
      return fail("active_backup", "A backup is already in progress.", 409);
    }

    const dispatched = await github(`${workflowRoute}/dispatches`, { ref: config.ref });
    const runId = typeof dispatched.workflow_run_id === "number" ? dispatched.workflow_run_id : null;

    // An accepted dispatch must never become a retryable failure because the
    // audit write failed — that would invite a second backup.
    try {
      await supabase.from("audit_logs").insert([{
        user_name: user.email ?? "Staff",
        performed_by: user.email ?? "Staff",
        action: "Backup Requested",
        description: `Manual backup dispatched (${config.workflow} on ${config.ref})`,
        type: "backup",
      }]);
    } catch (_) {
      // Deliberately ignored; the dispatch already succeeded.
    }

    return json({ accepted: true, runId }, 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "control_unavailable";
    const messages: Record<string, [string, number]> = {
      not_configured: ["Backup service is not configured.", 503],
      workflow_unavailable: ["The backup workflow is not available. It must exist on the configured branch.", 503],
      github_unavailable: ["GitHub backup status is unavailable. Please try refreshing later.", 502],
      dispatch_uncertain: ["The backup request outcome could not be confirmed. Refresh status before trying again.", 502],
      control_unavailable: ["Backup service is unavailable. Please try refreshing later.", 503],
    };
    const [message, status] = messages[code] ?? messages.control_unavailable;
    return fail(code, message, status);
  }
});
