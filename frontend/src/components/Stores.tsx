import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building2, Loader2, Power, Sliders } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/Button';
import Toggle from './ui/Toggle';

const Stores: React.FC = () => {
  const { stores, createStore, updateStore, deleteStore, switchStore, fetchStores } = useDataStore();
  const { user, setCurrentStore, canSwitchStores } = useAuthStore();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);
  const [editingStore, setEditingStore] = useState<any>(null);

  const [form, setForm] = useState({
    name: '',
    branch: '',
    location: '',
    phone: '',
    gstin: '',
    fssaiNo: '',
  });

  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStoreId, setLoadingStoreId] = useState<string | null>(null);

  // Store features modal
  const [featuresStore, setFeaturesStore] = useState<any>(null);
  const [featuresForm, setFeaturesForm] = useState({
    kitchenWindowEnabled: false,
    remoteBillingEnabled: false,
    kotPrintEnabled: true,
  });
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);

  const openFeatures = (store: any) => {
    setFeaturesStore(store);
    setFeaturesForm({
      kitchenWindowEnabled: store.kitchenWindowEnabled === true,
      remoteBillingEnabled: store.remoteBillingEnabled === true,
      kotPrintEnabled: store.kotPrintEnabled !== false,
    });
  };

  const closeFeatures = () => {
    setFeaturesStore(null);
  };

  const handleSaveFeatures = async () => {
    if (!featuresStore) return;
    setIsSavingFeatures(true);
    try {
      await updateStore(featuresStore.id, {
        kitchenWindowEnabled: featuresForm.kitchenWindowEnabled,
        remoteBillingEnabled: featuresForm.remoteBillingEnabled,
        kotPrintEnabled: featuresForm.kotPrintEnabled,
      });
      toast.success('Store features updated successfully');
      closeFeatures();
    } catch (error) {
      toast.error('Failed to update store features');
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const openModal = (store?: any) => {
    if (store) {
      setEditingStore(store);
      setForm({
        name: store.name,
        branch: store.branch || '',
        location: store.location || '',
        phone: store.phone || '',
        gstin: store.gstin || '',
        fssaiNo: store.fssaiNo || '',
      });
    } else {
      setEditingStore(null);
      setForm({ name: '', branch: '', location: '', phone: '', gstin: '', fssaiNo: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingStore) {
        await updateStore(editingStore.id, form);
        toast.success('Store updated successfully');
      } else {
        const newStore = await createStore(form);
        toast.success('Store created successfully');
        // Auto-switch to new store for superadmin/business owner
        if (newStore && canSwitchStores()) {
          await switchStore(newStore.id);
          setCurrentStore(newStore.id);
        }
      }
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this store? All associated data will be lost.')) {
      setLoadingStoreId(id);
      try {
        await deleteStore(id);
        toast.success('Store deleted successfully');
      } finally {
        setLoadingStoreId(null);
      }
    }
  };

  const canDelete = user?.role === 'superadmin';
  const canToggleStatus = user?.role === 'superadmin';
  const canManageFeatures = user?.role === 'superadmin' || user?.role === 'business_owner';

  const handleToggleStatus = async (store: any) => {
    setLoadingStoreId(store.id);
    try {
      await updateStore(store.id, { isActive: !store.isActive });
      toast.success(store.isActive ? 'Store disabled' : 'Store enabled');
    } finally {
      setLoadingStoreId(null);
    }
  };

  return (
    <div>
      {stores.length === 0 ? (
        <div className="empty-state">
          <Building2 size={48} />
          <p>No stores found</p>
          <button className="btn btn-primary" onClick={() => openModal()}>
            <Plus size={16} /> Create your first store
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Stores ({stores.length})</span>
            <button className="btn btn-primary" onClick={() => openModal()}>
              <Plus size={16} />
              Add Store
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Store Name</th>
                      <th>Branch</th>
                      <th>Location</th>
                      <th>Phone</th>
                      <th>GSTIN</th>
                      <th>FSSAI</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((store: any) => (
                      <tr key={store.id}>
                        <td style={{ fontWeight: 600, color: 'var(--dark)' }}>{store.name}</td>
                        <td>{store.branch || '—'}</td>
                        <td style={{ color: 'var(--gray-600)' }}>{store.location || '—'}</td>
                        <td>{store.phone || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{store.gstin || '—'}</td>
                        <td>{store.fssaiNo || '—'}</td>
                        <td>
                          <span className={`badge ${store.isActive ? 'badge-success' : 'badge-secondary'}`}>
                            {store.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="col-actions" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <div className="action-btns">
                            {canManageFeatures && (
                              <button
                                className="action-btn"
                                onClick={() => openFeatures(store)}
                                disabled={loadingStoreId === store.id}
                                title="Store Features"
                              >
                                <Sliders size={14} />
                              </button>
                            )}
                            {canToggleStatus && (
                              <button
                                className={`action-btn ${store.isActive ? '' : 'disabled-toggle'}`}
                                onClick={() => handleToggleStatus(store)}
                                disabled={loadingStoreId === store.id}
                                title={store.isActive ? 'Disable Store' : 'Enable Store'}
                                style={{ color: store.isActive ? '#48bb78' : 'var(--gray-400)' }}
                              >
                                {loadingStoreId === store.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Power size={14} />
                                )}
                              </button>
                            )}
                            <button
                              className="action-btn edit"
                              onClick={() => openModal(store)}
                              disabled={loadingStoreId === store.id}
                              title="Edit Store"
                            >
                              <Edit2 size={14} />
                            </button>
                            {canDelete && (
                              <button
                                className="action-btn delete"
                                onClick={() => handleDelete(store.id)}
                                disabled={loadingStoreId === store.id}
                                title="Delete Store"
                              >
                                {loadingStoreId === store.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Store Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingStore ? 'Edit Store' : 'Add New Store'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Store Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g., Main Cafe"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Branch</label>
                    <input
                      type="text"
                      value={form.branch}
                      onChange={e => setForm({ ...form, branch: e.target.value })}
                      placeholder="e.g., Downtown Branch"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Location</label>
                  <textarea
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="Full address"
                    rows={2}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      placeholder="Contact number"
                    />
                  </div>
                  <div className="form-group">
                    <label>GSTIN</label>
                    <input
                      type="text"
                      value={form.gstin}
                      onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                      placeholder="e.g., 32AAIFJ6501F1ZS"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>FSSAI Number</label>
                  <input
                    type="text"
                    value={form.fssaiNo}
                    onChange={e => setForm({ ...form, fssaiNo: e.target.value })}
                    placeholder="FSSAI License Number"
                  />
                </div>
              </div>
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
                  loadingText={editingStore ? 'Updating...' : 'Adding...'}
                >
                  {editingStore ? 'Update Store' : 'Add Store'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Store Features Modal */}
      {featuresStore && (
        <div className="modal-overlay" onClick={closeFeatures}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Store Features — {featuresStore.name}</h2>
              <button className="close-btn" onClick={closeFeatures}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Enable or disable features for this store. Changes can be made anytime.
              </p>

              <div className="form-group" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                <Toggle
                  checked={featuresForm.kitchenWindowEnabled}
                  onChange={checked => setFeaturesForm({ ...featuresForm, kitchenWindowEnabled: checked })}
                  label="Kitchen Window / Step"
                />
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '0.5rem', marginLeft: '3rem' }}>
                  Adds a Kitchen Display page showing active orders, where staff can mark orders as preparing / ready / served.
                </p>
              </div>

              <div className="form-group" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                <Toggle
                  checked={featuresForm.remoteBillingEnabled}
                  onChange={checked => setFeaturesForm({ ...featuresForm, remoteBillingEnabled: checked })}
                  label="Remote Billing"
                />
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '0.5rem', marginLeft: '3rem' }}>
                  Allows bills to be queued and processed remotely for this store.
                </p>
              </div>

              <div className="form-group" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <Toggle
                  checked={featuresForm.kotPrintEnabled}
                  onChange={checked => setFeaturesForm({ ...featuresForm, kotPrintEnabled: checked })}
                  label="KOT (Kitchen Order Ticket) Printing"
                />
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '0.5rem', marginLeft: '3rem' }}>
                  Automatically prints a KOT ticket to the kitchen printer when orders are placed.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <Button
                type="button"
                variant="secondary"
                onClick={closeFeatures}
                disabled={isSavingFeatures}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveFeatures}
                isLoading={isSavingFeatures}
                loadingText="Saving..."
              >
                Save Features
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stores;
