import React from 'react';
import { useToaster, resolveValue, toast as hotToast, Toast } from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading';

const getVariant = (t: Toast): ToastVariant => {
  if (t.type === 'success' || t.type === 'error' || t.type === 'loading') return t.type;
  if ((t.className || '').includes('warning')) return 'warning';
  return 'info';
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
  loading: <Loader2 size={18} className="animate-spin" />,
};

/**
 * Frosted-glass toast renderer. Headless layer on top of react-hot-toast's
 * state engine (durations, ids, promise/loading transitions, pause-on-hover).
 * Mounted once in main.tsx; trigger via the `notify` helper in utils/toast.
 */
export const GlassToaster: React.FC = () => {
  const { toasts, handlers } = useToaster();
  const { startPause, endPause, calculateOffset, updateHeight } = handlers;

  return (
    <div
      className="glass-toast-viewport"
      onMouseEnter={startPause}
      onMouseLeave={endPause}
    >
      {toasts.map((t) => {
        const offset = calculateOffset(t, { reverseOrder: false, gutter: 10 });
        const variant = getVariant(t);

        return (
          <div
            key={t.id}
            ref={(el) => {
              if (el && typeof t.height !== 'number') {
                updateHeight(t.id, el.offsetHeight);
              }
            }}
            className="glass-toast-positioner"
            style={{ transform: `translateY(${offset}px)` }}
          >
            <div
              className={`glass-toast glass-toast--${variant} ${t.visible ? 'glass-toast--visible' : 'glass-toast--hidden'}`}
              {...t.ariaProps}
            >
              <span className="glass-toast__icon">
                {resolveValue(t.icon, t) || VARIANT_ICONS[variant]}
              </span>
              <span className="glass-toast__message">{resolveValue(t.message, t)}</span>
              {t.type !== 'loading' && (
                <button
                  type="button"
                  className="glass-toast__close"
                  onClick={() => hotToast.dismiss(t.id)}
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GlassToaster;
