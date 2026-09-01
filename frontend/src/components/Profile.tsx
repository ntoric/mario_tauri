import React, { useState, useEffect } from 'react';
import { Save, User as UserIcon, Mail, Phone, AtSign, Shield, Store } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  business_owner: 'Business Owner',
  business_admin: 'Business Admin',
  staff: 'Staff',
};

const Profile: React.FC = () => {
  const { user, refreshUser } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  useEffect(() => {
    setHeaderContent({
      title: 'My Profile',
      subtitle: 'View and update your personal details',
      actions: null,
    });
  }, [setHeaderContent]);

  if (!user) {
    return (
      <div className="empty-state">
        <UserIcon size={64} style={{ opacity: 0.5 }} />
        <p>Loading profile...</p>
      </div>
    );
  }

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateUser(user.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      await refreshUser();
      toast.success('Profile updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Personal Information</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="card-body">
            {/* Profile summary banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem',
              background: 'var(--gray-50)',
              borderRadius: 'var(--radius)',
              marginBottom: '1.5rem',
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
                fontSize: '1.25rem',
                flexShrink: 0,
              }}>
                {getInitials(user.name || '?')}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{user.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                  {ROLE_LABELS[user.role] || user.role}
                </div>
              </div>
            </div>

            {/* Read-only username */}
            <div className="form-group">
              <label>Username</label>
              <div style={{ position: 'relative' }}>
                <AtSign size={16} style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--gray-400)',
                }} />
                <input
                  type="text"
                  value={user.username}
                  disabled
                  style={{ paddingLeft: '2.25rem', cursor: 'not-allowed' }}
                />
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                Your username cannot be changed.
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={16} style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--gray-400)',
                  }} />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your full name"
                    required
                    style={{ paddingLeft: '2.25rem' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--gray-400)',
                  }} />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="e.g., you@example.com"
                    style={{ paddingLeft: '2.25rem' }}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--gray-400)',
                }} />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g., +1234567890"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>
            </div>
          </div>

          <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Save size={18} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Read-only account details */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title">Account Details</span>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <div style={{ position: 'relative' }}>
                <Shield size={16} style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--gray-400)',
                }} />
                <input
                  type="text"
                  value={ROLE_LABELS[user.role] || user.role}
                  disabled
                  style={{ paddingLeft: '2.25rem', cursor: 'not-allowed' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Assigned Store</label>
              <div style={{ position: 'relative' }}>
                <Store size={16} style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--gray-400)',
                }} />
                <input
                  type="text"
                  value={user.storeName || user.stores?.[0]?.name || (user.stores && user.stores.length > 1 ? `${user.stores.length} stores` : '—')}
                  disabled
                  style={{ paddingLeft: '2.25rem', cursor: 'not-allowed' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
