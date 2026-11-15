import { create } from 'zustand';
import { useAuthStore } from './authStore';

const STORAGE_KEY = 'gr-table-layout';
// Bucket used when no store is selected; also the fallback for stores that
// haven't saved their own layout yet.
const DEFAULT_SCOPE = '_default';

export type TableCardSize = 'compact' | 'default' | 'large';
export type TableActionStyle = 'row' | 'compact' | 'labeled' | 'hidden';
export type TableFloatPosition = 'top' | 'bottom' | 'left' | 'right';
export type TableCardAction = 'bill' | 'move' | 'merge' | 'view';

export interface TableLayoutPrefs {
  // Fixed grid columns in layout view; 0 means auto-fill (default).
  // Fixed values are clamped to 6–15.
  gridColumns: number;
  cardSize: TableCardSize;
  // Card content toggles.
  showStatus: boolean; // "Available" chip on vacant tables
  showTimer: boolean; // elapsed-time chip on occupied tables
  showInfo: boolean; // seats (vacant) or amount + item count (occupied)
  actionStyle: TableActionStyle;
  // Which quick-action buttons appear on occupied table cards.
  actionButtons: Record<TableCardAction, boolean>;
  // Where the floating action bar appears relative to a hovered table card
  // when the card is too narrow for inline buttons.
  floatPosition: TableFloatPosition;
}

interface TableLayoutState extends TableLayoutPrefs {
  // localStorage bucket the prefs are persisted under ('_default' or a store id).
  scope: string;
  setStoreScope: (storeId: string | null) => void;
  setGridColumns: (n: number) => void;
  setCardSize: (v: TableCardSize) => void;
  setShowStatus: (v: boolean) => void;
  setShowTimer: (v: boolean) => void;
  setShowInfo: (v: boolean) => void;
  setActionStyle: (v: TableActionStyle) => void;
  setActionButton: (key: TableCardAction, v: boolean) => void;
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
  actionButtons: { bill: true, move: true, merge: true, view: true },
  floatPosition: 'bottom',
};

const CARD_SIZES: TableCardSize[] = ['compact', 'default', 'large'];
const ACTION_STYLES: TableActionStyle[] = ['row', 'compact', 'labeled', 'hidden'];
const FLOAT_POSITIONS: TableFloatPosition[] = ['top', 'bottom', 'left', 'right'];
const CARD_ACTIONS: TableCardAction[] = ['bill', 'move', 'merge', 'view'];

// Storage shape: { [scope]: TableLayoutPrefs }. Before prefs became
// store-scoped the key held a single flat prefs object — that shape is
// detected and treated as the _default scope so existing devices keep
// their settings.
function readAll(): Record<string, Partial<TableLayoutPrefs>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    if ('cardSize' in parsed || 'gridColumns' in parsed || 'actionStyle' in parsed) {
      return { [DEFAULT_SCOPE]: parsed };
    }
    return parsed as Record<string, Partial<TableLayoutPrefs>>;
  } catch {
    // localStorage unavailable or corrupt
    return {};
  }
}

function sanitize(parsed: Partial<TableLayoutPrefs> | undefined): TableLayoutPrefs {
  const merged = { ...TABLE_LAYOUT_DEFAULTS, ...(parsed ?? {}) };
  // Clamp/sanitize persisted values so a stale or hand-edited entry
  // can't break the layout.
  merged.gridColumns = Number.isFinite(merged.gridColumns)
    ? (merged.gridColumns <= 0 ? 0 : Math.min(Math.max(Math.round(merged.gridColumns), 6), 15))
    : 0;
  if (!CARD_SIZES.includes(merged.cardSize)) merged.cardSize = 'default';
  if (!ACTION_STYLES.includes(merged.actionStyle)) merged.actionStyle = 'row';
  if (!FLOAT_POSITIONS.includes(merged.floatPosition)) merged.floatPosition = 'bottom';
  // The shallow merge above can replace actionButtons with a partial or
  // malformed object; rebuild it key-by-key with safe defaults.
  const ab = (merged.actionButtons ?? {}) as Partial<Record<TableCardAction, unknown>>;
  merged.actionButtons = Object.fromEntries(
    CARD_ACTIONS.map(k => [k, typeof ab[k] === 'boolean' ? ab[k] : true])
  ) as Record<TableCardAction, boolean>;
  return merged;
}

function loadPrefs(scope: string): TableLayoutPrefs {
  const all = readAll();
  return sanitize(all[scope] ?? all[DEFAULT_SCOPE]);
}

function persist(scope: string, prefs: TableLayoutPrefs) {
  try {
    const all = readAll();
    all[scope] = prefs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
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
  actionButtons: s.actionButtons,
  floatPosition: s.floatPosition,
});

export const useTableLayoutStore = create<TableLayoutState>((set, get) => {
  const update = (patch: Partial<TableLayoutPrefs>) => {
    set(patch);
    persist(get().scope, pick(get()));
  };

  const initialScope = useAuthStore.getState().currentStoreId ?? DEFAULT_SCOPE;

  return {
    scope: initialScope,
    ...loadPrefs(initialScope),
    setStoreScope: (storeId) => {
      const scope = storeId ?? DEFAULT_SCOPE;
      if (scope === get().scope) return;
      set({ scope, ...loadPrefs(scope) });
    },
    setGridColumns: (gridColumns) => update({ gridColumns }),
    setCardSize: (cardSize) => update({ cardSize }),
    setShowStatus: (showStatus) => update({ showStatus }),
    setShowTimer: (showTimer) => update({ showTimer }),
    setShowInfo: (showInfo) => update({ showInfo }),
    setActionStyle: (actionStyle) => update({ actionStyle }),
    setActionButton: (key, v) => update({ actionButtons: { ...get().actionButtons, [key]: v } }),
    setFloatPosition: (floatPosition) => update({ floatPosition }),
    resetTableLayout: () => update({ ...TABLE_LAYOUT_DEFAULTS }),
  };
});

// Keep the layout scope in sync when the user switches stores or signs out.
useAuthStore.subscribe((state) => {
  useTableLayoutStore.getState().setStoreScope(state.currentStoreId);
});
