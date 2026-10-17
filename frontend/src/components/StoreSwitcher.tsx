import React from 'react';
import { X, Check } from 'lucide-react';
import { useAuthStore, useDataStore, useUIStore } from '../stores';
import notify from '../utils/toast';

const StoreSwitcher: React.FC = () => {
  const { user, currentStoreId, setCurrentStore, canSwitchStores } = useAuthStore();
  const { stores, switchStore } = useDataStore();
  const { storeSwitcherModal, closeStoreSwitcher } = useUIStore();

  if (!storeSwitcherModal || !canSwitchStores()) return null;

  const handleSwitchStore = async (storeId: string) => {
    try {
      await switchStore(storeId);
      setCurrentStore(storeId);
      closeStoreSwitcher();
      const store = stores.find(s => s.id === storeId);
      notify.success(`Switched to ${store?.name || 'store'}`);
    } catch (err: any) {
      notify.error(err.message || 'Failed to switch store');
    }
  };

  return (
    <div className="modal-overlay" onClick={closeStoreSwitcher}>
      <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Switch Store</h2>
          <button className="close-btn" onClick={closeStoreSwitcher}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => handleSwitchStore(store.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 'var(--radius)',
                  background: store.id === currentStoreId ? 'rgba(245,130,32, 0.1)' : 'var(--surface)',
                  borderColor: store.id === currentStoreId ? 'var(--primary)' : undefined,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius)',
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: '4px',
                }}>
                  <img
                    src={store.logoUrl || '/logo.png'}
                    alt={store.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{store.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>{store.branch}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                    {store.location}
                  </div>
                </div>
                {store.id === currentStoreId && (
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}>
                    <Check size={16} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreSwitcher;
