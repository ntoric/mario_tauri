import React, { useState, useEffect } from 'react';
import { Coffee, Loader2, Eye, EyeOff, Lock, User, ArrowRight, ArrowLeft, Mail } from 'lucide-react';
import { useAuthStore } from '../stores';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';

interface DefaultStore {
  id: string;
  name: string;
  branch?: string;
  logoUrl?: string;
}

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [defaultStore, setDefaultStore] = useState<DefaultStore | null>(null);
  const { login, isLoading } = useAuthStore();
  const toast = useToast();

  // Forgot password state
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Fetch default store info (for logo display)
  useEffect(() => {
    const fetchDefaultStore = async () => {
      try {
        const response = await fetch('/api/stores/default', {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
        });
        if (response.ok) {
          const data = await response.json();
          setDefaultStore(data);
        }
      } catch (error) {
        console.log('Could not fetch store logo');
      }
    };
    fetchDefaultStore();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const success = await login(username, password);
      if (!success) {
        toast.error('Invalid username or password');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMsg = err.message || 'Login failed. Please try again.';
      toast.error(errorMsg);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsSendingReset(true);
    try {
      await api.forgotPassword(forgotEmail);
      setResetSent(true);
      toast.success('Password reset link sent. Check your email.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reset email');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Brand header */}
        <div className="auth-brand">
          <div className="auth-brand-logo">
            {defaultStore?.logoUrl ? (
              <img
                src={defaultStore.logoUrl}
                alt={defaultStore.name}
                className="auth-brand-logo-img"
              />
            ) : (
              <Coffee size={20} />
            )}
          </div>
          <div className="auth-brand-text">
            <h1 className="auth-brand-title">
              {defaultStore?.name || 'Mario'}
            </h1>
            <p className="auth-brand-subtitle">
              {mode === 'login'
                ? (defaultStore?.branch ? defaultStore.branch : 'Sign in to your account')
                : 'Reset your password'}
            </p>
          </div>
        </div>

        {mode === 'login' ? (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">Username</label>
                <div className="auth-input-wrap">
                  <User size={16} className="auth-input-icon" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                    autoFocus
                    autoComplete="username"
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label">Password</label>
                <div className="auth-input-wrap">
                  <Lock size={16} className="auth-input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
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

              <button
                type="submit"
                disabled={isLoading}
                className="auth-submit-btn"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setResetSent(false); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Mail size={14} />
                Forgot password?
              </button>
            </div>
          </>
        ) : (
          <>
            {resetSent ? (
              <div className="auth-form" style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <Mail size={48} style={{ color: 'var(--primary)', margin: '0 auto 1rem' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Check Your Email</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', lineHeight: 1.5 }}>
                    If an account with <strong>{forgotEmail}</strong> exists, a password reset link has been sent.
                    The link will expire in 1 hour.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setResetSent(false); setForgotEmail(''); }}
                  className="auth-submit-btn"
                >
                  <ArrowLeft size={16} />
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Email Address</label>
                  <div className="auth-input-wrap">
                    <Mail size={16} className="auth-input-icon" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Enter your email address"
                      required
                      autoFocus
                      autoComplete="email"
                      className="auth-input"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSendingReset}
                  className="auth-submit-btn"
                >
                  {isSendingReset ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send Reset Link
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--gray-600)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <ArrowLeft size={14} />
                    Back to Login
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        <div className="auth-footer">
          <span className="auth-footer-text">
            Mario POS &middot; v{import.meta.env.VITE_APP_VERSION || '1.5.0'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Login;
