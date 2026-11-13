import React from 'react';
import { ShortcutBinding, describeShortcut } from '../hooks/useKeyboardShortcut';
import { Modal, Btn, Kbd } from './gr';

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
 */
const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ isOpen, onClose, groups, title = 'Keyboard shortcuts' }) => (
  <Modal
    open={isOpen}
    onClose={onClose}
    size="lg"
    title={title}
    footer={<Btn variant="secondary" onClick={onClose}>Close</Btn>}
  >
    <div className="shortcuts-help-body">
      {groups.map((group) => (
        <div key={group.title} className="shortcuts-group">
          <h3 className="shortcuts-group-title">{group.title}</h3>
          <ul className="shortcuts-list">
            {group.entries.map((entry, idx) => (
              <li key={idx} className="shortcuts-row">
                <span className="shortcuts-desc">{entry.description}</span>
                <Kbd className="shortcut-key">{describeShortcut(entry.binding)}</Kbd>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <p className="shortcuts-footnote">
      Shortcuts are disabled while typing in input fields (except <Kbd>Esc</Kbd>).
    </p>
  </Modal>
);

export default ShortcutsHelp;
