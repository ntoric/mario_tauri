import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Lock, Eye, EyeOff, Power, Loader2 } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';

const ROLES = [
  { value: 'superadmin', label: 'Super Admin', description: 'Full system access' },
  { value: 'business_owner', label: 'Business Owner', description: 'Can manage multiple stores' },
  { value: 'business_admin', label: 'Business Admin', description: 'Store administrator' },
  { value: 'staff', label: 'Staff', description: 'Regular staff member' },
];

// Roles available for business_admin to assign
const BUSINESS_ADMIN_ROLES = [
  { value: 'business_admin', label: 'Business Admin', description: 'Store administrator' },
  { value: 'staff', label: 'Staff', description: 'Regular staff member' },
];

const Users: React.FC = () => {
  const { users, stores, createUser, updateUser, deleteUser, resetPassword, fetchUsers, fetchStores } = useDataStore();
  const { user: currentUser, currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [showModal, setShowModal] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchUsers();
    fetchStores();
  }, [fetchUsers, fetchStores]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [passwordUser, setPasswordUser] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'staff',
    storeId: '',
    storeIds: [] as string[],
  });

  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });

  const isBusinessAdmin = currentUser?.role === 'business_admin';
  const isBusinessOwner = currentUser?.role === 'business_owner';
  const isSuperAdmin = currentUser?.role === 'superadmin';

  const openModal = (user?: any) => {
    if (user) {
      setEditingUser(user);
      setForm({
        username: user.username,
        password: '',
        name: user.name,
        email: user.email || '',
        role: user.role,
        storeId: user.storeId || '',
        storeIds: user.storeIds || [],
      });
    } else {
      setEditingUser(null);
      // For business_admin, auto-assign to their current store
      const defaultStoreId = isBusinessAdmin ? currentStoreId : (stores[0]?.id || '');
      setForm({
        username: '',
        password: '',
        name: '',
        email: '',
        role: 'staff',
        storeId: defaultStoreId || '',
        storeIds: [],
      });
    }
    setShowModal(true);
  };

  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    // For business_admin, don't send storeId - backend will auto-assign to their store
    const storeId = isBusinessAdmin ? undefined : 
      (form.role === 'staff' || form.role === 'business_admin' ? form.storeId : undefined);
    
    const userData = {
      username: form.username,
      password: form.password,
      name: form.name,
      email: form.email,
      role: form.role,
      storeId: storeId,
      storeIds: form.role === 'business_owner' ? form.storeIds : undefined,
    };

    try {
      if (editingUser) {
        const updateData = { ...userData };
        delete (updateData as any).password;
        await updateUser(editingUser.id, updateData);
      } else {
        console.log('Creating user with data:', userData);
        await createUser(userData);
        console.log('User created successfully');
      }
      setShowModal(false);
      setForm({ username: '', password: '', name: '', email: '', role: 'staff', storeId: '', storeIds: [] });
    } catch (err: any) {
      console.error('Failed to create user:', err);
      setError(err.message || 'Failed to save user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPasswordModal = (user: any) => {
    setPasswordUser(user);
    setPasswordForm({ password: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSuccess('');
    setShowPassword(false);
    setShowPasswordModal(true);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsPasswordSubmitting(true);
    try {
      await resetPassword(passwordUser.id, passwordForm.password);
      setPasswordSuccess(`Password for ${passwordUser.name} has been reset successfully`);
      setPasswordForm({ password: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordModal(false);
      }, 2000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to reset password');
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  const canManageRole = (role: string) => {
    if (currentUser?.role === 'superadmin') return true;
    if (currentUser?.role === 'business_owner') return role !== 'superadmin';
    if (currentUser?.role === 'business_admin') return role === 'staff' || role === 'business_admin';
    return false;
  };

  const handleDeleteUser = async (user: any) => {
    const confirmed = await confirm({
      title: 'Delete User',
      message: `Are you sure you want to delete "${user.name}" (${user.username})? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    
    if (confirmed) {
      setLoadingUserId(user.id);
      try {
        await deleteUser(user.id);
      } finally {
        setLoadingUserId(null);
      }
    }
  };

  const handleToggleActive = async (user: any) => {
    const action = user.isActive ? 'disable' : 'enable';
    const confirmed = await confirm({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      message: `Are you sure you want to ${action} "${user.name}" (${user.username})?`,
      confirmLabel: action === 'disable' ? 'Disable' : 'Enable',
      variant: action === 'disable' ? 'warning' : 'info',
    });
    
    if (confirmed) {
      setLoadingUserId(user.id);
      try {
        await updateUser(user.id, { isActive: !user.isActive });
      } finally {
        setLoadingUserId(null);
      }
    }
  };

  const getAvailableRoles = () => {
    if (isBusinessAdmin) {
      return BUSINESS_ADMIN_ROLES;
    }
    return ROLES.filter(r => canManageRole(r.value));
  };

  const getRoleLabel = (role: string) => {
    return ROLES.find(r => r.value === role)?.label || role;
  };

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'User Management',
      subtitle: 'Manage system users and permissions',
      actions: (
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={18} />
          Add User
        </button>
      ),
    });
  }, [setHeaderContent]);

  return (
    <div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="items-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Store</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>{user.email}</div>
                  </td>
                  <td>{user.username}</td>
                  <td><span className="badge badge-primary">{getRoleLabel(user.role)}</span></td>
                  <td>{user.storeName || user.storeIds?.length > 0 ? `${user.storeIds?.length || 1} store(s)` : '-'}</td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn edit" onClick={() => openModal(user)} title="Edit User">
                        <Edit2 size={14} />
                      </button>
                      {(currentUser?.role === 'superadmin' || currentUser?.role === 'business_owner') && (
                        <button 
                          className="action-btn" 
                          style={{ background: 'rgba(255, 193, 7, 0.1)', color: 'var(--warning)' }} 
                          onClick={() => openPasswordModal(user)} 
                          title="Reset Password"
                        >
                          <Lock size={14} />
                        </button>
                      )}
                      {canManageRole(user.role) && user.id !== currentUser?.id && (
                        <>
                          <button 
                            className="action-btn" 
                            style={{ 
                              background: user.isActive ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', 
                              color: user.isActive ? 'var(--danger)' : 'var(--success)',
                              opacity: loadingUserId === user.id ? 0.5 : 1,
                              cursor: loadingUserId === user.id ? 'not-allowed' : 'pointer'
                            }} 
                            onClick={() => handleToggleActive(user)}
                            title={user.isActive ? 'Disable User' : 'Enable User'}
                            disabled={loadingUserId === user.id}
                          >
                            {loadingUserId === user.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Power size={14} />
                            )}
                          </button>
                          <button 
                            className="action-btn delete" 
                            onClick={() => handleDeleteUser(user)}
                            title="Delete User"
                            style={{
                              opacity: loadingUserId === user.id ? 0.5 : 1,
                              cursor: loadingUserId === user.id ? 'not-allowed' : 'pointer'
                            }}
                            disabled={loadingUserId === user.id}
                          >
                            {loadingUserId === user.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      required
                      disabled={!!editingUser}
                    />
                  </div>
                </div>
                
                {!editingUser && (
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      required={!editingUser}
                    />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                      required
                    >
                      {getAvailableRoles().map(role => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {(form.role === 'staff' || form.role === 'business_admin') && !isBusinessAdmin && (
                  <div className="form-group">
                    <label>Assigned Store</label>
                    <select
                      value={form.storeId}
                      onChange={e => setForm({ ...form, storeId: e.target.value })}
                      required
                    >
                      <option value="">Select Store</option>
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.name} - {store.branch}</option>
                      ))}
                    </select>
                  </div>
                )}

                

                {form.role === 'business_owner' && (
                  <div className="form-group">
                    <label>Assigned Stores</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {stores.map(store => (
                        <label key={store.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={form.storeIds.includes(store.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm({ ...form, storeIds: [...form.storeIds, store.id] });
                              } else {
                                setForm({ ...form, storeIds: form.storeIds.filter(id => id !== store.id) });
                              }
                            }}
                          />
                          <span style={{ fontSize: '0.875rem' }}>{store.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {error && (
                <div className="modal-error">
                  <X size={16} style={{ marginRight: '0.5rem' }} />
                  {error}
                </div>
              )}
              <div className="modal-footer">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  loadingText={editingUser ? 'Updating...' : 'Adding...'}
                >
                  {editingUser ? 'Update User' : 'Add User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && passwordUser && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reset Password</h2>
              <button className="close-btn" onClick={() => setShowPasswordModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePasswordChange}>
              <div className="modal-body">
                {/* User Info */}
                <div style={{
                  padding: '1rem',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius)',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '1.2rem'
                  }}>
                    {passwordUser.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{passwordUser.name}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>{passwordUser.username}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', textTransform: 'capitalize' }}>
                      {passwordUser.role.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                {passwordError && (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(245, 101, 101, 0.1)',
                    color: 'var(--danger)',
                    borderRadius: 'var(--radius)',
                    marginBottom: '1rem',
                    fontSize: '0.9rem'
                  }}>
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(72, 187, 120, 0.1)',
                    color: 'var(--success)',
                    borderRadius: 'var(--radius)',
                    marginBottom: '1rem',
                    fontSize: '0.9rem'
                  }}>
                    {passwordSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordForm.password}
                      onChange={e => setPasswordForm({ ...passwordForm, password: e.target.value })}
                      placeholder="Enter new password (min 6 characters)"
                      required
                      minLength={6}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--gray-500)',
                        padding: '4px'
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm Password</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Confirm the new password"
                    required
                  />
                </div>

                <p style={{
                  fontSize: '0.85rem',
                  color: 'var(--gray-500)',
                  marginTop: '1rem',
                  padding: '0.75rem',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius)'
                }}>
                  <strong>Note:</strong> This will immediately change the user's password. 
                  They will need to use the new password on their next login.
                </p>
              </div>
              <div className="modal-footer">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowPasswordModal(false)}
                  disabled={isPasswordSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isPasswordSubmitting}
                  loadingText="Resetting..."
                  leftIcon={<Lock size={16} />}
                >
                  Reset Password
                </Button>
              </div>
            </form>
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
    </div>
  );
};

export default Users;
