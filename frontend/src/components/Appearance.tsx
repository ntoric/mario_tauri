import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
import { usePageHeader } from '../contexts/PageHeaderContext';
import {
  useAppearanceStore,
  ACCENT_PRESETS,
  TextSize,
  CornerStyle,
  Density,
  SidebarPosition,
  SidebarStyle,
  ContentWidth,
} from '../stores';
import { useUIStore } from '../stores';
import { useTheme } from '../contexts/ThemeContext';

const PrefCard: React.FC<{
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ selected, label, onClick, children }) => (
  <button
    type="button"
    className={`pref-card${selected ? ' selected' : ''}`}
    onClick={onClick}
    aria-pressed={selected}
  >
    <span className="pref-card__preview">{children}</span>
    <span className="pref-card__label">{label}</span>
    <span className="pref-card__check"><Check size={13} /></span>
  </button>
);

const MockLines: React.FC<{ gap?: number }> = ({ gap = 6 }) => (
  <span className="pv-mock__body" style={{ gap }}>
    <i /><i /><i />
  </span>
);

const Appearance: React.FC = () => {
  const { setHeaderContent } = usePageHeader();
  const { isDark } = useTheme();
  const setColorMode = useUIStore((s) => s.setColorMode);
  const prefs = useAppearanceStore();

  useEffect(() => {
    setHeaderContent({
      title: 'Appearance',
      subtitle: 'Choose colours, text size and how content is arranged. Saved automatically for your account on this device.',
      actions: null,
    });
  }, [setHeaderContent]);

  const textSizes: { id: TextSize; label: string; size: number }[] = [
    { id: 'small', label: 'Small', size: 14 },
    { id: 'default', label: 'Default', size: 17 },
    { id: 'large', label: 'Large', size: 21 },
    { id: 'xlarge', label: 'Extra large', size: 25 },
  ];

  const cornerStyles: { id: CornerStyle; label: string; box: string; dot: string }[] = [
    { id: 'sharp', label: 'Sharp', box: '3px', dot: '3px' },
    { id: 'default', label: 'Default', box: '12px', dot: '5px' },
    { id: 'round', label: 'Round', box: '999px', dot: '999px' },
  ];

  const densities: { id: Density; label: string; gap: number }[] = [
    { id: 'compact', label: 'Compact', gap: 3 },
    { id: 'comfortable', label: 'Comfortable', gap: 6 },
    { id: 'spacious', label: 'Spacious', gap: 10 },
  ];

  const sidebarPositions: { id: SidebarPosition; label: string }[] = [
    { id: 'left', label: 'Left' },
    { id: 'right', label: 'Right' },
  ];

  const sidebarStyles: { id: SidebarStyle; label: string }[] = [
    { id: 'hover', label: 'Hover expand' },
    { id: 'expanded', label: 'Expanded' },
    { id: 'icons', label: 'Icons only' },
  ];

  const contentWidths: { id: ContentWidth; label: string }[] = [
    { id: 'full', label: 'Full width' },
    { id: 'boxed', label: 'Boxed' },
  ];

  const handleHexInput = (value: string) => {
    let v = value.trim();
    if (v && !v.startsWith('#')) v = `#${v}`;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      prefs.setCustomAccent(v);
    } else {
      prefs.setCustomAccent(v.slice(0, 7));
    }
  };

  return (
    <div className="dev-settings-page appearance-page">
      {/* ------------------------------ Colours ------------------------------ */}
      <section className="gr-card appearance-card">
        <h3 className="appearance-card__title">Colours</h3>
        <p className="gr-caption">Theme and the accent used for buttons, highlights, the navigation rail and charts.</p>

        <span className="pref-label">Theme</span>
        <div className="pref-grid">
          <PrefCard
            selected={!isDark}
            label="Light"
            onClick={() => setColorMode('light')}
          >
            <span className="pv-window pv-window--light"><span className="pv-toggle" /></span>
          </PrefCard>
          <PrefCard
            selected={isDark}
            label="Dark"
            onClick={() => setColorMode('dark')}
          >
            <span className="pv-window pv-window--dark"><span className="pv-toggle" /></span>
          </PrefCard>
        </div>

        <span className="pref-label">Accent colour</span>
        <div className="accent-swatches">
          {ACCENT_PRESETS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`accent-swatch${prefs.accent === a.id ? ' selected' : ''}`}
              onClick={() => prefs.setAccent(a.id)}
              aria-pressed={prefs.accent === a.id}
            >
              <span className="accent-swatch__dot" style={{ background: a.color }}>
                {prefs.accent === a.id && <Check size={16} />}
              </span>
              {a.name}
            </button>
          ))}
        </div>

        <div className="custom-accent">
          <label
            className={`custom-accent__picker${prefs.accent === 'custom' ? ' selected' : ''}`}
            style={{ background: prefs.customAccent }}
            title="Pick a custom colour"
          >
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(prefs.customAccent) ? prefs.customAccent : '#1a64d1'}
              onChange={(e) => prefs.setCustomAccent(e.target.value)}
            />
          </label>
          <span className="custom-accent__name">Custom</span>
          <input
            className="gr-input custom-accent__hex"
            value={prefs.customAccent}
            onChange={(e) => handleHexInput(e.target.value)}
            onFocus={() => { if (prefs.accent !== 'custom') prefs.setAccent('custom'); }}
            spellCheck={false}
            aria-label="Custom accent colour hex"
          />
        </div>
      </section>

      {/* ---------------------------- Text & shape ---------------------------- */}
      <section className="gr-card appearance-card">
        <h3 className="appearance-card__title">Text &amp; shape</h3>
        <p className="gr-caption">Make text easier to read and choose how rounded panels and controls look.</p>

        <span className="pref-label">Text size</span>
        <div className="pref-grid pref-grid--4">
          {textSizes.map((t) => (
            <PrefCard
              key={t.id}
              selected={prefs.textSize === t.id}
              label={t.label}
              onClick={() => prefs.setTextSize(t.id)}
            >
              <span className="pv-aa" style={{ fontSize: t.size }}>Aa</span>
            </PrefCard>
          ))}
        </div>

        <span className="pref-label">Corner style</span>
        <div className="pref-grid">
          {cornerStyles.map((c) => (
            <PrefCard
              key={c.id}
              selected={prefs.cornerStyle === c.id}
              label={c.label}
              onClick={() => prefs.setCornerStyle(c.id)}
            >
              <span className="pv-corners">
                <i style={{ borderRadius: c.box }} />
                <i className="pv-corners__dot" style={{ borderRadius: c.dot }} />
              </span>
            </PrefCard>
          ))}
        </div>
      </section>

      {/* ------------------------------- Layout ------------------------------ */}
      <section className="gr-card appearance-card">
        <h3 className="appearance-card__title">Layout</h3>
        <p className="gr-caption">How pages and navigation are arranged.</p>

        <span className="pref-label">Density</span>
        <p className="gr-caption">Spacing around cards, tables and lists.</p>
        <div className="pref-grid">
          {densities.map((d) => (
            <PrefCard
              key={d.id}
              selected={prefs.density === d.id}
              label={d.label}
              onClick={() => prefs.setDensity(d.id)}
            >
              <MockLines gap={d.gap} />
            </PrefCard>
          ))}
        </div>

        <div className="pref-pair">
          <div>
            <span className="pref-label">Sidebar position</span>
            <p className="gr-caption">On wide screens. Phones always use the slide-out menu.</p>
            <div className="pref-grid pref-grid--2">
              {sidebarPositions.map((s) => (
                <PrefCard
                  key={s.id}
                  selected={prefs.sidebarPosition === s.id}
                  label={s.label}
                  onClick={() => prefs.setSidebarPosition(s.id)}
                >
                  <span className={`pv-mock${s.id === 'right' ? ' pv-mock--right' : ''}`}>
                    <i className="pv-mock__rail" />
                    <MockLines />
                  </span>
                </PrefCard>
              ))}
            </div>
          </div>
          <div>
            <span className="pref-label">Sidebar style</span>
            <p className="gr-caption">Hover expand opens the menu when you point at it. The sidebar button pins it open.</p>
            <div className="pref-grid pref-grid--3">
              {sidebarStyles.map((s) => (
                <PrefCard
                  key={s.id}
                  selected={prefs.sidebarStyle === s.id}
                  label={s.label}
                  onClick={() => prefs.setSidebarStyle(s.id)}
                >
                  <span className="pv-mock">
                    <i className={`pv-mock__rail${s.id === 'icons' ? ' pv-mock__rail--icons' : s.id === 'hover' ? ' pv-mock__rail--hover' : ''}`} />
                    <MockLines />
                  </span>
                </PrefCard>
              ))}
            </div>
          </div>
        </div>

        <span className="pref-label">Content width</span>
        <p className="gr-caption">Boxed keeps pages at a readable width on very large screens.</p>
        <div className="pref-grid pref-grid--wide">
          {contentWidths.map((c) => (
            <PrefCard
              key={c.id}
              selected={prefs.contentWidth === c.id}
              label={c.label}
              onClick={() => prefs.setContentWidth(c.id)}
            >
              <span className="pv-mock">
                <i className="pv-mock__rail" />
                <span className={`pv-mock__body${c.id === 'boxed' ? ' pv-mock__body--boxed' : ''}`}>
                  <i /><i /><i />
                </span>
              </span>
            </PrefCard>
          ))}
        </div>

        <div className="pref-toggles">
          <label className="gr-switch pref-toggle">
            <input
              type="checkbox"
              checked={prefs.stripedRows}
              onChange={(e) => prefs.setStripedRows(e.target.checked)}
            />
            <span className="pref-toggle__text">
              <strong>Striped table rows</strong>
              <small>Alternate row shading for easier scanning.</small>
            </span>
          </label>
          <label className="gr-switch pref-toggle">
            <input
              type="checkbox"
              checked={prefs.reduceMotion}
              onChange={(e) => prefs.setReduceMotion(e.target.checked)}
            />
            <span className="pref-toggle__text">
              <strong>Reduce motion</strong>
              <small>Turn off animations and transitions.</small>
            </span>
          </label>
        </div>
      </section>
    </div>
  );
};

export default Appearance;
