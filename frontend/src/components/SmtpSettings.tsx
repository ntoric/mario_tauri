import React, { useState, useEffect } from 'react';
import { Save, Mail, Loader2, Send, Lock } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';
import Toggle from './ui/Toggle';

const SmtpSettings: React.FC = () => {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [hasPassword, setHasPassword] = useState(false);

  const [config, setConfig] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    from: '',
    fromName: '',
    useTLS: true,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSmtpSettings();
      setConfig({
        host: data.host || '',
        port: data.port || 587,
        username: data.username || '',
        password: '',
        from: data.from || '',
        fromName: data.fromName || '',
        useTLS: data.useTLS !== false,
      });
      setHasPassword(!!data.hasPassword);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load SMTP settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateSmtpSettings(config);
      toast.success('SMTP configuration saved successfully');
      setHasPassword(true);
      setConfig(prev => ({ ...prev, password: '' }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to save SMTP settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.warning('Please enter an email address to send the test to');
      return;
    }
    setIsTesting(true);
    try {
      await api.testSmtpSettings(testEmail);
      toast.success('Test email sent successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test email');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">SMTP Email Settings</span>
        </div>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Mail size={18} style={{ color: 'var(--primary)' }} />
        <span className="card-title">SMTP Email Settings</span>
      </div>
      <form onSubmit={handleSave}>
        <div className="card-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
            Configure the SMTP server used to send password reset emails and other system notifications.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label>SMTP Host</label>
              <input
                type="text"
                value={config.host}
                onChange={e => setConfig(prev => ({ ...prev, host: e.target.value }))}
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div className="form-group" style={{ maxWidth: '120px' }}>
              <label>Port</label>
              <input
                type="number"
                value={config.port}
                onChange={e => setConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 587 }))}
                placeholder="587"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={config.username}
                onChange={e => setConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label>
                Password{' '}
                {hasPassword && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                    (saved — leave blank to keep)
                  </span>
                )}
              </label>
              <input
                type="password"
                value={config.password}
                onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder={hasPassword ? '••••••••' : 'Enter password'}
                required={!hasPassword}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>From Email Address</label>
              <input
                type="email"
                value={config.from}
                onChange={e => setConfig(prev => ({ ...prev, from: e.target.value }))}
                placeholder="noreply@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label>From Display Name</label>
              <input
                type="text"
                value={config.fromName}
                onChange={e => setConfig(prev => ({ ...prev, fromName: e.target.value }))}
                placeholder="Mario Cafe"
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Toggle
              checked={config.useTLS}
              onChange={checked => setConfig(prev => ({ ...prev, useTLS: checked }))}
            />
            <label style={{ margin: 0, cursor: 'pointer' }} onClick={() => setConfig(prev => ({ ...prev, useTLS: !prev.useTLS }))}>
              Use TLS/SSL encryption
            </label>
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>

      <div style={{ borderTop: '1px solid var(--gray-200)', padding: '1.5rem' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Send size={16} style={{ color: 'var(--primary)' }} />
          Send Test Email
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '0.75rem' }}>
          Verify your SMTP settings by sending a test email.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={isTesting || !config.host}
          >
            {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {isTesting ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmtpSettings;
