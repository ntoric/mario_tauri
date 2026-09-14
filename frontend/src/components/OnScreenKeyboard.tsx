import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Delete,
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  ChevronDown,
  ArrowBigUp,
  ArrowBigUpDash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useUIStore } from '../stores';

type TargetElement = HTMLInputElement | HTMLTextAreaElement;
type LayoutName = 'alpha' | 'symbols' | 'numpad';

const TEXT_INPUT_TYPES = new Set(['', 'text', 'password', 'email', 'search', 'tel', 'url', 'number']);
const NUMERIC_INPUT_TYPES = new Set(['number', 'tel']);

const isTextTarget = (el: unknown): el is TargetElement => {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  }
  return false;
};

const isNumericTarget = (el: TargetElement | null): boolean =>
  el instanceof HTMLInputElement && NUMERIC_INPUT_TYPES.has(el.type);

const setNativeValue = (el: TargetElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
};

const setCaret = (el: TargetElement, pos: number) => {
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    // setSelectionRange unsupported (e.g. input[type=number])
  }
};

const dispatchInput = (el: TargetElement) => {
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const ALPHA_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
  ['SYMBOLS', ',', 'SPACE', '.', 'LEFT', 'RIGHT', 'ENTER', 'HIDE'],
];

const SYMBOL_ROWS: string[][] = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
  ['-', '_', '=', '+', '[', ']', '{', '}', '|', '\\'],
  [';', ':', "'", '"', '<', '>', '/', '?', '`', '~'],
  ['ALPHA', 'SPACE', 'BACKSPACE', 'LEFT', 'RIGHT', 'ENTER', 'HIDE'],
];

const NUMPAD_ROWS: string[][] = [
  ['7', '8', '9', 'BACKSPACE'],
  ['4', '5', '6', 'LEFT'],
  ['1', '2', '3', 'RIGHT'],
  ['0', '.', 'ENTER', 'HIDE'],
];

const OnScreenKeyboard: React.FC = () => {
  const enabled = useUIStore((state) => state.onScreenKeyboardEnabled);
  const toggle = useUIStore((state) => state.toggleOnScreenKeyboard);
  const [visible, setVisible] = useState(false);
  const [shift, setShift] = useState(false);
  const [layout, setLayout] = useState<LayoutName>('alpha');
  const targetRef = useRef<TargetElement | null>(null);

  const getTarget = useCallback((): TargetElement | null => {
    const el = targetRef.current;
    if (el && document.contains(el) && isTextTarget(el)) return el;
    return null;
  }, []);

  // Track focus of text fields across the whole app (login page included)
  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      targetRef.current = null;
      return;
    }

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextTarget(e.target)) return;
      targetRef.current = e.target;
      setLayout(isNumericTarget(e.target) ? 'numpad' : 'alpha');
      setShift(false);
      setVisible(true);
      // Keep the focused field visible above the keyboard
      setTimeout(() => e.target instanceof HTMLElement && e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    };

    const onFocusOut = () => {
      // Defer so the newly focused element is reflected in document.activeElement
      setTimeout(() => {
        if (!isTextTarget(document.activeElement)) {
          setVisible(false);
          targetRef.current = null;
        }
      }, 0);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    // If a field is already focused when the keyboard gets enabled
    if (isTextTarget(document.activeElement)) {
      targetRef.current = document.activeElement;
      setLayout(isNumericTarget(document.activeElement) ? 'numpad' : 'alpha');
      setVisible(true);
    }

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled]);

  const insertText = useCallback((text: string) => {
    const el = getTarget();
    if (!el) return;
    let value = text;
    if (isNumericTarget(el)) {
      value = value.replace(/[^0-9.\-]/g, '');
      if (!value) return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setNativeValue(el, el.value.slice(0, start) + value + el.value.slice(end));
    dispatchInput(el);
    setCaret(el, start + value.length);
  }, [getTarget]);

  const backspace = useCallback(() => {
    const el = getTarget();
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start === end && start === 0) return;
    const delStart = start === end ? start - 1 : start;
    setNativeValue(el, el.value.slice(0, delStart) + el.value.slice(end));
    dispatchInput(el);
    setCaret(el, delStart);
  }, [getTarget]);

  const moveCaret = useCallback((dir: -1 | 1) => {
    const el = getTarget();
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === null || end === null) return;
    const pos = start === end ? start + dir : dir === -1 ? start : end;
    setCaret(el, Math.max(0, Math.min(el.value.length, pos)));
  }, [getTarget]);

  const pressEnter = useCallback(() => {
    const el = getTarget();
    if (!el) return;
    if (el instanceof HTMLTextAreaElement) {
      insertText('\n');
      return;
    }
    const notPrevented = el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
    );
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    if (notPrevented) el.closest('form')?.requestSubmit?.();
  }, [getTarget, insertText]);

  const press = useCallback((key: string) => {
    switch (key) {
      case 'SHIFT':
        setShift((s) => !s);
        return;
      case 'SYMBOLS':
        setLayout('symbols');
        return;
      case 'ALPHA':
        setLayout('alpha');
        return;
      case 'HIDE':
        setVisible(false);
        return;
      case 'BACKSPACE':
        backspace();
        return;
      case 'SPACE':
        insertText(' ');
        return;
      case 'LEFT':
        moveCaret(-1);
        return;
      case 'RIGHT':
        moveCaret(1);
        return;
      case 'ENTER':
        pressEnter();
        return;
      default: {
        insertText(shift ? key.toUpperCase() : key);
        if (shift) setShift(false);
      }
    }
  }, [backspace, insertText, moveCaret, pressEnter, shift]);

  const handleToggle = (e: React.PointerEvent) => {
    e.preventDefault();
    const next = !enabled;
    toggle();
    toast.success(next ? 'On-screen keyboard enabled' : 'On-screen keyboard disabled', { duration: 1500 });
  };

  const rows = layout === 'numpad' ? NUMPAD_ROWS : layout === 'symbols' ? SYMBOL_ROWS : ALPHA_ROWS;

  const renderKeyLabel = (key: string) => {
    switch (key) {
      case 'BACKSPACE': return <Delete size={20} />;
      case 'ENTER': return <CornerDownLeft size={20} />;
      case 'HIDE': return <ChevronDown size={20} />;
      case 'LEFT': return <ArrowLeft size={20} />;
      case 'RIGHT': return <ArrowRight size={20} />;
      case 'SHIFT': return shift ? <ArrowBigUpDash size={20} /> : <ArrowBigUp size={20} />;
      case 'SPACE': return 'space';
      case 'SYMBOLS': return '?123';
      case 'ALPHA': return 'ABC';
      default: return shift && key.length === 1 ? key.toUpperCase() : key;
    }
  };

  const keyClass = (key: string) => {
    const classes = ['osk-key'];
    if (key === 'SPACE') classes.push('osk-key--space');
    if (['BACKSPACE', 'ENTER', 'SHIFT', 'SYMBOLS', 'ALPHA', 'HIDE'].includes(key)) classes.push('osk-key--wide');
    if (['BACKSPACE', 'ENTER', 'SHIFT', 'SYMBOLS', 'ALPHA', 'HIDE', 'LEFT', 'RIGHT'].includes(key)) classes.push('osk-key--action');
    if (key === 'SHIFT' && shift) classes.push('osk-key--active');
    if (key === 'ENTER') classes.push('osk-key--enter');
    return classes.join(' ');
  };

  return (
    <>
      <button
        type="button"
        className={`osk-fab ${enabled ? 'osk-fab--active' : ''} ${visible ? 'osk-fab--raised' : ''} ${visible && layout === 'numpad' ? 'osk-fab--raised-compact' : ''}`}
        onPointerDown={handleToggle}
        title={enabled ? 'Disable on-screen keyboard' : 'Enable on-screen keyboard'}
        aria-label="Toggle on-screen keyboard"
        tabIndex={-1}
      >
        <Keyboard size={22} />
      </button>

      {enabled && visible && (
        <div className="onscreen-keyboard" onPointerDown={(e) => e.preventDefault()}>
          <div className={`osk-rows ${layout === 'numpad' ? 'osk-rows--numpad' : ''}`}>
            {rows.map((row, i) => (
              <div className="osk-row" key={i}>
                {row.map((key) => (
                  <button
                    key={key}
                    type="button"
                    tabIndex={-1}
                    className={keyClass(key)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      press(key);
                    }}
                  >
                    {renderKeyLabel(key)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default OnScreenKeyboard;
