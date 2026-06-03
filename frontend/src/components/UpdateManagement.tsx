import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, AlertCircle, Check, X, RefreshCw, ToggleLeft, ToggleRight, Calendar, Clock } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';

interface AppUpdate {
  id: string;
  platform: string;
  enabled: boolean;
  version: string;
  downloadUrl: string;
  releaseNotes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

const UpdateManagement: React.FC = () => {
  const { user } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [appUpdates, setAppUpdates] = useState<Record<string, AppUpdate>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setHeaderContent({
      title: 'Update Management',
      subtitle: 'Manage app version updates and rollouts - Superadmin only',
    });
    loadUpdates();
  }, [setHeaderContent]);

  const loadUpdates = async () => {
    setIsLoading(true);
    setError('');
    try {
      const updatesData = await api.getAllAppUpdates();
      const updatesMap: Record<string, AppUpdate> = {};
      if (updatesData && updatesData.updates && Array.isArray(updatesData.updates)) {
        updatesData.updates.forEach((update: AppUpdate) => {
          updatesMap[update.platform] = update;
        });
      }
      setAppUpdates(updatesMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load app updates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUpdate = async (platform: string, currentEnabled: boolean) => {
    setIsToggling(platform);
    setMessage('');
    setError('');
    
    try {
      const update = appUpdates[platform];
      if (!update) {
        setError('No update configuration found for this platform');
        return;
      }

      const response = await api.updateAppUpdate({
        platform,
        enabled: !currentEnabled,
        version: update.version,
        downloadUrl: update.downloadUrl,
        releaseNotes: update.releaseNotes || ''
      });

      setMessage(response.message || `Update ${!currentEnabled ? 'enabled' : 'disabled'} successfully`);
      await loadUpdates();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle update status');
    } finally {
      setIsToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (user?.role !== 'superadmin') {
    return (
      <div className="error-container">
        <AlertCircle size={48} color="#ef4444" />
        <h2>Access Denied</h2>
        <p>Only superadmin can access update management.</p>
      </div>
    );
  }

  const hasActiveUpdates = Object.values(appUpdates).some(u => u.enabled);

  return (
    <div className="update-management-container">
      {error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {message && (
        <div className="success-message" style={{ marginBottom: '1rem' }}>
          <Check size={16} />
          <span>{message}</span>
          <button 
            className="btn btn-icon" 
            onClick={() => setMessage('')}
            style={{ marginLeft: 'auto' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Active Updates Summary */}
      {hasActiveUpdates && (
        <div className="active-updates-banner">
          <AlertCircle size={20} className="banner-icon" />
          <div className="banner-content">
            <strong>Active Rollouts:</strong> {Object.values(appUpdates).filter(u => u.enabled).length} update(s) currently available to users
          </div>
        </div>
      )}

      <div className="updates-grid">
        {/* Mobile Update Card */}
        <div className={`update-card ${appUpdates.mobile?.enabled ? 'active' : 'inactive'}`}>
          <div className="update-card-header">
            <div className="platform-icon">
              <Smartphone size={32} />
            </div>
            <div className="platform-info">
              <h3>Mobile App</h3>
              <span className={`status-badge ${appUpdates.mobile?.enabled ? 'active' : 'inactive'}`}>
                {appUpdates.mobile?.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <button
              className="refresh-btn"
              onClick={loadUpdates}
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          {appUpdates.mobile ? (
            <div className="update-card-body">
              <div className="update-details">
                <div className="detail-row">
                  <span className="detail-label">Version:</span>
                  <span className="detail-value">{appUpdates.mobile.version}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Released:</span>
                  <span className="detail-value">
                    {new Date(appUpdates.mobile.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {appUpdates.mobile.updatedAt && (
                  <div className="detail-row">
                    <span className="detail-label">Last Updated:</span>
                    <span className="detail-value">
                      {new Date(appUpdates.mobile.updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {appUpdates.mobile.releaseNotes && (
                  <div className="detail-row full-width">
                    <span className="detail-label">Release Notes:</span>
                    <p className="detail-value release-notes">{appUpdates.mobile.releaseNotes}</p>
                  </div>
                )}
                <div className="detail-row full-width">
                  <span className="detail-label">Download URL:</span>
                  <a 
                    href={appUpdates.mobile.downloadUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="detail-value link"
                  >
                    {appUpdates.mobile.downloadUrl}
                  </a>
                </div>
              </div>

              <div className="update-card-actions">
                <button
                  className={`toggle-btn ${appUpdates.mobile.enabled ? 'disable' : 'enable'}`}
                  onClick={() => handleToggleUpdate('mobile', appUpdates.mobile.enabled)}
                  disabled={isToggling === 'mobile'}
                >
                  {isToggling === 'mobile' ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      Processing...
                    </>
                  ) : appUpdates.mobile.enabled ? (
                    <>
                      <ToggleLeft size={18} />
                      Disable Update
                    </>
                  ) : (
                    <>
                      <ToggleRight size={18} />
                      Enable Update
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="update-card-body empty">
              <p>No update configuration for mobile app</p>
            </div>
          )}
        </div>

        {/* Desktop Update Card */}
        <div className={`update-card ${appUpdates.desktop?.enabled ? 'active' : 'inactive'}`}>
          <div className="update-card-header">
            <div className="platform-icon">
              <Monitor size={32} />
            </div>
            <div className="platform-info">
              <h3>Desktop App</h3>
              <span className={`status-badge ${appUpdates.desktop?.enabled ? 'active' : 'inactive'}`}>
                {appUpdates.desktop?.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <button
              className="refresh-btn"
              onClick={loadUpdates}
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          {appUpdates.desktop ? (
            <div className="update-card-body">
              <div className="update-details">
                <div className="detail-row">
                  <span className="detail-label">Version:</span>
                  <span className="detail-value">{appUpdates.desktop.version}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Released:</span>
                  <span className="detail-value">
                    {new Date(appUpdates.desktop.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {appUpdates.desktop.updatedAt && (
                  <div className="detail-row">
                    <span className="detail-label">Last Updated:</span>
                    <span className="detail-value">
                      {new Date(appUpdates.desktop.updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {appUpdates.desktop.releaseNotes && (
                  <div className="detail-row full-width">
                    <span className="detail-label">Release Notes:</span>
                    <p className="detail-value release-notes">{appUpdates.desktop.releaseNotes}</p>
                  </div>
                )}
                <div className="detail-row full-width">
                  <span className="detail-label">Download URL:</span>
                  <a 
                    href={appUpdates.desktop.downloadUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="detail-value link"
                  >
                    {appUpdates.desktop.downloadUrl}
                  </a>
                </div>
              </div>

              <div className="update-card-actions">
                <button
                  className={`toggle-btn ${appUpdates.desktop.enabled ? 'disable' : 'enable'}`}
                  onClick={() => handleToggleUpdate('desktop', appUpdates.desktop.enabled)}
                  disabled={isToggling === 'desktop'}
                >
                  {isToggling === 'desktop' ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      Processing...
                    </>
                  ) : appUpdates.desktop.enabled ? (
                    <>
                      <ToggleLeft size={18} />
                      Disable Update
                    </>
                  ) : (
                    <>
                      <ToggleRight size={18} />
                      Enable Update
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="update-card-body empty">
              <p>No update configuration for desktop app</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .update-management-container {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .active-updates-banner {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: var(--radius);
          margin-bottom: 2rem;
        }

        .banner-icon {
          color: #10b981;
          flex-shrink: 0;
        }

        .banner-content {
          color: #10b981;
          font-size: 0.95rem;
        }

        .banner-content strong {
          font-weight: 600;
        }

        .updates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
        }

        .update-card {
          background: var(--darker);
          border: 2px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius);
          overflow: hidden;
          transition: all 0.3s;
        }

        .update-card.active {
          border-color: rgba(16, 185, 129, 0.3);
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);
        }

        .update-card.inactive {
          opacity: 0.7;
        }

        .update-card-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .platform-icon {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border-radius: var(--radius);
          color: var(--primary);
        }

        .platform-info {
          flex: 1;
        }

        .platform-info h3 {
          margin: 0 0 0.25rem 0;
          font-size: 1.1rem;
          color: #f1f5f9;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-badge.active {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }

        .status-badge.inactive {
          background: rgba(148, 163, 184, 0.2);
          color: #94a3b8;
        }

        .refresh-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
        }

        .update-card-body {
          padding: 1.25rem;
        }

        .update-card-body.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          color: #94a3b8;
          font-size: 0.9rem;
        }

        .update-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .detail-row {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
        }

        .detail-row.full-width {
          flex-direction: column;
        }

        .detail-label {
          min-width: 100px;
          font-size: 0.85rem;
          color: #94a3b8;
          font-weight: 500;
        }

        .detail-value {
          font-size: 0.9rem;
          color: #f1f5f9;
          word-break: break-all;
        }

        .detail-value.release-notes {
          background: rgba(255, 255, 255, 0.02);
          padding: 0.75rem;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 0.25rem;
          line-height: 1.5;
        }

        .detail-value.link {
          color: var(--primary);
          text-decoration: none;
          word-break: break-all;
        }

        .detail-value.link:hover {
          text-decoration: underline;
        }

        .update-card-actions {
          display: flex;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .toggle-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-btn.disable {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .toggle-btn.disable:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        .toggle-btn.enable {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .toggle-btn.enable:hover {
          background: rgba(16, 185, 129, 0.2);
        }

        .toggle-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .updates-grid {
            grid-template-columns: 1fr;
          }

          .detail-row {
            flex-direction: column;
            gap: 0.25rem;
          }

          .detail-label {
            min-width: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default UpdateManagement;
