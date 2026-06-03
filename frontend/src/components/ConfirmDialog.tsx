import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

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

  const variantStyles = {
    danger: {
      icon: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.1)',
      button: 'btn-danger',
    },
    warning: {
      icon: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)',
      button: 'btn-warning',
    },
    info: {
      icon: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.1)',
      button: 'btn-primary',
    },
  };

  const style = variantStyles[variant];

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: '450px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              background: style.bg,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}
          >
            <AlertTriangle size={32} style={{ color: style.icon }} />
          </div>
          <p style={{ fontSize: '1.05rem', marginBottom: '0.5rem', color: 'var(--gray-800)' }}>
            {message}
          </p>
        </div>
        <div className="modal-footer">
          {cancelLabel && (
            <button className="btn btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className={`btn ${style.button}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
