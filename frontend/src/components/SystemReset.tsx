import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw, Check, X, Database, Users, Store, Tag, Coffee, ShoppingCart, Grid3X3, Receipt, Settings, Clock, Smartphone, Monitor, Download, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import notify from '../utils/toast';

interface ResetOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  color: string;
}

interface SystemStats {
  users: number;
  stores: number;
  categories: number;
  items: number;
  orders: number;
  tables: number;
  bills: number;
}

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

const SystemReset: React.FC = () => {
  const { user } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  // Periodic Cleanup Settings State
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [cleanupIntervalMins, setCleanupIntervalMins] = useState(60);
  const [cleanupLastRun, setCleanupLastRun] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // App Update Settings State
  const [appUpdates, setAppUpdates] = useState<Record<string, AppUpdate>>({});
  const [isLoadingAppUpdates, setIsLoadingAppUpdates] = useState(false);
  const [isSavingAppUpdate, setIsSavingAppUpdate] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'mobile' | 'desktop'>('mobile');

  useEffect(() => {
    setHeaderContent({
      title: 'System Reset',
      subtitle: 'Reset system data - Superadmin only',
    });
    loadData();
  }, [setHeaderContent]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [statsData, configData] = await Promise.all([
        api.getSystemStats(),
        api.getSystemConfig()
      ]);
      setStats(statsData);
      setCleanupEnabled(configData.cleanupEnabled);
      setCleanupIntervalMins(configData.cleanupIntervalMins);
      setCleanupLastRun(configData.cleanupLastRun);
      
      // Load app updates separately with error handling
      try {
        const updatesData = await api.getAllAppUpdates();
        // Convert updates array to object keyed by platform
        const updatesMap: Record<string, AppUpdate> = {};
        if (updatesData && updatesData.updates && Array.isArray(updatesData.updates)) {
          updatesData.updates.forEach((update: AppUpdate) => {
            updatesMap[update.platform] = update;
          });
        }
        setAppUpdates(updatesMap);
      } catch (updateErr: any) {
        console.error('Failed to load app updates:', updateErr);
        // Don't fail the entire load if app updates fail
        setAppUpdates({});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load system data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const response = await api.updateSystemConfig({
        cleanupEnabled,
        cleanupIntervalMins
      });
      notify.success(response.message || 'Configuration updated successfully');
      // Refresh config to get latest last-run timestamp if any
      const configData = await api.getSystemConfig();
      setCleanupEnabled(configData.cleanupEnabled);
      setCleanupIntervalMins(configData.cleanupIntervalMins);
      setCleanupLastRun(configData.cleanupLastRun);
    } catch (err: any) {
      notify.error(err.message || 'Failed to save configuration');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveAppUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAppUpdate(true);
    try {
      const currentUpdate = appUpdates[activePlatform] || {
        enabled: false,
        version: '',
        downloadUrl: '',
        releaseNotes: ''
      };
      
      const response = await api.updateAppUpdate({
        platform: activePlatform,
        enabled: currentUpdate.enabled,
        version: currentUpdate.version,
        downloadUrl: currentUpdate.downloadUrl,
        releaseNotes: currentUpdate.releaseNotes || ''
      });
      notify.success(response.message || 'App update configuration saved');
      await loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to save app update configuration');
    } finally {
      setIsSavingAppUpdate(false);
    }
  };

  const updateAppUpdateField = (field: keyof AppUpdate, value: any) => {
    setAppUpdates(prev => ({
      ...prev,
      [activePlatform]: {
        ...prev[activePlatform],
        [field]: value
      }
    }));
  };


  const resetOptions: ResetOption[] = stats ? [
    {
      id: 'users',
      label: 'Users',
      description: 'Remove all users except superadmin',
      icon: <Users size={24} />,
      count: stats.users,
      color: 'var(--danger)',
    },
    {
      id: 'stores',
      label: 'Stores',
      description: 'Delete all stores and related data',
      icon: <Store size={24} />,
      count: stats.stores,
      color: 'var(--primary)',
    },
    {
      id: 'categories',
      label: 'Categories',
      description: 'Remove all menu categories',
      icon: <Tag size={24} />,
      count: stats.categories,
      color: 'var(--primary)',
    },
    {
      id: 'items',
      label: 'Items',
      description: 'Delete all menu items',
      icon: <Coffee size={24} />,
      count: stats.items,
      color: 'var(--primary)',
    },
    {
      id: 'tables',
      label: 'Tables',
      description: 'Remove all table configurations',
      icon: <Grid3X3 size={24} />,
      count: stats.tables,
      color: 'var(--primary)',
    },
    {
      id: 'orders',
      label: 'Orders',
      description: 'Delete all order history',
      icon: <ShoppingCart size={24} />,
      count: stats.orders,
      color: 'var(--primary)',
    },
    {
      id: 'bills',
      label: 'Bills',
      description: 'Remove all billing records',
      icon: <Receipt size={24} />,
      count: stats.bills,
      color: 'var(--primary)',
    },
  ] : [];

  const toggleOption = (id: string) => {
    const newSelected = new Set(selectedOptions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedOptions(newSelected);
  };

  const selectAll = () => {
    if (selectedOptions.size === resetOptions.length) {
      setSelectedOptions(new Set());
    } else {
      setSelectedOptions(new Set(resetOptions.map(o => o.id)));
    }
  };

  const handleReset = async () => {
    if (selectedOptions.size === 0) return;
    
    setIsResetting(true);
    setError('');
    
    try {
      const result = await api.resetSystem({
        users: selectedOptions.has('users'),
        stores: selectedOptions.has('stores'),
        categories: selectedOptions.has('categories'),
        items: selectedOptions.has('items'),
        orders: selectedOptions.has('orders'),
        tables: selectedOptions.has('tables'),
        bills: selectedOptions.has('bills'),
      });

      notify.success(result?.message || 'System reset completed successfully');
      setShowConfirm(false);
      await loadData();
      setSelectedOptions(new Set());
    } catch (err: any) {
      notify.error(err.message || 'Reset failed');
    } finally {
      setIsResetting(false);
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
        <AlertTriangle size={48} color="var(--danger)" />
        <h2>Access Denied</h2>
        <p>Only superadmin can access system reset functionality.</p>
      </div>
    );
  }

  return (
    <div className="system-reset-container">
      <div className="reset-intro">
        <div className="reset-warning">
          <AlertTriangle size={32} color="var(--danger)" />
          <div>
            <h3>Warning: Destructive Action</h3>
            <p>
              System reset will permanently delete selected data. This action cannot be undone.
              Make sure you have a backup if needed.
            </p>
          </div>
        </div>
      </div>

      {/* Periodic Cleanup Settings Card */}
      <div className="cleanup-config-card">
        <div className="cleanup-config-header">
          <Settings size={24} className="config-icon" />
          <div>
            <h3>Periodic Database Cleanup</h3>
            <p>Automatically clean up orders, bills, bill queues, and order items periodically across all stores.</p>
          </div>
        </div>
        
        <form onSubmit={handleSaveConfig} className="cleanup-config-form">
          <div className="gr-grid gr-form2">
            <div className="gr-field toggle-group">
              <label className="toggle-label">
                <span>Enable Periodic Cleanup</span>
                <span className="toggle-sub">Turn on/off automatic database purge</span>
              </label>
              <label className="gr-switch" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={cleanupEnabled}
                  onChange={(e) => setCleanupEnabled(e.target.checked)}
                />
              </label>
            </div>

            <div className="gr-field input-group">
              <label htmlFor="cleanupInterval">
                <span>Cleanup Period (Minutes)</span>
                <span className="toggle-sub">Interval between automatic purges</span>
              </label>
              <input
                id="cleanupInterval"
                type="number"
                min="1"
                required
                value={cleanupIntervalMins}
                onChange={(e) => setCleanupIntervalMins(Math.max(1, parseInt(e.target.value) || 1))}
                className="form-control"
                placeholder="60"
              />
            </div>
          </div>

          <div className="cleanup-status-info">
            <Clock size={16} />
            <span>
              Last Cleanup Run:{' '}
              <strong>
                {cleanupLastRun
                  ? new Date(cleanupLastRun).toLocaleString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Never'}
              </strong>
            </span>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="gr-btn gr-btn--primary"
              disabled={isSavingConfig}
            >
              {isSavingConfig ? (
                <>
                  <RefreshCw size={16} className="spin" style={{ marginRight: '0.5rem' }} />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* App Update Management Card */}
      <div className="cleanup-config-card">
        <div className="cleanup-config-header">
          <Download size={24} className="config-icon" />
          <div>
            <h3>App Update Management</h3>
            <p>Configure update notifications for mobile and desktop applications</p>
          </div>
        </div>

        {/* Platform Selector */}
        <div className="platform-selector">
          <button
            className={`platform-tab ${activePlatform === 'mobile' ? 'active' : ''}`}
            onClick={() => setActivePlatform('mobile')}
          >
            <Smartphone size={18} />
            Mobile App
          </button>
          <button
            className={`platform-tab ${activePlatform === 'desktop' ? 'active' : ''}`}
            onClick={() => setActivePlatform('desktop')}
          >
            <Monitor size={18} />
            Desktop App
          </button>
        </div>

        <form onSubmit={handleSaveAppUpdate} className="cleanup-config-form">
          <div className="gr-grid gr-form2">
            <div className="gr-field toggle-group">
              <label className="toggle-label">
                <span>Enable Update Notification</span>
                <span className="toggle-sub">
                  {activePlatform === 'mobile' 
                    ? 'Show download link in mobile app settings' 
                    : 'Show download banner in desktop app'}
                </span>
              </label>
              <label className="gr-switch" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={!!appUpdates[activePlatform]?.enabled}
                  onChange={(e) => updateAppUpdateField('enabled', e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="gr-grid gr-form2">
            <div className="gr-field input-group">
              <label htmlFor="version">
                <span>Version</span>
                <span className="toggle-sub">Latest version number (e.g., 1.2.0)</span>
              </label>
              <input
                id="version"
                type="text"
                required
                value={appUpdates[activePlatform]?.version || ''}
                onChange={(e) => updateAppUpdateField('version', e.target.value)}
                className="form-control"
                placeholder="1.2.2"
              />
            </div>

            <div className="gr-field input-group">
              <label htmlFor="downloadUrl">
                <span>Download URL</span>
                <span className="toggle-sub">Link to download the update</span>
              </label>
              <input
                id="downloadUrl"
                type="url"
                required
                value={appUpdates[activePlatform]?.downloadUrl || ''}
                onChange={(e) => updateAppUpdateField('downloadUrl', e.target.value)}
                className="form-control"
                placeholder="https://example.com/download"
              />
            </div>
          </div>

          <div className="gr-field">
            <label htmlFor="releaseNotes">
              <span>Release Notes (Optional)</span>
              <span className="toggle-sub">Describe what's new in this version</span>
            </label>
            <textarea
              id="releaseNotes"
              rows={3}
              value={appUpdates[activePlatform]?.releaseNotes || ''}
              onChange={(e) => updateAppUpdateField('releaseNotes', e.target.value)}
              className="form-control"
              placeholder="Bug fixes and performance improvements..."
            />
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="gr-btn gr-btn--primary"
              disabled={isSavingAppUpdate}
            >
              {isSavingAppUpdate ? (
                <>
                  <RefreshCw size={16} className="spin" style={{ marginRight: '0.5rem' }} />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </button>
          </div>
        </form>
      </div>


      {error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="reset-options-header">
        <h3>Select Data to Reset</h3>
        <button className="gr-btn gr-btn--secondary gr-btn--sm" onClick={selectAll}>
          {selectedOptions.size === resetOptions.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="reset-options-grid">
        {resetOptions.map((option) => (
          <div
            key={option.id}
            className={`reset-option-card ${selectedOptions.has(option.id) ? 'selected' : ''}`}
            onClick={() => toggleOption(option.id)}
            style={{ '--option-color': option.color } as React.CSSProperties}
          >
            <div className="reset-option-icon" style={{ color: option.color }}>
              {option.icon}
            </div>
            <div className="reset-option-content">
              <h4>{option.label}</h4>
              <p>{option.description}</p>
              <span className="reset-option-count">
                <Database size={12} />
                {option.count} records
              </span>
            </div>
            <div className="reset-option-check">
              {selectedOptions.has(option.id) && <Check size={20} />}
            </div>
          </div>
        ))}
      </div>

      <div className="reset-actions">
        <div className="reset-summary">
          {selectedOptions.size > 0 ? (
            <span>
              <strong>{selectedOptions.size}</strong> categories selected for reset
            </span>
          ) : (
            <span>Select at least one category to reset</span>
          )}
        </div>
        <button
          className="gr-btn gr-btn--danger gr-btn--sm"
          disabled={selectedOptions.size === 0 || isResetting}
          onClick={() => setShowConfirm(true)}
        >
          {isResetting ? (
            <>
              <RefreshCw size={18} className="spin" />
              Resetting...
            </>
          ) : (
            <>
              <Trash2 size={18} />
              Reset System
            </>
          )}
        </button>
      </div>

      {showConfirm && (
        <div className="gr-modal-live is-open">
          <div className="gr-modal" style={{ maxWidth: '480px' }}>
            <div className="gr-modal__head">
              <h3>Confirm System Reset</h3>
              <button className="gr-iconbtn" onClick={() => setShowConfirm(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="gr-modal__body">
              <div className="confirm-warning">
                <AlertTriangle size={48} color="var(--danger)" />
                <p>
                  You are about to permanently delete data from the following categories:
                </p>
                <ul className="confirm-list">
                  {Array.from(selectedOptions).map(id => {
                    const option = resetOptions.find(o => o.id === id);
                    return option ? (
                      <li key={id}>
                        <strong>{option.label}</strong> ({option.count} records)
                      </li>
                    ) : null;
                  })}
                </ul>
                <p className="confirm-note">
                  This action <strong>cannot be undone</strong>. Are you sure you want to continue?
                </p>
              </div>
            </div>
            <div className="gr-modal__foot">
              <button className="gr-btn gr-btn--secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button 
                className="gr-btn gr-btn--danger" 
                onClick={handleReset}
                disabled={isResetting}
              >
                {isResetting ? 'Resetting...' : 'Yes, Reset System'}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default SystemReset;
