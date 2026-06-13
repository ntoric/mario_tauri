import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Coffee, History, LogOut, Store, Users, Building2, Settings, Key, ChevronUp, User, AlertTriangle, Download, MessageCircle, BarChart2, ShoppingBag, Tag } from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import StoreSelector from './StoreSelector';
import ChangePasswordModal from './ChangePasswordModal';
import UpdateBanner from './UpdateBanner';
import { PageHeaderProvider, usePageHeader } from '../contexts/PageHeaderContext';

const LayoutContent: React.FC = () => {
  const { user, logout, canSwitchStores, currentStoreId, ensureStoreSelected } = useAuthStore();
  const { stores } = useDataStore();
  const { headerContent } = usePageHeader();
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
      <aside className={`sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand" onClick={() => setSidebarExpanded(!sidebarExpanded)} style={{ cursor: 'pointer' }}>
            <div className="sidebar-brand-icon" style={{
              background: currentStore?.logoUrl ? 'white' : undefined,
              overflow: 'hidden',
              padding: currentStore?.logoUrl ? '4px' : undefined,
            }}>
              {currentStore?.logoUrl ? (
                <img
                  src={currentStore.logoUrl}
                  alt={currentStore.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <Store size={24} />
              )}
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
              {sidebarExpanded && <span>Tables</span>}
            </NavLink>
            <NavLink to="/items" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Items & Menu">
              <span className="nav-icon"><Coffee size={18} /></span>
              {sidebarExpanded && <span>Items & Menu</span>}
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Order History">
              <span className="nav-icon"><History size={18} /></span>
              {sidebarExpanded && <span>Order History</span>}
            </NavLink>
          </div>

          <div className="nav-section">
            {sidebarExpanded && <div className="nav-section-title">Settings</div>}
            <NavLink to="/business-settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Business Settings">
              <span className="nav-icon"><Settings size={18} /></span>
              {sidebarExpanded && <span>Business Settings</span>}
            </NavLink>
            <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Users">
              <span className="nav-icon"><Users size={18} /></span>
              {sidebarExpanded && <span>Users</span>}
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Reports" end>
              <span className="nav-icon"><BarChart2 size={18} /></span>
              {sidebarExpanded && <span>Reports</span>}
            </NavLink>
            <NavLink to="/reports/top-items" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Top Selling Items">
              <span className="nav-icon"><ShoppingBag size={18} /></span>
              {sidebarExpanded && <span>Top Items</span>}
            </NavLink>
            <NavLink to="/reports/top-categories" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Top Selling Categories">
              <span className="nav-icon"><Tag size={18} /></span>
              {sidebarExpanded && <span>Top Categories</span>}
            </NavLink>
          </div>

          {isSuperAdmin && (
            <div className="nav-section">
              {sidebarExpanded && <div className="nav-section-title">Administration</div>}
              <NavLink to="/stores" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Manage Stores">
                <span className="nav-icon"><Building2 size={18} /></span>
                {sidebarExpanded && <span>Manage Stores</span>}
              </NavLink>
              <NavLink to="/update-management" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Update Management">
                <span className="nav-icon"><Download size={18} /></span>
                {sidebarExpanded && <span>Update Management</span>}
              </NavLink>
              <NavLink to="/support-settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Support Settings">
                <span className="nav-icon"><MessageCircle size={18} /></span>
                {sidebarExpanded && <span>Support Settings</span>}
              </NavLink>
              <NavLink to="/system-reset" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="System Reset">
                <span className="nav-icon"><AlertTriangle size={18} /></span>
                {sidebarExpanded && <span>System Reset</span>}
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
                    background: 'var(--darker)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.3)'
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
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(245, 101, 101, 0.1)'}
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
                  className="btn btn-outline btn-icon"
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
                    background: 'var(--darker)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
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
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(245, 101, 101, 0.1)'}
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

      <main className={`main-content ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
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
            {showStoreSelector && <StoreSelector />}
          </div>
          
          <div className="navbar-right">
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
      <LayoutContent />
    </PageHeaderProvider>
  );
};

export default Layout;
