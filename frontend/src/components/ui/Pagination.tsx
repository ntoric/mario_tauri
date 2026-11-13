import React from 'react';
import { Pager } from '../gr';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="gr-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <span className="gr-caption">
        Showing {startItem}–{endItem} of {totalItems}
      </span>
      <Pager page={currentPage} totalPages={totalPages} onPage={onPageChange} />
    </div>
  );
};

export default Pagination;
