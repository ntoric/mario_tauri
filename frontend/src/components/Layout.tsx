import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Coffee,
  History,
  LogOut,
  Store,
  Users,
  User as UserIcon,
  Building2,
  Settings,
  Key,
  ChevronDown,
  AlertTriangle,
  Download,
  MessageCircle,
  BarChart2,
  DollarSign,
  Search,
  Menu,
  X,
  ArrowLeft,
  RotateCcw,
  Printer,
  Wrench,
  ShoppingBag,
  Keyboard,
  Package,
  ChefHat,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import StoreSelector from './StoreSelector';
import ChangePasswordModal from './ChangePasswordModal';
import UpdateBanner from './UpdateBanner';
import { printerService } from '../services/printer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import ShortcutsModal from './ShortcutsModal';
import { PageHeaderProvider, usePageHeader } from '../contexts/PageHeaderContext';
import { ThemeProvider } from '../contexts/ThemeContext';

interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  featureFlag?: 'kitchenWindowEnabled';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tables', description: 'Manage dining tables', icon: LayoutGrid },
  { to: '/kitchen', label: 'Kitchen', description: 'Kitchen display & order status', icon: ChefHat, featureFlag: 'kitchenWindowEnabled' },
  { to: '/items', label: 'Items & Menu', description: 'Manage menu items', icon: Coffee },
  { to: '/history', label: 'Order History', description: 'View past orders', icon: History },
  { to: '/users', label: 'Users', description: 'Manage user accounts', icon: Users },
  { to: '/reports', label: 'Reports', description: 'Sales & analytics', icon: BarChart2 },
  { to: '/business-settings', label: 'Business Settings', description: 'Configure business', icon: Settings },
  { to: '/expenses', label: 'Expenses', description: 'Track expenses', icon: DollarSign },
  { to: '/inventory', label: 'Inventory', description: 'Stock, recipes & purchases', icon: Package },
  { to: '/developer-settings', label: 'Developer Settings', description: 'Stores, support & system reset', icon: Wrench, superAdminOnly: true },
  { to: '/update-management', label: 'Update Management', description: 'Manage app updates', icon: Download, superAdminOnly: true },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Tables',
  '/kitchen': 'Kitchen Display',
  '/items': 'Items & Menu',
  '/history': 'Order History',
  '/users': 'Users',
  '/reports': 'Reports',
  '/business-settings': 'Business Settings',
  '/expenses': 'Expenses',
  '/inventory': 'Inventory',
  '/developer-settings': 'Developer Settings',
  '/update-management': 'Update Management',
};

const LayoutContent: React.FC = () => {
  const { user, logout, canSwitchStores, currentStoreId, ensureStoreSelected } = useAuthStore();
  const { stores } = useDataStore();
  const { headerContent } = usePageHeader();
  const navigate = useNavigate();
  const location = useLocation();

  const [railOpen, setRailOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [time, setTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [printerStatus, setPrinterStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [showShortcuts, setShowShortcuts] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const openRail = useCallback(() => setRailOpen(true), []);
  const closeRail = useCallback(() => setRailOpen(false), []);
  const toggleRail = useCallback(() => setRailOpen((v) => !v), []);

  useEffect(() => {
    ensureStoreSelected();
  }, [ensureStoreSelected]);

  const currentStore = stores.find((s) => s.id === currentStoreId);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Online/offline status
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Printer status
  useEffect(() => {
    let mounted = true;
    const checkPrinter = async () => {
      try {
        const status = await printerService.getStatus() as any;
        if (mounted) setPrinterStatus(status?.status === 'online' ? 'online' : 'offline');
      } catch {
        if (mounted) setPrinterStatus('offline');
      }
    };
    checkPrinter();
    const interval = setInterval(checkPrinter, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts(navigate, () => setShowShortcuts(s => !s));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isSuperAdmin = user?.role === 'superadmin';
  const showStoreSelector = canSwitchStores();

  const pageTitle = headerContent.title || PAGE_TITLES[location.pathname] || 'Mario';

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.featureFlag === 'kitchenWindowEnabled' && !currentStore?.kitchenWindowEnabled) return false;
    return true;
  });

  const searchResults = searchQuery
    ? visibleNavItems.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleSearchSelect = (item: NavItem) => {
    navigate(item.to);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      closeRail();
    }
  };

  return (
    <div className="app-container">
      {/* ===== Top Bar ===== */}
      <header className="zoho-topbar" data-tauri-drag-region>
        <div className="zoho-topbar-left" data-tauri-drag-region>
          <button
            onClick={toggleRail}
            aria-label="Toggle navigation"
            className="zoho-menu-toggle"
          >
            <Menu size={16} />
          </button>
          <div className="zoho-topbar-logo" data-tauri-drag-region>
            {currentStore?.logoUrl ? (
              <img
                src={currentStore.logoUrl}
                alt={currentStore.name}
                className="zoho-topbar-logo-img"
              />
            ) : (
              <Store size={16} />
            )}
          </div>
          <div className="zoho-topbar-breadcrumb" data-tauri-drag-region>
            <span>{currentStore?.name || 'Mario'}</span>
            <span className="zoho-topbar-breadcrumb-sep">/</span>
            <span className="zoho-topbar-breadcrumb-page">{pageTitle}</span>
          </div>
        </div>

        {/* Center: Search */}
        <div className="zoho-search" ref={searchRef}>
          <Search size={14} className="zoho-search-icon" />
          <input
            className="zoho-search-input"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => setShowSearchResults(true)}
          />
          {showSearchResults && searchResults.length > 0 && (
            <div className="zoho-search-results">
              {searchResults.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.to}
                    className="zoho-search-result-item"
                    onClick={() => handleSearchSelect(item)}
                  >
                    <Icon size={12} />
                    <span className="zoho-search-result-label">{item.label}</span>
                    <span className="zoho-search-result-path">{item.to}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick access: Tables + Parcel */}
        <div className="zoho-topbar-quick">
          <button
            className={`zoho-quick-btn ${location.pathname === '/' ? 'is-active' : ''}`}
            onClick={() => navigate('/')}
            title="Tables"
          >
            <LayoutGrid size={16} />
            <span>Tables</span>
          </button>
          <button
            className={`zoho-quick-btn ${location.pathname === '/parcel-order' ? 'is-active' : ''}`}
            onClick={() => navigate('/parcel-order')}
            title="Parcel Order"
          >
            <ShoppingBag size={16} />
            <span>Parcel</span>
          </button>
        </div>

        {/* Right: store selector + clock + user */}
        <div className="zoho-topbar-right">
          {showStoreSelector && (
            <div className="zoho-topbar-store">
              <StoreSelector />
            </div>
          )}

          <div className="zoho-topbar-clock" data-tauri-drag-region>
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>

          {user && (
            <div style={{ position: 'relative' }} ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`zoho-user-btn ${showUserMenu ? 'is-open' : ''}`}
              >
                <div className="zoho-user-avatar">{getInitials(user.name)}</div>
                <div className="zoho-user-name">{user.name}</div>
                <ChevronDown size={12} className="zoho-user-chevron" />
              </button>

              {showUserMenu && (
                <div className="zoho-user-dropdown">
                  <div className="zoho-user-dropdown-header">
                    <div className="zoho-user-dropdown-avatar">
                      {getInitials(user.name)}
                    </div>
                    <div className="zoho-user-dropdown-info">
                      <div className="zoho-user-dropdown-name">{user.name}</div>
                      <div className="zoho-user-dropdown-role">
                        {user.role?.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigate('/profile');
                      setShowUserMenu(false);
                    }}
                    className="zoho-user-dropdown-item"
                  >
                    <UserIcon size={14} />
                    My Profile
                  </button>
                  <button
                    onClick={() => {
                      setShowChangePassword(true);
                      setShowUserMenu(false);
                    }}
                    className="zoho-user-dropdown-item"
                  >
                    <Key size={14} />
                    Change Password
                  </button>
                  <button
                    onClick={() => {
                      handleLogout();
                      setShowUserMenu(false);
                    }}
                    className="zoho-user-dropdown-item zoho-user-dropdown-danger"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ===== Body: Rail + Main ===== */}
      <div className="app-body">
        <div className={`no-print zoho-rail ${railOpen ? 'is-open' : ''}`}>
          <nav className="zoho-rail-nav">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `zoho-rail-item ${isActive ? 'is-active' : ''}`
                  }
                  title={item.label}
                >
                  <span className="zoho-rail-item-icon">
                    <Icon size={18} />
                  </span>
                  <span className="zoho-rail-item-label">{item.label}</span>
                  <span className="zoho-rail-popover">
                    <span className="zoho-rail-popover-icon">
                      <Icon size={14} />
                    </span>
                    <span className="zoho-rail-popover-text">
                      <span className="zoho-rail-popover-label">{item.label}</span>
                      <span className="zoho-rail-popover-desc">{item.description}</span>
                    </span>
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {railOpen && (
          <div className="sidebar-backdrop is-open" onClick={closeRail}>
            <X size={20} className="sidebar-backdrop-close" />
          </div>
        )}

        <main className="main-content">
          <UpdateBanner />

          {/* Page header — title + actions from PageHeaderContext */}
          {(headerContent.title || headerContent.actions) && (
            <div className="zoho-page-header">
              <h1 className="zoho-page-title">{headerContent.title || pageTitle}</h1>
              {headerContent.actions && (
                <div className="zoho-page-header-actions">{headerContent.actions}</div>
              )}
            </div>
          )}

          <div className="zoho-page-content">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ===== Status Bar ===== */}
      <footer className="zoho-status-bar">
        <div className="zoho-status-bar-left">
          <span className={`zoho-status-bar-online ${isOnline ? 'is-online' : 'is-offline'}`} title={isOnline ? 'Online' : 'Offline'} />
          <span>{isOnline ? 'Online' : 'Offline'}</span>
          <span className="zoho-status-bar-divider" />
          <Printer size={12} style={{ opacity: 0.6 }} />
          <span
            className={`zoho-status-bar-printer ${printerStatus === 'online' ? 'is-online' : printerStatus === 'offline' ? 'is-offline' : 'is-checking'}`}
            title={printerStatus === 'online' ? 'Printer Service Online' : printerStatus === 'offline' ? 'Printer Service Offline' : 'Checking printer...'}
          >
            {printerStatus === 'online' ? 'Printer Ready' : printerStatus === 'offline' ? 'Printer Offline' : 'Checking...'}
          </span>
          <span className="zoho-status-bar-divider" />
          <span>Mario</span>
          <span className="zoho-status-bar-divider" />
          <span>v{import.meta.env.VITE_APP_VERSION || '1.5.0'}</span>
        </div>
        <div className="zoho-status-bar-right">
          <span>{currentStore?.name || 'No store'}</span>
          <span className="zoho-status-bar-divider" />
          <span>{user?.role?.replace('_', ' ')}</span>
          <span className="zoho-status-bar-divider" />
          <div className="zoho-status-bar-actions">
            <button
              className="zoho-status-bar-btn"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard size={13} />
            </button>
            <button
              className="zoho-status-bar-btn"
              onClick={() => navigate(-1)}
              title="Go Back (Alt+B)"
              disabled={location.pathname === '/'}
            >
              <ArrowLeft size={13} />
            </button>
            <button
              className="zoho-status-bar-btn"
              onClick={() => window.location.reload()}
              title="Reload"
            >
              <RotateCcw size={13} />
            </button>
            <button
              className="zoho-status-bar-btn"
              onClick={() => navigate('/business-settings')}
              title="Settings"
            >
              <Settings size={13} />
            </button>
            <button
              className="zoho-status-bar-btn danger"
              onClick={handleLogout}
              title="Sign Out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </footer>

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
};

const Layout: React.FC = () => {
  return (
    <PageHeaderProvider>
      <ThemeProvider>
        <LayoutContent />
      </ThemeProvider>
    </PageHeaderProvider>
  );
};

export default Layout;
