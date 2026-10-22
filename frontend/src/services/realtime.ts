const getWsBase = (): string | null => {
  const env = (import.meta as any).env;
  const isWeb = /^https?:$/.test(window.location.protocol);
  const backend =
    env?.VITE_BACKEND_URL ||
    env?.VITE_API_URL ||
    (isWeb ? '/api' : 'http://localhost:8088/api');

  let base = backend;

  // Handle relative paths first
  if (base.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = `${protocol}//${window.location.host}`;
  } else {
    // Convert http/https to ws/wss
    base = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }

  // Remove /api suffix if present
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }

  return base;
};

const getToken = (): string | null => sessionStorage.getItem('cafe_token');

export const getTableStatusWsUrl = (storeId: string): string => {
  const token = getToken();
  const base = getWsBase();
  if (!token || !base) return '';

  const params = new URLSearchParams({ storeId, token });
  return `${base}/api/ws/tables-status?${params.toString()}`;
};

export const getBillPrintWsUrl = (storeId: string, deviceId: string): string => {
  const token = getToken();
  const base = getWsBase();
  if (!token || !base) return '';

  const params = new URLSearchParams({ storeId, deviceId, token });
  return `${base}/api/ws/bill-print?${params.toString()}`;
};
