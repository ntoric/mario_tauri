import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface TableStatusUpdate {
  type: string;
  storeId: string;
  reason: string;
}

// Subscribes to table status changes emitted by the embedded local backend.
// Replaces the previous websocket channel — updates are delivered via Tauri
// events, which work fully offline.
export const listenTableStatusUpdates = (
  storeId: string,
  onUpdate: () => void,
): Promise<UnlistenFn> => {
  return listen<TableStatusUpdate>('table_status_update', (event) => {
    const msg = event.payload;
    if (msg?.type === 'table_status_update' && msg.storeId === storeId) {
      onUpdate();
    }
  });
};
