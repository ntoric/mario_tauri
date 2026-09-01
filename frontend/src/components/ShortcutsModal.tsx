import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const categories = ['Navigation', 'Tables', 'Order Page', 'Actions', 'General'] as const;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Keyboard size={20} />
            <h2>Keyboard Shortcuts</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {categories.map(cat => {
            const items = SHORTCUTS.filter(s => s.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="shortcuts-section">
                <h3 className="shortcuts-section-title">{cat}</h3>
                <div className="shortcuts-grid">
                  {items.map(s => (
                    <div key={s.keys} className="shortcut-row">
                      <span className="shortcut-desc">{s.description}</span>
                      <span className="shortcut-keys">
                        {s.keys.split('+').map((k, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span className="shortcut-plus">+</span>}
                            <kbd className="shortcut-kbd">{k}</kbd>
                          </React.Fragment>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
