import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { api } from '../services/api';
import { updaterService } from '../services/updater';
import { Ic } from './gr';

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

const FALLBACK_APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.2.2';

const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      // Prefer the real desktop app version; fall back to the build-time env.
      const appVersion = await updaterService.getCurrentVersion();
      const currentVersion =
        appVersion !== 'unknown' ? appVersion : FALLBACK_APP_VERSION;
      const data = await api.getAppUpdate('desktop');
      if (data && data.enabled && isNewerVersion(currentVersion, data.version)) {
        setUpdate(data);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isNewerVersion = (current: string, latest: string): boolean => {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    
    // Pad with zeros if versions have different lengths
    while (currentParts.length < 3) currentParts.push(0);
    while (latestParts.length < 3) latestParts.push(0);
    
    for (let i = 0; i < 3; i++) {
      if (latestParts[i] > currentParts[i]) return true;
      if (latestParts[i] < currentParts[i]) return false;
    }
    return false;
  };

  const handleDownload = () => {
    if (update?.downloadUrl) {
      window.open(update.downloadUrl, '_blank');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Store dismissal in localStorage with version
    if (update) {
      localStorage.setItem(`update-dismissed-${update.version}`, 'true');
    }
  };

  // Check if this version was previously dismissed
  useEffect(() => {
    if (update) {
      const wasDismissed = localStorage.getItem(`update-dismissed-${update.version}`);
      if (wasDismissed === 'true') {
        setDismissed(true);
      }
    }
  }, [update]);

  if (isLoading || !update || dismissed) {
    return null;
  }

  return (
    <div className="gr-banner gr-banner--brand">
      <span className="update-banner-icon">
        <Download size={18} strokeWidth={1.8} />
      </span>
      <div className="gr-banner__text">
        <b>New version available: {update.version}</b>
        {update.releaseNotes && (
          <div className="update-banner-notes">{update.releaseNotes}</div>
        )}
      </div>
      <button
        className="gr-btn gr-btn--sm gr-btn--white"
        onClick={handleDownload}
      >
        <Ic name="download" size={16} />
        Download update
      </button>
      <button
        className="gr-iconbtn gr-iconbtn--sm"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{ color: '#fff' }}
      >
        <Ic name="x" size={16} />
      </button>
    </div>
  );
};

export default UpdateBanner;
