import React from 'react';
import { Seg } from './gr';
import {
  useTableLayoutStore,
  TableActionStyle,
  TableCardAction,
  TableFloatPosition,
} from '../stores';

const ACTION_STYLE_OPTIONS: { value: TableActionStyle; label: string }[] = [
  { value: 'row', label: 'Row' },
  { value: 'compact', label: 'Compact' },
  { value: 'labeled', label: 'Labeled' },
  { value: 'hidden', label: 'Hidden' },
];

const ACTION_BUTTONS: { key: TableCardAction; label: string; hint: string }[] = [
  { key: 'bill', label: 'Print bill', hint: 'Open the bill dialog for printing.' },
  { key: 'move', label: 'Change table', hint: 'Move the order to another table.' },
  { key: 'merge', label: 'Merge bill', hint: 'Combine with another table’s order.' },
  { key: 'view', label: 'Preview order', hint: 'Peek at the order without opening it.' },
];

const FLOAT_POSITION_OPTIONS: { value: TableFloatPosition; label: string }[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

// Quick-action button preferences for occupied table cards. Shared by the
// Tables "Customize Layout" modal and the Appearance page.
const TableActionPrefs: React.FC = () => {
  const {
    actionStyle, actionButtons, floatPosition,
    setActionStyle, setActionButton, setFloatPosition,
  } = useTableLayoutStore();

  const visibleActionCount = Object.values(actionButtons).filter(Boolean).length;

  return (
    <>
      <div className="layout-pref-group">
        <span className="pref-label">Action buttons</span>
        <p className="gr-caption">How the bill, move, merge and preview buttons appear on occupied tables. Hidden actions are always available from the right-click or touch-and-hold menu.</p>
        <Seg
          value={actionStyle}
          onChange={v => setActionStyle(v as TableActionStyle)}
          options={ACTION_STYLE_OPTIONS}
        />
      </div>

      {actionStyle !== 'hidden' && (
        <div className="layout-pref-group">
          <span className="pref-label">Buttons to show</span>
          <p className="gr-caption">Pick which quick actions appear on occupied tables. Hidden actions remain available from the right-click or touch-and-hold menu.</p>
          <div className="pref-toggles">
            {ACTION_BUTTONS.map(a => (
              <label key={a.key} className="gr-switch pref-toggle">
                <input
                  type="checkbox"
                  checked={actionButtons[a.key]}
                  onChange={e => setActionButton(a.key, e.target.checked)}
                />
                <span className="pref-toggle__text">
                  <strong>{a.label}</strong>
                  <small>{a.hint}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {actionStyle !== 'hidden' && visibleActionCount > 0 && (
        <div className="layout-pref-group">
          <span className="pref-label">Floating bar position</span>
          <p className="gr-caption">Where the floating action bar appears when a card is too small for inline buttons.</p>
          <Seg
            value={floatPosition}
            onChange={v => setFloatPosition(v as TableFloatPosition)}
            options={FLOAT_POSITION_OPTIONS}
          />
        </div>
      )}
    </>
  );
};

export default TableActionPrefs;
