import { api } from './api';
import { printerService } from './printer';
import { getBillPrintWsUrl } from './realtime';
import { getDeviceId } from '../utils/deviceId';
import { isQuietHours } from '../utils/quietHours';
import { buildInvoiceFromBillData, parseBillData } from '../utils/billPrint';
import notify from '../utils/toast';
import type { Order, Store } from '../types';

/**
 * Remote bill print service.
 *
 * Runs only on the machine designated as the store's remote bill printer
 * (store.remotePrinterDeviceId === this device's ID). Keeps a dedicated
 * websocket open for instant bill_print_request pushes, claims each job
 * atomically (so two app instances can never double-print), prints, then
 * acks. A slow catch-up read on connect — plus a 30s safety interval — covers
 * any event missed while the socket was down. Jobs stay in the backend queue
 * until acked, so a crash never silently loses a bill; unprinted jobs expire
 * server-side after ~60s.
 */
class RemoteBillPrinterService {
  private ws: WebSocket | null = null;
  private store: Store | null = null;
  private stopped = true;
  private retryTimer: number | null = null;
  private retryDelay = 2000;
  private catchUpTimer: number | null = null;
  private processing = new Set<string>();
  private seen = new Set<string>();

  /** True when this device is store's designated remote bill printer. */
  isPrinterDevice(store?: Store | null): boolean {
    if (!store?.remoteBillingEnabled || !store.remotePrinterDeviceId) return false;
    if (store.remotePrinterDeviceId !== getDeviceId()) return false;
    return !!(store.printerName || (store.printerVendorId && store.printerProductId));
  }

  start(store?: Store | null) {
    const active = store && this.isPrinterDevice(store) ? store : null;

    // Skip restarts when nothing relevant to printing changed (the store
    // object is recreated on every fetchStores refresh).
    if (!this.stopped && active && this.store && this.configKey(this.store) === this.configKey(active)) {
      return;
    }

    this.stop();
    if (!active) return;

    this.store = active;
    this.stopped = false;
    this.retryDelay = 2000;
    this.connect();
    this.catchUpTimer = window.setInterval(() => void this.catchUp(), 30000);
  }

  stop() {
    this.stopped = true;
    this.store = null;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.catchUpTimer) {
      window.clearInterval(this.catchUpTimer);
      this.catchUpTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.processing.clear();
  }

  private configKey(s: Store): string {
    return [
      s.id,
      s.remotePrinterDeviceId,
      s.printerName,
      s.printerVendorId,
      s.printerProductId,
      s.invoiceSize,
      s.taxEnabled,
      s.name,
      s.branch,
      s.location,
      s.gstin,
      s.fssaiNo,
      s.phone,
    ].join('|');
  }

  private connect() {
    if (this.stopped || !this.store) return;
    const url = getBillPrintWsUrl(this.store.id, getDeviceId());
    if (!url) return;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryDelay = 2000;
      // Catch up on anything enqueued while we were disconnected.
      void this.catchUp();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'bill_print_request') {
          void this.handleQueueItem({
            id: msg.queueId,
            orderId: msg.orderId,
            billData: msg.billData,
          });
        } else if (msg?.type === 'bill_print_expired') {
          notify.warning('A remote bill was not printed in time and expired.');
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      if (this.stopped || this.ws !== ws) return;
      // Back off exponentially (2s → 30s cap): a hard failure like a rejected
      // handshake otherwise retries every 2s forever.
      this.retryTimer = window.setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private async catchUp() {
    const store = this.store;
    if (this.stopped || !store || isQuietHours()) return;
    try {
      const items = await api.getBillQueue(store.id, getDeviceId());
      for (const item of items || []) {
        void this.handleQueueItem(item);
      }
    } catch {
      // Transient failure — next safety interval retries.
    }
  }

  private async findOrder(storeId: string, orderId?: string): Promise<Order | undefined> {
    if (!orderId) return undefined;
    try {
      const orders = await api.getOrders(storeId);
      return (orders || []).find((o: Order) => o.id === orderId);
    } catch {
      return undefined;
    }
  }

  private async ack(queueId: string, status: 'printed' | 'failed', error?: string) {
    const store = this.store;
    if (!store) return;
    try {
      await api.ackBillQueueItem(queueId, store.id, getDeviceId(), status, error);
    } catch {
      // Best-effort — the job will expire server-side if the ack is lost.
    }
  }

  private async handleQueueItem(item: { id: string; orderId?: string; billData: unknown }) {
    if (!item?.id || this.seen.has(item.id) || this.processing.has(item.id)) return;
    // No quiet-hours gate here: pushed print jobs are user-initiated, not
    // polling, and the backend accepts them around the clock — refusing them
    // would silently burn the job's 60s TTL.
    const store = this.store;
    if (this.stopped || !store) return;

    this.processing.add(item.id);
    try {
      // Atomic claim — if another instance/device got here first, skip.
      try {
        await api.claimBillQueueItem(item.id, store.id, getDeviceId());
      } catch {
        return; // already claimed elsewhere, or job no longer exists
      }

      const billData = parseBillData(item.billData);
      if (!billData) {
        await this.ack(item.id, 'failed', 'Malformed bill payload');
        return;
      }

      let payload = buildInvoiceFromBillData(billData, undefined, store);
      if (!payload) {
        // Legacy payload without embedded items — resolve the order.
        const order = await this.findOrder(store.id, billData.orderId || item.orderId);
        if (order) {
          payload = buildInvoiceFromBillData(billData, order, store);
        }
      }
      if (!payload) {
        await this.ack(item.id, 'failed', 'Bill has no printable items');
        return;
      }

      try {
        await printerService.printInvoice(payload);
      } catch {
        // One immediate retry, then report the failure upstream.
        try {
          await printerService.printInvoice(payload);
        } catch (err: any) {
          await this.ack(item.id, 'failed', String(err?.message || err));
          notify.error(`Remote bill print failed (${billData.invoiceNo || item.id.slice(0, 8)})`);
          return;
        }
      }

      await this.ack(item.id, 'printed');
      this.seen.add(item.id);
      if (this.seen.size > 500) {
        this.seen.clear();
        this.seen.add(item.id);
      }
    } catch (err) {
      console.error('[RemoteBillPrinter] Unexpected error processing queue item:', err);
    } finally {
      this.processing.delete(item.id);
    }
  }
}

export const remoteBillPrinter = new RemoteBillPrinterService();
