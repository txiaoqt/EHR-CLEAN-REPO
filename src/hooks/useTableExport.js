import { useCallback, useState } from 'react';
import { exportReport } from '../utils/export/engine.js';
import { logAudit } from '../utils.js';

/**
 * Wires an export config to a page: dialog state, the export itself, and an
 * audit-trail entry recording who exported what, in which format, and how many
 * rows — including the filters that were active at the time.
 *
 * @param {Object}   options
 * @param {Object}   options.config        Export config from utils/export/configs.js
 * @param {Function} options.getRows       Returns the rows to export (call it lazily)
 * @param {Function} [options.getFilterLines] Returns human-readable active filters
 * @param {string}   [options.itemLabel]   e.g. 'appointments'
 * @param {Function} [options.onMessage]   (text, type) => void, for the page's toast
 */
export const useTableExport = ({ config, getRows, getFilterLines, itemLabel = 'rows', count, onMessage }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);

  const run = useCallback(
    async ({ format, pageConfig }) => {
      setBusy(true);
      try {
        // getRows may be async — a server-paginated log has to fetch every
        // matching row, not just the page on screen.
        const rows = (await Promise.resolve(getRows())) || [];
        const filterLines = getFilterLines?.() || [];

        await exportReport(format, { config, rows, filterSummaryLines: filterLines, pageConfig });

        // Recorded even if the download is cancelled afterwards — the data left
        // the database, which is the auditable event.
        await logAudit(
          'EXPORT',
          `Exported ${config.title} — ${rows.length} ${itemLabel} as ${format.toUpperCase()}`,
          undefined,
          {
            type: 'export',
            meta: {
              entity: config.filenamePrefix,
              format,
              rowCount: rows.length,
              filters: filterLines,
            },
          }
        );

        onMessage?.(`Exported ${rows.length} ${itemLabel} as ${format.toUpperCase()}.`, 'success');
        setOpen(false);
      } catch (err) {
        console.error('Export failed:', err);
        onMessage?.(`Export failed: ${err?.message || 'Unknown error'}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [config, getRows, getFilterLines, itemLabel, onMessage]
  );

  return {
    exportOpen: open,
    openExport: openDialog,
    closeExport: closeDialog,
    exportBusy: busy,
    runExport: run,
    rowCount: count ?? 0,
  };
};

export default useTableExport;
