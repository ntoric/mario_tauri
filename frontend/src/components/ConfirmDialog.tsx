import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal, Btn, Ic } from './gr';

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
  const icon =
    variant === 'info'
      ? <Ic icon={Info} size={22} />
      : <Ic icon={AlertTriangle} size={22} />;

  return (
    <Modal
      open={isOpen}
      onClose={onCancel}
      size="sm"
      title={title}
      icon={icon}
      iconDanger={variant === 'danger'}
      footer={
        <>
          {cancelLabel && (
            <Btn variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Btn>
          )}
          <Btn variant={variant === 'info' ? 'primary' : variant === 'warning' ? 'soft' : 'danger'} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <p style={{ fontSize: 15, lineHeight: '24px', color: 'var(--text)' }}>{message}</p>
    </Modal>
  );
};

export default ConfirmDialog;
