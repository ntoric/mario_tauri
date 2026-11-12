import React from 'react';
import { useUpdater } from '../hooks/useUpdater';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

const UpdateNotification: React.FC = () => {
  const {
    updateInfo,
    isDownloading,
    isInstalling,
    installKind,
    downloadProgress,
    downloadAndInstall,
    dismissUpdate,
  } = useUpdater(true, 3600000);

  if (!isTauri()) {
    return null;
  }

  if (isInstalling) {
    return (
      <div className="modal-overlay" style={{ zIndex: 10000 }}>
        <div className="modal" style={{ maxWidth: '400px' }}>
          <div className="modal-body" style={{ padding: '2.25rem', textAlign: 'center' }}>
            <div style={styles.spinner} className="animate-spin" />
            <h3 style={styles.title}>
              {installKind === 'downgrade' ? 'Installing Previous Version' : 'Installing Newer Version'}
            </h3>
            <p style={styles.text}>The app will relaunch shortly...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check/install errors are intentionally not shown here — they surface on
  // the Software Updates page only, so a transient failure never alarms
  // operators on the main screen.
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
              try {
                await downloadAndInstall();
              } catch {
                // Error is already set in the hook state
              }
            }}
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
  title: {
    margin: '0 0 8px',
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'var(--dark)',
  },
  text: {
    margin: 0,
    fontSize: '14px',
    color: 'var(--gray-500)',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid var(--gray-300)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    margin: '0 auto 16px',
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
    background: 'var(--light)',
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
    background: 'var(--light)',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '12px',
    minWidth: '36px',
  },
};

export default UpdateNotification;
