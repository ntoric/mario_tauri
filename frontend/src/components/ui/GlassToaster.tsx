import React from 'react';
import { useToaster, resolveValue, toast as hotToast, Toast } from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Ic, Spin } from '../gr';

type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading';

const getVariant = (t: Toast): ToastVariant => {
  if (t.type === 'success' || t.type === 'error' || t.type === 'loading') return t.type;
  if ((t.className || '').includes('warning')) return 'warning';
  return 'info';
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={16} strokeWidth={2.2} />,
  error: <XCircle size={16} strokeWidth={2.2} />,
  warning: <AlertTriangle size={16} strokeWidth={2.2} />,
  info: <Info size={16} strokeWidth={2.2} />,
  loading: <Spin size={16} />,
};

/**
 * Gooseroot toast renderer (`.gr-toast` / `.gr-toaststack`). Headless layer on
 * top of react-hot-toast's state engine (durations, ids, promise/loading
 * transitions, pause-on-hover). Mounted once in main.tsx; trigger via the
 * `notify` helper in utils/toast.
 */
export const GlassToaster: React.FC = () => {
  const { toasts, handlers } = useToaster();
  const { startPause, endPause, calculateOffset, updateHeight } = handlers;

  return (
    <div
      className="gr gr-toaststack"
      onMouseEnter={startPause}
      onMouseLeave={endPause}
      style={{ top: 20, right: 20 }}
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
            className={`pos-toast-positioner ${t.visible ? 'is-in' : 'is-out'}`}
            style={{ transform: `translateY(${offset}px)` }}
          >
            <div
              className={`gr-toast ${t.visible ? '' : 'is-leaving'}`}
              {...t.ariaProps}
            >
              <span className="gr-toast__icon">
                {resolveValue(t.icon, t) || VARIANT_ICONS[variant]}
              </span>
              <span>{resolveValue(t.message, t)}</span>
              {t.type !== 'loading' && (
                <button
                  type="button"
                  onClick={() => hotToast.dismiss(t.id)}
                  aria-label="Dismiss notification"
                >
                  <Ic name="x" size={14} />
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
