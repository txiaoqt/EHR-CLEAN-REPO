import { supabase } from '../supabaseClient.js';

/**
 * Client wrapper for the backup-control edge function.
 *
 * The browser never sees the GitHub token — it only ever receives normalised run
 * records. The function re-validates everything it is given, so this layer is
 * convenience rather than a security boundary.
 */

export const SAFE_BACKUP_ERRORS = {
  not_configured: 'Backup is not configured yet. Add the GitHub secrets to the backup function.',
  dispatch_disabled:
    'Starting a backup from here is not enabled yet. Run the workflow once from GitHub to validate it, then turn dispatch on.',
  forbidden: 'You do not have permission to manage backups.',
  unauthorized: 'Your session has expired. Please sign in again.',
  active_backup: 'A backup is already running.',
  workflow_unavailable: 'The backup workflow is not available. It must exist on the configured branch.',
  github_unavailable: 'GitHub is not reachable right now. Try refreshing in a moment.',
  control_unavailable: 'The backup service is unavailable. Try refreshing in a moment.',
  dispatch_uncertain:
    'The backup request could not be confirmed. Refresh the status before trying again — it may have started.',
};

export class BackupControlError extends Error {
  constructor(code) {
    super(SAFE_BACKUP_ERRORS[code] ?? SAFE_BACKUP_ERRORS.control_unavailable);
    this.code = code;
  }
}

const invoke = async (action) => {
  try {
    const { data, error } = await supabase.functions.invoke('backup-control', { body: { action } });
    if (error) {
      // The function returns { code, error }; prefer its code so the message
      // matches the real cause rather than a generic one.
      let code = 'control_unavailable';
      try {
        const body = error.context instanceof Response ? await error.context.clone().json() : null;
        if (body?.code && SAFE_BACKUP_ERRORS[body.code]) code = body.code;
      } catch (_) {
        // Keep the generic code.
      }
      throw new BackupControlError(code);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BackupControlError('control_unavailable');
    }
    return data;
  } catch (err) {
    if (err instanceof BackupControlError) throw err;
    throw new BackupControlError(action === 'dispatch' ? 'dispatch_uncertain' : 'control_unavailable');
  }
};

/** Re-validates a run before it is displayed, so a malformed record cannot render. */
const displayRun = (value) => {
  const run = value ?? {};
  const id = Number(run.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new BackupControlError('control_unavailable');
  if (!Number.isFinite(Date.parse(run.createdAt))) throw new BackupControlError('control_unavailable');

  let url;
  try {
    url = new URL(run.htmlUrl);
  } catch {
    throw new BackupControlError('control_unavailable');
  }
  // The link must point at a GitHub run for this id and nothing else — no query,
  // no fragment, no credentials in the URL.
  if (
    url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash ||
    !new RegExp(`^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/actions/runs/${id}$`).test(url.pathname)
  ) {
    throw new BackupControlError('control_unavailable');
  }

  return {
    id,
    runNumber: Number(run.runNumber) || 0,
    status: typeof run.status === 'string' ? run.status : 'unknown',
    conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    htmlUrl: url.href,
    headSha: typeof run.headSha === 'string' ? run.headSha : '',
  };
};

export const isBackupActive = (run) =>
  ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(run?.status);

export const backupStatusLabel = (run) => {
  if (!run) return 'No backup yet';
  if (run.status === 'in_progress') return 'Backup in progress';
  if (isBackupActive(run)) return 'Queued';
  if (run.status !== 'completed') return 'Status unavailable';
  if (run.conclusion === 'success') return 'Verified backup';
  if (run.conclusion === 'cancelled') return 'Cancelled';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)) return 'Failed';
  return run.conclusion === 'skipped' ? 'Skipped' : 'Not verified';
};

export const formatDuration = (run) => {
  if (!run) return '—';
  if (isBackupActive(run)) return 'In progress';
  const seconds = Math.max(0, Math.round((Date.parse(run.updatedAt) - Date.parse(run.createdAt)) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};

export async function fetchBackupRuns() {
  const result = await invoke('list_runs');
  if (!Array.isArray(result.runs)) throw new BackupControlError('control_unavailable');
  return {
    runs: result.runs.map(displayRun),
    activeBackup: result.activeBackup === true,
    dispatchEnabled: result.dispatchEnabled === true,
  };
}

export async function requestBackup() {
  const result = await invoke('dispatch');
  if (result.accepted !== true) throw new BackupControlError('dispatch_uncertain');
  return { accepted: true, runId: Number.isSafeInteger(result.runId) ? result.runId : null };
}
