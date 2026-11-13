import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, Combine, Edit2, Eye, FolderOpen, History, Loader2, LogOut, Palette, Plus, Printer, RefreshCw, Settings, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useUpdater } from '../hooks/useUpdater';
import { useAuthStore, useDataStore, useUIStore } from '../stores';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from './ConfirmDialog';
import { updaterService } from '../services/updater';
import notify from '../utils/toast';
import { Ic } from './gr';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

interface MenuPosition {
  x: number;
  y: number;
}

const MENU_WIDTH = 250;
const MENU_HEIGHT_ESTIMATE = 360;

const AppContextMenu: React.FC = () => {
  const {
    downgradeInfo,
    isCheckingDowngrade,
    isDownloading,
    isInstalling,
    installKind,
    downloadProgress,
    checkForDowngrade,
    downgrade,
  } = useUpdater(false);

  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const { isAuthenticated, logout, user } = useAuthStore();
  const { openItemModal, openCategoryModal } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [tablesDeleteMode, setTablesDeleteMode] = useState(false);
  const [contextTableId, setContextTableId] = useState<string | null>(null);
  const [contextItemId, setContextItemId] = useState<string | null>(null);
  const [contextCategoryId, setContextCategoryId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const hasCheckedDowngrade = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    updaterService.getCurrentVersion().then((v) => {
      if (v !== 'unknown') setAppVersion(v);
    });
  }, []);

  // Show the custom menu on any right-click, in the browser and in Tauri.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Occupied table cards carry data-ctx-table=<id>; a right-click on one
      // surfaces per-table actions in the menu.
      const tableEl = (e.target as HTMLElement | null)?.closest?.('[data-ctx-table]');
      setContextTableId(tableEl?.getAttribute('data-ctx-table') ?? null);
      // Order-page item cards carry data-ctx-item=<id>; a right-click on one
      // surfaces the Edit Item action for privileged roles.
      const itemEl = (e.target as HTMLElement | null)?.closest?.('[data-ctx-item]');
      setContextItemId(itemEl?.getAttribute('data-ctx-item') ?? null);
      // Order-page category buttons carry data-ctx-category=<id>; same idea
      // for the Edit Category action.
      const catEl = (e.target as HTMLElement | null)?.closest?.('[data-ctx-category]');
      setContextCategoryId(catEl?.getAttribute('data-ctx-category') ?? null);
      setMenuPos({
        x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8),
        y: Math.min(e.clientY, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8),
      });
      // One check per app session — repeated right-clicks must not spam the
      // release-list endpoint. Tauri-only.
      if (isTauri() && !hasCheckedDowngrade.current) {
        hasCheckedDowngrade.current = true;
        checkForDowngrade();
      }
    };

    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [checkForDowngrade]);

  // The Tables page broadcasts its delete-mode state so this menu can label
  // the toggle correctly ("Delete Tables" vs "Done").
  useEffect(() => {
    const onDeleteState = (e: Event) =>
      setTablesDeleteMode((e as CustomEvent<boolean>).detail === true);
    window.addEventListener('app:tables-delete-state', onDeleteState);
    return () => window.removeEventListener('app:tables-delete-state', onDeleteState);
  }, []);

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
    // Scroll events don't bubble, so capture is needed to catch page scrolls —
    // but scrolling *inside* the menu must not close it.
    const onScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      close();
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [menuPos]);

  // location.key is 'default' only on the router's first history entry, so
  // Back is disabled when there's nowhere in-app to go back to.
  const canGoBack = location.key !== 'default';
  const isTablesPage = location.pathname === '/';
  const isAdmin = user?.role === 'superadmin' || user?.role === 'business_owner' || user?.role === 'business_admin';

  const handleBack = () => {
    setMenuPos(null);
    if (canGoBack) navigate(-1);
  };

  const handleRefresh = () => {
    setMenuPos(null);
    window.location.reload();
  };

  const handleNavigate = (to: string) => {
    setMenuPos(null);
    navigate(to);
  };

  const handleLogout = () => {
    setMenuPos(null);
    logout();
    navigate('/login');
  };

  // The Tables page owns the add-table modal and delete-mode flag; it listens
  // for these window events.
  const handleAddTable = () => {
    setMenuPos(null);
    window.dispatchEvent(new CustomEvent('app:tables-add'));
  };

  const handleToggleTableDelete = () => {
    setMenuPos(null);
    window.dispatchEvent(new CustomEvent('app:tables-delete-mode'));
  };

  const handleCustomizeLayout = () => {
    setMenuPos(null);
    window.dispatchEvent(new CustomEvent('app:tables-customize'));
  };

  const handleTableAction = (action: 'print-bill' | 'move' | 'merge' | 'view') => {
    const tableId = contextTableId;
    setMenuPos(null);
    if (!tableId) return;
    window.dispatchEvent(
      new CustomEvent('app:tables-table-action', { detail: { action, tableId } }),
    );
  };

  const handleEditItem = () => {
    const itemId = contextItemId;
    setMenuPos(null);
    if (!itemId) return;
    const item = useDataStore.getState().items.find(i => i.id === itemId);
    if (item) openItemModal(item);
  };

  const handleEditCategory = () => {
    const categoryId = contextCategoryId;
    setMenuPos(null);
    if (!categoryId) return;
    const category = useDataStore.getState().categories.find(c => c.id === categoryId);
    if (category) openCategoryModal(category);
  };

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

  const busy = isDownloading || isInstalling;

  return (
    <>
      {menuPos && (
        <div
          ref={menuRef}
          className="gr gr-menu"
          style={{
            position: 'fixed',
            top: menuPos.y,
            left: menuPos.x,
            width: MENU_WIDTH,
            zIndex: 10001,
            userSelect: 'none',
          }}
        >
          <button className="gr-menu__item" onClick={handleBack} disabled={!canGoBack}>
            <Ic icon={ArrowLeft} size={16} />
            Back
          </button>
          <button className="gr-menu__item" onClick={handleRefresh}>
            <Ic icon={RefreshCw} size={16} />
            Refresh
          </button>

          <div className="gr-menu__sep" />

          {contextTableId && (
            <>
              <button className="gr-menu__item" onClick={() => handleTableAction('print-bill')}>
                <Ic icon={Printer} size={16} />
                Print Bill
              </button>
              <button className="gr-menu__item" onClick={() => handleTableAction('move')}>
                <Ic icon={ArrowRightLeft} size={16} />
                Move Table
              </button>
              <button className="gr-menu__item" onClick={() => handleTableAction('merge')}>
                <Ic icon={Combine} size={16} />
                Merge Bill
              </button>
              <button className="gr-menu__item" onClick={() => handleTableAction('view')}>
                <Ic icon={Eye} size={16} />
                View Order
              </button>
              <div className="gr-menu__sep" />
            </>
          )}

          {contextItemId && isAdmin && (
            <>
              <button className="gr-menu__item" onClick={handleEditItem}>
                <Ic icon={Edit2} size={16} />
                Edit Item
              </button>
              <div className="gr-menu__sep" />
            </>
          )}

          {contextCategoryId && isAdmin && (
            <>
              <button className="gr-menu__item" onClick={handleEditCategory}>
                <Ic icon={FolderOpen} size={16} />
                Edit Category
              </button>
              <div className="gr-menu__sep" />
            </>
          )}

          {isTablesPage && isAuthenticated && (
            <>
              <button className="gr-menu__item" onClick={handleAddTable}>
                <Ic icon={Plus} size={16} />
                Add Table
              </button>
              {isAdmin && (
                <>
                  <button className="gr-menu__item" onClick={handleCustomizeLayout}>
                    <Ic icon={SlidersHorizontal} size={16} />
                    Customize Layout
                  </button>
                  <button
                    className={`gr-menu__item${tablesDeleteMode ? ' gr-menu__item--danger' : ''}`}
                    onClick={handleToggleTableDelete}
                  >
                    <Ic icon={Trash2} size={16} />
                    {tablesDeleteMode ? 'Done' : 'Delete Tables'}
                  </button>
                </>
              )}
              <div className="gr-menu__sep" />
            </>
          )}

          {isAuthenticated && (
            <>
              <button className="gr-menu__item" onClick={() => handleNavigate('/business-settings')}>
                <Ic icon={Settings} size={16} />
                Settings
              </button>
              <button className="gr-menu__item" onClick={() => handleNavigate('/appearance')}>
                <Ic icon={Palette} size={16} />
                Appearance
              </button>
              <button className="gr-menu__item gr-menu__item--danger" onClick={handleLogout}>
                <Ic icon={LogOut} size={16} />
                Sign out
              </button>

              <div className="gr-menu__sep" />
            </>
          )}

          <div className="pos-menu-user gr-caption" style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
            Mario Juicy{appVersion ? ` v${appVersion}` : ''}
          </div>

          {isTauri() && (
            isCheckingDowngrade ? (
              <div className="gr-menu__item" style={{ cursor: 'default' }}>
                <Ic icon={Loader2} size={16} className="animate-spin" />
                Checking for previous version…
              </div>
            ) : downgradeInfo?.available ? (
              <button className="gr-menu__item" onClick={handleDowngradeClick} disabled={busy}>
                <Ic icon={History} size={16} />
                Restore version {downgradeInfo.latestVersion}
              </button>
            ) : (
              <div className="gr-menu__item" style={{ cursor: 'default', opacity: .6 }}>
                <Ic icon={History} size={16} />
                No earlier version available
              </div>
            )
          )}
        </div>
      )}

      {/* Download progress — visible while a downgrade is downloading */}
      {isDownloading && downloadProgress && (
        <div
          className="gr gr-card gr-card--raised"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '280px',
            padding: '14px 16px',
            zIndex: 10001,
          }}
        >
          <div className="gr-label" style={{ marginBottom: 8 }}>
            {installKind === 'downgrade'
              ? `Downloading version ${downgradeInfo?.latestVersion || ''}…`
              : 'Downloading update…'}
          </div>
          <div className="gr-progress">
            <span style={{ width: `${downloadProgress.percentage}%` }} />
          </div>
          <div className="gr-caption" style={{ marginTop: 6, textAlign: 'right' }}>
            {downloadProgress.percentage}%
          </div>
        </div>
      )}

      {/* Installing overlay */}
      {isInstalling && (
        <div className="gr-modal-live is-open" style={{ zIndex: 10001 }}>
          <div className="gr-modal" style={{ maxWidth: '400px' }}>
            <div className="gr-modal__body" style={{ alignItems: 'center', textAlign: 'center', padding: '16px 0' }}>
              <Ic icon={Loader2} size={34} className="animate-spin tint-primary" />
              <h3 className="gr-h3">
                {installKind === 'downgrade' ? 'Installing previous version' : 'Installing newer version'}
              </h3>
              <p className="gr-caption">The app will relaunch shortly…</p>
            </div>
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

export default AppContextMenu;
