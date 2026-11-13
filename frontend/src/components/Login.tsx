import React, { useState, useEffect } from 'react';
import { ShieldCheck, EyeOff } from 'lucide-react';
import { useAuthStore, useUIStore, getEffectiveColorMode } from '../stores';
import { API_URL } from '../services/api';
import toast from 'react-hot-toast';
import { Btn, Field, Input, Ic, Logo, IconBtn, Alert } from './gr';

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
  const [error, setError] = useState('');
  const [defaultStore, setDefaultStore] = useState<DefaultStore | null>(null);
  const { login, isLoading } = useAuthStore();
  const colorMode = useUIStore((state) => state.colorMode);
  const setColorMode = useUIStore((state) => state.setColorMode);
  const isDark = getEffectiveColorMode(colorMode) === 'dark';

  // Fetch default store info (for logo display)
  useEffect(() => {
    const fetchDefaultStore = async () => {
      try {
        const response = await fetch(`${API_URL}/stores/default`, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
        });
        if (response.ok) {
          const data = await response.json();
          setDefaultStore(data);
        }
      } catch {
        // logo is optional
      }
    };
    fetchDefaultStore();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const success = await login(username, password);
      if (!success) {
        toast.error('Invalid username or password');
        setError('Invalid username or password');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Login failed. Please try again.';
      toast.error(errorMsg);
      setError(errorMsg);
    }
  };

  return (
    <div className="gr-signin">
      <div className="gr-signin__brand">
        {defaultStore?.logoUrl ? (
          <img
            src={defaultStore.logoUrl}
            alt={defaultStore.name ? `${defaultStore.name} logo` : 'Store logo'}
            style={{
              height: 64,
              maxWidth: 240,
              objectFit: 'contain',
              objectPosition: 'left',
              background: '#ffffff',
              borderRadius: 12,
              padding: 8,
            }}
          />
        ) : (
          <Logo kind="wordmark-white" width={180} />
        )}
        <span className="gr-signin__mark">
          <Logo kind="symbol-white" width="100%" />
        </span>
        <div style={{ marginTop: 'auto', position: 'relative' }}>
          <h1 className="gr-signin__title">
            {defaultStore?.name || 'Cafe Manager'}
          </h1>
          {defaultStore?.branch && (
            <p style={{ fontSize: 15, opacity: .9, marginBottom: 10 }}>{defaultStore.branch}</p>
          )}
          <p style={{ maxWidth: 420, fontSize: 15, lineHeight: '24px', opacity: .92 }}>
            Your entire cafe, managed beautifully — billing, tables, reports and more.
          </p>
          <div className="gr-row" style={{ marginTop: 22, gap: 10 }}>
            <span className="gr-badge gr-badge--lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>
              <Ic name="zap" size={14} /> Lightning-fast billing
            </span>
            <span className="gr-badge gr-badge--lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>
              <Ic name="chart" size={14} /> Real-time insights
            </span>
            <span className="gr-badge gr-badge--lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>
              <Ic name="lock" size={14} /> Secure by design
            </span>
          </div>
        </div>
      </div>

      <div className="gr-signin__form">
        <IconBtn
          className="login-theme-toggle"
          variant="outline"
          round
          label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          icon={isDark ? <Ic name="sun" /> : <Ic name="moon" />}
          onClick={() => setColorMode(isDark ? 'light' : 'dark')}
        />
        <div className="gr-card gr-card--raised gr-signin__card">
          <div style={{ marginBottom: 22 }}>
            <h2 className="gr-h2">Welcome back</h2>
            <p className="login-subtitle">
              {defaultStore ? `Sign in to ${defaultStore.name}` : 'Sign in to your account'}
            </p>
          </div>

          {error && (
            <Alert variant="danger" title="Sign in failed" style={{ marginBottom: 16 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="gr-stack" style={{ gap: 14 }}>
            <Field label="Username" htmlFor="login-username">
              <div className="gr-inputwrap">
                <Ic name="user" size={18} />
                <Input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="login-password">
              <div className="gr-pass">
                <div className="gr-inputwrap">
                  <Ic name="lock" size={18} />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <IconBtn
                  sm
                  label={showPassword ? 'Hide password' : 'Show password'}
                  icon={showPassword ? <Ic icon={EyeOff} size={16} /> : <Ic name="eye" size={16} />}
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                />
              </div>
            </Field>

            <Btn
              type="submit"
              variant="primary"
              size="sm"
              block
              isLoading={isLoading}
              loadingText="Signing in…"
              className="login-submit"
            >
              Sign in
            </Btn>
          </form>

          <div className="login-footer">
            <ShieldCheck size={13} />
            <span>Protected · Secure session</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
