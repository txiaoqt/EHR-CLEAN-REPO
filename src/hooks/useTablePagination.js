import { useEffect, useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side table pagination.
 *
 * @param {Array} rows           Full (already filtered/sorted) row list.
 * @param {Object} options
 * @param {number} options.pageSize  Rows per page.
 * @param {string|number} options.resetKey  Any value that changes when the
 *   search/filter/sort criteria change — snaps the table back to page 1.
 * @returns {{page,totalPages,total,pageSize,pageRows,startIndex,endIndex,goToPage,reset}}
 */
export const useTablePagination = (rows, { pageSize = DEFAULT_PAGE_SIZE, resetKey } = {}) => {
  const [page, setPage] = useState(0);

  const total = rows?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp during render so a shrinking row set can never leave us out of range.
  const clampedPage = Math.min(page, totalPages - 1);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const pageRows = useMemo(() => {
    const start = clampedPage * pageSize;
    return (rows || []).slice(start, start + pageSize);
  }, [rows, clampedPage, pageSize]);

  const goToPage = (next) => setPage(Math.max(0, Math.min(next, totalPages - 1)));

  return {
    page: clampedPage,
    totalPages,
    total,
    pageSize,
    pageRows,
    startIndex: total === 0 ? 0 : clampedPage * pageSize + 1,
    endIndex: Math.min((clampedPage + 1) * pageSize, total),
    goToPage,
    reset: () => setPage(0),
  };
};

/**
 * Builds the page-number strip: first, last, and a window around the current
 * page, with "ellipsis" markers filling the gaps.
 */
export const buildPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const items = [];
  const windowStart = Math.max(1, currentPage - 1);
  const windowEnd = Math.min(totalPages - 2, currentPage + 1);

  items.push(0);
  if (windowStart > 1) items.push('ellipsis-start');
  for (let i = windowStart; i <= windowEnd; i++) items.push(i);
  if (windowEnd < totalPages - 2) items.push('ellipsis-end');
  items.push(totalPages - 1);

  return items;
};
