import React, { useState, useEffect } from 'react';
import { Save, Mail, Phone, MessageCircle, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';

interface SupportConfig {
  email: string;
  phone: string;
  whatsappLink: string;
}

const SupportSettings: React.FC = () => {
  const { user } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  
  const [config, setConfig] = useState<SupportConfig>({
    email: '',
    phone: '',
    whatsappLink: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'superadmin') {
      setError('Access denied. Superadmin role required.');
      setIsLoading(false);
      return;
    }

    fetchSupportConfig();
  }, [user]);

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
      setError('Failed to load support configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage('');
    setError('');

    try {
      const response = await fetch('/api/support-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.getToken()}`,
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setSaveMessage('Support configuration saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    setHeaderContent({
      title: 'Support Configuration',
      subtitle: 'Configure support contact information for disabled stores',
      actions: null,
    });
  }, [setHeaderContent]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (error && !config.email && !config.phone && !config.whatsappLink) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <AlertCircle size={64} style={{ color: 'var(--danger)', marginBottom: '1.5rem' }} />
        <p style={{ fontSize: '1.125rem', color: 'var(--danger)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      {saveMessage && (
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(72, 187, 120, 0.1)',
          color: 'var(--success)',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={18} />
          {saveMessage}
        </div>
      )}

      {error && config.email && (
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(245, 101, 101, 0.1)',
          color: 'var(--danger)',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Support Contact Information</span>
        </div>
        <form onSubmit={handleSave}>
          <div className="card-body">
            <div style={{ 
              padding: '1rem', 
              background: 'var(--gray-50)', 
              borderRadius: 'var(--radius)',
              marginBottom: '1.5rem',
              border: '1px solid var(--gray-200)'
            }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', margin: 0 }}>
                <strong>Note:</strong> This information will be displayed to users when their store is disabled. 
                Users will see these contact details on the support page in the mobile app.
              </p>
            </div>

            <div className="form-group">
              <label>
                <Mail size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Support Email
              </label>
              <input
                type="email"
                value={config.email}
                onChange={e => setConfig({ ...config, email: e.target.value })}
                placeholder="support@example.com"
              />
              <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                Email address for users to contact support
              </small>
            </div>

            <div className="form-group">
              <label>
                <Phone size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Support Phone
              </label>
              <input
                type="tel"
                value={config.phone}
                onChange={e => setConfig({ ...config, phone: e.target.value })}
                placeholder="+1 234 567 8900"
              />
              <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                Phone number for users to call support
              </small>
            </div>

            <div className="form-group">
              <label>
                <MessageCircle size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                WhatsApp Link
              </label>
              <input
                type="url"
                value={config.whatsappLink}
                onChange={e => setConfig({ ...config, whatsappLink: e.target.value })}
                placeholder="https://wa.me/1234567890"
              />
              <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                WhatsApp chat link for instant support (e.g., https://wa.me/1234567890)
              </small>
            </div>
          </div>
          <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" style={{ marginRight: '0.5rem' }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} style={{ marginRight: '0.5rem' }} />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupportSettings;
