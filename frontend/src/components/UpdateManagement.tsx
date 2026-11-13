import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, AlertCircle, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import notify from '../utils/toast';
import { Empty } from './gr';

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
    setError('');

    try {
      const update = appUpdates[platform];
      if (!update) {
        notify.error('No update configuration found for this platform');
        return;
      }

      const response = await api.updateAppUpdate({
        platform,
        enabled: !currentEnabled,
        version: update.version,
        downloadUrl: update.downloadUrl,
        releaseNotes: update.releaseNotes || ''
      });

      notify.success(response.message || `Update ${!currentEnabled ? 'enabled' : 'disabled'} successfully`);
      await loadUpdates();
    } catch (err: any) {
      notify.error(err.message || 'Failed to toggle update status');
    } finally {
      setIsToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="pos-loader">
        <div className="gr-spin"></div>
      </div>
    );
  }

  if (user?.role !== 'superadmin') {
    return (
      <div className="error-container">
        <AlertCircle size={48} color="var(--danger)" />
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
                <div className="pos-kv">
                  <span className="pos-kv__label">Version:</span>
                  <span className="pos-kv__value">{appUpdates.mobile.version}</span>
                </div>
                <div className="pos-kv">
                  <span className="pos-kv__label">Released:</span>
                  <span className="pos-kv__value">
                    {new Date(appUpdates.mobile.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {appUpdates.mobile.updatedAt && (
                  <div className="pos-kv">
                    <span className="pos-kv__label">Last Updated:</span>
                    <span className="pos-kv__value">
                      {new Date(appUpdates.mobile.updatedAt).toLocaleString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {appUpdates.mobile.releaseNotes && (
                  <div className="pos-kv full-width">
                    <span className="pos-kv__label">Release Notes:</span>
                    <p className="pos-kv__value release-notes">{appUpdates.mobile.releaseNotes}</p>
                  </div>
                )}
                <div className="pos-kv full-width">
                  <span className="pos-kv__label">Download URL:</span>
                  <a 
                    href={appUpdates.mobile.downloadUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="pos-kv__value link"
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
            <div className="update-card-body">
              <Empty compact icon={<Smartphone />} title="No update configuration" text="Set up version requirements for the mobile app." />
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
                <div className="pos-kv">
                  <span className="pos-kv__label">Version:</span>
                  <span className="pos-kv__value">{appUpdates.desktop.version}</span>
                </div>
                <div className="pos-kv">
                  <span className="pos-kv__label">Released:</span>
                  <span className="pos-kv__value">
                    {new Date(appUpdates.desktop.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {appUpdates.desktop.updatedAt && (
                  <div className="pos-kv">
                    <span className="pos-kv__label">Last Updated:</span>
                    <span className="pos-kv__value">
                      {new Date(appUpdates.desktop.updatedAt).toLocaleString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {appUpdates.desktop.releaseNotes && (
                  <div className="pos-kv full-width">
                    <span className="pos-kv__label">Release Notes:</span>
                    <p className="pos-kv__value release-notes">{appUpdates.desktop.releaseNotes}</p>
                  </div>
                )}
                <div className="pos-kv full-width">
                  <span className="pos-kv__label">Download URL:</span>
                  <a 
                    href={appUpdates.desktop.downloadUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="pos-kv__value link"
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
            <div className="update-card-body">
              <Empty compact icon={<Monitor />} title="No update configuration" text="Set up version requirements for the desktop app." />
            </div>
          )}
        </div>
      </div>


    </div>
  );
};

export default UpdateManagement;
