import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, Store } from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';

const StoreSelector: React.FC = () => {
  const { user, currentStoreId, setCurrentStore, canSwitchStores } = useAuthStore();
  const { stores, switchStore } = useDataStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current store directly from stores list to include newly created stores
  const currentStore = stores.find(s => s.id === currentStoreId);
  const canSwitch = canSwitchStores();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchStore = async (storeId: string) => {
    if (storeId === currentStoreId) {
      setIsOpen(false);
      return;
    }

    await switchStore(storeId);
    setCurrentStore(storeId);
    setIsOpen(false);
  };

  if (!canSwitch || stores.length <= 1) {
    return (
      <div className="store-selector-readonly">
        {currentStore?.logoUrl ? (
          <img
            src={currentStore.logoUrl}
            alt={currentStore.name}
            style={{ width: '20px', height: '20px', objectFit: 'contain', borderRadius: '4px' }}
          />
        ) : (
          <Store size={18} />
        )}
                <span>{currentStore?.name || 'Select Store'}</span>
      </div>
    );
  }

  return (
    <div className="store-selector" ref={dropdownRef}>
      <button 
        className="store-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="store-selector-icon">
          {currentStore?.logoUrl ? (
            <img
              src={currentStore.logoUrl}
              alt={currentStore.name}
              style={{ width: '24px', height: '24px', objectFit: 'contain', borderRadius: '4px' }}
            />
          ) : (
            <Building2 size={18} />
          )}
        </div>
        <div className="store-selector-info">
          <span className="store-selector-label">Current Store</span>
          <span className="store-selector-name">
            {currentStore?.name} {currentStore?.branch && `- ${currentStore.branch}`}
          </span>
        </div>
        <ChevronDown size={16} className={`store-selector-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="store-selector-dropdown">
          <div className="store-selector-header">
            <span>Select Store</span>
            <span className="store-count">{stores.length} stores</span>
          </div>
          <div className="store-selector-list">
            {stores.map((store) => (
              <button
                key={store.id}
                className={`store-option ${store.id === currentStoreId ? 'active' : ''}`}
                onClick={() => handleSwitchStore(store.id)}
              >
                <div className="store-option-icon">
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt={store.name}
                      style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px' }}
                    />
                  ) : (
                    <Store size={18} />
                  )}
                </div>
                <div className="store-option-info">
                  <div className="store-option-name">{store.name}</div>
                  {store.branch && (
                    <div className="store-option-branch">{store.branch}</div>
                  )}
                  {store.location && (
                    <div className="store-option-location">{store.location}</div>
                  )}
                </div>
                {store.id === currentStoreId && (
                  <div className="store-option-check">
                    <Check size={16} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreSelector;
