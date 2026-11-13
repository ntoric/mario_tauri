import React from 'react';
import { Check } from 'lucide-react';
import { useAuthStore, useDataStore, useUIStore } from '../stores';
import notify from '../utils/toast';
import { Modal, Ic } from './gr';

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
    <Modal open onClose={closeStoreSwitcher} title="Switch store" size="md">
      <div className="gr-stack">
        {stores.map((store) => {
          const active = store.id === currentStoreId;
          return (
            <button
              key={store.id}
              onClick={() => handleSwitchStore(store.id)}
              className={`store-option${active ? ' is-active' : ''}`}
              style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '14px 16px', background: 'var(--surface)' }}
            >
              <div className="store-option-icon" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', padding: 4 }}>
                <img
                  src={store.logoUrl || '/logo.png'}
                  alt={store.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }}
                />
              </div>
              <div className="store-option-info">
                <div className="store-option-name">{store.name}</div>
                {store.branch && <div className="store-option-branch">{store.branch}</div>}
                {store.location && <div className="store-option-location">{store.location}</div>}
              </div>
              {active && (
                <span className="store-option-check"><Ic icon={Check} size={18} /></span>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
};

export default StoreSwitcher;
