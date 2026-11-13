/* Gooseroot UI — React primitives over the gr-* class system.
   Every component renders the kit's markup so the app reads tokens only. */
import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { grIcon, grLogo, grLens, hasGrIcon, type GrLogoKind } from '../../gooseroot/runtime';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ---------- Icons ---------- */
interface IcProps {
  name?: string;               // kit icon name (see gooseroot/runtime GR_ICON_NAMES)
  icon?: LucideIcon;           // lucide fallback for names the kit does not ship
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Ic: React.FC<IcProps> = ({ name, icon: Lucide, size = 20, className = '', style }) => {
  if (name && hasGrIcon(name)) {
    return (
      <span
        className={cx('gr-ic', className)}
        style={{ display: 'inline-flex', width: size, height: size, ...style }}
        dangerouslySetInnerHTML={{ __html: grIcon(name) }}
      />
    );
  }
  if (Lucide) return <Lucide size={size} strokeWidth={1.8} className={cx('gr-i-lu', className)} style={style} />;
  return null;
};

/* ---------- Brand assets ---------- */
export const Logo: React.FC<{ kind?: GrLogoKind; width?: number | string; className?: string; style?: React.CSSProperties }> = ({
  kind = 'wordmark',
  width = 150,
  className = '',
  style,
}) => (
  <span
    className={cx('gr-logo', className)}
    style={{ width, ...style }}
    dangerouslySetInnerHTML={{ __html: grLogo(kind) }}
  />
);

export const Lens: React.FC<{ white?: boolean; size?: number; className?: string }> = ({ white, size = 64, className = '' }) => (
  <span
    className={cx('gr-lens-wrap', className)}
    style={{ ['--size' as string]: `${size}px`, display: 'inline-flex' }}
    dangerouslySetInnerHTML={{ __html: grLens(white) }}
  />
);

export const PageLoader: React.FC = () => (
  <div className="gr pos-loader">
    <Lens size={88} />
  </div>
);

export const Spin: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <span className={cx('gr-spin', className)} style={{ width: size, height: size }} />
);

/* ---------- Buttons ---------- */
export type BtnVariant = 'primary' | 'ink' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'success';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  pill?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(({
  children,
  variant = 'primary',
  size = 'md',
  block,
  pill,
  isLoading,
  loadingText,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  ...rest
}, ref) => (
  <button
    ref={ref}
    className={cx(
      'gr-btn',
      `gr-btn--${variant}`,
      size === 'sm' && 'gr-btn--sm',
      size === 'lg' && 'gr-btn--lg',
      block && 'gr-btn--block',
      pill && 'gr-btn--pill',
      className,
    )}
    disabled={disabled || isLoading}
    {...rest}
  >
    {isLoading ? (
      <>
        <Spin size={16} />
        {loadingText || children}
      </>
    ) : (
      <>
        {leftIcon}
        {children}
        {rightIcon}
      </>
    )}
  </button>
));
Btn.displayName = 'Btn';

interface IconBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'plain' | 'outline' | 'filled';
  round?: boolean;
  sm?: boolean;
  badge?: boolean;
  icon: React.ReactNode;
  label: string;
}

export const IconBtn = React.forwardRef<HTMLButtonElement, IconBtnProps>(({
  variant = 'plain', round, sm, badge, icon, label, className = '', ...rest
}, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    className={cx(
      'gr-iconbtn',
      variant === 'outline' && 'gr-iconbtn--outline',
      variant === 'filled' && 'gr-iconbtn--filled',
      round && 'gr-iconbtn--round',
      sm && 'gr-iconbtn--sm',
      className,
    )}
    {...rest}
  >
    {icon}
    {badge && <span className="gr-dotbadge" />}
  </button>
));
IconBtn.displayName = 'IconBtn';

/* ---------- Card ---------- */
interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  flat?: boolean;
  raised?: boolean;
  tint?: boolean;
  brand?: boolean;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ flat, raised, tint, brand, title, actions, className = '', children, ...rest }) => (
  <section
    className={cx('gr-card', flat && 'gr-card--flat', raised && 'gr-card--raised', tint && 'gr-card--tint', brand && 'gr-card--brand', className)}
    {...rest}
  >
    {(title || actions) && (
      <header className="gr-card__head">
        {typeof title === 'string' ? <h3 className="gr-h3">{title}</h3> : title}
        {actions}
      </header>
    )}
    {children}
  </section>
);

export const Inner: React.FC<React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }> = ({ raised, className = '', ...rest }) => (
  <div className={cx('gr-inner', raised && 'gr-inner--raised', className)} {...rest} />
);

/* ---------- Forms ---------- */
interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  help?: string;
  error?: string;
  ok?: string;
  invalid?: boolean;
  valid?: boolean;
  htmlFor?: string;
}

export const Field: React.FC<FieldProps> = ({ label, help, error, ok, invalid, valid, htmlFor, className = '', children, ...rest }) => (
  <div className={cx('gr-field', (invalid || error) && 'is-invalid', valid && 'is-valid', className)} {...rest}>
    {label && <label className="gr-field__label" htmlFor={htmlFor}>{label}</label>}
    {children}
    {error ? <span className="gr-field__error">{error}</span> : ok ? <span className="gr-field__ok">{ok}</span> : help ? <span className="gr-field__help">{help}</span> : null}
  </div>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...rest }, ref) => <input ref={ref} className={cx('gr-input', className)} {...rest} />,
);
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...rest }, ref) => <select ref={ref} className={cx('gr-select', className)} {...rest} />,
);
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...rest }, ref) => <textarea ref={ref} className={cx('gr-textarea', className)} {...rest} />,
);
Textarea.displayName = 'Textarea';

export const SearchInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { kbd?: string }> = ({ kbd, className = '', ...rest }) => (
  <div className={cx('gr-search', className)}>
    <Ic name="search" size={18} />
    <input type="search" {...rest} />
    {kbd && <span className="gr-kbd">{kbd}</span>}
  </div>
);

interface CheckProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  radio?: boolean;
}

export const Check = React.forwardRef<HTMLInputElement, CheckProps>(({ label, radio, className = '', ...rest }, ref) => (
  <label className={cx('gr-check', className)}>
    <input ref={ref} type={radio ? 'radio' : 'checkbox'} {...rest} />
    {label && <span>{label}</span>}
  </label>
));
Check.displayName = 'Check';

export const Switch = React.forwardRef<HTMLInputElement, Omit<CheckProps, 'radio'>>(({ label, className = '', ...rest }, ref) => (
  <label className={cx('gr-switch', className)}>
    <input ref={ref} type="checkbox" {...rest} />
    {label && <span>{label}</span>}
  </label>
));
Switch.displayName = 'Switch';

export const Range = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...rest }, ref) => <input ref={ref} type="range" className={cx('gr-range', className)} {...rest} />,
);
Range.displayName = 'Range';

/* ---------- Badge ---------- */
type BadgeVariant = 'red' | 'solid' | 'ink' | 'success' | 'neutral' | 'outline' | 'danger';
export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; lg?: boolean; dot?: boolean }> = ({
  variant = 'red', lg, dot, className = '', children, ...rest
}) => (
  <span className={cx('gr-badge', `gr-badge--${variant}`, lg && 'gr-badge--lg', className)} {...rest}>
    {dot && <span className="gr-dot" />}
    {children}
  </span>
);

/* ---------- Tabs ---------- */
interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  pill?: boolean;
  line?: boolean;
}
export const Tabs: React.FC<TabsProps> = ({ pill, line, className = '', ...rest }) => (
  <div className={cx('gr-tabs', pill && 'gr-tabs--pill', line && 'gr-tabs--line', className)} {...rest} />
);

interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}
export const Tab: React.FC<TabProps> = ({ active, className = '', ...rest }) => (
  <button type="button" className={cx('gr-tab', active && 'is-active', className)} {...rest} />
);

/* ---------- Segmented ---------- */
interface SegProps {
  options: Array<{ value: string; label?: React.ReactNode; icon?: React.ReactNode; title?: string }>;
  value: string;
  onChange: (value: string) => void;
  plain?: boolean;
  className?: string;
}
export const Seg: React.FC<SegProps> = ({ options, value, onChange, plain, className = '' }) => (
  <div className={cx('gr-seg', plain && 'gr-seg--plain', className)} role="group">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        title={o.title}
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
      >
        {o.icon}
        {o.label}
      </button>
    ))}
  </div>
);

/* ---------- Modal ---------- */
interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconDanger?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  hideClose?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open, onClose, title, subtitle, icon, iconDanger, size = 'md', footer, children, className = '', bodyClassName = '', hideClose,
}) => {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="gr-modal-live is-open"
      onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div className={cx('gr-modal', size !== 'md' && `gr-modal--${size}`, className)} role="dialog" aria-modal="true">
        {(title || !hideClose) && (
          <div className="gr-modal__head">
            {icon && (
              <span
                className="gr-well"
                style={iconDanger ? { background: 'var(--danger-tint)', color: 'var(--danger)' } : undefined}
              >
                {icon}
              </span>
            )}
            <div>
              {typeof title === 'string' ? <h3 className="gr-h3">{title}</h3> : title}
              {subtitle && <p className="gr-caption">{subtitle}</p>}
            </div>
            {!hideClose && onClose && (
              <IconBtn label="Close" icon={<Ic name="x" />} onClick={onClose} />
            )}
          </div>
        )}
        <div className={cx('gr-modal__body', bodyClassName)}>{children}</div>
        {footer && <div className="gr-modal__foot">{footer}</div>}
      </div>
    </div>
  );
};

/* ---------- Table ---------- */
export const TableWrap: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div className={cx('gr-tablewrap', className)} {...rest} />
);
export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className = '', ...rest }) => (
  <table className={cx('gr-table', className)} {...rest} />
);

/* ---------- Feedback ---------- */
type AlertVariant = 'info' | 'success' | 'danger';
export const Alert: React.FC<React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant; icon?: React.ReactNode; title?: string }> = ({
  variant = 'info', icon, title, className = '', children, ...rest
}) => (
  <div className={cx('gr-alert', `gr-alert--${variant}`, className)} {...rest}>
    {icon || <Ic name={variant === 'danger' ? 'alert' : variant === 'success' ? 'check' : 'info'} />}
    <div>
      {title && <b>{title}</b>}
      {children}
    </div>
  </div>
);

const EmptyScene: React.FC = () => (
  <svg className="gr-empty__scene" viewBox="0 0 220 164" aria-hidden="true">
    <circle className="ges-orbit" cx="110" cy="80" r="70" />
    <circle className="ges-dot" cx="43" cy="61" r="3.4" />
    <circle className="ges-dot" cx="172" cy="47" r="3.4" />
    <circle className="ges-dot" cx="171" cy="115" r="3.4" />
    <circle className="ges-dot ges-dot--sm" cx="65" cy="134" r="2.4" />
    <path className="ges-star" d="M58 121 Q59.3 126.7 65 128 Q59.3 129.3 58 135 Q56.7 129.3 51 128 Q56.7 126.7 58 121 Z" />
    <path className="ges-star" d="M178 46 Q179 51 184 52 Q179 53 178 58 Q177 53 172 52 Q177 51 178 46 Z" />
    <path className="ges-star ges-star--sm" d="M136 133.5 Q136.8 137.2 140.5 138 Q136.8 138.8 136 142.5 Q135.2 138.8 131.5 138 Q135.2 137.2 136 133.5 Z" />
    <g transform="rotate(-7 79 82)">
      <rect className="ges-card" x="32" y="54" width="94" height="56" rx="15" />
      <rect className="ges-line" x="44" y="68" width="56" height="5" rx="2.5" />
      <rect className="ges-line" x="44" y="79" width="40" height="5" rx="2.5" />
      <rect className="ges-line" x="44" y="90" width="50" height="5" rx="2.5" />
    </g>
    <g transform="rotate(6 141 78)">
      <rect className="ges-card" x="94" y="50" width="94" height="56" rx="15" />
      <rect className="ges-line" x="106" y="64" width="54" height="5" rx="2.5" />
      <rect className="ges-line" x="106" y="75" width="38" height="5" rx="2.5" />
      <rect className="ges-line" x="106" y="86" width="48" height="5" rx="2.5" />
    </g>
  </svg>
);

export const Empty: React.FC<{ icon?: React.ReactNode; title?: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode; compact?: boolean; className?: string }> = ({
  icon, title, text, action, compact, className = '',
}) => (
  <div className={cx('gr-empty', compact && 'gr-empty--compact', className)}>
    {icon && (
      <div className="gr-empty__art">
        {!compact && <EmptyScene />}
        <span className="gr-empty__icon">{icon}</span>
      </div>
    )}
    {title && <h3 className="gr-h3">{title}</h3>}
    {text && <p className="gr-empty__text">{text}</p>}
    {action}
  </div>
);

/* ---------- Pagination (gr-pager) ---------- */
interface PagerProps {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  className?: string;
}
export const Pager: React.FC<PagerProps> = ({ page, totalPages, onPage, className = '' }) => {
  if (totalPages <= 1) return null;
  const pages: Array<number | '…'> = [];
  const push = (v: number | '…') => { if (pages[pages.length - 1] !== v) pages.push(v); };
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) push(i);
    else push('…');
  }
  return (
    <div className={cx('gr-pager', className)}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <Ic name="chevron-left" size={16} />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <button key={`e${i}`} type="button" disabled>…</button>
        ) : (
          <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
        ),
      )}
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
        <Ic name="chevron-right" size={16} />
      </button>
    </div>
  );
};

/* ---------- Dropdown / menu ---------- */
interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  right?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}
export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, right, className = '', onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const set = (v: boolean) => { setOpen(v); onOpenChange?.(v); };
  return (
    <span ref={ref} className={cx('gr-dropdown', right && 'gr-dropdown--right', open && 'is-open', className)}>
      <span onClick={() => set(!open)} style={{ display: 'inline-flex' }}>{trigger}</span>
      <div className="gr-menu" role="menu" onClick={() => set(false)}>{children}</div>
    </span>
  );
};

export const MenuItem: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; active?: boolean; icon?: React.ReactNode }> = ({
  danger, active, icon, className = '', children, ...rest
}) => (
  <button type="button" className={cx('gr-menu__item', danger && 'gr-menu__item--danger', active && 'is-active', className)} {...rest}>
    {icon}
    {children}
    {active && <Ic name="check" size={16} className="gr-check-mark" />}
  </button>
);

export const MenuSep: React.FC = () => <div className="gr-menu__sep" />;

/* ---------- Stat ---------- */
export const Stat: React.FC<{ icon?: React.ReactNode; label: React.ReactNode; value: React.ReactNode; delta?: React.ReactNode; deltaDown?: boolean; className?: string }> = ({
  icon, label, value, delta, deltaDown, className = '',
}) => (
  <div className={cx('gr-stat', className)}>
    <div className="gr-stat__top">
      {icon && <span className="gr-well">{icon}</span>}
      <div>
        <div className="gr-stat__value">{value}</div>
        <div className="gr-caption">{label}</div>
      </div>
    </div>
    {delta && <span className={cx('gr-delta', deltaDown && 'is-down')}>{delta}</span>}
  </div>
);

/* ---------- Page head ---------- */
export const PageHead: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode; className?: string }> = ({
  title, subtitle, children, className = '',
}) => (
  <div className={cx('pos-pagehead gr-row', className)}>
    <div style={{ flex: 1, minWidth: 0 }}>
      {typeof title === 'string' ? <h2 className="gr-h2">{title}</h2> : title}
      {subtitle && <p className="gr-caption">{subtitle}</p>}
    </div>
    {children}
  </div>
);

/* ---------- Misc ---------- */
export const Kbd: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className = '', ...rest }) => (
  <span className={cx('gr-kbd', className)} {...rest} />
);

export const Well: React.FC<React.HTMLAttributes<HTMLSpanElement> & { brand?: boolean; sm?: boolean; lg?: boolean }> = ({
  brand, sm, lg, className = '', ...rest
}) => (
  <span className={cx('gr-well', brand && 'gr-well--brand', sm && 'gr-well--sm', lg && 'gr-well--lg', className)} {...rest} />
);

export const Avatar: React.FC<React.HTMLAttributes<HTMLSpanElement> & { wine?: boolean; tint?: boolean; sm?: boolean; lg?: boolean }> = ({
  wine, tint, sm, lg, className = '', ...rest
}) => (
  <span className={cx('gr-avatar', wine && 'gr-avatar--wine', tint && 'gr-avatar--tint', sm && 'gr-avatar--sm', lg && 'gr-avatar--lg', className)} {...rest} />
);

export const Progress: React.FC<{ value: number; success?: boolean; live?: boolean; className?: string }> = ({ value, success, live, className = '' }) => (
  <div className={cx('gr-progress', success && 'gr-progress--success', live && 'gr-progress--live', className)}>
    <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export const Hr: React.FC<{ strong?: boolean; dashed?: boolean; brand?: boolean; className?: string }> = ({ strong, dashed, brand, className = '' }) => (
  <hr className={cx('gr-hr', strong && 'gr-hr--strong', dashed && 'gr-hr--dashed', brand && 'gr-hr--brand', className)} />
);

export const Skel: React.FC<{ w?: number | string; h?: number | string; className?: string; style?: React.CSSProperties }> = ({ w = '100%', h = 14, className = '', style }) => (
  <div className={cx('gr-skel', className)} style={{ width: w, height: h, ...style }} />
);
