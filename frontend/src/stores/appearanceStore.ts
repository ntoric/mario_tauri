import { create } from 'zustand';

const STORAGE_KEY = 'gr-appearance';
const LEGACY_SIDEBAR_KEY = 'gr-sidebar-expanded';

export type AccentId =
  | 'crimson' | 'rose' | 'tangerine' | 'amber' | 'emerald'
  | 'teal' | 'ocean' | 'indigo' | 'plum' | 'graphite' | 'custom';
export type TextSize = 'small' | 'default' | 'large' | 'xlarge';
export type CornerStyle = 'sharp' | 'default' | 'round';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type SidebarPosition = 'left' | 'right';
export type SidebarStyle = 'expanded' | 'icons' | 'hover';
export type ContentWidth = 'full' | 'boxed';

export interface AccentPreset {
  id: Exclude<AccentId, 'custom'>;
  name: string;
  color: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'crimson', name: 'Crimson', color: '#d4031a' },
  { id: 'rose', name: 'Rose', color: '#c2185b' },
  { id: 'tangerine', name: 'Tangerine', color: '#e8590c' },
  { id: 'amber', name: 'Amber', color: '#b07d00' },
  { id: 'emerald', name: 'Emerald', color: '#1e8e5a' },
  { id: 'teal', name: 'Teal', color: '#0f766e' },
  { id: 'ocean', name: 'Ocean', color: '#1a64d1' },
  { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { id: 'plum', name: 'Plum', color: '#9333ea' },
  { id: 'graphite', name: 'Graphite', color: '#3f3f46' },
];

interface AppearanceState {
  accent: AccentId;
  customAccent: string;
  textSize: TextSize;
  cornerStyle: CornerStyle;
  density: Density;
  sidebarPosition: SidebarPosition;
  sidebarStyle: SidebarStyle;
  sidebarLocked: boolean;
  contentWidth: ContentWidth;
  stripedRows: boolean;
  reduceMotion: boolean;

  setAccent: (accent: AccentId) => void;
  setCustomAccent: (hex: string) => void;
  setTextSize: (v: TextSize) => void;
  setCornerStyle: (v: CornerStyle) => void;
  setDensity: (v: Density) => void;
  setSidebarPosition: (v: SidebarPosition) => void;
  setSidebarStyle: (v: SidebarStyle) => void;
  setSidebarLocked: (v: boolean) => void;
  setContentWidth: (v: ContentWidth) => void;
  setStripedRows: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
}

type AppearancePrefs = Omit<AppearanceState,
  | 'setAccent' | 'setCustomAccent' | 'setTextSize' | 'setCornerStyle'
  | 'setDensity' | 'setSidebarPosition' | 'setSidebarStyle' | 'setSidebarLocked' | 'setContentWidth'
  | 'setStripedRows' | 'setReduceMotion'>;

const defaults: AppearancePrefs = {
  accent: 'tangerine',
  customAccent: '#1a64d1',
  textSize: 'default',
  cornerStyle: 'sharp',
  density: 'compact',
  sidebarPosition: 'left',
  sidebarStyle: 'hover',
  sidebarLocked: false,
  contentWidth: 'full',
  stripedRows: true,
  reduceMotion: false,
};

function loadPrefs(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
    // migrate the pre-appearance-store sidebar flag
    if (localStorage.getItem(LEGACY_SIDEBAR_KEY) === '1') {
      return { ...defaults, sidebarStyle: 'expanded' };
    }
  } catch {
    // localStorage unavailable or corrupt
  }
  return { ...defaults };
}

function hexToRgb(hex: string) {
  const c = hex.replace('#', '');
  if (c.length !== 6) return null;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
}

function shade(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const f = (c: number) => Math.round((t - c) * p) + c;
  return `#${((1 << 24) + (f(rgb.r) << 16) + (f(rgb.g) << 8) + f(rgb.b)).toString(16).slice(1)}`;
}

const CUSTOM_PROPS = [
  '--primary', '--primary-strong', '--grad-start', '--grad-mid', '--grad-end',
  '--tint', '--ink', '--heading', '--shadow-red',
];

export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.dataset.accent = prefs.accent;
  root.dataset.textSize = prefs.textSize;
  root.dataset.corners = prefs.cornerStyle;
  root.dataset.density = prefs.density;
  root.dataset.sidebarPos = prefs.sidebarPosition;
  root.dataset.contentWidth = prefs.contentWidth;
  root.dataset.striped = String(prefs.stripedRows);
  root.dataset.motion = prefs.reduceMotion ? 'reduced' : 'normal';

  // Preset accents are driven purely by CSS attribute rules so both themes are
  // covered; a custom hex needs computed shades applied as inline properties.
  CUSTOM_PROPS.forEach((p) => root.style.removeProperty(p));
  if (prefs.accent === 'custom' && hexToRgb(prefs.customAccent)) {
    const hex = prefs.customAccent;
    const dark = root.dataset.theme === 'dark';
    root.style.setProperty('--primary', dark ? shade(hex, 18) : hex);
    root.style.setProperty('--primary-strong', dark ? shade(hex, 34) : shade(hex, -16));
    root.style.setProperty('--grad-start', shade(hex, 14));
    root.style.setProperty('--grad-mid', hex);
    root.style.setProperty('--grad-end', shade(hex, -16));
    root.style.setProperty('--tint', `color-mix(in srgb, ${hex} ${dark ? 18 : 9}%, var(--surface))`);
    if (!dark) {
      root.style.setProperty('--ink', shade(hex, -52));
      root.style.setProperty('--heading', shade(hex, -56));
    }
    root.style.setProperty('--shadow-red', `0 12px 28px color-mix(in srgb, ${hex} 30%, transparent)`);
  }
}

function persist(prefs: AppearancePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

const pick = (s: AppearanceState): AppearancePrefs => ({
  accent: s.accent,
  customAccent: s.customAccent,
  textSize: s.textSize,
  cornerStyle: s.cornerStyle,
  density: s.density,
  sidebarPosition: s.sidebarPosition,
  sidebarStyle: s.sidebarStyle,
  sidebarLocked: s.sidebarLocked,
  contentWidth: s.contentWidth,
  stripedRows: s.stripedRows,
  reduceMotion: s.reduceMotion,
});

export const useAppearanceStore = create<AppearanceState>((set, get) => {
  const update = (patch: Partial<AppearancePrefs>) => {
    set(patch);
    const prefs = pick(get());
    persist(prefs);
    applyAppearance(prefs);
  };

  return {
    ...loadPrefs(),
    setAccent: (accent) => update({ accent }),
    setCustomAccent: (customAccent) => update({ customAccent, accent: 'custom' }),
    setTextSize: (textSize) => update({ textSize }),
    setCornerStyle: (cornerStyle) => update({ cornerStyle }),
    setDensity: (density) => update({ density }),
    setSidebarPosition: (sidebarPosition) => update({ sidebarPosition }),
    setSidebarStyle: (sidebarStyle) => update({ sidebarStyle, sidebarLocked: false }),
    setSidebarLocked: (sidebarLocked) => update({ sidebarLocked }),
    setContentWidth: (contentWidth) => update({ contentWidth }),
    setStripedRows: (stripedRows) => update({ stripedRows }),
    setReduceMotion: (reduceMotion) => update({ reduceMotion }),
  };
});

// Apply persisted prefs at module load (before first paint where possible)
applyAppearance(loadPrefs());

// A custom accent's derived shades differ between light/dark — recompute when
// the theme attribute flips (driven by uiStore's colorMode).
try {
  new MutationObserver(() => {
    const s = useAppearanceStore.getState();
    if (s.accent === 'custom') applyAppearance(pick(s));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
} catch {
  // observer unavailable
}
