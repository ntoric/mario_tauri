import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useDataStore } from '../stores';
import { useAuthStore } from '../stores';
import { useUIStore, ColorMode } from '../stores';

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default', name: 'Gooseroot Red', primary: '#d4031a', primaryDark: '#b8002e', primaryLight: '#f0140a' },
];

const DEFAULT_THEME = THEME_PRESETS[0];

interface ThemeContextType {
  currentThemeColor: string | undefined;
  colorMode: ColorMode;
  effectiveColorMode: 'light' | 'dark';
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return null;
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function shadeColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const r = Math.round((t - rgb.r) * p) + rgb.r;
  const g = Math.round((t - rgb.g) * p) + rgb.g;
  const b = Math.round((t - rgb.b) * p) + rgb.b;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Gooseroot brand uses a fixed red accent — per-store custom colours are no
// longer applied. This keeps the public API stable while clearing any
// overrides written by older versions.
export function applyThemeColor(_colorHex: string | undefined) {
  const root = document.documentElement;
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-dark');
  root.style.removeProperty('--primary-light');
  root.style.removeProperty('--primary-50');
  root.style.removeProperty('--primary-100');
  root.style.removeProperty('--shadow-3d-primary');
  root.style.removeProperty('--shadow-3d-primary-lg');
  root.style.removeProperty('--sidebar-bg-top');
  root.style.removeProperty('--sidebar-bg-mid');
  root.style.removeProperty('--sidebar-bg-bottom');
}

export function getThemePresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find(t => t.id === id);
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const stores = useDataStore((state) => state.stores);
  const currentStoreId = useAuthStore((state) => state.currentStoreId);
  const colorMode = useUIStore((state) => state.colorMode);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const currentStore = stores.find(s => s.id === currentStoreId);
  const themeColor = currentStore?.themeColor;

  // Track OS preference so 'system' mode reacts to changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveColorMode: 'light' | 'dark' =
    colorMode === 'system' ? (systemDark ? 'dark' : 'light') : colorMode;

  useEffect(() => {
    // The DOM attribute is applied by uiStore (also on login/app boot);
    // set it again here defensively, then re-apply theme-dependent vars.
    document.documentElement.dataset.theme = effectiveColorMode;
    applyThemeColor(themeColor);
  }, [themeColor, effectiveColorMode]);

  return (
    <ThemeContext.Provider value={{
      currentThemeColor: themeColor,
      colorMode,
      effectiveColorMode,
      isDark: effectiveColorMode === 'dark',
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
