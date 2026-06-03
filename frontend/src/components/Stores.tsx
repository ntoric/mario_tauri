import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building2, MapPin, Phone, Receipt, Loader2, Power } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { Button } from '../components/ui/Button';

const Stores: React.FC = () => {
  const { stores, createStore, updateStore, deleteStore, switchStore, fetchStores } = useDataStore();
  const { user, setCurrentStore, canSwitchStores } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
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
      } else {
        const newStore = await createStore(form);
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
      } finally {
        setLoadingStoreId(null);
      }
    }
  };

  const canDelete = user?.role === 'superadmin';
  const canToggleStatus = user?.role === 'superadmin';

  const handleToggleStatus = async (store: any) => {
    setLoadingStoreId(store.id);
    try {
      await updateStore(store.id, { isActive: !store.isActive });
    } finally {
      setLoadingStoreId(null);
    }
  };

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Manage Stores',
      subtitle: 'Create and manage your cafe branches',
      actions: (
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={18} />
          Add Store
        </button>
      ),
    });
  }, [setHeaderContent]);

  return (
    <div>
      <div className="stores-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
        {stores.map((store: any) => (
          <div key={store.id} className="card" style={{ position: 'relative' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius)',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}>
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{store.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray-600)' }}>{store.branch || 'Main Branch'}</p>
                </div>
              </div>
              <div className="action-btns">
                {canToggleStatus && (
                  <button
                    className="action-btn"
                    onClick={() => handleToggleStatus(store)}
                    disabled={loadingStoreId === store.id}
                    style={{
                      opacity: loadingStoreId === store.id ? 0.5 : 1,
                      cursor: loadingStoreId === store.id ? 'not-allowed' : 'pointer',
                      color: store.isActive ? 'var(--success)' : 'var(--gray-400)'
                    }}
                    title={store.isActive ? 'Disable Store' : 'Enable Store'}
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
                  style={{
                    opacity: loadingStoreId === store.id ? 0.5 : 1,
                    cursor: loadingStoreId === store.id ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Edit2 size={14} />
                </button>
                {canDelete && (
                  <button 
                    className="action-btn delete" 
                    onClick={() => handleDelete(store.id)}
                    disabled={loadingStoreId === store.id}
                    style={{
                      opacity: loadingStoreId === store.id ? 0.5 : 1,
                      cursor: loadingStoreId === store.id ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {loadingStoreId === store.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {store.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPin size={16} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--gray-700)', fontSize: '0.9rem' }}>{store.location}</span>
                  </div>
                )}
                {store.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Phone size={16} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--gray-700)', fontSize: '0.9rem' }}>{store.phone}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
                  {store.gstin && (
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', display: 'block' }}>GSTIN</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, fontFamily: 'monospace' }}>{store.gstin}</span>
                    </div>
                  )}
                  {store.fssaiNo && (
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', display: 'block' }}>FSSAI</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{store.fssaiNo}</span>
                    </div>
                  )}
                </div>
                {(store.printerVendorId || store.invoiceSize) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <Receipt size={14} style={{ color: 'var(--gray-400)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      {store.invoiceSize || '3inch'} printer
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {stores.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-500)' }}>
          <Building2 size={64} style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
          <p style={{ fontSize: '1.125rem' }}>No stores found</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Create your first store to get started</p>
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
    </div>
  );
};

export default Stores;
