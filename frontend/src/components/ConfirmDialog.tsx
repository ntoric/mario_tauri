import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const confirmButtonClass = {
    danger: 'btn-danger',
    warning: 'btn-warning',
    info: 'btn-primary',
  }[variant];

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className={`modal confirm-dialog confirm-dialog-${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn confirm-dialog-close" onClick={onCancel}>
          <X size={16} />
        </button>
        <div className="confirm-dialog-icon">
          {variant === 'info' ? <Info size={26} /> : <AlertTriangle size={26} />}
        </div>
        <h2 className="confirm-dialog-title">{title}</h2>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          {cancelLabel && (
            <button className="btn btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className={`btn ${confirmButtonClass}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
