import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import {
  fetchBackupRuns,
  requestBackup,
  isBackupActive,
  backupStatusLabel,
  formatDuration,
  BackupControlError,
} from '../utils/backupControl.js';
import { AlertIcon, ClockIcon } from '../components/icons/Icons.jsx';
import ResultDialog from '../components/ResultDialog.jsx';
import TablePagination from '../components/table/TablePagination.jsx';

/**
 * Backup & Recovery.
 *
 * Shows the real workflow runs and can start one. The previous version was a
 * page of static explanation — "what is included", "what is not included" — which
 * told the reader nothing about whether a backup had actually happened. That
 * belongs in docs/BACKUP_RECOVERY.md, and it is there.
 *
 * What is left is the only question that matters operationally: did the last
 * backup succeed, and can I start one now.
 */
const BackupRecovery = () => {
  const [state, setState] = useState({ loading: true, error: null, runs: [], activeBackup: false, dispatchEnabled: false });
  // Read from the settings table, which the workflow writes to only after an
  // upload has been verified. Shown even when the run history is unavailable, so
  // the page is never blank about whether a backup has happened.
  const [recorded, setRecorded] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('key,value')
          .in('key', ['last_backup', 'last_backup_id']);
        if (!mounted || !data) return;
        const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
        if (map.last_backup) setRecorded({ at: map.last_backup, id: map.last_backup_id || null });
      } catch (_) {
        // The run history is the better source; this is a fallback.
      }
    })();
    return () => { mounted = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchBackupRuns();
      setState({ loading: false, error: null, ...data });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof BackupControlError ? err : new BackupControlError('control_unavailable') }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while something is running, so the page reflects the workflow without
  // anyone refreshing by hand. Stops on its own once nothing is active.
  useEffect(() => {
    const running = state.activeBackup || state.runs.some(isBackupActive);
    if (!running || state.error) return undefined;
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [state.activeBackup, state.runs, state.error, load]);

  const createBackup = async () => {
    if (busyRef.current || requesting) return;
    busyRef.current = true;
    setRequesting(true);
    setConfirming(false);
    try {
      await requestBackup();
      setResult({
        tone: 'success',
        title: 'Backup requested',
        message: 'The workflow was asked to run. It will appear in the history below once GitHub registers it.',
      });
      await load();
    } catch (err) {
      const safe = err instanceof BackupControlError ? err : new BackupControlError('control_unavailable');
      setResult({
        tone: safe.code === 'active_backup' ? 'info' : 'error',
        title: safe.code === 'active_backup' ? 'A backup is already running' : 'Backup request failed',
        message: safe.message,
      });
      await load();
    } finally {
      setRequesting(false);
      busyRef.current = false;
    }
  };

  const runs = state.runs;
  const activeRun = runs.find(isBackupActive);
  const latest = activeRun ?? runs[0];
  const blocked = state.loading || Boolean(state.error) || !state.dispatchEnabled || state.activeBackup || requesting;

  const statusTone = (run) => {
    if (!run) return 'neutral';
    if (isBackupActive(run)) return 'info';
    if (run.status === 'completed' && run.conclusion === 'success') return 'ok';
    if (run.status === 'completed' && ['failure', 'timed_out', 'startup_failure'].includes(run.conclusion)) return 'bad';
    return 'neutral';
  };

  const toneStyles = {
    ok: { color: 'var(--color-emerald-text)', background: 'var(--color-emerald-bg)' },
    bad: { color: 'var(--color-rose-text)', background: 'var(--color-rose-bg)' },
    info: { color: 'var(--text)', background: 'var(--surface-raised)' },
    neutral: { color: 'var(--text-muted)', background: 'var(--surface-raised)' },
  };

  const StatusPill = ({ run }) => {
    const tone = statusTone(run);
    return (
      <span
        className="backup-status-pill"
        style={{ ...toneStyles[tone] }}
      >
        {backupStatusLabel(run)}
      </span>
    );
  };

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Backup &amp; Recovery</h1>
            <div className="page-header-subtitle">
              Verified backups of the database and uploaded files, and how to restore them.
            </div>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn secondary" onClick={load} disabled={state.loading}>
              {state.loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {state.loading && (
          <div className="card settings-card" role="status">
            <div style={{ marginBottom: recorded ? 16 : 0 }}>
              {recorded ? (
                <>
                  <div className="settings-identity" style={{ marginBottom: 14 }}>
                    <div className="settings-identity-label">Last verified backup</div>
                    <div className="settings-identity-body">
                      <div>
                        <div className="settings-identity-name" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(recorded.at).toLocaleString()}
                        </div>
                        {recorded.id && <div className="settings-identity-meta">Run {recorded.id}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="settings-row-note" style={{ margin: 0 }}>
                    Loading run history from GitHub…
                  </div>
                </>
              ) : (
                'Loading backup history…'
              )}
            </div>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="card settings-card" role="alert">
            <header className="settings-card-head" style={{ marginBottom: 10 }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertIcon size={18} />
                {state.error.code === 'not_configured' ? 'Live run history is not available yet' : 'Backup information unavailable'}
              </h2>
              <p>{state.error.message}</p>
            </header>

            {recorded && (
              <div className="settings-identity" style={{ marginBottom: 14 }}>
                <div className="settings-identity-label">Last verified backup</div>
                <div className="settings-identity-body">
                  <div>
                    <div className="settings-identity-name" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(recorded.at).toLocaleString()}
                    </div>
                    {recorded.id && <div className="settings-identity-meta">Run {recorded.id}</div>}
                  </div>
                </div>
              </div>
            )}

            <div className="settings-callout" style={{ marginTop: 0 }}>
              {state.error.code === 'not_configured' ? (
                <>
                  Set <code>GITHUB_BACKUP_TOKEN</code>, <code>GITHUB_BACKUP_REPOSITORY</code>,{' '}
                  <code>GITHUB_BACKUP_WORKFLOW</code> and <code>GITHUB_BACKUP_REF</code> as secrets on the{' '}
                  <code>backup-control</code> function, then deploy it:{' '}
                  <code>supabase functions deploy backup-control</code>.{' '}
                  <code>docs/BACKUP_RECOVERY.md</code> lists them.
                </>
              ) : (
                <>Try refreshing. If it keeps failing, the GitHub token may have expired.</>
              )}
            </div>
            <button type="button" className="btn secondary" onClick={load} style={{ marginTop: 14 }}>
              Try again
            </button>
          </div>
        )}

        {!state.loading && !state.error && (
          <>
            <div className="card settings-card" style={{ marginBottom: 20 }}>
              <header className="settings-card-head">
                <h2>Latest backup</h2>
                <p>
                  Coverage is verified only when a workflow run completes successfully. Restore steps are
                  in <code>docs/BACKUP_RECOVERY.md</code>.
                </p>
              </header>

              <div style={{ marginBottom: 16 }}>
                <StatusPill run={latest} />
              </div>

              {latest ? (
                <div className="backup-facts">
                  {[
                    ['Started', new Date(latest.createdAt).toLocaleString()],
                    ['Completed', latest.status === 'completed' ? new Date(latest.updatedAt).toLocaleString() : '—'],
                    ['Run number', `#${latest.runNumber}`],
                    ['Revision', latest.headSha.slice(0, 7)],
                    ['Duration', formatDuration(latest)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="backup-fact-label">{label}</div>
                      <div className="backup-fact-value">{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="settings-row-note" style={{ margin: 0 }}>
                  No backup runs were found for the configured workflow.
                </p>
              )}

              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 18, paddingTop: 16 }}>
                {!confirming ? (
                  <>
                    <button type="button" className="btn" onClick={() => setConfirming(true)} disabled={blocked}>
                      {requesting ? 'Requesting…' : 'Create backup now'}
                    </button>
                    <div className="settings-row-note" style={{ marginTop: 8 }}>
                      {state.activeBackup
                        ? 'A backup is already running. This page refreshes every 12 seconds.'
                        : !state.dispatchEnabled
                          ? 'Starting a backup from here is not enabled yet. Run the workflow once from GitHub to validate it, then set GITHUB_BACKUP_DISPATCH_ENABLED to true.'
                          : 'Backs up the database and uploaded files to private external storage. This can take several minutes.'}
                    </div>
                  </>
                ) : (
                  <div className="settings-callout" style={{ marginTop: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
                      <ClockIcon size={15} />
                      <span>
                        Start a backup now? It runs the workflow in the background and can take several
                        minutes. You can leave this page.
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn" onClick={createBackup} disabled={requesting}>
                        {requesting ? 'Requesting…' : 'Start backup'}
                      </button>
                      <button type="button" className="btn secondary" onClick={() => setConfirming(false)} disabled={requesting}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card table-section-card backup-history-table-card">
              <header className="settings-card-head table-section-header">
                <h2>Backup history</h2>
                <p>Recent 25 manual runs from GitHub Actions, in your local timezone.</p>
              </header>

              <div className="table-responsive">
                <table className="table" aria-label="Backup history">
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>Date and time</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Duration</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Revision</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.loading ? (
                      <tr className="table-empty-row"><td colSpan={5}>Loading backup history…</td></tr>
                    ) : state.error ? (
                      <tr className="table-empty-row"><td colSpan={5}>Backup history unavailable</td></tr>
                    ) : runs.length === 0 ? (
                      <tr className="table-empty-row"><td colSpan={5}>No backup runs yet</td></tr>
                    ) : runs.map((run) => (
                      <tr key={run.id}>
                        <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(run.createdAt).toLocaleString()}
                        </td>
                        <td><StatusPill run={run} /></td>
                        <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDuration(run)}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{run.headSha.slice(0, 7)}</td>
                        <td>
                          <a href={run.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                            #{run.runNumber}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <TablePagination
                page={0}
                totalPages={1}
                startIndex={runs.length ? 1 : 0}
                endIndex={runs.length}
                total={runs.length}
                onPageChange={() => {}}
                itemLabel="backup runs"
                showWhenEmpty={!state.loading}
              />
            </div>
          </>
        )}
      </div>

      <ResultDialog
        open={Boolean(result)}
        tone={result?.tone}
        title={result?.title}
        message={result?.message}
        actions={[{ label: 'Close', onClick: () => setResult(null) }]}
        onClose={() => setResult(null)}
      />
    </main>
  );
};

export default BackupRecovery;
