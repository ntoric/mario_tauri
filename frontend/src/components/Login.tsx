import React, { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useAuthStore, useUIStore, getEffectiveColorMode } from '../stores';
import { Button } from '../components/ui/Button';
import { API_URL } from '../services/api';
import toast from 'react-hot-toast';

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
        // Use direct fetch without any auth headers
        const response = await fetch(`${API_URL}/stores/default`, {
          headers: {
            'Content-Type': 'application/json',
            // Explicitly exclude Authorization header
          },
          credentials: 'omit', // Don't send cookies
        });
        if (response.ok) {
          const data = await response.json();
          setDefaultStore(data);
        }
      } catch (error) {
        // Silently fail - logo is optional
        console.log('Could not fetch store logo');
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
      console.error('Login error:', err);
      console.error('Error message:', err.message);
      const errorMsg = err.message || 'Login failed. Please try again.';
      toast.error(errorMsg);
      setError(errorMsg);
    }
  };

  return (
    <div className="login-container">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={() => setColorMode(isDark ? 'light' : 'dark')}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle dark mode"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="login-aurora" aria-hidden="true">
        <span className="login-orb login-orb-1" />
        <span className="login-orb login-orb-2" />
        <span className="login-orb login-orb-3" />
      </div>

      <div className="login-box">
        <div className="login-logo">
          <div className="login-logo-icon" style={{
            background: 'white',
            padding: '10px',
          }}>
            <img
              src={defaultStore?.logoUrl || '/logo.png'}
              alt={defaultStore?.name || 'Store logo'}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
          <h1>{defaultStore?.name || 'Cafe Manager'}</h1>
          {defaultStore?.branch && (
            <p className="login-branch">{defaultStore.branch}</p>
          )}
          <p className="login-subtitle">Sign in to your account</p>
        </div>

        {error && (
          <div className="login-error">
            <span className="login-error-label">Error</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Username</label>
            <div className="login-input-wrap">
              <User size={16} className="login-input-icon" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label>Password</label>
            <div className="login-input-wrap">
              <Lock size={16} className="login-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isFullWidth
            isLoading={isLoading}
            loadingText="Signing in..."
            className="login-submit"
          >
            Sign In
          </Button>
        </form>

        <div className="login-footer">
          <ShieldCheck size={13} />
          <span>Protected &middot; Secure session</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
