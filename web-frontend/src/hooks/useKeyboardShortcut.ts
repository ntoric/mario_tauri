import { useEffect, useRef } from 'react';

/**
 * Modifier flags expected on a shortcut.
 */
export interface ShortcutModifiers {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface ShortcutBinding {
  /** Lowercase key, e.g. "a", "Enter", "ArrowDown", "1", "/", "?". */
  key: string;
  modifiers?: ShortcutModifiers;
  /** Action to run when the shortcut fires. */
  handler: (e: KeyboardEvent) => void;
  /**
   * If true (default), the shortcut is ignored while the user is typing
   * in an input/textarea/select/contentEditable element. Set false for
   * shortcuts that should work even inside form fields (e.g. Esc).
   */
  allowInInput?: boolean;
  /** If true, call preventDefault() on the event before the handler. */
  preventDefault?: boolean;
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (INPUT_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  // Tauri webview sometimes reports the document as target; treat as not typing.
  return false;
}

function modifiersMatch(e: KeyboardEvent, m?: ShortcutModifiers): boolean {
  if (!m) {
    // No modifiers requested -> require none of the modifiers held.
    return !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
  }
  return (
    !!e.ctrlKey === !!m.ctrl &&
    !!e.shiftKey === !!m.shift &&
    !!e.altKey === !!m.alt &&
    !!e.metaKey === !!m.meta
  );
}

/**
 * Register a list of keyboard shortcuts on window. The bindings list is
 * captured via a ref so callers can pass an inline array without causing
 * re-subscriptions on every render.
 */
export function useKeyboardShortcuts(bindings: ShortcutBinding[], enabled: boolean = true): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const list = bindingsRef.current;
      // Compare case-insensitively for letter keys; keep symbols as-is.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const bKey = b.key.length === 1 ? b.key.toLowerCase() : b.key;
        if (bKey !== key) continue;
        if (!modifiersMatch(e, b.modifiers)) continue;

        if (!b.allowInInput && isTypingTarget(e.target)) continue;

        if (b.preventDefault) e.preventDefault();
        b.handler(e);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Helper to build a human-readable label for a shortcut binding.
 */
export function describeShortcut(binding: Pick<ShortcutBinding, 'key' | 'modifiers'>): string {
  const parts: string[] = [];
  if (binding.modifiers?.meta) parts.push('Cmd');
  if (binding.modifiers?.ctrl) parts.push('Ctrl');
  if (binding.modifiers?.shift) parts.push('Shift');
  if (binding.modifiers?.alt) parts.push('Alt');
  const k = binding.key;
  if (k === 'ArrowUp') parts.push('↑');
  else if (k === 'ArrowDown') parts.push('↓');
  else if (k === 'ArrowLeft') parts.push('←');
  else if (k === 'ArrowRight') parts.push('→');
  else if (k === 'Enter') parts.push('Enter');
  else if (k === 'Escape') parts.push('Esc');
  else if (k === ' ') parts.push('Space');
  else if (k === '/') parts.push('/');
  else if (k === '?') parts.push('?');
  else if (k === '+') parts.push('+');
  else if (k === '-') parts.push('-');
  else if (k.length === 1) parts.push(k.toUpperCase());
  else parts.push(k);
  return parts.join(' + ');
}
