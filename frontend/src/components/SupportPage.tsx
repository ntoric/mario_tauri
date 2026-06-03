import React, { useState, useEffect } from 'react';
import { Mail, Phone, MessageCircle, AlertCircle, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores';

interface SupportConfig {
  email: string;
  phone: string;
  whatsappLink: string;
}

const SupportPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [config, setConfig] = useState<SupportConfig>({
    email: '',
    phone: '',
    whatsappLink: '',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSupportConfig();
  }, []);

  const fetchSupportConfig = async () => {
    try {
      const response = await fetch('/api/support-config');
      if (response.ok) {
        const data = await response.json();
        setConfig({
          email: data.email || '',
          phone: data.phone || '',
          whatsappLink: data.whatsappLink || '',
        });
      }
    } catch (err) {
      console.error('Failed to load support config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

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
          background: 'rgba(245, 101, 101, 0.1)',
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
          Store Disabled
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '16px',
          color: 'var(--gray-600)',
          textAlign: 'center',
          margin: '0 0 2rem',
          lineHeight: '1.5',
        }}>
          Your store is currently disabled. Please contact support for assistance.
        </p>

        {/* Contact Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {config.email && (
            <a
              href={`mailto:${config.email}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: 'var(--gray-50)',
                borderRadius: '12px',
                border: '1px solid var(--gray-200)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--gray-100)';
                e.currentTarget.style.borderColor = 'var(--gray-300)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--gray-50)';
                e.currentTarget.style.borderColor = 'var(--gray-200)';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Mail size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: 'var(--gray-500)', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Email Support
                </div>
                <div style={{ fontSize: '16px', color: 'var(--dark)', fontWeight: 600 }}>
                  {config.email}
                </div>
              </div>
            </a>
          )}

          {config.phone && (
            <a
              href={`tel:${config.phone}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: 'var(--gray-50)',
                borderRadius: '12px',
                border: '1px solid var(--gray-200)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--gray-100)';
                e.currentTarget.style.borderColor = 'var(--gray-300)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--gray-50)';
                e.currentTarget.style.borderColor = 'var(--gray-200)';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Phone size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: 'var(--gray-500)', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Call Support
                </div>
                <div style={{ fontSize: '16px', color: 'var(--dark)', fontWeight: 600 }}>
                  {config.phone}
                </div>
              </div>
            </a>
          )}

          {config.whatsappLink && (
            <a
              href={config.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: 'var(--gray-50)',
                borderRadius: '12px',
                border: '1px solid var(--gray-200)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--gray-100)';
                e.currentTarget.style.borderColor = 'var(--gray-300)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--gray-50)';
                e.currentTarget.style.borderColor = 'var(--gray-200)';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <MessageCircle size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: 'var(--gray-500)', fontWeight: 500, marginBottom: '0.25rem' }}>
                  WhatsApp Support
                </div>
                <div style={{ fontSize: '16px', color: 'var(--dark)', fontWeight: 600 }}>
                  Chat with us
                </div>
              </div>
            </a>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            height: '50px',
            marginTop: '2rem',
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

export default SupportPage;
