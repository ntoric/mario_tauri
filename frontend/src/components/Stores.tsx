import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Building2, MapPin, Phone, Receipt, Loader2, Power, Monitor } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { Button } from '../components/ui/Button';
import notify from '../utils/toast';
import { Empty } from './gr';
import { isTaxEnabled } from '../utils/tax';

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
    secondaryPhone: '',
    gstin: '',
    fssaiNo: '',
    dataRetentionDays: 0,
    myPlanEnabled: false,
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
        secondaryPhone: store.secondaryPhone || '',
        gstin: store.gstin || '',
        fssaiNo: store.fssaiNo || '',
        dataRetentionDays: store.dataRetentionDays || 0,
        myPlanEnabled: !!store.myPlanEnabled,
      });
    } else {
      setEditingStore(null);
      setForm({ name: '', branch: '', location: '', phone: '', secondaryPhone: '', gstin: '', fssaiNo: '', dataRetentionDays: 0, myPlanEnabled: false });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingStore) {
        // GSTIN is hidden for stores with tax off — leave the stored value alone.
        const { gstin, ...rest } = form;
        await updateStore(editingStore.id, isTaxEnabled(editingStore) ? form : rest);
        notify.success(`Store "${form.name}" updated`);
      } else {
        const newStore = await createStore(form);
        // Auto-switch to new store for superadmin/business owner
        if (newStore && canSwitchStores()) {
          await switchStore(newStore.id);
          setCurrentStore(newStore.id);
        }
        notify.success(`Store "${form.name}" created`);
      }
      setShowModal(false);
    } catch (err: any) {
      notify.error(err.message || 'Failed to save store');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this store? All associated data will be lost.')) {
      setLoadingStoreId(id);
      try {
        await deleteStore(id);
        notify.success('Store deleted');
      } catch (err: any) {
        notify.error(err.message || 'Failed to delete store');
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
      notify.success(`Store "${store.name}" ${store.isActive ? 'disabled' : 'enabled'}`);
    } catch (err: any) {
      notify.error(err.message || 'Failed to update store');
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
        <button className="gr-btn gr-btn--primary" onClick={() => openModal()}>
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
          <div key={store.id} className="gr-card" style={{ position: 'relative' }}>
            <div className="gr-card__head">
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
                    className="gr-iconbtn gr-iconbtn--sm"
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
                  className="gr-iconbtn gr-iconbtn--sm edit" 
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
                    className="gr-iconbtn gr-iconbtn--sm delete" 
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
            <div className="gr-card__body">
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {store.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPin size={16} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--gray-700)', fontSize: '0.9rem' }}>{store.location}</span>
                  </div>
                )}
                {(store.phone || store.secondaryPhone) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Phone size={16} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--gray-700)', fontSize: '0.9rem' }}>
                      {[store.phone, store.secondaryPhone].filter(Boolean).join(' / ')}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
                  {isTaxEnabled(store) && store.gstin && (
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
                {user?.role === 'superadmin' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <Monitor size={14} style={{ color: store.appVersion ? 'var(--primary)' : 'var(--gray-400)' }} />
                    <span style={{ fontSize: '0.8rem', color: store.appVersion ? 'var(--gray-700)' : 'var(--gray-400)' }}>
                      {store.appVersion
                        ? `Desktop app v${store.appVersion}` +
                          (store.appVersionSeenAt
                            ? ` · last seen ${new Date(store.appVersionSeenAt).toLocaleString()}`
                            : '')
                        : 'Desktop app: no version reported yet'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {stores.length === 0 && (
        <Empty
          icon={<Building2 />}
          title="No stores found"
          text="Create your first store to get started"
        />
      )}

      {/* Store Modal */}
      {showModal && (
        <div className="gr-modal-live is-open" onClick={() => setShowModal(false)}>
          <div className="gr-modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>{editingStore ? 'Edit Store' : 'Add New Store'}</h2>
              <button className="gr-iconbtn" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="gr-modal__body">
                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Store Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g., Main Cafe"
                      required
                    />
                  </div>
                  <div className="gr-field">
                    <label>Branch</label>
                    <input
                      type="text"
                      value={form.branch}
                      onChange={e => setForm({ ...form, branch: e.target.value })}
                      placeholder="e.g., Downtown Branch"
                    />
                  </div>
                </div>

                <div className="gr-field">
                  <label>Location</label>
                  <textarea
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="Full address"
                    rows={2}
                  />
                </div>

                <div className="gr-grid gr-form2">
                  <div className="gr-field">
                    <label>Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      placeholder="Contact number"
                    />
                  </div>
                  <div className="gr-field">
                    <label>Secondary Phone</label>
                    <input
                      type="text"
                      value={form.secondaryPhone}
                      onChange={e => setForm({ ...form, secondaryPhone: e.target.value })}
                      placeholder="Alternate contact number"
                    />
                  </div>
                </div>

                {(!editingStore || isTaxEnabled(editingStore)) && (
                  <div className="gr-field">
                    <label>GSTIN</label>
                    <input
                      type="text"
                      value={form.gstin}
                      onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                      placeholder="e.g., 32AAIFJ6501F1ZS"
                    />
                  </div>
                )}

                <div className="gr-field">
                  <label>FSSAI Number</label>
                  <input
                    type="text"
                    value={form.fssaiNo}
                    onChange={e => setForm({ ...form, fssaiNo: e.target.value })}
                    placeholder="FSSAI License Number"
                  />
                </div>

                {user?.role === 'superadmin' && (
                  <div className="gr-field">
                    <label>Hide sales history after (days)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.dataRetentionDays}
                      onChange={e => setForm({ ...form, dataRetentionDays: Math.max(0, parseInt(e.target.value) || 0) })}
                      placeholder="0 = keep all history"
                    />
                    <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                      Orders, bills, sales/profit reports and expenses older than this many days are
                      hidden from store users. Nothing is deleted — the data stays visible to
                      superadmin for analytics. 0 = unlimited.
                    </small>
                  </div>
                )}

                {user?.role === 'superadmin' && (
                  <div className="gr-field">
                    <label className="gr-switch">
                      <input
                        type="checkbox"
                        checked={form.myPlanEnabled}
                        onChange={e => setForm({ ...form, myPlanEnabled: e.target.checked })}
                      />
                      Show "My Plan" page to this store's users
                    </label>
                    <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                      Lets the store view their subscription plan, request upgrades/downgrades
                      and cancellations, and see billing history from the My Plan menu.
                    </small>
                  </div>
                )}
              </div>
              <div className="gr-modal__foot">
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
