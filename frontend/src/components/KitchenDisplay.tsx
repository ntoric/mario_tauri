import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, ChefHat, AlertCircle, ArrowLeft, CheckCircle2, Soup, Utensils, PlusCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';
import OrderTimer from './OrderTimer';
import type { Order, KitchenStatus, KitchenStatusHistoryEntry } from '../types';

const COLUMNS: { status: KitchenStatus; label: string; emptyText: string; accent: string }[] = [
  { status: 'pending', label: 'New Orders', emptyText: 'No new orders', accent: 'amber' },
  { status: 'preparing', label: 'Preparing', emptyText: 'Nothing being prepared', accent: 'blue' },
  { status: 'ready', label: 'Ready', emptyText: 'Nothing ready', accent: 'emerald' },
  { status: 'served', label: 'Served', emptyText: 'Nothing served', accent: 'violet' },
];

const KitchenDisplay: React.FC = () => {
  const { orders, stores, fetchOrders, updateOrderKitchenStatus } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const toast = useToast();

  const currentStore = stores.find(s => s.id === currentStoreId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedTimingId, setExpandedTimingId] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<string, KitchenStatusHistoryEntry[]>>({});
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);

  const enabled = currentStore?.kitchenWindowEnabled === true;

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchOrders();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchOrders]);

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Page header
  useEffect(() => {
    setHeaderContent({
      title: 'Kitchen Display',
      subtitle: currentStore?.name || '',
      actions: (
        <button className="btn btn-secondary" onClick={refresh} disabled={isRefreshing}>
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      ),
    });
  }, [setHeaderContent, currentStore, isRefreshing, refresh]);

  // Only active orders, sorted oldest first (kitchen works FIFO)
  const activeOrders = useMemo(() => {
    return orders
      .filter(o => o.status === 'active')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders]);

  const ordersByStatus = useMemo(() => {
    const map: Record<KitchenStatus, Order[]> = { pending: [], preparing: [], ready: [], served: [] };
    for (const o of activeOrders) {
      const status: KitchenStatus = (o.kitchenStatus as KitchenStatus) || 'pending';
      if (map[status]) map[status].push(o);
    }
    return map;
  }, [activeOrders]);

  const advance = async (order: Order) => {
    const current: KitchenStatus = (order.kitchenStatus as KitchenStatus) || 'pending';
    const next: KitchenStatus =
      current === 'pending' ? 'preparing'
      : current === 'preparing' ? 'ready'
      : current === 'ready' ? 'served'
      : 'ready';
    setUpdatingId(order.id);
    try {
      await updateOrderKitchenStatus(order.id, next);
      setHistoryCache(prev => { const n = { ...prev }; delete n[order.id]; return n; });
      toast.success(`Order moved to ${next}`);
    } catch (error) {
      toast.error('Failed to update order status');
    } finally {
      setUpdatingId(null);
    }
  };

  const setStatus = async (order: Order, status: KitchenStatus) => {
    setUpdatingId(order.id);
    try {
      await updateOrderKitchenStatus(order.id, status);
      // Invalidate history cache so timings refresh on next expand
      setHistoryCache(prev => { const next = { ...prev }; delete next[order.id]; return next; });
    } catch (error) {
      toast.error('Failed to update order status');
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleTimings = async (orderId: string) => {
    if (expandedTimingId === orderId) {
      setExpandedTimingId(null);
      return;
    }
    setExpandedTimingId(orderId);
    if (!historyCache[orderId]) {
      setLoadingHistoryId(orderId);
      try {
        const history = await api.getKitchenHistory(orderId);
        setHistoryCache(prev => ({ ...prev, [orderId]: history || [] }));
      } catch {
        setHistoryCache(prev => ({ ...prev, [orderId]: [] }));
      } finally {
        setLoadingHistoryId(null);
      }
    }
  };

  const formatDuration = (ms: number): string => {
    if (ms < 0 || Number.isNaN(ms)) return '—';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const statusLabel = (status: KitchenStatus): string => {
    switch (status) {
      case 'pending': return 'New';
      case 'preparing': return 'Preparing';
      case 'ready': return 'Ready';
      case 'served': return 'Served';
      default: return status;
    }
  };

  const statusDotClass = (status: KitchenStatus): string => {
    switch (status) {
      case 'pending': return 'kitchen-dot-amber';
      case 'preparing': return 'kitchen-dot-blue';
      case 'ready': return 'kitchen-dot-emerald';
      case 'served': return 'kitchen-dot-violet';
      default: return 'kitchen-dot-gray';
    }
  };

  const renderStepTimings = (order: Order) => {
    if (expandedTimingId !== order.id) return null;
    const history = historyCache[order.id];
    if (loadingHistoryId === order.id) {
      return (
        <div className="kitchen-timings" style={{ textAlign: 'center', padding: '0.5rem' }}>
          <RefreshCw size={14} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      );
    }
    if (!history || history.length === 0) {
      return (
        <div className="kitchen-timings">
          <span style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>No step history yet.</span>
        </div>
      );
    }
    const now = Date.now();
    return (
      <div className="kitchen-timings">
        {history.map((entry, idx) => {
          const entered = new Date(entry.enteredAt).getTime();
          const exited = entry.exitedAt ? new Date(entry.exitedAt).getTime() : now;
          const duration = exited - entered;
          const isCurrent = !entry.exitedAt;
          return (
            <div key={idx} className="kitchen-timing-row">
              <span className={`kitchen-timing-dot ${statusDotClass(entry.status)}`} />
              <span className="kitchen-timing-label">{statusLabel(entry.status)}</span>
              <span className={`kitchen-timing-duration ${isCurrent ? 'kitchen-timing-current' : ''}`}>
                {formatDuration(duration)}
                {isCurrent && ' · active'}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!enabled) {
    return (
      <div className="empty-state">
        <AlertCircle size={48} />
        <p>Kitchen Window is not enabled</p>
        <p style={{ fontSize: '0.875rem' }}>
          Enable the “Kitchen Window / Step” feature for this store in Store Management to use the Kitchen Display.
        </p>
      </div>
    );
  }

  const renderItemNotes = (notes?: string) => {
    if (!notes) return null;
    return <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: '0.15rem' }}>Note: {notes}</div>;
  };

  return (
    <div className="kitchen-display">
      <div className="kitchen-columns">
        {COLUMNS.map(col => (
          <div key={col.status} className={`kitchen-column kitchen-column-${col.accent}`}>
            <div className="kitchen-column-header">
              <span className="kitchen-column-title">{col.label}</span>
              <span className="kitchen-column-count">{ordersByStatus[col.status].length}</span>
            </div>
            <div className="kitchen-column-body">
              {ordersByStatus[col.status].length === 0 ? (
                <div className="kitchen-empty">
                  <Soup size={28} />
                  <span>{col.emptyText}</span>
                </div>
              ) : (
                ordersByStatus[col.status].map(order => (
                  <div key={order.id} className={`kitchen-card ${order.kotReissuedAt ? 'kitchen-card-addon' : ''}`}>
                    <div className="kitchen-card-header">
                      <div className="kitchen-card-table">
                        <ChefHat size={14} />
                        {order.orderType === 'parcel' ? 'Parcel' : `Table ${order.tableNumber || '—'}`}
                      </div>
                      <OrderTimer createdAt={order.kotReissuedAt || order.createdAt} />
                    </div>

                    <div className="kitchen-card-order-id">#{order.id.slice(-6).toUpperCase()}</div>

                    {order.kotReissuedAt && (
                      <div className="kitchen-addon-badge">
                        <PlusCircle size={12} />
                        Add-on / Re-order
                      </div>
                    )}

                    {order.customerName && (
                      <div className="kitchen-card-customer">{order.customerName}</div>
                    )}

                    {order.specialNote && (
                      <div className="kitchen-card-special-note">
                        <AlertCircle size={12} />
                        {order.specialNote}
                      </div>
                    )}

                    <ul className="kitchen-card-items">
                      {(order.kotItems && order.kotItems.length > 0 ? order.kotItems : order.items).map((oi, idx) => (
                        <li key={`${oi.itemId}-${idx}`} className="kitchen-item">
                          <span className="kitchen-item-qty">{oi.quantity}×</span>
                          <span className="kitchen-item-name">{oi.item?.name || 'Unknown item'}</span>
                          {renderItemNotes(oi.notes)}
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      className="kitchen-timings-toggle"
                      onClick={() => toggleTimings(order.id)}
                    >
                      <Clock size={12} />
                      Step timings
                      {expandedTimingId === order.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    {renderStepTimings(order)}

                    <div className="kitchen-card-actions">
                      {col.status === 'pending' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => advance(order)}
                          disabled={updatingId === order.id}
                        >
                          <Soup size={14} />
                          Start Preparing
                        </button>
                      )}
                      {col.status === 'preparing' && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setStatus(order, 'pending')}
                            disabled={updatingId === order.id}
                          >
                            <ArrowLeft size={14} />
                            Back
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => advance(order)}
                            disabled={updatingId === order.id}
                          >
                            <CheckCircle2 size={14} />
                            Mark Ready
                          </button>
                        </>
                      )}
                      {col.status === 'ready' && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setStatus(order, 'preparing')}
                            disabled={updatingId === order.id}
                          >
                            <ArrowLeft size={14} />
                            Back
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => advance(order)}
                            disabled={updatingId === order.id}
                          >
                            <Utensils size={14} />
                            Mark Served
                          </button>
                        </>
                      )}
                      {col.status === 'served' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setStatus(order, 'ready')}
                          disabled={updatingId === order.id}
                        >
                          <ArrowLeft size={14} />
                          Back to Ready
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KitchenDisplay;
