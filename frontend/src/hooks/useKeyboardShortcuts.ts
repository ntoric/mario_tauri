import { useEffect, useCallback } from 'react';

export interface ShortcutDef {
  keys: string;
  description: string;
  category: 'Navigation' | 'Tables' | 'Order Page' | 'Actions' | 'General';
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: 'Alt+1', description: 'Go to Tables', category: 'Navigation' },
  { keys: 'Alt+2', description: 'Go to Parcel Order', category: 'Navigation' },
  { keys: 'Alt+3', description: 'Go to Items & Menu', category: 'Navigation' },
  { keys: 'Alt+4', description: 'Go to Order History', category: 'Navigation' },
  { keys: 'Alt+5', description: 'Go to Users', category: 'Navigation' },
  { keys: 'Alt+6', description: 'Go to Reports', category: 'Navigation' },
  { keys: 'Alt+7', description: 'Go to Expenses', category: 'Navigation' },
  { keys: 'Alt+8', description: 'Go to Business Settings', category: 'Navigation' },
  { keys: 'Alt+9', description: 'Go to Developer Settings', category: 'Navigation' },
  // Tables page
  { keys: 'V', description: 'Toggle table view (layout / list)', category: 'Tables' },
  { keys: 'A', description: 'Add new table', category: 'Tables' },
  { keys: 'E', description: 'Toggle edit tables mode', category: 'Tables' },
  { keys: 'P', description: 'Go to Parcel Order', category: 'Tables' },
  // Order page
  { keys: 'Ctrl+S', description: 'Save order', category: 'Order Page' },
  { keys: 'Ctrl+P', description: 'Save & Print bill', category: 'Order Page' },
  { keys: 'Ctrl+E', description: 'Save as E-Bill', category: 'Order Page' },
  { keys: 'Ctrl+K', description: 'KOT & Print', category: 'Order Page' },
  { keys: 'Esc', description: 'Cancel / back to tables', category: 'Order Page' },
  // General actions
  { keys: 'N', description: 'New / Add (context-aware)', category: 'Actions' },
  { keys: '/', description: 'Focus search', category: 'Actions' },
  { keys: 'Esc', description: 'Close modal / overlay', category: 'General' },
  { keys: '?', description: 'Show / hide shortcuts', category: 'General' },
  { keys: 'Alt+B', description: 'Go back', category: 'General' },
  { keys: 'Alt+R', description: 'Reload page', category: 'General' },
];

const PAGE_ROUTES: Record<string, string> = {
  '1': '/',
  '2': '/parcel-order',
  '3': '/items',
  '4': '/history',
  '5': '/users',
  '6': '/reports',
  '7': '/expenses',
  '8': '/business-settings',
  '9': '/developer-settings',
};

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function clickBySelector(selector: string): void {
  const btn = document.querySelector(selector) as HTMLButtonElement | null;
  if (btn && !btn.disabled) btn.click();
}

export function useKeyboardShortcuts(
  navigate: (path: string) => void,
  toggleShortcuts: () => void,
) {
  const handler = useCallback((e: KeyboardEvent) => {
    // Alt+number navigation — works even in inputs
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const key = e.key;
      if (PAGE_ROUTES[key]) {
        e.preventDefault();
        navigate(PAGE_ROUTES[key]);
        return;
      }
      if (key.toLowerCase() === 'b') {
        e.preventDefault();
        navigate(-1 as any);
        return;
      }
      if (key.toLowerCase() === 'r') {
        e.preventDefault();
        window.location.reload();
        return;
      }
    }

    // Ctrl+key shortcuts (order page actions) — work even in some inputs
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const path = currentPath();
      // Order page and parcel order page
      if (path.startsWith('/order/') || path === '/parcel-order') {
        const key = e.key.toLowerCase();
        if (key === 's') {
          e.preventDefault();
          clickBySelector('.order-page-bottom-bar-actions .btn-secondary');
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          clickBySelector('.order-page-bottom-bar-actions .btn-primary');
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          clickBySelector('.order-page-bottom-bar-actions .btn-warning');
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          clickBySelector('.order-page-bottom-bar-actions .btn-info');
          return;
        }
      }
    }

    // Don't intercept single-key shortcuts while typing
    if (isTyping()) {
      if (e.key === 'Escape') {
        (document.activeElement as HTMLElement)?.blur();
      }
      return;
    }

    // ? — toggle shortcuts modal
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      toggleShortcuts();
      return;
    }

    const path = currentPath();

    // Tables page specific shortcuts
    if (path === '/') {
      const key = e.key.toLowerCase();
      if (key === 'v') {
        e.preventDefault();
        // Toggle view: click the inactive view button
        const layoutBtn = document.querySelector('.zoho-page-header .view-btn') as HTMLButtonElement;
        const listBtn = document.querySelectorAll('.zoho-page-header .view-btn')[1] as HTMLButtonElement;
        const layoutActive = layoutBtn?.classList.contains('active');
        if (layoutActive && listBtn) listBtn.click();
        else if (layoutBtn) layoutBtn.click();
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        // Click "Add Table" button
        const btns = document.querySelectorAll('.zoho-page-header .btn-primary');
        for (const btn of btns) {
          if (btn.textContent?.includes('Add Table')) {
            (btn as HTMLButtonElement).click();
            return;
          }
        }
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        // Click "Edit Tables" / "Done" button
        const btns = document.querySelectorAll('.zoho-page-header .btn');
        for (const btn of btns) {
          const text = btn.textContent?.trim();
          if (text === 'Edit Tables' || text === 'Done') {
            (btn as HTMLButtonElement).click();
            return;
          }
        }
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        navigate('/parcel-order');
        return;
      }
    }

    // Order page: Escape to cancel/back
    if ((path.startsWith('/order/') || path === '/parcel-order') && e.key === 'Escape') {
      e.preventDefault();
      const cancelBtn = document.querySelector('.order-page-bottom-bar-actions .btn-danger') as HTMLButtonElement;
      if (cancelBtn) cancelBtn.click();
      return;
    }

    // n — trigger the primary "Add" action
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const btn = document.querySelector('.zoho-page-header .btn-primary, .card-header .btn-primary') as HTMLButtonElement;
      if (btn) btn.click();
      return;
    }

    // / — focus search input
    if (e.key === '/') {
      e.preventDefault();
      const search = document.querySelector('.search-input, .zoho-search-input, input[type="search"]') as HTMLInputElement;
      if (search) {
        search.focus();
      }
      return;
    }

    // Escape — close any open modal
    if (e.key === 'Escape') {
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        const closeBtn = overlay.querySelector('.close-btn') as HTMLButtonElement;
        if (closeBtn) closeBtn.click();
      }
    }
  }, [navigate, toggleShortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
