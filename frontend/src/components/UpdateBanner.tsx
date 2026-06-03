import React, { useState, useEffect } from 'react';
import { Download, X, AlertCircle } from 'lucide-react';
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

const CURRENT_APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const data = await api.getAppUpdate('desktop');
      if (data && data.enabled && isNewerVersion(CURRENT_APP_VERSION, data.version)) {
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
    <div className="update-banner">
      <div className="update-banner-content">
        <div className="update-banner-icon">
          <AlertCircle size={20} />
        </div>
        <div className="update-banner-text">
          <span className="update-banner-title">
            New Version Available: {update.version}
          </span>
          {update.releaseNotes && (
            <span className="update-banner-notes">
              {update.releaseNotes}
            </span>
          )}
        </div>
        <button
          className="update-banner-download"
          onClick={handleDownload}
        >
          <Download size={16} />
          Download Update
        </button>
        <button
          className="update-banner-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
      <style>{`
        .update-banner {
          background: #fff3e0;
          border-bottom: 2px solid #ff6b35;
          color: #1a1a1a;
          padding: 0.75rem 1rem;
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .update-banner-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .update-banner-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ff6b35;
          border-radius: 8px;
          color: white;
        }

        .update-banner-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .update-banner-title {
          font-weight: 600;
          font-size: 0.95rem;
          color: #1a1a1a;
        }

        .update-banner-notes {
          font-size: 0.8rem;
          color: #555;
        }

        .update-banner-download {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: #ff6b35;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .update-banner-download:hover {
          background: #e55a2b;
          transform: translateY(-1px);
        }

        .update-banner-dismiss {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.05);
          border: none;
          border-radius: 6px;
          color: #555;
          cursor: pointer;
          transition: all 0.2s;
        }

        .update-banner-dismiss:hover {
          background: rgba(0, 0, 0, 0.1);
          color: #1a1a1a;
        }

        @media (max-width: 768px) {
          .update-banner-content {
            flex-wrap: wrap;
            gap: 0.75rem;
          }

          .update-banner-text {
            flex-basis: 100%;
            order: -1;
          }

          .update-banner-download {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default UpdateBanner;
