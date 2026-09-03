import React from 'react';
import { X } from 'lucide-react';
import { ShortcutBinding, describeShortcut } from '../hooks/useKeyboardShortcut';

export interface ShortcutEntry {
  binding: Pick<ShortcutBinding, 'key' | 'modifiers'>;
  description: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ShortcutGroup[];
  title?: string;
}

/**
 * Modal overlay that lists available keyboard shortcuts, grouped by section.
 * Closes on Escape (handled by parent) or by clicking the backdrop/close btn.
 */
const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ isOpen, onClose, groups, title = 'Keyboard Shortcuts' }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal shortcuts-help-modal"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body shortcuts-help-body">
          {groups.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <ul className="shortcuts-list">
                {group.entries.map((entry, idx) => (
                  <li key={idx} className="shortcuts-row">
                    <span className="shortcuts-desc">{entry.description}</span>
                    <kbd className="shortcut-key">{describeShortcut(entry.binding)}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="shortcuts-footnote">
            Shortcuts are disabled while typing in input fields (except <kbd className="shortcut-key">Esc</kbd>).
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelp;
