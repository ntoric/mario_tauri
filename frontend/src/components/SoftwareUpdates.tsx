import React, { useState } from 'react';
import { RefreshCw, Download, CheckCircle, AlertCircle, Loader2, Monitor, Package } from 'lucide-react';
import { useUpdater } from '../hooks/useUpdater';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

const SoftwareUpdates: React.FC = () => {
  const {
    updateInfo,
    isChecking,
    isDownloading,
    isInstalling,
    downloadProgress,
    error,
    checkForUpdates,
    downloadUpdate,
    installAndRelaunch,
    dismissUpdate,
  } = useUpdater(false);

  const [hasChecked, setHasChecked] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const handleCheck = async () => {
    setHasChecked(true);
    setInstallError(null);
    await checkForUpdates();
  };

  const handleDownloadAndInstall = async () => {
    setInstallError(null);
    try {
      await downloadUpdate();
      await installAndRelaunch();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Failed to install update');
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Non-Tauri (web browser) — updates only available in the desktop app
  if (!isTauri()) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={18} />
            Software Updates
          </span>
        </div>
        <div className="card-body">
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Monitor size={48} style={{ color: 'var(--gray-400)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', color: 'var(--gray-600)', margin: 0 }}>
              In-app updates are only available in the desktop application.
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
              Install the Mario Juicy desktop app to check for and install software updates automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isInstalling) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={18} />
            Software Updates
          </span>
        </div>
        <div className="card-body">
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem' }}>Installing Update</h3>
            <p style={{ color: 'var(--gray-500)', margin: 0 }}>The application will relaunch shortly. Please do not close the window.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} />
          Software Updates
        </span>
        <button
          className="btn btn-secondary"
          onClick={handleCheck}
          disabled={isChecking || isDownloading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {isChecking ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              Check for Updates
            </>
          )}
        </button>
      </div>

      <div className="card-body">
        {/* Current version */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          background: 'var(--gray-50)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--gray-200)',
          marginBottom: '1.5rem',
        }}>
          <Monitor size={28} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Current Version</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {updateInfo?.currentVersion || '—'}
            </div>
          </div>
        </div>

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

        {installError && (
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
            {installError}
          </div>
        )}

        {/* Update available */}
        {updateInfo?.available && (
          <div style={{
            padding: '1.25rem',
            background: 'rgba(43,165,74, 0.08)',
            border: '1px solid rgba(43,165,74, 0.3)',
            borderRadius: 'var(--radius)',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Download size={20} style={{ color: 'var(--success)' }} />
              <strong style={{ color: 'var(--success)' }}>
                New version {updateInfo.latestVersion} is available!
              </strong>
            </div>

            {updateInfo.body && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                background: 'var(--darker)',
                borderRadius: '6px',
                fontSize: '0.875rem',
                color: 'var(--gray-600)',
                whiteSpace: 'pre-wrap',
                maxHeight: '180px',
                overflow: 'auto',
              }}>
                {updateInfo.body}
              </div>
            )}

            {/* Download progress */}
            {isDownloading && downloadProgress && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'var(--gray-600)',
                  marginBottom: '0.25rem',
                }}>
                  <span>Downloading update...</span>
                  <span>{downloadProgress.percentage}%</span>
                </div>
                <div style={{
                  height: '8px',
                  background: 'var(--gray-200)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${downloadProgress.percentage}%`,
                    background: 'var(--success)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                  {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              {!isDownloading ? (
                <button
                  className="btn btn-primary"
                  onClick={handleDownloadAndInstall}
                  disabled={isChecking}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Download size={16} />
                  Download & Install
                </button>
              ) : (
                <span style={{ fontSize: '0.9rem', color: 'var(--gray-600)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Loader2 size={16} className="animate-spin" />
                  Downloading...
                </span>
              )}
              <button
                className="btn btn-secondary"
                onClick={dismissUpdate}
                disabled={isDownloading}
              >
                Remind me later
              </button>
            </div>
          </div>
        )}

        {/* Up to date */}
        {hasChecked && !isChecking && !updateInfo?.available && !error && (
          <div style={{
            padding: '1.25rem',
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <CheckCircle size={24} style={{ color: 'var(--success)' }} />
            <div>
              <strong>You're up to date!</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                The application is running the latest version.
              </div>
            </div>
          </div>
        )}

        {/* Initial state */}
        {!hasChecked && !isChecking && (
          <div style={{
            padding: '1.25rem',
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}>
            <RefreshCw size={28} style={{ color: 'var(--gray-400)', marginBottom: '0.75rem' }} />
            <p style={{ margin: 0, color: 'var(--gray-600)' }}>
              Click <strong>Check for Updates</strong> to see if a new version is available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SoftwareUpdates;
