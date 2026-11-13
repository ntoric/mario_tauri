import { create } from 'zustand';

const STORAGE_KEY = 'gr-table-layout';

export type TableCardSize = 'compact' | 'default' | 'large';
export type TableActionStyle = 'row' | 'compact' | 'labeled' | 'hidden';
export type TableFloatPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TableLayoutPrefs {
  // Fixed grid columns in layout view; 0 means auto-fill (default).
  gridColumns: number;
  cardSize: TableCardSize;
  // Card content toggles.
  showStatus: boolean; // "Available" chip on vacant tables
  showTimer: boolean; // elapsed-time chip on occupied tables
  showInfo: boolean; // seats (vacant) or amount + item count (occupied)
  actionStyle: TableActionStyle;
  // Where the floating action bar appears relative to a hovered table card
  // when the card is too narrow for inline buttons.
  floatPosition: TableFloatPosition;
}

interface TableLayoutState extends TableLayoutPrefs {
  setGridColumns: (n: number) => void;
  setCardSize: (v: TableCardSize) => void;
  setShowStatus: (v: boolean) => void;
  setShowTimer: (v: boolean) => void;
  setShowInfo: (v: boolean) => void;
  setActionStyle: (v: TableActionStyle) => void;
  setFloatPosition: (v: TableFloatPosition) => void;
  resetTableLayout: () => void;
}

export const TABLE_LAYOUT_DEFAULTS: TableLayoutPrefs = {
  gridColumns: 0,
  cardSize: 'default',
  showStatus: true,
  showTimer: true,
  showInfo: true,
  actionStyle: 'row',
  floatPosition: 'bottom',
};

const CARD_SIZES: TableCardSize[] = ['compact', 'default', 'large'];
const ACTION_STYLES: TableActionStyle[] = ['row', 'compact', 'labeled', 'hidden'];
const FLOAT_POSITIONS: TableFloatPosition[] = ['top', 'bottom', 'left', 'right'];

function loadPrefs(): TableLayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...TABLE_LAYOUT_DEFAULTS, ...parsed };
      // Clamp/sanitize persisted values so a stale or hand-edited entry
      // can't break the layout.
      merged.gridColumns = Number.isFinite(merged.gridColumns)
        ? Math.min(Math.max(Math.round(merged.gridColumns), 0), 15)
        : 0;
      if (!CARD_SIZES.includes(merged.cardSize)) merged.cardSize = 'default';
      if (!ACTION_STYLES.includes(merged.actionStyle)) merged.actionStyle = 'row';
      if (!FLOAT_POSITIONS.includes(merged.floatPosition)) merged.floatPosition = 'bottom';
      return merged;
    }
  } catch {
    // localStorage unavailable or corrupt
  }
  return { ...TABLE_LAYOUT_DEFAULTS };
}

function persist(prefs: TableLayoutPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

const pick = (s: TableLayoutState): TableLayoutPrefs => ({
  gridColumns: s.gridColumns,
  cardSize: s.cardSize,
  showStatus: s.showStatus,
  showTimer: s.showTimer,
  showInfo: s.showInfo,
  actionStyle: s.actionStyle,
  floatPosition: s.floatPosition,
});

export const useTableLayoutStore = create<TableLayoutState>((set, get) => {
  const update = (patch: Partial<TableLayoutPrefs>) => {
    set(patch);
    persist(pick(get()));
  };

  return {
    ...loadPrefs(),
    setGridColumns: (gridColumns) => update({ gridColumns }),
    setCardSize: (cardSize) => update({ cardSize }),
    setShowStatus: (showStatus) => update({ showStatus }),
    setShowTimer: (showTimer) => update({ showTimer }),
    setShowInfo: (showInfo) => update({ showInfo }),
    setActionStyle: (actionStyle) => update({ actionStyle }),
    setFloatPosition: (floatPosition) => update({ floatPosition }),
    resetTableLayout: () => update({ ...TABLE_LAYOUT_DEFAULTS }),
  };
});
