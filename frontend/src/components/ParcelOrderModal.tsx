import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Minus, Trash2, Search, Printer, Package, ChevronDown } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { formatCurrency } from '../utils/currency';
import { isTaxEnabled } from '../utils/tax';
import { orderItemUnitPrice } from '../utils/order';
import { sortCategories, sortItemsByCategoryOrder } from '../utils/category';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { printerService } from '../services/printer';
import { computeCartTotals } from '../utils/tax';

import GstBillSummary from './GstBillSummary';
import { buildInvoicePrintJob } from '../utils/gstInvoice';
import notify from '../utils/toast';
import type { OrderItem, Item } from '../types';

const ParcelOrderModal: React.FC = () => {
  const { categories, items, stores, fetchCategories, fetchItems, fetchOrders } = useDataStore();
  const { user, currentStoreId } = useAuthStore();
  const { parcelOrderModal, closeParcelOrderModal } = useUIStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [orderSource, setOrderSource] = useState('pos');

  const { gstMeta, fetchGstMeta } = useDataStore();
  React.useEffect(() => { fetchGstMeta().catch(() => {}); }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(5);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const isOpen = parcelOrderModal.isOpen;

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchItems();
    }
  }, [isOpen, fetchCategories, fetchItems]);

  useEffect(() => {
    if (isOpen) {
      setOrderItems([]);
      setShowCustomerDialog(false);
      setCustomerName('');
      setCustomerMobile('');
      setPaymentMethod('upi');
      setIsSubmitting(false);
      setSelectedCategory('all');
      setSearchQuery('');
      setShowCategoryDropdown(false);
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCategoryDropdown]);

  if (!isOpen) return null;

  // IDs of disabled categories — items belonging to these are hidden from ordering.
  const disabledCategoryIds = new Set(
    categories.filter(c => c.enabled === false).map(c => c.id)
  );

  const filteredItems = sortItemsByCategoryOrder(items.filter(item => {
    if (item.enabled === false) return false;
    if (disabledCategoryIds.has(item.categoryId)) return false;
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesSearch = searchQuery === '' || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  }), categories);

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

  const cartTotals = () => computeCartTotals(currentStore, orderItems.map(oi => ({ unitPrice: orderItemUnitPrice(oi), quantity: oi.quantity, taxPercent: oi.item.taxPercent, taxCategory: (oi.item as any).taxCategory })), 0, orderSource);
  const calculateTotal = () => cartTotals().gross;

  const calculateTax = () => cartTotals().totalTax;

  const total = cartTotals().total;

  // Calculate visible and overflow categories (exclude disabled categories)
  const enabledCategories = sortCategories(categories.filter(c => c.enabled !== false));
  const allCategories = ['all', ...enabledCategories.map(cat => cat.id)];
  const visibleCategories = allCategories.slice(0, visibleCategoryCount);
  const overflowCategories = allCategories.slice(visibleCategoryCount);
  const hasOverflow = overflowCategories.length > 0;
  const isOverflowActive = overflowCategories.includes(selectedCategory);

  const handleCreateOrderClick = () => {
    if (orderItems.length === 0) return;
    setShowCustomerDialog(true);
  };

  const handleSubmit = async (skipKot = false) => {
    if (orderItems.length === 0 || isSubmitting) return;

    // Pre-check: KOT enabled but no printer configured
    if (!skipKot && currentStore?.kotPrintEnabled && !currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'KOT printing is enabled but no printer is configured in settings. Create order without KOT print?',
        onConfirm: () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          handleSubmit(true);
        },
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const totalAmount = calculateTotal();
      const taxAmount = calculateTax();

      const payload = {
        storeId: currentStoreId,
        items: orderItems.map(oi => ({
          itemId: oi.itemId,
          quantity: oi.quantity,
          unitPrice: orderItemUnitPrice(oi),
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

      const createdOrder = await api.createParcelOrder(payload);

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
                rate: orderItemUnitPrice(oi),
                tax_percent: taxEnabled ? (oi.item.taxPercent || 0) : 0,
                amount: orderItemUnitPrice(oi) * oi.quantity,
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
        if (createdOrder?.bill) {
          await printerService.printInvoice(buildInvoicePrintJob(createdOrder.bill, currentStore!, createdOrder.items)!);
        }
      } catch (error) {
        console.error('Failed to print invoice:', error);
      }

      notify.success('Parcel order placed');
      await fetchOrders({ status: 'active' });
      closeParcelOrderModal();
    } catch (error) {
      console.error('Failed to create parcel order:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to create parcel order. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeParcelOrderModal}>
      <div className="modal order-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Package size={19} />
            Parcel Order
          </h2>
          <button className="close-btn" onClick={closeParcelOrderModal}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body order-modal-body">
          <div className="order-layout-fixed">
            <div className="order-main-fixed">
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
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="categories-wrapper" ref={categoryDropdownRef}>
                <div className="categories-list">
                  {visibleCategories.map(catId => {
                    if (catId === 'all') {
                      return (
                        <button
                          key="all"
                          className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                          onClick={() => setSelectedCategory('all')}
                        >
                          All
                        </button>
                      );
                    }
                    const cat = categories.find(c => c.id === catId);
                    if (!cat) return null;
                    return (
                      <button
                        key={cat.id}
                        className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
                {hasOverflow && (
                  <div className="category-dropdown-container">
                    <button
                      className={`category-dropdown-btn ${isOverflowActive ? 'active' : ''}`}
                      onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    >
                      {isOverflowActive 
                        ? categories.find(c => c.id === selectedCategory)?.name || `+${overflowCategories.length} more`
                        : `+${overflowCategories.length} more`
                      }
                      <ChevronDown size={14} />
                    </button>
                    {showCategoryDropdown && (
                      <div className="category-dropdown-menu">
                        {overflowCategories.map(catId => {
                          if (catId === 'all') {
                            return (
                              <button
                                key="all-dropdown"
                                className={`category-dropdown-item ${selectedCategory === 'all' ? 'active' : ''}`}
                                onClick={() => {
                                  setSelectedCategory('all');
                                  setShowCategoryDropdown(false);
                                }}
                              >
                                All
                              </button>
                            );
                          }
                          const cat = categories.find(c => c.id === catId);
                          if (!cat) return null;
                          return (
                            <button
                              key={cat.id}
                              className={`category-dropdown-item ${selectedCategory === cat.id ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedCategory(cat.id);
                                setShowCategoryDropdown(false);
                              }}
                            >
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                    <div className="item-category">{categories.find(c => c.id === item.categoryId)?.name || ''}</div>
                    <div className="item-price">{formatCurrency(item.price)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-sidebar-fixed">
              <h3>Order Items ({orderItems.length})</h3>

              {orderItems.length === 0 ? (
                <div className="empty-order">
                  Click items to add
                </div>
              ) : (
                <>
                  <div className="order-items-scrollable">
                    {orderItems.map(oi => (
                      <div key={oi.itemId} className="order-item-compact">
                        <div className="order-item-info">
                          <div className="order-item-name">{oi.item.name}</div>
                          <div className="order-item-category">{categories.find(c => c.id === oi.item.categoryId)?.name || ''}</div>
                          <div className="order-item-price">{formatCurrency(orderItemUnitPrice(oi))}</div>
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

                  <div className="order-total-fixed">
                    <div className="total-row">
                      <span>Subtotal</span>
                      <span>{formatCurrency(calculateTotal())}</span>
                    </div>
                    {taxEnabled && (
                      <div className="total-row">
                        <span>Tax</span>
                        <span>{formatCurrency(calculateTax())}</span>
                      </div>
                    )}
                    <div className="total-row final">
                      <span>Total</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={handleCreateOrderClick}
            disabled={orderItems.length === 0}
          >
            <Package size={16} />
            Create Order
          </button>
          <button className="btn btn-secondary" onClick={closeParcelOrderModal}>
            Cancel
          </button>
        </div>

        {/* Customer Details Dialog */}
        {showCustomerDialog && (
          <div className="modal-overlay" onClick={() => !isSubmitting && setShowCustomerDialog(false)}>
            <div className="modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Customer Details</h2>
                <button
                  className="close-btn"
                  onClick={() => !isSubmitting && setShowCustomerDialog(false)}
                  disabled={isSubmitting}
                >
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body">
                                <div style={{ margin: '8px 0' }}>
                  <label style={{ fontSize: '0.8rem' }}>Order source</label>
                  <select value={orderSource} onChange={e => setOrderSource(e.target.value)}>
                    {(gstMeta?.orderSources || [{id:'pos',label:'Counter / POS'},{id:'swiggy',label:'Swiggy'},{id:'zomato',label:'Zomato'},{id:'other_eco',label:'Other e-commerce'}]).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  {taxEnabled && orderSource !== 'pos' && <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>GST is paid by the platform (Sec 9(5)); no GST is charged on this bill</p>}
                </div>
                <GstBillSummary storeId={currentStoreId!} items={orderItems.map(oi => ({ itemId: oi.itemId, quantity: oi.quantity, unitPrice: orderItemUnitPrice(oi) }))} orderSource={orderSource} />
                <div className="bill-total-display">
                  <span className="bill-total-label">Total Amount</span>
                  <span className="bill-total-value">{formatCurrency(total)}</span>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label>Customer Name <span style={{ color: 'var(--gray-400)' }}>(optional)</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-group">
                  <label>Mobile Number <span style={{ color: 'var(--gray-400)' }}>(optional)</span></label>
                  <input
                    type="text"
                    value={customerMobile}
                    onChange={e => setCustomerMobile(e.target.value)}
                    placeholder="e.g. 9876543210"
                    disabled={isSubmitting}
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                >
                  <Printer size={18} />
                  {isSubmitting ? 'Processing...' : 'Submit & Print'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowCustomerDialog(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
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
    </div>
  );
};

export default ParcelOrderModal;
