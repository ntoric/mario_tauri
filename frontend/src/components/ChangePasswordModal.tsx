import React, { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { api } from '../services/api';
import notify from '../utils/toast';
import { Modal, Btn, Field, Input, Ic, IconBtn, Alert } from './gr';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setIsLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      notify.success('Password changed successfully');
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Change password"
      icon={<Ic name="lock" size={20} />}
      footer={
        <>
          <Btn variant="secondary" onClick={handleClose}>Cancel</Btn>
          <Btn
            variant="primary"
            isLoading={isLoading}
            loadingText="Changing…"
            onClick={handleSubmit}
          >
            Change password
          </Btn>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="gr-stack" id="change-password-form">
        {error && <Alert variant="danger">{error}</Alert>}

        <Field label="Current password">
          <div className="gr-pass">
            <Input
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              required
            />
            <IconBtn
              sm
              label={showCurrentPassword ? 'Hide password' : 'Show password'}
              icon={showCurrentPassword ? <Ic icon={EyeOff} size={16} /> : <Ic name="eye" size={16} />}
              onClick={() => setShowCurrentPassword(v => !v)}
              tabIndex={-1}
            />
          </div>
        </Field>

        <Field label="New password" help="Minimum 6 characters">
          <div className="gr-pass">
            <Input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              minLength={6}
            />
            <IconBtn
              sm
              label={showNewPassword ? 'Hide password' : 'Show password'}
              icon={showNewPassword ? <Ic icon={EyeOff} size={16} /> : <Ic name="eye" size={16} />}
              onClick={() => setShowNewPassword(v => !v)}
              tabIndex={-1}
            />
          </div>
        </Field>

        <Field label="Confirm new password">
          <Input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm your new password"
            required
          />
        </Field>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
