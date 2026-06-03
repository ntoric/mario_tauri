import React, { useState, useEffect } from 'react';
import { Eye, Calendar, Search, Receipt, Package, X, Printer } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import { printerService } from '../services/printer';
import type { Order } from '../types';

const History: React.FC = () => {
  const { orders, bills, stores, fetchOrders, fetchBills } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId) || stores[0];
  const { setHeaderContent } = usePageHeader();
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [viewingBill, setViewingBill] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPrinting, setIsPrinting] = useState<string | null>(null);

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
        const taxPercent = oi.item.taxPercent || 0;
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
      const cgst = taxable * 0.025; // Assuming 5% total tax split as 2.5% CGST + 2.5% SGST
      const sgst = taxable * 0.025;
      const subtotal = associatedBill?.subtotal || taxable;
      const taxTotal = associatedBill?.taxTotal || (cgst + sgst);
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
            gst_number: currentStore?.gstin || '',
            fssai_lic_no: currentStore?.fssaiNo || '',
            phone: currentStore?.phone || '',
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
          dr_ref: '',
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

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      order.tableNumber.toString().includes(searchTerm) ||
      order.items.some(i => i.item.name.toLowerCase().includes(searchLower)) ||
      (isParcel(order) && 'parcel'.includes(searchLower)) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchLower));

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Order History',
      subtitle: 'View and manage all orders',
      actions: null,
    });
  }, [setHeaderContent]);

  const completedCount = orders.filter(o => o.status === 'completed').length;
  const activeCount = orders.filter(o => o.status === 'active').length;
  const totalRevenue = bills.reduce((sum, b) => sum + b.total, 0);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
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
    <div>
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

      <div className="card">
        <div className="card-header">
          <div className="history-filters" style={{ margin: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, maxWidth: '400px' }}>
              <Search size={18} color="var(--gray-500)" />
              <input
                type="text"
                placeholder="Search by table or item..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="card-body">
          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-500)' }}>
              <Calendar size={64} style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
              <p style={{ fontSize: '1.125rem' }}>No orders found</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredOrders.map(order => (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {isParcel(order) ? (
                      <>
                        <span className="order-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Package size={16} />
                          Parcel
                        </span>
                        {order.customerName && (
                          <span style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                            ({order.customerName})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="order-card-title">Table {order.tableNumber}</span>
                    )}
                    <span className={getStatusBadgeClass(order.status)} style={{ marginLeft: '0.5rem' }}>
                      {order.status}
                    </span>
                  </div>
                  <div className="order-card-meta">
                    <span>Order #{order.id.slice(-6).toUpperCase()}</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>

                <div className="order-card-items">
                  {order.items.map((oi, idx) => (
                    <div key={idx} className="order-item-row">
                      <span>{oi.quantity}x {oi.item.name}</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(oi.quantity * oi.item.price)}</span>
                    </div>
                  ))}
                </div>

                <div className="order-card-total">
                  <span>Total</span>
                  <span style={{ color: 'var(--primary)' }}>{formatCurrency(order.totalAmount)}</span>
                </div>

                <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setViewingOrder(order)}>
                    <Eye size={16} />
                    View Details
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setViewingBill(order)}
                  >
                    <Receipt size={14} />
                    View Bill
                  </button>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => handlePrintBill(order)}
                    disabled={isPrinting === order.id}
                    title="Print Bill"
                  >
                    <Printer size={14} />
                    {isPrinting === order.id ? 'Printing...' : 'Print Bill'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
                  <div className="total-row">
                    <span>Tax</span>
                    <span>{formatCurrency(viewingOrder.taxAmount || 0)}</span>
                  </div>
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
                  <div className="bill-total-row">
                    <span>Tax</span>
                    <span>{formatCurrency(viewingBill.taxAmount || 0)}</span>
                  </div>
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
    </div>
  );
};

export default History;
