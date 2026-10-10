import React from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { useAuthStore, useUIStore } from '../stores';

// Blocking screen shown when the backend rejects the session (401). The user
// stays here until they explicitly sign out — no silent redirect loop.
const SessionExpired: React.FC = () => {
  const { user, logout } = useAuthStore();
  const setSessionExpired = useUIStore((s) => s.setSessionExpired);

  const handleLogout = async () => {
    // Await logout so the persisted session is cleared before AppRoutes
    // remounts and restoreSession runs. Navigate first so late 401s can't
    // re-flag the screen (the api layer ignores 401s on the login route).
    await logout();
    window.location.replace('/#/login');
    setSessionExpired(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--darker) 0%, var(--secondary) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--light)',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        padding: '3rem',
        maxWidth: '500px',
        width: '100%',
      }}>
        {/* Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '16px',
          background: 'rgba(229,57,53, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
        }}>
          <AlertCircle size={40} style={{ color: 'var(--danger)' }} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          color: 'var(--dark)',
          textAlign: 'center',
          margin: '0 0 0.5rem',
        }}>
          Session Expired
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '16px',
          color: 'var(--gray-600)',
          textAlign: 'center',
          margin: '0 0 2rem',
          lineHeight: '1.5',
        }}>
          Your session is no longer valid. Please sign out and log in again to continue.
        </p>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            height: '50px',
            padding: '0 1.5rem',
            background: 'transparent',
            border: '1px solid var(--gray-300)',
            borderRadius: 'var(--radius)',
            color: 'var(--gray-600)',
            fontSize: '16px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--gray-50)';
            e.currentTarget.style.borderColor = 'var(--gray-400)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--gray-300)';
          }}
        >
          <LogOut size={18} />
          Sign Out
        </button>

        {/* User Info */}
        {user && (
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--gray-200)',
            textAlign: 'center',
            fontSize: '14px',
            color: 'var(--gray-500)',
          }}>
            Logged in as <strong>{user.name}</strong> ({user.role})
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionExpired;
