import React from 'react';
import { useUpdater } from '../hooks/useUpdater';
import { Ic, Btn, Spin } from './gr';

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
      <div className="gr-modal-live is-open" style={{ zIndex: 10000 }}>
        <div className="gr-modal" style={{ maxWidth: '400px' }}>
          <div className="gr-modal__body" style={{ alignItems: 'center', textAlign: 'center', padding: '16px 0' }}>
            <Spin size={34} className="tint-primary" />
            <h3 className="gr-h3">
              {installKind === 'downgrade' ? 'Installing previous version' : 'Installing newer version'}
            </h3>
            <p className="gr-caption">The app will relaunch shortly…</p>
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
    <div className="gr gr-banner gr-banner--brand pos-update-bar">
      <div className="gr-banner__text">
        <b>New version {updateInfo.latestVersion} available!</b>
        {updateInfo.body && (
          <div className="update-banner-notes">{updateInfo.body}</div>
        )}
        {isDownloading && downloadProgress && (
          <div className="gr-row" style={{ marginTop: 6, gap: 8, flexWrap: 'nowrap' }}>
            <div className="gr-progress" style={{ maxWidth: 200 }}>
              <span style={{ width: `${downloadProgress.percentage}%`, background: '#fff' }} />
            </div>
            <span className="gr-caption" style={{ color: '#fff' }}>{downloadProgress.percentage}%</span>
          </div>
        )}
      </div>
      <div className="gr-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
        {!isDownloading ? (
          <Btn
            size="sm"
            className="gr-btn--white"
            onClick={async () => {
              try {
                await downloadAndInstall();
              } catch {
                // Error is already set in the hook state
              }
            }}
          >
            Download &amp; install
          </Btn>
        ) : (
          <span className="gr-caption" style={{ color: '#fff' }}>Downloading…</span>
        )}
        <Btn size="sm" variant="ghost" style={{ color: '#fff' }} onClick={dismissUpdate} disabled={isDownloading}>
          Remind me later
        </Btn>
      </div>
    </div>
  );
};

export default UpdateNotification;
