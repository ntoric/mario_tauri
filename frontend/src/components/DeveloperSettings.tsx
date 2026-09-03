import React, { useState, useEffect } from 'react';
import { Save, Github, Loader2, AlertCircle, Check, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';

const DeveloperSettings: React.FC = () => {
  const { user } = useAuthStore();
  const { setHeaderContent } = usePageHeader();

  const [githubRepo, setGithubRepo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setHeaderContent({
      title: 'Developer Settings',
      subtitle: 'Configure in-app update repository - Superadmin only',
      actions: null,
    });
  }, [setHeaderContent]);

  useEffect(() => {
    if (user?.role !== 'superadmin') {
      setError('Access denied. Superadmin role required.');
      setIsLoading(false);
      return;
    }
    fetchConfig();
  }, [user]);

  const fetchConfig = async () => {
    try {
      const data = await api.getUpdateRepoConfig();
      setGithubRepo(data.githubRepo || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load update repository configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const repo = githubRepo.trim();
    if (!repo) {
      setError('GitHub repository is required');
      return;
    }
    if (repo.split('/').length !== 2 || repo.startsWith('/') || repo.endsWith('/')) {
      setError("Repository must be in 'owner/repo' format (e.g. ntoric/mario_tauri)");
      return;
    }

    setIsSaving(true);
    setSaveMessage('');
    setError('');

    try {
      const res = await api.updateUpdateRepoConfig(repo);
      setGithubRepo(res.config?.githubRepo || repo);
      setSaveMessage(res.message || 'Configuration saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (user?.role !== 'superadmin') {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <AlertCircle size={64} style={{ color: 'var(--danger)', marginBottom: '1.5rem' }} />
        <p style={{ fontSize: '1.125rem', color: 'var(--danger)' }}>Access Denied</p>
        <p style={{ color: 'var(--gray-500)', marginTop: '0.5rem' }}>Only superadmin can access developer settings.</p>
      </div>
    );
  }

  return (
    <div>
      {saveMessage && (
        <div style={{
          padding: '1rem',
          background: 'rgba(43,165,74, 0.1)',
          color: 'var(--success)',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <Check size={18} />
          {saveMessage}
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(229,57,53, 0.1)',
          color: 'var(--danger)',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Github size={18} />
            Update Repository Configuration
          </span>
        </div>
        <form onSubmit={handleSave}>
          <div className="card-body">
            <div style={{
              padding: '1rem',
              background: 'var(--gray-50)',
              borderRadius: 'var(--radius)',
              marginBottom: '1.5rem',
              border: '1px solid var(--gray-200)',
            }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', margin: 0 }}>
                <strong>Note:</strong> This is the GitHub repository the desktop app will check for updates.
                The app fetches the <code>latest.json</code> manifest from this repository's latest release.
                Ensure releases are published with a signed <code>latest.json</code> and installer artifacts.
              </p>
            </div>

            <div className="form-group">
              <label>
                <Github size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                GitHub Repository
              </label>
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="owner/repo (e.g. ntoric/mario_tauri)"
                spellCheck={false}
              />
              <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                Repository in <code>owner/repo</code> format. The latest release must include a <code>latest.json</code> manifest.
              </small>
            </div>

            {githubRepo && (
              <div style={{ marginTop: '0.5rem' }}>
                <a
                  href={`https://github.com/${githubRepo.trim()}/releases/latest`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.85rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  View latest release <ExternalLink size={12} />
                </a>
              </div>
            )}
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

export default DeveloperSettings;
