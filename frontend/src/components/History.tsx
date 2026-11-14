import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Eye, Calendar, Search, Receipt, Package, X, Printer, CalendarDays, Ban, Combine, FileText, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';
import { orderItemUnitPrice } from '../utils/order';
import { isTaxEnabled } from '../utils/tax';
import { api } from '../services/api';
import { printerService } from '../services/printer';
import { buildInvoicePrintJob, buildCreditNotePrintJob } from '../utils/gstInvoice';
import notify from '../utils/toast';
import { Empty } from './gr';
import { ConfirmDialog } from './ConfirmDialog';
import Pagination from './ui/Pagination';
import type { Order, Bill, BillLine, CreditNote } from '../types';

const PAGE_SIZE = 15;

const History: React.FC = () => {
  const { orders, bills, stores, fetchOrders, fetchBills, cancelOrder } = useDataStore();
  const { currentStoreId, user } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId) || stores[0];
  const taxEnabled = isTaxEnabled(currentStore);
  const { setHeaderContent } = usePageHeader();
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [viewingBill, setViewingBill] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const toolbarSearchRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPrinting, setIsPrinting] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // GST bill detail for the "View Bill" modal (fetched with lines + credit notes)
  const [viewingGstBill, setViewingGstBill] = useState<Bill | null>(null);
  const [billCreditNotes, setBillCreditNotes] = useState<CreditNote[]>([]);
  const [printingCnId, setPrintingCnId] = useState<string | null>(null);
  // Issue-credit-note modal state
  const [cnModalBill, setCnModalBill] = useState<Bill | null>(null);
  const [cnQuantities, setCnQuantities] = useState<Record<number, number>>({});
  const [cnReason, setCnReason] = useState('');
  const [isIssuingCn, setIsIssuingCn] = useState(false);
  const [issuedCn, setIssuedCn] = useState<CreditNote | null>(null);

  // Orders billed from another screen or device can be missing from the
  // cached bill list — re-check the server once before treating an order
  // as having no GST bill.
  const refetchedFor = useRef<Set<string>>(new Set());
  const findBillForOrder = async (orderId: string): Promise<Bill | undefined> => {
    const cached = bills.find(b => b.orderId === orderId);
    if (cached) return cached;
    await fetchBills(true, 1000);
    return useDataStore.getState().bills.find(b => b.orderId === orderId);
  };

  const handlePrintBill = async (order: Order) => {
    if (!currentStore?.printerName) {
      notify.warning('No printer configured. Set one up in Settings.');
      return;
    }

    setIsPrinting(order.id);
    try {
      let associatedBill = await findBillForOrder(order.id);
      if (associatedBill?.fy && !associatedBill.lines?.length) {
        associatedBill = await api.getBill(associatedBill.id);
      }
      if (associatedBill?.fy && associatedBill.lines?.length) {
        await printerService.printInvoice(buildInvoicePrintJob(associatedBill, currentStore!, order.items)!);
        notify.success('Bill reprinted');
        return;
      }
      const invoiceNo = associatedBill?.invoiceNo || '';
      
      const printItems = order.items.map(oi => {
        const itemTotal = orderItemUnitPrice(oi) * oi.quantity;
        const taxPercent = taxEnabled ? (oi.item.taxPercent || 0) : 0;
        return {
          name: oi.item.name,
          hsn: oi.item.description || '',
          qty: oi.quantity,
          unit: 'PCS',
          rate: orderItemUnitPrice(oi),
          tax_percent: taxPercent,
          amount: itemTotal,
        };
      });

      const taxable = printItems.reduce((sum, item) => sum + item.amount, 0);
      const actualTax = printItems.reduce((sum, item) => sum + (item.amount * item.tax_percent / 100), 0);
      const cgst = actualTax / 2;
      const sgst = actualTax / 2;
      const subtotal = associatedBill?.subtotal || taxable;
      const taxTotal = associatedBill?.taxTotal ?? actualTax;
      const total = associatedBill?.total || (subtotal + taxTotal);
      const paymentMethod = associatedBill?.paymentMethod || order.paymentMethod || 'cash';

      await printerService.printInvoice({
        type: 'invoice',
        printer: {
          type: 'usb',
          name: currentStore?.printerName || 'Thermal Printer',
          vendor_id: currentStore?.printerVendorId || '0x0fe6',
          product_id: currentStore?.printerProductId || '0x811e',
          paper_width: (currentStore?.invoiceSize as '2inch' | '3inch') || '3inch',
        },
        invoice: {
          store: {
            name: currentStore?.name || 'Cafe',
            branch: currentStore?.branch || '',
            location: currentStore?.location || '',
            // No GST bill exists for this order, so the receipt must not
            // carry the GSTIN (it would look like a tax invoice).
            ...(currentStore?.fssaiNo ? { fssai_lic_no: currentStore.fssaiNo } : {}),
            ...(currentStore?.phone ? { phone: currentStore.phone } : {}),
            ...(currentStore?.secondaryPhone ? { phone_secondary: currentStore.secondaryPhone } : {}),
            address: currentStore?.location || '',
          },
          customer: {
            name: associatedBill?.customerName || order.customerName || 'Walk-in Customer',
            mobile: associatedBill?.customerMobile || order.customerMobile || '',
          },
          invoice_no: invoiceNo,
          bill_no: invoiceNo,
          date: new Date(order.createdAt).toLocaleString('en-IN'),
          items: printItems,
          summary: {
            sub_total: subtotal,
            discount: associatedBill?.discount || 0,
            taxable: subtotal,
            cgst: cgst,
            sgst: sgst,
            grand_total: total,
          },
          payment: {
            cash: paymentMethod === 'cash' ? total : 0,
            card: paymentMethod === 'card' ? total : 0,
            upi: paymentMethod === 'upi' ? total : 0,
            balance: 0,
          },
          payment_mode: paymentMethod,
          footer: ['Thank You Visit Again'],
        },
      });
    } catch (error) {
      console.error('Failed to print bill:', error);
      notify.error('Failed to print bill. Check your connection and printer settings.');
    } finally {
      setIsPrinting(null);
    }
  };

  // Fetch data on mount
  useEffect(() => {
    fetchOrders({ limit: 1000, sort: 'paid' }); // Fetch more orders for history view (all statuses)
    fetchBills(true, 1000); // always fresh: bills may have been issued elsewhere
  }, [fetchOrders, fetchBills]);

  // When the "View Bill" modal opens on an order with a GST bill, load the full
  // bill (the list payload omits lines) and its credit notes.
  useEffect(() => {
    setViewingGstBill(null);
    setBillCreditNotes([]);
    if (!viewingBill) return;
    const associated = bills.find(b => b.orderId === viewingBill.id);
    if (!associated && !refetchedFor.current.has(viewingBill.id)) {
      // Not in the list yet — refresh once; this effect re-runs on `bills`.
      refetchedFor.current.add(viewingBill.id);
      fetchBills(true, 1000);
      return;
    }
    if (!associated?.fy) return;
    let cancelled = false;
    (async () => {
      try {
        const full = associated.lines?.length ? associated : await api.getBill(associated.id);
        if (cancelled) return;
        setViewingGstBill(full);
        if (currentStore?.id) {
          const cns = await api.getCreditNotes(currentStore.id, { billId: full.id });
          if (!cancelled) setBillCreditNotes(Array.isArray(cns) ? cns : []);
        }
      } catch (error) {
        console.error('Failed to load bill details:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [viewingBill, bills, currentStore?.id, fetchBills]);

  const isParcel = (order: Order) => order.orderType === 'parcel' || order.tableNumber === 0;

  const getDateRange = (period: string): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (period) {
      case 'today': {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { from: today, to: tomorrow };
      }
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const todayEnd = new Date(today);
        return { from: yesterday, to: todayEnd };
      }
      case 'week': {
        const weekStart = new Date(today);
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - day);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return { from: weekStart, to: weekEnd };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        return { from: monthStart, to: monthEnd };
      }
      case 'custom': {
        const from = customDateFrom ? new Date(customDateFrom + 'T00:00:00') : null;
        const to = customDateTo ? new Date(customDateTo + 'T23:59:59') : null;
        return { from, to };
      }
      default:
        return { from: null, to: null };
    }
  };

  // History is ordered by payment time, not order-open time: an order can sit
  // active for a while before billing, so created_at ordering would push a
  // recently-paid long-running table below newer quick orders. For billed
  // orders the bill's generated_at is the exact payment timestamp; for the
  // rest, updated_at is stamped at complete/cancel time.
  const billByOrderId = new Map<string, Bill>(bills.map(b => [b.orderId, b]));
  const paidAt = (o: Order) =>
    new Date(
      o.status === 'cancelled'
        ? o.cancelledAt ?? o.updatedAt ?? o.createdAt
        : billByOrderId.get(o.id)?.generatedAt ?? o.updatedAt ?? o.createdAt
    ).getTime();

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      order.tableNumber.toString().includes(searchTerm) ||
      (order.tableName && order.tableName.toLowerCase().includes(searchLower)) ||
      order.items.some(i => i.item.name.toLowerCase().includes(searchLower)) ||
      (isParcel(order) && 'parcel'.includes(searchLower)) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchLower));

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    const { from, to } = getDateRange(periodFilter);
    const orderDate = new Date(order.createdAt);
    const matchesDate = (!from || orderDate >= from) && (!to || orderDate <= to);

    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => paidAt(b) - paidAt(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Order History',
      subtitle: 'View and manage all orders',
      actions: null,
    });
  }, [setHeaderContent]);

  const completedCount = filteredOrders.filter(o => o.status === 'completed').length;
  const activeCount = filteredOrders.filter(o => o.status === 'active').length;
  const filteredBillIds = new Set(filteredOrders.map(o => o.id));
  const totalRevenue = bills.filter(b => filteredBillIds.has(b.orderId) && b.status !== 'cancelled').reduce((sum, b) => sum + b.total, 0);

  const handleCancelOrder = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await cancelOrder(cancelTarget.id);
      await fetchBills();
      notify.success('Order cancelled');
      setCancelTarget(null);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      // The backend returns 409 with a specific reason for GST bills from a
      // previous return period ("Issue a credit note instead.") — show it.
      notify.error(error instanceof Error && error.message ? error.message : 'Failed to cancel order. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const docTypeLabel = (documentType?: string) => {
    switch (documentType) {
      case 'tax_invoice': return 'Tax Invoice';
      case 'bill_of_supply': return 'Bill of Supply';
      default: return 'Invoice';
    }
  };

  const cnLineRemaining = (l: BillLine) => Math.max(0, (l.quantity || 0) - (l.creditedQuantity || 0));

  const openCreditNoteModal = (bill: Bill) => {
    setCnModalBill(bill);
    setCnQuantities({});
    setCnReason('');
  };

  const setCnQty = (lineId: number, raw: string, max: number) => {
    const parsed = Number(raw);
    const qty = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), max) : 0;
    setCnQuantities(prev => ({ ...prev, [lineId]: qty }));
  };

  const creditAllRemaining = () => {
    if (!cnModalBill?.lines) return;
    const next: Record<number, number> = {};
    for (const l of cnModalBill.lines) next[l.id] = cnLineRemaining(l);
    setCnQuantities(next);
  };

  const cnEstimatedTotal = useMemo(() => {
    if (!cnModalBill?.lines) return 0;
    return cnModalBill.lines.reduce((sum, l) => {
      const qty = cnQuantities[l.id] || 0;
      if (!qty || !l.quantity) return sum;
      const lineTotal = (l.taxableValue || 0) + (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0) + (l.cess || 0);
      return sum + (lineTotal * qty) / l.quantity;
    }, 0);
  }, [cnModalBill, cnQuantities]);

  const handleIssueCreditNote = async () => {
    if (!cnModalBill) return;
    const reason = cnReason.trim();
    if (!reason) {
      notify.warning('Please enter a reason for the credit note');
      return;
    }
    const billLines = cnModalBill.lines || [];
    const selected = billLines
      .map(l => ({ billLineId: l.id, quantity: cnQuantities[l.id] || 0 }))
      .filter(x => x.quantity > 0);
    if (!selected.length) {
      notify.warning('Select a quantity to credit on at least one line');
      return;
    }
    // When every line is credited at its full remaining quantity the backend
    // derives the lines itself — omit `lines` entirely.
    const allRemaining = billLines.every(l => (cnQuantities[l.id] || 0) >= cnLineRemaining(l));
    setIsIssuingCn(true);
    try {
      const req: { reason: string; lines?: { billLineId: number; quantity: number }[] } = { reason };
      if (!allRemaining) req.lines = selected;
      const cn = await api.createCreditNote(cnModalBill.id, req);
      notify.success(`Credit note ${cn.creditNoteNo} issued`);
      // Refresh the bill (creditedQuantity/creditedTotal changed) and its CN list
      try {
        const refreshed = await api.getBill(cnModalBill.id);
        setViewingGstBill(refreshed);
        await fetchBills();
      } catch { /* list will refresh on next open */ }
      try {
        if (currentStore?.id) {
          const cns = await api.getCreditNotes(currentStore.id, { billId: cnModalBill.id });
          setBillCreditNotes(Array.isArray(cns) ? cns : []);
        }
      } catch { /* ignore */ }
      setCnModalBill(null);
      setIssuedCn(cn);
    } catch (error) {
      console.error('Failed to issue credit note:', error);
      notify.error(error instanceof Error && error.message ? error.message : 'Failed to issue credit note');
    } finally {
      setIsIssuingCn(false);
    }
  };

  const printCreditNote = async (cn: CreditNote) => {
    if (!currentStore?.printerName) {
      notify.warning('No printer configured. Set one up in Settings.');
      return;
    }
    const full = cn.lines?.length ? cn : await api.getCreditNote(cn.id);
    await printerService.printInvoice(buildCreditNotePrintJob(full, currentStore));
  };

  const handleReprintCreditNote = async (cn: CreditNote) => {
    setPrintingCnId(cn.id);
    try {
      await printCreditNote(cn);
      notify.success(`Credit note ${cn.creditNoteNo} reprinted`);
    } catch (error) {
      console.error('Failed to print credit note:', error);
      notify.error('Failed to print credit note. Check your connection and printer settings.');
    } finally {
      setPrintingCnId(null);
    }
  };

  const handlePrintIssuedCn = async () => {
    const cn = issuedCn;
    setIssuedCn(null);
    if (!cn) return;
    try {
      await printCreditNote(cn);
      notify.success(`Credit note ${cn.creditNoteNo} printed`);
    } catch (error) {
      console.error('Failed to print credit note:', error);
      notify.error('Failed to print credit note. Check your connection and printer settings.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed': return 'status-badge completed';
      case 'active': return 'status-badge active';
      case 'cancelled': return 'status-badge cancelled';
      case 'merged': return 'status-badge merged';
      default: return 'status-badge';
    }
  };

  // A merged order keeps its own table label; the surviving order's
  // tableName is a "+ "-joined list of every table folded into it
  // (e.g. "5 + 3"), so we can recover which bill absorbed this order.
  const getMergedIntoOrder = (order: Order): Order | undefined => {
    if (order.status !== 'merged') return undefined;
    const label = order.tableName || String(order.tableNumber);
    return orders
      .filter(o => o.id !== order.id && o.status !== 'merged')
      .filter(o => (o.tableName || '').split('+').map(s => s.trim()).includes(label))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  };

  return (
    <div className="history-page">
      <div className="stats-grid">
        <div className="gr-card pos-stat">
          <div className="gr-well success">
            <Receipt size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{completedCount}</div>
            <div className="gr-caption">Completed Orders</div>
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well warning">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{activeCount}</div>
            <div className="gr-caption">Active Orders</div>
          </div>
        </div>
        <div className="gr-card pos-stat">
          <div className="gr-well primary">
            <Receipt size={24} />
          </div>
          <div className="stat-content">
            <div className="gr-stat__value">{formatCurrency(totalRevenue)}</div>
            <div className="gr-caption">Total Revenue</div>
          </div>
        </div>
      </div>

      <div className="history-toolbar">
        <div className="inv-spacer" />
        {searchOpen && (
          <div className="history-search">
            <Search size={16} />
            <input
              ref={toolbarSearchRef}
              type="text"
              placeholder="Search by table or item..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        )}
        <button
          className="gr-iconbtn"
          onClick={() => {
            setSearchOpen(o => {
              if (o) setSearchTerm('');
              else setTimeout(() => toolbarSearchRef.current?.focus(), 0);
              return !o;
            });
          }}
          title={searchOpen ? 'Close search' : 'Search'}
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>
        <div className="filter-pop">
          <button
            className={`gr-iconbtn ${periodFilter !== 'all' || statusFilter !== 'all' ? 'has-active-filters' : ''}`}
            onClick={() => setFilterOpen(o => !o)}
            title="Filters"
          >
            <SlidersHorizontal size={18} />
          </button>
          {filterOpen && (
            <>
              <div className="filter-overlay" onClick={() => setFilterOpen(false)} />
              <div className="filter-popover">
                <div className="gr-field">
                  <label>Period</label>
                  <select value={periodFilter} onChange={e => { setPeriodFilter(e.target.value); setCurrentPage(1); }}>
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                {periodFilter === 'custom' && (
                  <div className="gr-field">
                    <label>Date Range</label>
                    <div className="history-date-range">
                      <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />
                      <span className="history-date-sep">to</span>
                      <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />
                    </div>
                  </div>
                )}
                <div className="gr-field">
                  <label>Status</label>
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="active">Active</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="merged">Merged</option>
                  </select>
                </div>
                {(periodFilter !== 'all' || statusFilter !== 'all') && (
                  <button
                    className="gr-btn gr-btn--soft gr-btn--sm"
                    style={{ alignSelf: 'flex-end' }}
                    onClick={() => { setPeriodFilter('all'); setStatusFilter('all'); setCurrentPage(1); }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <Empty
          icon={<Calendar />}
          title="No orders found"
          text="Try adjusting your search or filters"
        />
      ) : (
        <div className="gr-card gr-card--flush" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="gr-tablewrap">
            <table className="gr-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Type</th>
                  <th>Table/Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map(order => (
                  <tr key={order.id}>
                    <td><strong>#{order.id.slice(-6).toUpperCase()}</strong></td>
                    <td>
                      {isParcel(order) ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Package size={13} /> Parcel
                        </span>
                      ) : (
                        'Dine-in'
                      )}
                    </td>
                    <td>
                      {isParcel(order)
                        ? (order.customerName || 'Walk-in')
                        : `Table ${order.tableName || order.tableNumber}`}
                      {order.status === 'merged' && (() => {
                        const mergedInto = getMergedIntoOrder(order);
                        return (
                          <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>
                            → merged into {mergedInto ? `Table ${mergedInto.tableName || mergedInto.tableNumber}` : 'another bill'}
                          </div>
                        );
                      })()}
                    </td>
                    <td>{order.status === 'merged' ? '—' : order.items.length}</td>
                    <td>{formatCurrency((order.totalAmount || 0) + (order.taxAmount || 0))}</td>
                    <td>
                      <span className={getStatusBadgeClass(order.status)}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{formatDate(order.createdAt)}</td>
                    <td style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button
                        className="gr-iconbtn gr-iconbtn--sm"
                        onClick={() => setViewingOrder(order)}
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                      {order.status !== 'merged' && (
                        <>
                          <button
                            className="gr-iconbtn gr-iconbtn--sm"
                            onClick={() => setViewingBill(order)}
                            title="View Bill"
                          >
                            <Receipt size={14} />
                          </button>
                          <button
                            className="gr-iconbtn gr-iconbtn--sm"
                            onClick={() => handlePrintBill(order)}
                            disabled={isPrinting === order.id}
                            title="Print Bill"
                          >
                            <Printer size={14} />
                          </button>
                        </>
                      )}
                      {order.status === 'completed' && (
                        <button
                          className="gr-iconbtn gr-iconbtn--sm delete"
                          onClick={() => setCancelTarget(order)}
                          title="Cancel Order"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="gr-card__foot table-foot">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(filteredOrders.length / PAGE_SIZE)}
              totalItems={filteredOrders.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* View Order Modal */}
      {viewingOrder && (
        <div className="gr-modal-live is-open" onClick={() => setViewingOrder(null)}>
          <div className="gr-modal" onClick={e => e.stopPropagation()}>
            <div className="gr-modal__head">
              <h2>
                {isParcel(viewingOrder) ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={20} />
                    Parcel Order
                    {viewingOrder.customerName && ` - ${viewingOrder.customerName}`}
                  </span>
                ) : (
                  `Order Details - Table ${viewingOrder.tableName || viewingOrder.tableNumber}`
                )}
              </h2>
              <button className="gr-iconbtn" onClick={() => setViewingOrder(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="gr-modal__body">
              {viewingOrder.status === 'merged' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.6rem 0.75rem', marginBottom: '0.75rem',
                  background: 'rgba(33,150,243,0.08)', border: '1px solid rgba(33,150,243,0.2)',
                  borderRadius: '8px', color: 'var(--info)', fontSize: '0.82rem', fontWeight: 600,
                }}>
                  <Combine size={15} />
                  {(() => {
                    const mergedInto = getMergedIntoOrder(viewingOrder);
                    return mergedInto
                      ? `Merged into Table ${mergedInto.tableName || mergedInto.tableNumber} — items are included in that bill`
                      : 'This order was merged into another bill';
                  })()}
                </div>
              )}
              <div className="bill-items">
                {viewingOrder.items.map((oi, idx) => (
                  <div key={idx} className="bill-item">
                    <div className="bill-item-details">
                      <div className="bill-item-name">{oi.item.name}</div>
                      <div className="bill-item-qty">
                        {oi.quantity} x {formatCurrency(orderItemUnitPrice(oi))}
                        {oi.notes ? ` — ${oi.notes}` : ''}
                      </div>
                    </div>
                    <div className="bill-item-price">{formatCurrency(oi.quantity * orderItemUnitPrice(oi))}</div>
                  </div>
                ))}
              </div>
              <div className="bill-totals">
                <div className="bill-total-row">
                  <span>Subtotal</span>
                  <span>{formatCurrency(viewingOrder.totalAmount)}</span>
                </div>
                {taxEnabled && (
                  <div className="bill-total-row">
                    <span>Tax</span>
                    <span>{formatCurrency(viewingOrder.taxAmount || 0)}</span>
                  </div>
                )}
                <div className="bill-total-row grand-total">
                  <span>Total</span>
                  <span>{formatCurrency((viewingOrder.totalAmount || 0) + (viewingOrder.taxAmount || 0))}</span>
                </div>
              </div>
            </div>
            <div className="gr-modal__foot" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {viewingOrder.status !== 'merged' && (
                  <>
                    <button
                      className="gr-btn gr-btn--secondary"
                      onClick={() => { setViewingOrder(null); setViewingBill(viewingOrder); }}
                    >
                      <Receipt size={16} />
                      View Bill
                    </button>
                    <button
                      className="gr-btn gr-btn--primary"
                      onClick={() => handlePrintBill(viewingOrder)}
                      disabled={isPrinting === viewingOrder.id}
                    >
                      <Printer size={16} />
                      {isPrinting === viewingOrder.id ? 'Printing...' : 'Print Bill'}
                    </button>
                  </>
                )}
              </div>
              <button className="gr-btn gr-btn--secondary" onClick={() => setViewingOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* View Bill Modal */}
      {viewingBill && (
        <div className="gr-modal-live is-open" onClick={() => setViewingBill(null)}>
          <div className="gr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="gr-modal__head">
              <h2>
                {isParcel(viewingBill) ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={20} />
                    Parcel Order{viewingBill.customerName ? ` - ${viewingBill.customerName}` : ''}
                  </span>
                ) : (
                  `Bill - Table ${viewingBill.tableName || viewingBill.tableNumber}`
                )}
              </h2>
              <button className="gr-iconbtn" onClick={() => setViewingBill(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="gr-modal__body">
              <div className="bill-container">
                <div className="bill-header">
                  <h2>{currentStore?.name || 'Restaurant'}</h2>
                  {currentStore?.location && <p>{currentStore.location}</p>}
                  {(currentStore?.phone || currentStore?.secondaryPhone) && (
                    <p>Tel: {[currentStore.phone, currentStore.secondaryPhone].filter(Boolean).join(' / ')}</p>
                  )}
                  {taxEnabled && viewingGstBill && currentStore?.gstin && <p>GSTIN: {currentStore.gstin}</p>}
                </div>

                {viewingGstBill ? (
                  <>
                    <div className="bill-table-info">
                      <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        {docTypeLabel(viewingGstBill.documentType)}
                        {viewingGstBill.status === 'cancelled' && (
                          <span className="status-badge cancelled">CANCELLED</span>
                        )}
                      </h3>
                      <p>Invoice No: <strong>{viewingGstBill.invoiceNo || '—'}</strong></p>
                      <p>
                        {isParcel(viewingBill)
                          ? `Parcel${viewingBill.customerName ? ` — ${viewingBill.customerName}` : ''}`
                          : `Table ${viewingBill.tableName || viewingBill.tableNumber}`}
                        {' · '}{formatDate(viewingGstBill.generatedAt)}
                      </p>
                      {(viewingGstBill.buyerGstin || viewingGstBill.buyerName) && (
                        <p>
                          Buyer: {viewingGstBill.buyerName || ''}
                          {viewingGstBill.buyerGstin ? ` — GSTIN: ${viewingGstBill.buyerGstin}` : ''}
                        </p>
                      )}
                    </div>

                    <table className="gr-table" style={{ margin: '0.5rem 0' }}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Rate</th>
                          <th style={{ textAlign: 'right' }}>{taxEnabled ? 'Taxable' : 'Amount'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewingGstBill.lines || []).map(l => (
                          <tr key={l.id}>
                            <td>
                              {l.name}
                              {(l.creditedQuantity || 0) > 0 && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--danger, #ef4444)' }}>
                                  {' '}(credited {l.creditedQuantity})
                                </span>
                              )}
                            </td>
                            <td>{l.quantity}{l.unit ? ` ${l.unit}` : ''}</td>
                            <td>{formatCurrency(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(l.taxableValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="bill-totals">
                      <div className="bill-total-row">
                        <span>{taxEnabled ? 'Taxable Value' : 'Subtotal'}</span>
                        <span>{formatCurrency(viewingGstBill.taxableValue ?? viewingGstBill.subtotal)}</span>
                      </div>
                      {(viewingGstBill.taxSummary || []).map((row, i) => (
                        <React.Fragment key={i}>
                          {row.igst > 0 ? (
                            <div className="bill-total-row">
                              <span>IGST @{row.rate}%</span>
                              <span>{formatCurrency(row.igst)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="bill-total-row">
                                <span>CGST @{row.rate / 2}%</span>
                                <span>{formatCurrency(row.cgst)}</span>
                              </div>
                              <div className="bill-total-row">
                                <span>{viewingGstBill.isUtgst ? 'UTGST' : 'SGST'} @{row.rate / 2}%</span>
                                <span>{formatCurrency(row.sgst)}</span>
                              </div>
                            </>
                          )}
                          {row.cess > 0 && (
                            <div className="bill-total-row">
                              <span>Cess</span>
                              <span>{formatCurrency(row.cess)}</span>
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                      {!!viewingGstBill.roundOff && (
                        <div className="bill-total-row">
                          <span>Round Off</span>
                          <span>{formatCurrency(viewingGstBill.roundOff)}</span>
                        </div>
                      )}
                      <div className="bill-total-row grand-total">
                        <span>TOTAL</span>
                        <span>{formatCurrency(viewingGstBill.total)}</span>
                      </div>
                      {(viewingGstBill.creditedTotal || 0) > 0 && (
                        <div className="bill-total-row" style={{ color: 'var(--danger, #ef4444)' }}>
                          <span>Credited</span>
                          <span>-{formatCurrency(viewingGstBill.creditedTotal || 0)}</span>
                        </div>
                      )}
                    </div>

                    {viewingGstBill.paymentMethod && (
                      <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--gray-600)', textTransform: 'capitalize' }}>
                        Payment: {viewingGstBill.paymentMethod.toUpperCase()}
                      </div>
                    )}

                    {taxEnabled && billCreditNotes.length > 0 && (
                      <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--gray-600)' }}>Credit Notes</h4>
                        {billCreditNotes.map(cn => (
                          <div
                            key={cn.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.45rem 0', borderTop: '1px solid var(--gray-200)',
                              fontSize: '0.8rem',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div><strong>{cn.creditNoteNo}</strong> · {formatDate(cn.issuedAt)}</div>
                              <div style={{ color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cn.reason}</div>
                            </div>
                            <div style={{ fontWeight: 600 }}>{formatCurrency(cn.total)}</div>
                            <button
                              className="gr-iconbtn gr-iconbtn--sm"
                              title="Reprint credit note"
                              disabled={printingCnId === cn.id}
                              onClick={() => handleReprintCreditNote(cn)}
                            >
                              <Printer size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="bill-table-info">
                      <h3>
                        {isParcel(viewingBill)
                          ? `Parcel${viewingBill.customerName ? ` — ${viewingBill.customerName}` : ''}`
                          : `Table ${viewingBill.tableName || viewingBill.tableNumber}`
                        }
                      </h3>
                      <p>Order #{viewingBill.id.slice(-6).toUpperCase()}</p>
                      <p>{formatDate(viewingBill.createdAt)}</p>
                      {taxEnabled && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--warning-dark, var(--primary-strong))', marginTop: '0.35rem' }}>
                          Order summary — no GST invoice found for this order
                        </p>
                      )}
                    </div>

                    <div className="bill-items">
                      {viewingBill.items.map((oi, idx) => (
                        <div key={idx} className="bill-item">
                          <div className="bill-item-details">
                            <div className="bill-item-name">{oi.item.name}</div>
                            <div className="bill-item-qty">{oi.quantity} x {formatCurrency(orderItemUnitPrice(oi))}</div>
                          </div>
                          <div className="bill-item-price">{formatCurrency(oi.quantity * orderItemUnitPrice(oi))}</div>
                        </div>
                      ))}
                    </div>

                    <div className="bill-totals">
                      <div className="bill-total-row">
                        <span>Subtotal</span>
                        <span>{formatCurrency(viewingBill.totalAmount)}</span>
                      </div>
                      {taxEnabled && (
                        <div className="bill-total-row">
                          <span>Tax</span>
                          <span>{formatCurrency(viewingBill.taxAmount || 0)}</span>
                        </div>
                      )}
                      <div className="bill-total-row grand-total">
                        <span>TOTAL</span>
                        <span>{formatCurrency((viewingBill.totalAmount || 0) + (viewingBill.taxAmount || 0))}</span>
                      </div>
                    </div>

                    {(() => {
                      const associatedBill = bills.find(b => b.orderId === viewingBill.id);
                      return associatedBill?.paymentMethod ? (
                        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--gray-600)', textTransform: 'capitalize' }}>
                          Payment: {associatedBill.paymentMethod.toUpperCase()}
                        </div>
                      ) : null;
                    })()}
                  </>
                )}

                <div className="bill-footer">
                  <p>Thank you for visiting!</p>
                  <p>Please come again</p>
                </div>
              </div>
            </div>
            <div className="gr-modal__foot" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="gr-btn gr-btn--primary"
                  onClick={() => handlePrintBill(viewingBill)}
                  disabled={isPrinting === viewingBill.id}
                >
                  <Printer size={16} />
                  {isPrinting === viewingBill.id ? 'Printing...' : 'Print Bill'}
                </button>
                {taxEnabled && viewingGstBill && viewingGstBill.status !== 'cancelled' && user?.role !== 'staff' && (
                  <button
                    className="gr-btn gr-btn--secondary"
                    onClick={() => openCreditNoteModal(viewingGstBill)}
                  >
                    <FileText size={16} />
                    Issue Credit Note
                  </button>
                )}
              </div>
              <button className="gr-btn gr-btn--secondary" onClick={() => setViewingBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Credit Note Modal */}
      {cnModalBill && (
        <div className="gr-modal-live is-open" onClick={() => { if (!isIssuingCn) setCnModalBill(null); }}>
          <div className="gr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="gr-modal__head">
              <h2>Issue Credit Note — {cnModalBill.invoiceNo || 'Invoice'}</h2>
              <button className="gr-iconbtn" onClick={() => setCnModalBill(null)} disabled={isIssuingCn}>
                <X size={20} />
              </button>
            </div>
            <div className="gr-modal__body">
              <div className="cn-section-head">
                <span className="cn-section-title">Items to credit</span>
                <button
                  type="button"
                  className="cn-link-btn"
                  onClick={creditAllRemaining}
                  disabled={isIssuingCn}
                >
                  Credit all remaining
                </button>
              </div>
              {(cnModalBill.lines || []).map(l => {
                const remaining = cnLineRemaining(l);
                const qty = cnQuantities[l.id] ?? 0;
                const exhausted = remaining <= 0;
                return (
                  <div key={l.id} className={`cn-line${exhausted ? ' exhausted' : ''}`}>
                    <div className="cn-line-info">
                      <div className="cn-line-name">{l.name}</div>
                      <div className="cn-line-meta">
                        Billed {l.quantity} · Remaining {remaining}
                        {exhausted && <span className="cn-line-tag">Fully credited</span>}
                      </div>
                    </div>
                    <div className="cn-qty-stepper">
                      <button
                        type="button"
                        className="pos-qtybtn"
                        disabled={exhausted || qty <= 0 || isIssuingCn}
                        onClick={() => setCnQty(l.id, String(qty - 1), remaining)}
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        className="cn-qty-input"
                        min={0}
                        max={remaining}
                        step="any"
                        disabled={exhausted || isIssuingCn}
                        value={qty}
                        onChange={e => setCnQty(l.id, e.target.value, remaining)}
                      />
                      <button
                        type="button"
                        className="pos-qtybtn"
                        disabled={exhausted || qty >= remaining || isIssuingCn}
                        onClick={() => setCnQty(l.id, String(qty + 1), remaining)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="gr-field" style={{ marginTop: '0.75rem' }}>
                <label>Reason *</label>
                <input
                  type="text"
                  value={cnReason}
                  onChange={e => setCnReason(e.target.value)}
                  placeholder="e.g., Customer returned items"
                  disabled={isIssuingCn}
                />
              </div>
              <div className="cn-total-row">
                <span>Estimated credit</span>
                <span className="cn-total-amount">{formatCurrency(cnEstimatedTotal)}</span>
              </div>
            </div>
            <div className="gr-modal__foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="gr-btn gr-btn--secondary" onClick={() => setCnModalBill(null)} disabled={isIssuingCn}>
                Cancel
              </button>
              <button className="gr-btn gr-btn--primary" onClick={handleIssueCreditNote} disabled={isIssuingCn}>
                {isIssuingCn ? 'Issuing...' : 'Issue Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print offer after a credit note is issued */}
      <ConfirmDialog
        isOpen={!!issuedCn}
        title="Credit Note Issued"
        message={`Credit note ${issuedCn?.creditNoteNo || ''} was issued successfully. Print it now?`}
        confirmLabel="Print"
        cancelLabel="Later"
        variant="info"
        onConfirm={handlePrintIssuedCn}
        onCancel={() => setIssuedCn(null)}
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        title="Cancel Completed Order"
        message={`Are you sure you want to cancel this completed order${cancelTarget ? ` for Table ${cancelTarget.tableName || cancelTarget.tableNumber}` : ''}? This will also void the associated bill.`}
        confirmLabel={isCancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
        cancelLabel="No, Keep Order"
        variant="danger"
        onConfirm={handleCancelOrder}
        onCancel={() => { if (!isCancelling) setCancelTarget(null); }}
      />
    </div>
  );
};

export default History;
