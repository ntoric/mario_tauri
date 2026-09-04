import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Minus, Trash2, Search, Printer, X, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { printerService } from '../services/printer';
import { isTaxEnabled } from '../utils/tax';
import type { OrderItem, Item } from '../types';

const ParcelOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const { setHeaderContent } = usePageHeader();

  const {
    categories, items, stores,
    fetchCategories, fetchItems, fetchOrders,
  } = useDataStore();
  const { currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionType, setActionType] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [printerConfirm, setPrinterConfirm] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });
  const [errorDialog, setErrorDialog] = useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: '' });

  // Prevent outer .page-content from scrolling; keep bottom bar fixed
  useEffect(() => {
    const pageContent = document.querySelector('.page-content');
    if (pageContent) {
      pageContent.classList.add('order-page-active');
    }
    return () => {
      if (pageContent) {
        pageContent.classList.remove('order-page-active');
      }
    };
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchCategories();
    fetchItems();
  }, [fetchCategories, fetchItems]);

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'New Parcel Order',
      subtitle: currentStore?.name || '',
      actions: (
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Back to Tables
        </button>
      ),
    });
  }, [currentStore, setHeaderContent, navigate]);

  // Reset on mount
  useEffect(() => {
    setOrderItems([]);
    setCustomerName('');
    setCustomerMobile('');
    setPaymentMethod('upi');
    setSelectedCategory('all');
    setSearchQuery('');
  }, []);

  // IDs of disabled categories — items belonging to these are hidden from ordering.
  const disabledCategoryIds = new Set(
    categories.filter(c => c.enabled === false).map(c => c.id)
  );

  const filteredItems = items.filter(item => {
    if (item.enabled === false) return false;
    if (disabledCategoryIds.has(item.categoryId)) return false;
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const category = categories.find(cat => cat.id === item.categoryId);
    const categoryName = category?.name || '';
    const matchesSearch = searchQuery === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      categoryName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addItemToOrder = (item: Item) => {
    const existingItem = orderItems.find(oi => oi.itemId === item.id);
    if (existingItem) {
      setOrderItems(orderItems.map(oi =>
        oi.itemId === item.id
          ? { ...oi, quantity: oi.quantity + 1 }
          : oi
      ));
    } else {
      setOrderItems([...orderItems, { itemId: item.id, item, quantity: 1 }]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setOrderItems(orderItems.map(oi => {
      if (oi.itemId === itemId) {
        const newQuantity = oi.quantity + delta;
        return newQuantity > 0 ? { ...oi, quantity: newQuantity } : oi;
      }
      return oi;
    }).filter(oi => oi.quantity > 0));
  };

  const removeItem = (itemId: string) => {
    setOrderItems(orderItems.filter(oi => oi.itemId !== itemId));
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, oi) => sum + (oi.item.price * oi.quantity), 0);
  };

  const calculateTax = () => {
    if (!taxEnabled) return 0;
    return orderItems.reduce((sum, oi) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (oi.item.price * oi.quantity * taxPercent / 100);
    }, 0);
  };

  const total = calculateTotal() + calculateTax();

  const buildPayload = () => {
    const totalAmount = calculateTotal();
    const taxAmount = calculateTax();
    return {
      storeId: currentStoreId,
      items: orderItems.map(oi => ({
        itemId: oi.itemId,
        quantity: oi.quantity,
        unitPrice: oi.item.price,
        taxPercent: taxEnabled ? (oi.item.taxPercent || 0) : 0,
        notes: oi.notes || '',
        item: {
          id: oi.item.id,
          name: oi.item.name,
          price: oi.item.price,
          description: oi.item.description || '',
          taxPercent: taxEnabled ? (oi.item.taxPercent || 0) : 0,
        },
      })),
      totalAmount,
      taxAmount,
      discountAmount: 0,
      paymentMethod,
      customerName: customerName.trim() || 'Walk-in Customer',
      customerMobile: customerMobile.trim(),
    };
  };

  const handleSaveEBill = async () => {
    if (orderItems.length === 0 || isSubmitting) return;

    setActionType('e-bill');
    setIsSubmitting(true);

    try {
      await api.createParcelOrder(buildPayload());
      await fetchOrders();
      navigate('/');
      setOrderItems([]);
    } catch (error: any) {
      console.error('Failed to create parcel order:', error);
      if (error?.message === 'User or store not authenticated' || error?.message === 'Store not selected') {
        setErrorDialog({ show: true, message: 'Session expired. Please log in again.' });
        window.location.hash = '/login';
        window.location.reload();
      } else {
        setErrorDialog({ show: true, message: (error as Error).message || 'Failed to create parcel order. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
      setActionType('');
    }
  };

  const handleSavePrint = async (skipKot = false) => {
    if (orderItems.length === 0 || isSubmitting) return;

    // Pre-check: KOT enabled but no printer configured
    if (!skipKot && currentStore?.kotPrintEnabled && !currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'KOT printing is enabled but no printer is configured in settings. Create order without KOT print?',
        onConfirm: () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          handleSavePrint(true);
        },
      });
      return;
    }

    setActionType('save-print');
    setIsSubmitting(true);

    try {
      const totalAmount = calculateTotal();
      const taxAmount = calculateTax();
      const invoiceNo = `INV-${Date.now()}`;

      const createdOrder = await api.createParcelOrder(buildPayload());

      // Print KOT if enabled for the store
      if (!skipKot && currentStore?.kotPrintEnabled && createdOrder?.id) {
        try {
          await printerService.printKOT({
            type: 'kot',
            printer: {
              type: 'usb',
              name: currentStore.printerName || 'Thermal Printer',
              vendor_id: currentStore.printerVendorId || '0x0fe6',
              product_id: currentStore.printerProductId || '0x811e',
              paper_width: (currentStore.invoiceSize as '2inch' | '3inch') || '3inch',
            },
            kot: {
              order_id: parseInt(createdOrder.id.slice(-6), 36) || 0,
              table_number: 'Parcel',
              waiter_name: '',
              date: new Date().toLocaleString('en-IN'),
              items: orderItems.map(oi => ({
                name: oi.item.name,
                qty: oi.quantity,
                unit: 'PCS',
                rate: oi.item.price,
                tax_percent: taxEnabled ? (oi.item.taxPercent || 0) : 0,
                amount: oi.item.price * oi.quantity,
              })),
              notes: '',
              order_type: 'TAKE_AWAY',
              customer_name: customerName.trim() || 'Guest',
              customer_mobile: customerMobile.trim(),
            },
          });
        } catch (error) {
          console.error('Failed to print KOT:', error);
        }
      }

      // Print invoice
      try {
        const printItems = orderItems.map(oi => {
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
              name: customerName.trim() || 'Walk-in Customer',
              mobile: customerMobile.trim(),
            },
            invoice_no: invoiceNo,
            bill_no: invoiceNo,
            date: new Date().toLocaleString('en-IN'),
            items: printItems,
            summary: {
              sub_total: taxable,
              discount: 0,
              taxable: taxable,
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
        console.error('Failed to print invoice:', error);
      }

      await fetchOrders();
      navigate('/');
      setOrderItems([]);
    } catch (error: any) {
      console.error('Failed to create parcel order:', error);
      if (error?.message === 'User or store not authenticated' || error?.message === 'Store not selected') {
        setErrorDialog({ show: true, message: 'Session expired. Please log in again.' });
        window.location.hash = '/login';
        window.location.reload();
      } else {
        setErrorDialog({ show: true, message: (error as Error).message || 'Failed to create parcel order. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
      setActionType('');
    }
  };

  return (
    <div className="order-page">
      <div className="order-page-layout">
        {/* Left Sidebar - Categories (Petpooja style) */}
        <div className="order-page-left">
          <h3>Categories</h3>
          <div className="order-categories-vertical">
            <button
              className={`category-btn-vertical ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Items
            </button>
            {categories.filter(c => c.enabled !== false).map(cat => (
              <button
                key={cat.id}
                className={`category-btn-vertical ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Main Area - Items Grid */}
        <div className="order-page-main">
          <div className="order-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="order-search-input"
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="items-grid-scrollable">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="item-card"
                data-tooltip={item.name}
                onClick={() => addItemToOrder(item)}
              >
                <div className="item-name">{item.name}</div>
                <div className="item-price">{formatCurrency(item.price)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Customer + Cart (Petpooja style) */}
        <div className="order-page-right">
          <h3>Parcel Order</h3>
          <div className="form-group" style={{ marginBottom: '0.6rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Name <span style={{ color: 'var(--gray-400)' }}>(optional)</span></label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="e.g. John Doe"
              style={{ padding: '0.5rem', fontSize: '0.9rem' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Mobile <span style={{ color: 'var(--gray-400)' }}>(optional)</span></label>
            <input
              type="text"
              value={customerMobile}
              onChange={e => setCustomerMobile(e.target.value)}
              placeholder="e.g. 9876543210"
              style={{ padding: '0.5rem', fontSize: '0.9rem' }}
            />
          </div>

          <div className="order-page-left-header">
            <h3>Cart ({orderItems.length})</h3>
          </div>

          {orderItems.length === 0 ? (
            <div className="empty-order">
              Click items to add
            </div>
          ) : (
            <div className="order-items-scrollable">
              {orderItems.map(oi => (
                <div key={oi.itemId} className="order-item-compact">
                  <div className="order-item-info">
                    <div className="order-item-name">{oi.item.name}</div>
                    <div className="order-item-category">{categories.find(c => c.id === oi.item.categoryId)?.name || ''}</div>
                    <div className="order-item-price">{formatCurrency(oi.item.price)} x {oi.quantity}</div>
                  </div>
                  <div className="order-item-actions">
                    <button
                      className="quantity-btn"
                      onClick={() => updateQuantity(oi.itemId, -1)}
                    >
                      <Minus size={10} />
                    </button>
                    <span className="order-item-quantity">{oi.quantity}</span>
                    <button
                      className="quantity-btn"
                      onClick={() => updateQuantity(oi.itemId, 1)}
                    >
                      <Plus size={10} />
                    </button>
                    <button
                      className="remove-item-btn"
                      onClick={() => removeItem(oi.itemId)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {orderItems.length > 0 && (
            <div className="order-cart-summary">
              <div className="cart-summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(calculateTotal())}</span>
              </div>
              {taxEnabled && (
                <div className="cart-summary-row">
                  <span>Tax</span>
                  <span>{formatCurrency(calculateTax())}</span>
                </div>
              )}
              <div className="cart-summary-row total">
                <span>Total</span>
                <span className="cart-amount">{formatCurrency(total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="order-page-bottom-bar">
        <div className="order-page-bottom-bar-info">
          <span className="bottom-bar-items">Items: {orderItems.length}</span>
          <div className="bottom-bar-total-wrap">
            <button
              className="bottom-bar-total-btn"
              onClick={() => setShowBreakdown(!showBreakdown)}
            >
              Total: {formatCurrency(total)}
            </button>
            {showBreakdown && orderItems.length > 0 && (
              <div className="bottom-bar-breakdown">
                <div className="breakdown-row">
                  <span>Subtotal</span>
                  <span>{formatCurrency(calculateTotal())}</span>
                </div>
                {taxEnabled && (
                  <div className="breakdown-row">
                    <span>Tax</span>
                    <span>{formatCurrency(calculateTax())}</span>
                  </div>
                )}
                <div className="breakdown-row final">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="bottom-bar-payment">
            <span className="payment-label-inline">Pay:</span>
            <div className="payment-method-pills">
              <button
                className={`payment-pill ${paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('cash')}
              >
                Cash
              </button>
              <button
                className={`payment-pill ${paymentMethod === 'card' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('card')}
              >
                Card
              </button>
              <button
                className={`payment-pill ${paymentMethod === 'upi' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('upi')}
              >
                UPI
              </button>
            </div>
          </div>
        </div>
        <div className="order-page-bottom-bar-actions">
          <button
            className="btn btn-warning"
            onClick={handleSaveEBill}
            disabled={orderItems.length === 0 || isSubmitting}
            title="Save as E-Bill (no print)"
          >
            <FileText size={14} />
            {actionType === 'e-bill' ? 'Saving...' : 'Save & E-Bill'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSavePrint()}
            disabled={orderItems.length === 0 || isSubmitting}
            title="Save, Print Bill"
          >
            <Printer size={14} />
            {actionType === 'save-print' ? 'Processing...' : 'Save & Print'}
          </button>
          <button className="btn btn-danger" onClick={() => navigate('/')}>
            <X size={14} />
            Cancel
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={printerConfirm.show}
        title={printerConfirm.title}
        message={printerConfirm.message}
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={printerConfirm.onConfirm}
        onCancel={() => setPrinterConfirm(p => ({ ...p, show: false }))}
      />
      <ConfirmDialog
        isOpen={errorDialog.show}
        title="Error"
        message={errorDialog.message}
        confirmLabel="OK"
        cancelLabel=""
        variant="danger"
        onConfirm={() => setErrorDialog({ show: false, message: '' })}
        onCancel={() => setErrorDialog({ show: false, message: '' })}
      />
    </div>
  );
};

export default ParcelOrderPage;
