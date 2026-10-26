// Failed or running attempts must never replace the last verified backup.
export function latestVerifiedBackup(runs = [], recorded = null) {
  const timestamp = typeof recorded === 'string' ? recorded : recorded?.completedAt;
  let latest = typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))
    ? { at: timestamp, source: 'recorded' } : null;

  for (const run of runs) {
    if (run.status !== 'completed' || run.conclusion !== 'success'
      || typeof run.updatedAt !== 'string' || !Number.isFinite(Date.parse(run.updatedAt))) continue;
    if (!latest || Date.parse(run.updatedAt) > Date.parse(latest.at)) {
      latest = { at: run.updatedAt, source: 'workflow', runNumber: run.runNumber };
    }
  }
  return latest;
}
