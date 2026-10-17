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
  { id: 'default', name: 'Orange (Default)', primary: '#f58220', primaryDark: '#e0731a', primaryLight: '#f99b3f' },
  { id: 'blue', name: 'Blue', primary: '#3b82f6', primaryDark: '#2563eb', primaryLight: '#60a5fa' },
  { id: 'green', name: 'Green', primary: '#10b981', primaryDark: '#059669', primaryLight: '#34d399' },
  { id: 'purple', name: 'Purple', primary: '#8b5cf6', primaryDark: '#7c3aed', primaryLight: '#a78bfa' },
  { id: 'red', name: 'Red', primary: '#ef4444', primaryDark: '#dc2626', primaryLight: '#f87171' },
  { id: 'teal', name: 'Teal', primary: '#14b8a6', primaryDark: '#0d9488', primaryLight: '#2dd4bf' },
  { id: 'pink', name: 'Pink', primary: '#ec4899', primaryDark: '#db2777', primaryLight: '#f472b6' },
  { id: 'indigo', name: 'Indigo', primary: '#6366f1', primaryDark: '#4f46e5', primaryLight: '#818cf8' },
  { id: 'amber', name: 'Amber', primary: '#f59e0b', primaryDark: '#d97706', primaryLight: '#fbbf24' },
  { id: 'cyan', name: 'Cyan', primary: '#06b6d4', primaryDark: '#0891b2', primaryLight: '#22d3ee' },
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

export function applyThemeColor(colorHex: string | undefined) {
  const root = document.documentElement;

  if (!colorHex) {
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
    return;
  }

  const rgb = hexToRgb(colorHex);
  if (!rgb) return;

  const primary = colorHex;
  const primaryDark = shadeColor(colorHex, -10);
  const primaryLight = shadeColor(colorHex, 15);

  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-dark', primaryDark);
  root.style.setProperty('--primary-light', primaryLight);

  // Tints: light pastels in light mode, translucent brand glows in dark mode
  if (root.dataset.theme === 'dark') {
    root.style.setProperty('--primary-50', `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`);
    root.style.setProperty('--primary-100', `rgba(${rgb.r},${rgb.g},${rgb.b},0.24)`);
  } else {
    root.style.setProperty('--primary-50', shadeColor(colorHex, 92));
    root.style.setProperty('--primary-100', shadeColor(colorHex, 82));
  }
  root.style.setProperty('--shadow-3d-primary',
    `0 4px 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.3), 0 2px 6px rgba(${rgb.r},${rgb.g},${rgb.b},0.2), 0 1px 3px rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`);
  root.style.setProperty('--shadow-3d-primary-lg',
    `0 8px 24px rgba(${rgb.r},${rgb.g},${rgb.b},0.35), 0 4px 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.25), 0 2px 6px rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`);

  const sidebarStops: Array<[string, number]> = [
    ['--sidebar-bg-top', -55],
    ['--sidebar-bg-mid', -70],
    ['--sidebar-bg-bottom', -82],
  ];
  sidebarStops.forEach(([name, percent]) => {
    const shaded = hexToRgb(shadeColor(colorHex, percent));
    if (shaded) root.style.setProperty(name, `${shaded.r}, ${shaded.g}, ${shaded.b}`);
  });
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
