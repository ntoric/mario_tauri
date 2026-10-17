import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Coffee, History, LogOut, Users, Building2, Settings, Key, ChevronUp, User, AlertTriangle, Download, MessageCircle, BarChart2, ShoppingBag, Tag, DollarSign, TrendingUp, Clock, Wrench, Sparkles, Keyboard, Sun, Moon, LifeBuoy, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore, useDataStore, useUIStore } from '../stores';
import StoreSelector from './StoreSelector';
import ChangePasswordModal from './ChangePasswordModal';
import UpdateBanner from './UpdateBanner';
import { PageHeaderProvider, usePageHeader } from '../contexts/PageHeaderContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

const LayoutContent: React.FC = () => {
  const { user, logout, canSwitchStores, currentStoreId, ensureStoreSelected } = useAuthStore();
  const { stores } = useDataStore();
  const oskEnabled = useUIStore((state) => state.onScreenKeyboardEnabled);
  const toggleOsk = useUIStore((state) => state.toggleOnScreenKeyboard);
  const setColorMode = useUIStore((state) => state.setColorMode);
  const { isDark } = useTheme();
  const { headerContent } = usePageHeader();
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [now, setNow] = useState(new Date());
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Live clock (Petpooja-style date/time in top bar)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ensure store is selected on mount (for business_admin and staff)
  useEffect(() => {
    ensureStoreSelected();
  }, [ensureStoreSelected]);

  const currentStore = stores.find(s => s.id === currentStoreId);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleToggleOsk = () => {
    const next = !oskEnabled;
    toggleOsk();
    toast.success(next ? 'On-screen keyboard enabled' : 'On-screen keyboard disabled', { duration: 1500 });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const showStoreSelector = canSwitchStores();

  const isSuperAdmin = user?.role === 'superadmin';
  const isBusinessOwner = user?.role === 'business_owner';
  const isBusinessAdmin = user?.role === 'business_admin';
  const isStaff = user?.role === 'staff';
  const canManageStore = isSuperAdmin || isBusinessOwner || isBusinessAdmin;

  return (
    <div className="layout">
      <aside
        className={`sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'}`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="sidebar-header">
          <div className="sidebar-brand" style={{ cursor: 'default' }}>
            <div className="sidebar-brand-icon" style={{
              background: 'white',
              overflow: 'hidden',
              padding: '4px',
            }}>
              <img
                src={currentStore?.logoUrl || '/logo.png'}
                alt={currentStore?.name || 'Store logo'}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            {sidebarExpanded && (
              <span className="sidebar-brand-text">
                {currentStore?.name || 'Cafe Manager'}
              </span>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            {sidebarExpanded && <div className="nav-section-title">Main Menu</div>}
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end title="Tables">
              <span className="nav-icon"><LayoutGrid size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Tables</span>}
            </NavLink>
            <NavLink to="/items" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Items & Menu">
              <span className="nav-icon"><Coffee size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Items & Menu</span>}
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Order History">
              <span className="nav-icon"><History size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Order History</span>}
            </NavLink>
          </div>

          <div className="nav-section">
            {sidebarExpanded && <div className="nav-section-title">Settings</div>}
            <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Users">
              <span className="nav-icon"><Users size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Users</span>}
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Reports" end>
              <span className="nav-icon"><BarChart2 size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Reports</span>}
            </NavLink>
            <NavLink to="/business-settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Business Settings">
              <span className="nav-icon"><Settings size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Business Settings</span>}
            </NavLink>
            <NavLink to="/business-settings?tab=support" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Support">
              <span className="nav-icon"><LifeBuoy size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Support</span>}
            </NavLink>
          </div>

          <div className="nav-section">
            {sidebarExpanded && <div className="nav-section-title">Expenses</div>}
            <NavLink to="/expenses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Expenses">
              <span className="nav-icon"><DollarSign size={18} /></span>
              {sidebarExpanded && <span className="nav-label">Expenses</span>}
            </NavLink>
          </div>

          {isSuperAdmin && (
            <div className="nav-section">
              {sidebarExpanded && <div className="nav-section-title">Administration</div>}
              <NavLink to="/stores" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Manage Stores">
                <span className="nav-icon"><Building2 size={18} /></span>
                {sidebarExpanded && <span className="nav-label">Manage Stores</span>}
              </NavLink>
              <NavLink to="/menu-upload" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="AI Menu Upload">
                <span className="nav-icon"><Sparkles size={18} /></span>
                {sidebarExpanded && <span className="nav-label">AI Menu Upload</span>}
              </NavLink>
              <NavLink to="/update-management" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Update Management">
                <span className="nav-icon"><Download size={18} /></span>
                {sidebarExpanded && <span className="nav-label">Update Management</span>}
              </NavLink>
              <NavLink to="/support-tickets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Support Tickets">
                <span className="nav-icon"><Inbox size={18} /></span>
                {sidebarExpanded && <span className="nav-label">Support Tickets</span>}
              </NavLink>
              <NavLink to="/support-settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Support Settings">
                <span className="nav-icon"><MessageCircle size={18} /></span>
                {sidebarExpanded && <span className="nav-label">Support Settings</span>}
              </NavLink>
              <NavLink to="/developer-settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Developer Settings">
                <span className="nav-icon"><Wrench size={18} /></span>
                {sidebarExpanded && <span className="nav-label">Developer Settings</span>}
              </NavLink>
              <NavLink to="/system-reset" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="System Reset">
                <span className="nav-icon"><AlertTriangle size={18} /></span>
                {sidebarExpanded && <span className="nav-label">System Reset</span>}
              </NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            {sidebarExpanded ? (
              <>
                <button 
                  className="user-card"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  style={{ 
                    width: '100%', 
                    border: 'none', 
                    cursor: 'pointer',
                    background: showUserMenu ? 'rgba(255,255,255,0.1)' : undefined
                  }}
                >
                  <div className="user-avatar">
                    {user ? getInitials(user.name) : 'U'}
                  </div>
                  <div className="user-info" style={{ flex: 1, textAlign: 'left' }}>
                    <div className="user-name">{user?.name}</div>
                    <div className="user-role">{user?.role?.replace('_', ' ')}</div>
                  </div>
                  <ChevronUp 
                    size={16} 
                    style={{ 
                      transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--gray-400)'
                    }} 
                  />
                </button>

                {showUserMenu && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    right: 0,
                    marginBottom: '0.5rem',
                    background: 'rgba(12, 16, 23, 0.88)',
                    backdropFilter: 'blur(24px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: '0 -12px 36px rgba(8,12,18,0.4), inset 0 1px 0 rgba(255,255,255,0.08)'
                  }}>
                    <button
                      onClick={() => {
                        setShowChangePassword(true);
                        setShowUserMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--light)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Key size={16} />
                      Change Password
                    </button>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.75rem' }} />
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowUserMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(229,57,53, 0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button 
                  className="sidebar-user-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  title={user?.name}
                  style={{ 
                    position: 'relative',
                    background: showUserMenu ? 'rgba(255,255,255,0.1)' : undefined
                  }}
                >
                  <User size={18} />
                </button>

                {showUserMenu && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '100%',
                    marginBottom: '0.5rem',
                    marginLeft: '0.5rem',
                    background: 'rgba(12, 16, 23, 0.88)',
                    backdropFilter: 'blur(24px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: '0 -12px 36px rgba(8,12,18,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                    minWidth: '180px',
                    zIndex: 1000
                  }}>
                    <div style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--gray-400)',
                      fontSize: '0.8rem'
                    }}>
                      {user?.name}
                    </div>
                    <button
                      onClick={() => {
                        setShowChangePassword(true);
                        setShowUserMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--light)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Key size={16} />
                      Change Password
                    </button>
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowUserMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(229,57,53, 0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <UpdateBanner />
        <header className="top-navbar">
          <div className="navbar-left">
            <div className="navbar-page-info">
              <h1 className="navbar-page-title">{headerContent.title}</h1>
              {headerContent.subtitle && (
                <p className="navbar-page-subtitle">{headerContent.subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="navbar-center">
            {showStoreSelector ? (
              <StoreSelector />
            ) : (
              <div className="navbar-datetime">
                <Clock size={16} style={{ color: 'var(--primary)' }} />
                <div className="navbar-datetime-text">
                  <span className="navbar-time">
                    {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="navbar-date">
                    {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <div className="navbar-right">
            <button
              type="button"
              className="btn btn-outline btn-icon"
              onClick={() => setColorMode(isDark ? 'light' : 'dark')}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className={`btn btn-outline btn-icon navbar-osk-toggle ${oskEnabled ? 'active' : ''}`}
              onClick={handleToggleOsk}
              title={oskEnabled ? 'Disable on-screen keyboard' : 'Enable on-screen keyboard'}
              aria-label="Toggle on-screen keyboard"
            >
              <Keyboard size={18} />
            </button>
            {headerContent.actions && (
              <div className="navbar-actions">
                {headerContent.actions}
              </div>
            )}
          </div>
        </header>
        
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      <ChangePasswordModal 
        isOpen={showChangePassword} 
        onClose={() => setShowChangePassword(false)} 
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
