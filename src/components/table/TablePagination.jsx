import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons/Icons.jsx';
import { buildPageItems } from '../../hooks/useTablePagination.js';

/**
 * Shared table footer: "Showing X of Y" on the left, page controls on the right.
 * Mirrors the reference admin-portal pattern, wired to design tokens.
 */
const TablePagination = ({
  page,
  totalPages,
  startIndex,
  endIndex,
  total,
  onPageChange,
  itemLabel = 'records',
  selectedCount = 0,
  showWhenEmpty = false,
  disabled = false,
}) => {
  if (!total && !showWhenEmpty) return null;

  const canPrev = page > 0;
  const canNext = page < totalPages - 1;
  const pageItems = buildPageItems(page, totalPages);

  return (
    <div className="table-pagination">
      <p className="table-pagination-info">
        {total === 0 ? (
          <>Showing 0 of 0 {itemLabel}</>
        ) : (
          <>
            Showing <span className="table-pagination-count">{startIndex}</span>–
            <span className="table-pagination-count">{endIndex}</span> of{' '}
            <span className="table-pagination-count">{total}</span> {itemLabel}
          </>
        )}
        {selectedCount > 0 && (
          <span className="table-pagination-selected">({selectedCount} selected)</span>
        )}
      </p>

      {totalPages > 1 && (
        <div className="table-pagination-controls">
          <button
            type="button"
            className="table-pagination-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || !canPrev}
            aria-label="Go to previous page"
          >
            <ChevronLeftIcon size={16} />
            Previous
          </button>

          <div className="table-pagination-pages">
            {pageItems.map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  className={`table-pagination-page${item === page ? ' active' : ''}`}
                  onClick={() => onPageChange(item)}
                  aria-label={`Go to page ${item + 1}`}
                  aria-current={item === page ? 'page' : undefined}
                  disabled={disabled}
                >
                  {item + 1}
                </button>
              ) : (
                <span key={item} className="table-pagination-ellipsis" aria-hidden="true">
                  …
                </span>
              )
            )}
          </div>

          <button
            type="button"
            className="table-pagination-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || !canNext}
            aria-label="Go to next page"
          >
            Next
            <ChevronRightIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TablePagination;
