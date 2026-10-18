import React, { useState, useEffect, useRef } from 'react';
import { History, Loader2 } from 'lucide-react';
import { useUpdater } from '../hooks/useUpdater';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from './ConfirmDialog';
import { updaterService } from '../services/updater';
import notify from '../utils/toast';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

interface MenuPosition {
  x: number;
  y: number;
}

const MENU_WIDTH = 250;
const MENU_HEIGHT_ESTIMATE = 110;

const AppContextMenu: React.FC = () => {
  const {
    downgradeInfo,
    isCheckingDowngrade,
    isDownloading,
    isInstalling,
    downloadProgress,
    checkForDowngrade,
    downgrade,
  } = useUpdater(false);

  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const hasCheckedDowngrade = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    updaterService.getCurrentVersion().then((v) => {
      if (v !== 'unknown') setAppVersion(v);
    });
  }, []);

  // Show the custom menu on any right-click. Desktop only — in a browser the
  // native context menu is left alone.
  useEffect(() => {
    if (!isTauri()) return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setMenuPos({
        x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8),
        y: Math.min(e.clientY, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8),
      });
      // One check per app session — repeated right-clicks must not spam the
      // release-list endpoint.
      if (!hasCheckedDowngrade.current) {
        hasCheckedDowngrade.current = true;
        checkForDowngrade();
      }
    };

    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [checkForDowngrade]);

  // Close on outside click, Escape, scroll, resize, or window blur.
  useEffect(() => {
    if (!menuPos) return;

    const close = () => setMenuPos(null);
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [menuPos]);

  const handleDowngradeClick = async () => {
    setMenuPos(null);
    const accepted = await confirm({
      title: 'Restore Previous Version',
      message: `Downgrade Mario Juicy from ${downgradeInfo?.currentVersion || appVersion || 'the current version'} to ${downgradeInfo?.latestVersion || 'the previous version'}? The app will restart after installing.`,
      confirmLabel: 'Downgrade',
      cancelLabel: 'Cancel',
      variant: 'warning',
    });
    if (!accepted) return;
    try {
      await downgrade();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to install downgrade');
    }
  };

  if (!isTauri()) {
    return null;
  }

  const busy = isDownloading || isInstalling;

  return (
    <>
      {menuPos && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.y,
            left: menuPos.x,
            width: MENU_WIDTH,
            background: 'var(--surface)',
            border: '1px solid var(--gray-200)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            padding: '6px',
            zIndex: 10001,
            userSelect: 'none',
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--gray-500)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Mario Juicy{appVersion ? ` v${appVersion}` : ''}
          </div>

          {isCheckingDowngrade ? (
            <div style={{ ...itemStyle, color: 'var(--gray-500)', cursor: 'default' }}>
              <Loader2 size={15} className="animate-spin" />
              Checking for previous version...
            </div>
          ) : downgradeInfo?.available ? (
            <button
              onClick={handleDowngradeClick}
              disabled={busy}
              style={{
                ...itemStyle,
                opacity: busy ? 0.5 : 1,
                cursor: busy ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!busy) e.currentTarget.style.background = 'var(--gray-100)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <History size={15} style={{ color: '#f59e0b' }} />
              Restore version {downgradeInfo.latestVersion}
            </button>
          ) : (
            <div style={{ ...itemStyle, color: 'var(--gray-400)', cursor: 'default' }}>
              <History size={15} />
              No earlier version available
            </div>
          )}
        </div>
      )}

      {/* Download progress — visible while a downgrade is downloading */}
      {isDownloading && downloadProgress && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '280px',
            background: 'var(--surface)',
            border: '1px solid var(--gray-200)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            padding: '14px 16px',
            zIndex: 10001,
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--gray-800)' }}>
            Downloading version {downgradeInfo?.latestVersion || ''}...
          </div>
          <div
            style={{
              height: '6px',
              background: 'var(--gray-200)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${downloadProgress.percentage}%`,
                background: '#f59e0b',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '6px', textAlign: 'right' }}>
            {downloadProgress.percentage}%
          </div>
        </div>
      )}

      {/* Installing overlay */}
      {isInstalling && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              padding: '32px',
              textAlign: 'center',
              maxWidth: '400px',
            }}
          >
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px', fontSize: '20px' }}>Installing Previous Version</h3>
            <p style={{ margin: 0, color: 'var(--gray-600)' }}>The app will relaunch shortly...</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--gray-800)',
  textAlign: 'left',
};

export default AppContextMenu;
