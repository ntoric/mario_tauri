import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { PaginationState } from '../hooks/usePagination';

interface TablePaginationProps {
  pagination: PaginationState;
}

const TablePagination: React.FC<TablePaginationProps> = ({ pagination }) => {
  const { currentPage, pageSize, totalPages, totalItems, startIndex, endIndex, goToPage, nextPage, prevPage, setPageSize } = pagination;

  if (totalItems === 0) return null;

  // Generate page numbers to display (show up to 5 pages around current)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    const left = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="zoho-table-footer">
      <div className="zoho-table-footer-info">
        <span>Rows per page</span>
        <select
          className="zoho-table-footer-pagesize"
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value))}
        >
          {[10, 25, 50, 100].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span style={{ marginLeft: '8px' }}>
          {startIndex + 1}–{endIndex} of {totalItems}
        </span>
      </div>
      <div className="zoho-table-footer-actions">
        <button
          className="zoho-table-footer-btn"
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          title="First page"
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          className="zoho-table-footer-btn"
          onClick={prevPage}
          disabled={currentPage === 1}
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        {pageNumbers.map((p, i) =>
          typeof p === 'number' ? (
            <button
              key={i}
              className={`zoho-table-footer-btn ${p === currentPage ? 'active' : ''}`}
              onClick={() => goToPage(p)}
            >
              {p}
            </button>
          ) : (
            <span key={i} style={{ padding: '0 4px', color: '#a1a1aa', fontSize: '12px' }}>{p}</span>
          )
        )}
        <button
          className="zoho-table-footer-btn"
          onClick={nextPage}
          disabled={currentPage === totalPages}
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>
        <button
          className="zoho-table-footer-btn"
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          title="Last page"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
