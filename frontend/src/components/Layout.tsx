import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Coffee, History, Building2, Key, LogOut, Wrench, AlertTriangle, Crown, Boxes, Keyboard, Sun, Moon, LifeBuoy, Package, Pin, PinOff, BarChart3, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore, useDataStore, useUIStore, useAppearanceStore } from '../stores';
import StoreSelector from './StoreSelector';
import ChangePasswordModal from './ChangePasswordModal';
import ItemModal from './ItemModal';
import CategoryModal from './CategoryModal';
import UpdateBanner from './UpdateBanner';
import { PageHeaderProvider, usePageHeader } from '../contexts/PageHeaderContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { Ic, Logo, IconBtn, Dropdown, MenuItem, MenuSep, Avatar, Seg } from './gr';

// Isolated so the 1s tick only re-renders the clock, not the whole layout tree.
const NavbarClock: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="navbar-datetime">
      <Ic name="clock" size={16} className="tint-primary" />
      <div className="navbar-datetime-text">
        <span className="navbar-time">
          {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="navbar-date">
          {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </div>
  );
};

interface RailItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  show?: boolean;
}

const RailLink: React.FC<RailItem & { activeOverride?: boolean }> = ({ to, icon, label, end, activeOverride }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => `gr-sidebar__item ${(activeOverride ?? isActive) ? 'is-active' : ''}`}
    title={label}
    aria-label={label}
  >
    {icon}
    <span className="gr-sidebar__label">{label}</span>
  </NavLink>
);

const LayoutContent: React.FC = () => {
  const { user, logout, canSwitchStores, currentStoreId, ensureStoreSelected } = useAuthStore();
  const { stores } = useDataStore();
  const oskEnabled = useUIStore((state) => state.onScreenKeyboardEnabled);
  const statsVisible = useUIStore((state) => state.statsVisible);
  const toggleStatsVisible = useUIStore((state) => state.toggleStatsVisible);
  const toggleOsk = useUIStore((state) => state.toggleOnScreenKeyboard);
  const setColorMode = useUIStore((state) => state.setColorMode);
  const { isDark } = useTheme();
  const { headerContent } = usePageHeader();
  const navigate = useNavigate();
  const location = useLocation();
  const isInventoryPath = location.pathname === '/inventory';
  const [showChangePassword, setShowChangePassword] = useState(false);
  const sidebarStyle = useAppearanceStore((s) => s.sidebarStyle);
  const sidebarLocked = useAppearanceStore((s) => s.sidebarLocked);
  const setSidebarLocked = useAppearanceStore((s) => s.setSidebarLocked);
  const [sidebarHover, setSidebarHover] = useState(false);
  const sidebarExpanded =
    sidebarLocked || sidebarStyle === 'expanded' || (sidebarStyle === 'hover' && sidebarHover);

  const toggleSidebar = () => {
    setSidebarLocked(!sidebarLocked);
  };

  useEffect(() => {
    ensureStoreSelected();
  }, [ensureStoreSelected]);

  const currentStore = stores.find(s => s.id === currentStoreId);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleToggleOsk = () => {
    const next = !oskEnabled;
    toggleOsk();
    toast.success(next ? 'On-screen keyboard enabled' : 'On-screen keyboard disabled', { duration: 1500 });
  };

  const showStoreSelector = canSwitchStores();

  const isSuperAdmin = user?.role === 'superadmin';
  const isBusinessAdmin = user?.role === 'business_admin';
  const canManageStore = isSuperAdmin || user?.role === 'business_owner' || isBusinessAdmin;
  const showMyPlan = isSuperAdmin || !!currentStore?.myPlanEnabled;

  const icon = (el: React.ReactNode) => el;

  const mainItems: RailItem[] = [
    { to: '/', icon: <Ic name="grid" />, label: 'Tables', end: true },
    { to: '/items', icon: icon(<Ic icon={Coffee} />), label: 'Items & Menu' },
    { to: '/history', icon: icon(<Ic icon={History} />), label: 'Order History' },
    { to: '/reports', icon: <Ic name="chart" />, label: 'Reports', end: true },
  ];

  const moneyItems: RailItem[] = [
    { to: '/expenses', icon: <Ic name="wallet" />, label: 'Expenses' },
    { to: '/inventory', icon: icon(<Ic icon={Boxes} />), label: 'Raw Materials' },
  ];

  const adminItems: RailItem[] = isSuperAdmin ? [
    { to: '/stores', icon: icon(<Ic icon={Building2} />), label: 'Manage Stores' },
    { to: '/subscriptions', icon: <Ic name="credit" />, label: 'Subscriptions' },
    { to: '/menu-upload', icon: <Ic name="sparkle" />, label: 'AI Menu Upload' },
    { to: '/update-management', icon: <Ic name="download" />, label: 'Update Management' },
    { to: '/support-tickets', icon: <Ic name="inbox" />, label: 'Support Tickets' },
    { to: '/support-settings', icon: <Ic name="chat" />, label: 'Support Settings' },
    { to: '/developer-settings', icon: icon(<Ic icon={Wrench} />), label: 'Developer Settings' },
    { to: '/system-reset', icon: icon(<Ic icon={AlertTriangle} />), label: 'System Reset' },
  ] : [];

  const settingsItems: RailItem[] = [
    { to: '/users', icon: <Ic name="users" />, label: 'Users' },
    { to: '/appearance', icon: icon(<Ic icon={Palette} />), label: 'Appearance' },
    ...(showMyPlan ? [{ to: '/my-plan', icon: icon(<Ic icon={Crown} />), label: 'My Plan' } as RailItem] : []),
    { to: '/business-settings', icon: <Ic name="settings" />, label: 'Business Settings' },
    { to: '/business-settings?tab=support', icon: icon(<Ic icon={LifeBuoy} />), label: 'Support' },
  ];

  return (
    <div className={`gr gr-shell${statsVisible ? '' : ' stats-hidden'}`}>
      <aside
        className={`gr-sidebar${sidebarExpanded ? ' gr-sidebar--wide' : ''}`}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
        <span className="gr-sidebar__logo">
          {currentStore?.logoUrl ? (
            <img
              src={currentStore.logoUrl}
              alt={currentStore.name ? `${currentStore.name} logo` : 'Store logo'}
              style={{
                maxWidth: '100%',
                maxHeight: sidebarExpanded ? 56 : 48,
                objectFit: 'contain',
                background: '#ffffff',
                borderRadius: 10,
                padding: 5,
              }}
            />
          ) : (
            <Logo kind={sidebarExpanded ? "wordmark-white" : "symbol-white"} width="100%" />
          )}
        </span>

        <nav className="gr-sidebar__nav">
          {mainItems.map((it) => <RailLink key={it.to} {...it} />)}
          <span className="gr-sidebar__sep" />
          {moneyItems.map((it) => (
            <RailLink key={it.to} {...it} activeOverride={it.to === '/inventory' ? isInventoryPath : undefined} />
          ))}
          {adminItems.length > 0 && <span className="gr-sidebar__sep" />}
          {adminItems.map((it) => <RailLink key={it.to} {...it} />)}
          <span className="gr-sidebar__sep" />
          {settingsItems.map((it) => <RailLink key={it.to} {...it} />)}
        </nav>

        <button
          className="gr-sidebar__item gr-sidebar__toggle"
          onClick={toggleSidebar}
          title={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
          aria-label={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
          aria-pressed={sidebarLocked}
        >
          <Ic icon={sidebarLocked ? PinOff : Pin} />
          <span className="gr-sidebar__label">{sidebarLocked ? 'Unpin' : 'Pin open'}</span>
        </button>

        <Dropdown
          right={false}
          className="gr-dropdown--up"
          trigger={
            <button className="gr-sidebar__item" title={user?.name || 'Account'} aria-label="Account">
              <Avatar sm>{user ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}</Avatar>
              <span className="gr-sidebar__label">{user?.name || 'Account'}</span>
            </button>
          }
        >
          <div className="pos-menu-user">
            <div className="user-name">{user?.name}</div>
            <div className="user-role">{user?.role?.replace('_', ' ')}</div>
          </div>
          <MenuSep />
          <MenuItem icon={<Ic icon={Palette} size={16} />} onClick={() => navigate('/appearance')}>
            Appearance
          </MenuItem>
          <MenuItem icon={<Ic name="lock" size={16} />} onClick={() => setShowChangePassword(true)}>
            Change password
          </MenuItem>
          <MenuItem danger icon={<Ic name="logout" size={16} />} onClick={handleLogout}>
            Sign out
          </MenuItem>
        </Dropdown>
      </aside>

      <main className="gr-shell__main">
        <UpdateBanner />
        <header className="gr-topnav">
          <div className="gr-topnav__page">
            <h1 className="gr-h2">{headerContent.title}</h1>
            {headerContent.subtitle && <p className="gr-caption">{headerContent.subtitle}</p>}
          </div>
          <div className="gr-spacer" />
          {showStoreSelector ? <StoreSelector /> : <NavbarClock />}
          <Seg
            plain={false}
            value={isDark ? 'dark' : 'light'}
            onChange={(v) => setColorMode(v as 'light' | 'dark')}
            options={[
              { value: 'light', icon: <Ic name="sun" size={16} />, title: 'Light mode' },
              { value: 'dark', icon: <Ic name="moon" size={16} />, title: 'Dark mode' },
            ]}
          />
          <IconBtn
            className="stats-toggle"
            label={statsVisible ? 'Hide stats widgets' : 'Show stats widgets'}
            variant={statsVisible ? 'filled' : 'outline'}
            icon={<Ic icon={BarChart3} />}
            onClick={toggleStatsVisible}
          />
          <IconBtn
            label={oskEnabled ? 'Disable on-screen keyboard' : 'Enable on-screen keyboard'}
            variant={oskEnabled ? 'filled' : 'outline'}
            icon={<Ic icon={Keyboard} />}
            onClick={handleToggleOsk}
          />
          {headerContent.actions && (
            <div className="gr-row" style={{ gap: 8 }}>
              {headerContent.actions}
            </div>
          )}
        </header>

        <Outlet />

        <ChangePasswordModal
          isOpen={showChangePassword}
          onClose={() => setShowChangePassword(false)}
        />
        <ItemModal />
        <CategoryModal />
      </main>
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
