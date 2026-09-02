import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Calendar, Search, Receipt, Package, X, Printer, CalendarDays, Ban } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';
import { isTaxEnabled } from '../utils/tax';
import { api } from '../services/api';
import { printerService } from '../services/printer';
import { ConfirmDialog } from './ConfirmDialog';
import Pagination from './ui/Pagination';
import type { Order } from '../types';

const PAGE_SIZE = 15;

const History: React.FC = () => {
  const { orders, bills, stores, fetchOrders, fetchBills, cancelOrder } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId) || stores[0];
  const taxEnabled = isTaxEnabled(currentStore);
  const { setHeaderContent } = usePageHeader();
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [viewingBill, setViewingBill] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPrinting, setIsPrinting] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const handlePrintBill = async (order: Order) => {
    if (!currentStore?.printerName) {
      alert('No printer is configured in settings. Please configure a printer first.');
      return;
    }

    setIsPrinting(order.id);
    try {
      const associatedBill = bills.find(b => b.orderId === order.id);
      const invoiceNo = associatedBill?.invoiceNo || `INV-${Date.now()}`;
      
      const printItems = order.items.map(oi => {
        const itemTotal = oi.item.price * oi.quantity;
        const taxPercent = taxEnabled ? (oi.item.taxPercent || 0) : 0;
        return {
          name: oi.item.name,
          hsn: oi.item.description || '',
          qty: oi.quantity,
          unit: 'PCS',
          rate: oi.item.price,
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
            ...(currentStore?.gstin ? { gst_number: currentStore.gstin } : {}),
            ...(currentStore?.fssaiNo ? { fssai_lic_no: currentStore.fssaiNo } : {}),
            ...(currentStore?.phone ? { phone: currentStore.phone } : {}),
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
      alert('Failed to print bill. Please check your connection and printer settings.');
    } finally {
      setIsPrinting(null);
    }
  };

  // Fetch data on mount
  useEffect(() => {
    fetchOrders();
    fetchBills();
  }, [fetchOrders, fetchBills]);

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

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      order.tableNumber.toString().includes(searchTerm) ||
      order.items.some(i => i.item.name.toLowerCase().includes(searchLower)) ||
      (isParcel(order) && 'parcel'.includes(searchLower)) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchLower));

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    const { from, to } = getDateRange(periodFilter);
    const orderDate = new Date(order.createdAt);
    const matchesDate = (!from || orderDate >= from) && (!to || orderDate <= to);

    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
      setCancelTarget(null);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      alert('Failed to cancel order. Please try again.');
    } finally {
      setIsCancelling(false);
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
      default: return 'status-badge';
    }
  };

  return (
    <div className="history-page">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon success">
            <Receipt size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{completedCount}</div>
            <div className="stat-label">Completed Orders</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{activeCount}</div>
            <div className="stat-label">Active Orders</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary">
            <Receipt size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
      </div>

      <div className="history-toolbar">
        <div className="history-search">
          <Search size={18} color="var(--gray-500)" />
          <input
            type="text"
            placeholder="Search by table or item..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <select className="history-filter-select" value={periodFilter} onChange={e => { setPeriodFilter(e.target.value); setCurrentPage(1); }}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>
        {periodFilter === 'custom' && (
          <div className="history-date-range">
            <input
              type="date"
              className="history-date-input"
              value={customDateFrom}
              onChange={e => setCustomDateFrom(e.target.value)}
              placeholder="From"
            />
            <span className="history-date-sep">to</span>
            <input
              type="date"
              className="history-date-input"
              value={customDateTo}
              onChange={e => setCustomDateTo(e.target.value)}
              placeholder="To"
            />
          </div>
        )}
        <select className="history-filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-500)' }}>
          <Calendar size={64} style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
          <p style={{ fontSize: '1.125rem' }}>No orders found</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="table-scroll-container">
            <table className="items-table">
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
                        : `Table ${order.tableNumber}`}
                    </td>
                    <td>{order.items.length}</td>
                    <td>{formatCurrency((order.totalAmount || 0) + (order.taxAmount || 0))}</td>
                    <td>
                      <span className={getStatusBadgeClass(order.status)}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{formatDate(order.createdAt)}</td>
                    <td style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button
                        className="action-btn"
                        onClick={() => setViewingOrder(order)}
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => setViewingBill(order)}
                        title="View Bill"
                      >
                        <Receipt size={14} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => handlePrintBill(order)}
                        disabled={isPrinting === order.id}
                        title="Print Bill"
                      >
                        <Printer size={14} />
                      </button>
                      {order.status === 'completed' && (
                        <button
                          className="action-btn delete"
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
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(filteredOrders.length / PAGE_SIZE)}
            totalItems={filteredOrders.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* View Order Modal */}
      {viewingOrder && (
        <div className="modal-overlay" onClick={() => setViewingOrder(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {isParcel(viewingOrder) ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={20} />
                    Parcel Order
                    {viewingOrder.customerName && ` - ${viewingOrder.customerName}`}
                  </span>
                ) : (
                  `Order Details - Table ${viewingOrder.tableNumber}`
                )}
              </h2>
              <button className="close-btn" onClick={() => setViewingOrder(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="order-sidebar">
                {viewingOrder.items.map((oi, idx) => (
                  <div key={idx} className="order-item">
                    <div className="order-item-info">
                      <div className="order-item-name">{oi.item.name}</div>
                      <div className="order-item-price">{formatCurrency(oi.item.price)} each</div>
                    </div>
                    <span className="order-item-quantity">x{oi.quantity}</span>
                  </div>
                ))}
                <div className="order-total">
                  <div className="total-row">
                    <span>Subtotal</span>
                    <span>{formatCurrency(viewingOrder.totalAmount)}</span>
                  </div>
                  {taxEnabled && (
                    <div className="total-row">
                      <span>Tax</span>
                      <span>{formatCurrency(viewingOrder.taxAmount || 0)}</span>
                    </div>
                  )}
                  <div className="total-row final">
                    <span>Total</span>
                    <span>{formatCurrency((viewingOrder.totalAmount || 0) + (viewingOrder.taxAmount || 0))}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setViewingOrder(null); setViewingBill(viewingOrder); }}
                >
                  <Receipt size={16} />
                  View Bill
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handlePrintBill(viewingOrder)}
                  disabled={isPrinting === viewingOrder.id}
                >
                  <Printer size={16} />
                  {isPrinting === viewingOrder.id ? 'Printing...' : 'Print Bill'}
                </button>
              </div>
              <button className="btn btn-secondary" onClick={() => setViewingOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* View Bill Modal */}
      {viewingBill && (
        <div className="modal-overlay" onClick={() => setViewingBill(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>
                {isParcel(viewingBill) ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={20} />
                    Parcel Order{viewingBill.customerName ? ` - ${viewingBill.customerName}` : ''}
                  </span>
                ) : (
                  `Bill - Table ${viewingBill.tableNumber}`
                )}
              </h2>
              <button className="close-btn" onClick={() => setViewingBill(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="bill-container">
                <div className="bill-header">
                  <h2>{currentStore?.name || 'Restaurant'}</h2>
                  {currentStore?.location && <p>{currentStore.location}</p>}
                  {currentStore?.phone && <p>Tel: {currentStore.phone}</p>}
                  {currentStore?.gstin && <p>GSTIN: {currentStore.gstin}</p>}
                </div>

                <div className="bill-table-info">
                  <h3>
                    {isParcel(viewingBill)
                      ? `Parcel${viewingBill.customerName ? ` — ${viewingBill.customerName}` : ''}`
                      : `Table ${viewingBill.tableNumber}`
                    }
                  </h3>
                  <p>Order #{viewingBill.id.slice(-6).toUpperCase()}</p>
                  <p>{formatDate(viewingBill.createdAt)}</p>
                </div>

                <div className="bill-items">
                  {viewingBill.items.map((oi, idx) => (
                    <div key={idx} className="bill-item">
                      <div className="bill-item-details">
                        <div className="bill-item-name">{oi.item.name}</div>
                        <div className="bill-item-qty">{oi.quantity} x {formatCurrency(oi.item.price)}</div>
                      </div>
                      <div className="bill-item-price">{formatCurrency(oi.quantity * oi.item.price)}</div>
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

                <div className="bill-footer">
                  <p>Thank you for visiting!</p>
                  <p>Please come again</p>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button
                className="btn btn-primary"
                onClick={() => handlePrintBill(viewingBill)}
                disabled={isPrinting === viewingBill.id}
              >
                <Printer size={16} />
                {isPrinting === viewingBill.id ? 'Printing...' : 'Print Bill'}
              </button>
              <button className="btn btn-secondary" onClick={() => setViewingBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!cancelTarget}
        title="Cancel Completed Order"
        message={`Are you sure you want to cancel this completed order${cancelTarget ? ` for Table ${cancelTarget.tableNumber}` : ''}? This will also void the associated bill.`}
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
