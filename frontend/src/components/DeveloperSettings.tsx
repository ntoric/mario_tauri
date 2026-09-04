import React, { useState, useEffect } from 'react';
import { Save, Github, Loader2, AlertCircle, Check, ExternalLink, Sparkles, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';

interface GeminiModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

const DeveloperSettings: React.FC = () => {
  const { user } = useAuthStore();
  const { setHeaderContent } = usePageHeader();

  // Update repo config
  const [githubRepo, setGithubRepo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  // Gemini config
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [isSavingGemini, setIsSavingGemini] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [geminiMessage, setGeminiMessage] = useState('');
  const [geminiError, setGeminiError] = useState('');

  useEffect(() => {
    setHeaderContent({
      title: 'Developer Settings',
      subtitle: 'Configure update repository and AI menu parsing - Superadmin only',
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
    fetchGeminiConfig();
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

  const fetchGeminiConfig = async () => {
    try {
      const data = await api.getGeminiConfig();
      setGeminiApiKey(data.apiKey || '');
      setGeminiModel(data.model || '');
      if (data.model) {
        // Seed the dropdown with the currently configured model so it's visible
        // even before the admin clicks refresh.
        setModels([{ name: data.model, displayName: data.model }]);
      }
    } catch (err: any) {
      setGeminiError(err.message || 'Failed to load Gemini configuration');
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

  const handleRefreshModels = async () => {
    setGeminiError('');
    setGeminiMessage('');
    // Persist the current API key first so the backend can use it to list models.
    const key = geminiApiKey.trim();
    if (!key) {
      setGeminiError('Enter and save a Gemini API key before refreshing models.');
      return;
    }
    setIsLoadingModels(true);
    try {
      // Save the key so the backend has it available for the models request.
      await api.updateGeminiConfig({ apiKey: key, model: geminiModel });
      const data = await api.listGeminiModels();
      const list: GeminiModel[] = data.models || [];
      setModels(list);
      if (list.length === 0) {
        setGeminiError('No models supporting generateContent were returned for this API key.');
      } else if (!geminiModel || !list.find(m => m.name === geminiModel || m.name === `models/${geminiModel}`)) {
        // Default to the first returned model if the current one isn't available.
        const first = list[0];
        setGeminiModel(first.name);
      }
      setGeminiMessage(`Loaded ${list.length} available model(s).`);
      setTimeout(() => setGeminiMessage(''), 3000);
    } catch (err: any) {
      setGeminiError(err.message || 'Failed to load Gemini models');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSaveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiError('');
    setGeminiMessage('');
    const key = geminiApiKey.trim();
    if (!key) {
      setGeminiError('Gemini API key is required');
      return;
    }
    const model = geminiModel.trim();
    if (!model) {
      setGeminiError('Please select a model');
      return;
    }
    setIsSavingGemini(true);
    try {
      const res = await api.updateGeminiConfig({ apiKey: key, model });
      setGeminiModel(res.config?.model || model);
      setGeminiMessage(res.message || 'Gemini configuration saved successfully!');
      setTimeout(() => setGeminiMessage(''), 3000);
    } catch (err: any) {
      setGeminiError(err.message || 'Failed to save Gemini configuration');
    } finally {
      setIsSavingGemini(false);
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

  const renderBanner = (msg: string, err: string) => (
    <>
      {msg && (
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
          {msg}
        </div>
      )}
      {err && (
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
          {err}
        </div>
      )}
    </>
  );

  return (
    <div>
      {renderBanner(saveMessage, error)}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
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

      {renderBanner(geminiMessage, geminiError)}

      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} />
            Gemini AI Configuration
          </span>
        </div>
        <form onSubmit={handleSaveGemini}>
          <div className="card-body">
            <div style={{
              padding: '1rem',
              background: 'var(--gray-50)',
              borderRadius: 'var(--radius)',
              marginBottom: '1.5rem',
              border: '1px solid var(--gray-200)',
            }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', margin: 0 }}>
                <strong>Note:</strong> The Gemini API key is used by the AI Menu Upload feature to parse
                menu images/PDFs into categories and items. The key is stored server-side and never
                exposed to clients. Get a key from{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                  Google AI Studio <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
                </a>.
              </p>
            </div>

            <div className="form-group">
              <label>API Key</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  spellCheck={false}
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? 'Hide' : 'Show'}
                  style={{ flexShrink: 0 }}
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                Stored securely in server settings. Used to authenticate Gemini API requests.
              </small>
            </div>

            <div className="form-group">
              <label>Model</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {models.length === 0 && (
                    <option value="">Click refresh to load available models</option>
                  )}
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.displayName || m.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleRefreshModels}
                  disabled={isLoadingModels}
                  title="Refresh available models from Gemini"
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {isLoadingModels ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <RefreshCw size={18} />
                  )}
                  Refresh
                </button>
              </div>
              <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                Click <strong>Refresh</strong> to fetch the list of models available for your API key.
                Only models supporting <code>generateContent</code> are shown.
              </small>
            </div>
          </div>
          <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="submit" className="btn btn-primary" disabled={isSavingGemini}>
              {isSavingGemini ? (
                <>
                  <Loader2 size={18} className="animate-spin" style={{ marginRight: '0.5rem' }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} style={{ marginRight: '0.5rem' }} />
                  Save Gemini Configuration
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
