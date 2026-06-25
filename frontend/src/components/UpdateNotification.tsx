import React from 'react';
import { useUpdater } from '../hooks/useUpdater';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

const UpdateNotification: React.FC = () => {
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
  } = useUpdater(true, 3600000);

  if (!isTauri()) {
    return null;
  }

  if (isInstalling) {
    return (
      <div style={styles.overlay}>
        <div style={styles.card}>
          <h3 style={styles.title}>Installing Update</h3>
          <p style={styles.text}>The app will relaunch shortly...</p>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.banner}>
        <span style={styles.bannerText}>Update error: {error}</span>
        <button style={styles.btnSmall} onClick={checkForUpdates} disabled={isChecking}>
          Retry
        </button>
        <button style={styles.btnSmall} onClick={dismissUpdate}>Dismiss</button>
      </div>
    );
  }

  if (!updateInfo?.available) {
    return null;
  }

  return (
    <div style={styles.banner}>
      <div style={styles.bannerInfo}>
        <strong>New version {updateInfo.latestVersion} available!</strong>
        {updateInfo.body && (
          <p style={styles.releaseNotes}>{updateInfo.body}</p>
        )}
        {isDownloading && downloadProgress && (
          <div style={styles.progressContainer}>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${downloadProgress.percentage}%`,
                }}
              />
            </div>
            <span style={styles.progressText}>{downloadProgress.percentage}%</span>
          </div>
        )}
      </div>
      <div style={styles.bannerActions}>
        {!isDownloading ? (
          <button
            style={styles.btnPrimary}
            onClick={async () => {
              await downloadUpdate();
              await installAndRelaunch();
            }}
            disabled={isChecking}
          >
            Download & Install
          </button>
        ) : (
          <span style={styles.downloadingText}>Downloading...</span>
        )}
        <button style={styles.btnSecondary} onClick={dismissUpdate} disabled={isDownloading}>
          Remind me later
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '20px',
  },
  text: {
    margin: '0 0 16px',
    color: '#666',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e0e0e0',
    borderTopColor: '#4f46e5',
    borderRadius: '50%',
    margin: '0 auto',
    animation: 'spin 1s linear infinite',
  },
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    background: '#4f46e5',
    color: '#fff',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9999,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    gap: '16px',
  },
  bannerInfo: {
    flex: 1,
    minWidth: 0,
  },
  bannerText: {
    fontSize: '14px',
  },
  releaseNotes: {
    margin: '4px 0 0',
    fontSize: '12px',
    opacity: 0.85,
    whiteSpace: 'pre-wrap',
    maxHeight: '60px',
    overflow: 'hidden',
  },
  bannerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexShrink: 0,
  },
  btnPrimary: {
    background: '#fff',
    color: '#4f46e5',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnSecondary: {
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnSmall: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  downloadingText: {
    fontSize: '14px',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '6px',
  },
  progressBar: {
    flex: 1,
    maxWidth: '200px',
    height: '6px',
    background: 'rgba(255,255,255,0.3)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#fff',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '12px',
    minWidth: '36px',
  },
};

export default UpdateNotification;
