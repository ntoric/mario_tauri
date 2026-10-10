export const getTableStatusWsUrl = (storeId: string): string => {
  const token = localStorage.getItem('cafe_token');
  if (!token) return '';

  const env = (import.meta as any).env;
  const backend =
    env?.VITE_BACKEND_URL ||
    env?.VITE_API_URL ||
    (window.location.protocol === 'file:' ? 'http://localhost:8088/api' : '/api');

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

  const params = new URLSearchParams({ storeId, token });
  return `${base}/api/ws/tables-status?${params.toString()}`;
};
