import React, { useState, useEffect } from 'react';
import { Coffee, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores';
import { Button } from '../components/ui/Button';
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
  const [error, setError] = useState('');
  const [defaultStore, setDefaultStore] = useState<DefaultStore | null>(null);
  const { login, isLoading } = useAuthStore();

  // Fetch default store info (for logo display)
  useEffect(() => {
    const fetchDefaultStore = async () => {
      try {
        // Use direct fetch without any auth headers
        const response = await fetch('/api/stores/default', {
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
      <div className="login-box">
        <div className="login-logo">
          <div className="login-logo-icon" style={{
            background: defaultStore?.logoUrl ? 'white' : undefined,
            padding: defaultStore?.logoUrl ? '10px' : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {defaultStore?.logoUrl ? (
              <img
                src={defaultStore.logoUrl}
                alt={defaultStore.name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Coffee size={40} />
            )}
          </div>
          <h1>{defaultStore?.name || 'Cafe Manager'}</h1>
          {defaultStore?.branch && (
            <p style={{ color: 'var(--gray-600)', marginBottom: '0.25rem' }}>{defaultStore.branch}</p>
          )}
          <p className="login-subtitle">Sign in to your account</p>
        </div>
        
        {error && (
          <div className="error-message" style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontWeight: 600 }}>Error:</span> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isFullWidth
            isLoading={isLoading}
            loadingText="Signing in..."
          >
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
