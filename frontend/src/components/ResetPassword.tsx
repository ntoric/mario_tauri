import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Coffee, Lock, Loader2, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetPasswordWithToken(token, password);
      setSuccess(true);
      toast.success('Password reset successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-logo">
              <Coffee size={20} />
            </div>
            <div className="auth-brand-text">
              <h1 className="auth-brand-title">Mario</h1>
              <p className="auth-brand-subtitle">Invalid Reset Link</p>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
              This password reset link is invalid or missing a token. Please request a new reset link.
            </p>
            <button onClick={() => navigate('/login')} className="auth-submit-btn">
              Go to Login
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-logo" style={{ background: 'var(--success)' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="auth-brand-text">
              <h1 className="auth-brand-title">Password Reset</h1>
              <p className="auth-brand-subtitle">Your password has been updated</p>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button onClick={() => navigate('/login')} className="auth-submit-btn">
              Sign In
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-logo">
            <Coffee size={20} />
          </div>
          <div className="auth-brand-text">
            <h1 className="auth-brand-title">Mario</h1>
            <p className="auth-brand-subtitle">Set a new password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">New Password</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                required
                autoFocus
                minLength={6}
                autoComplete="new-password"
                className="auth-input auth-input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="auth-password-toggle"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">Confirm Password</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                autoComplete="new-password"
                className="auth-input auth-input-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-submit-btn"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                Reset Password
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
