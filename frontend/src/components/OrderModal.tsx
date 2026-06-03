import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Minus, Trash2, Receipt, Search, Printer, ChevronDown } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { printerService } from '../services/printer';
import type { OrderItem, Item } from '../types';

const OrderModal: React.FC = () => {
  const { categories, items, stores, createOrder, updateOrder, completeOrder, createBill, fetchCategories, fetchItems } = useDataStore();
  const { user, currentStoreId } = useAuthStore();
  const { orderModal, closeOrderModal } = useUIStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isPrinting, setIsPrinting] = useState(false);
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

  const isOpen = orderModal.isOpen;
  const { table, existingOrder, viewOnly } = orderModal.data || {};

  // Fetch categories and items when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchItems();
    }
  }, [isOpen, fetchCategories, fetchItems]);

  useEffect(() => {
    if (isOpen) {
      if (existingOrder) {
        setOrderItems(existingOrder.items || []);
      } else {
        setOrderItems([]);
      }
      // Reset state when modal opens
      setShowBillDialog(false);
      setPaymentMethod('upi');
      setIsPrinting(false);
    }
  }, [isOpen, existingOrder]);

  // Handle Enter key in bill dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showBillDialog && e.key === 'Enter' && !isPrinting && currentStore?.remoteBillingEnabled) {
        e.preventDefault();
        handlePrintAndComplete();
      }
    };

    if (showBillDialog) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showBillDialog, isPrinting, paymentMethod, currentStore]);

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

  if (!isOpen || !table) return null;

  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesSearch = searchQuery === '' || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addItemToOrder = (item: Item) => {
    if (viewOnly) return;
    
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
    if (viewOnly) return;
    
    setOrderItems(orderItems.map(oi => {
      if (oi.itemId === itemId) {
        const newQuantity = oi.quantity + delta;
        return newQuantity > 0 ? { ...oi, quantity: newQuantity } : oi;
      }
      return oi;
    }).filter(oi => oi.quantity > 0));
  };

  const removeItem = (itemId: string) => {
    if (viewOnly) return;
    setOrderItems(orderItems.filter(oi => oi.itemId !== itemId));
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, oi) => sum + (oi.item.price * oi.quantity), 0);
  };

  const calculateTax = () => {
    return orderItems.reduce((sum, oi) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (oi.item.price * oi.quantity * taxPercent / 100);
    }, 0);
  };

  const handleSaveOrder = async (skipKot = false) => {
    if (orderItems.length === 0) return;

    const totalAmount = calculateTotal();
    const taxAmount = calculateTax();

    // Pre-check: new order with KOT enabled but no printer configured
    if (!skipKot && !existingOrder && currentStore?.kotPrintEnabled && !currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'KOT printing is enabled but no printer is configured in settings. Place order without KOT print?',
        onConfirm: () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          handleSaveOrder(true);
        },
      });
      return;
    }

    try {
      if (existingOrder) {
        await updateOrder(existingOrder.id, {
          items: orderItems,
          totalAmount,
          taxAmount,
        });
      } else {
        const newOrder = await createOrder({
          tableId: table.id,
          tableNumber: table.number,
          items: orderItems,
          totalAmount,
          taxAmount,
          discountAmount: 0,
          paymentMethod: 'cash',
        });

        // Print KOT if enabled for the store
        if (!skipKot && currentStore?.kotPrintEnabled && newOrder?.id) {
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
                order_id: parseInt(newOrder.id.slice(-6), 36) || 0,
                table_number: String(table.number),
                waiter_name: '',
                date: new Date().toLocaleString('en-IN'),
                items: orderItems.map(oi => ({
                  name: oi.item.name,
                  qty: oi.quantity,
                  unit: 'PCS',
                  rate: oi.item.price,
                  tax_percent: oi.item.taxPercent || 0,
                  amount: oi.item.price * oi.quantity,
                })),
                notes: '',
                order_type: 'DINE_IN',
                customer_name: 'Guest',
                customer_mobile: '',
              },
            });
          } catch (error) {
            console.error('Failed to print KOT:', error);
            // Don't block the order creation if KOT printing fails
          }
        }
      }
      closeOrderModal();
      setOrderItems([]);
    } catch (error: any) {
      console.error('Failed to save order:', error);
      // Show error to user
      if (error?.message === 'User or store not authenticated' || error?.message === 'Store not selected') {
        setErrorDialog({ show: true, message: 'Session expired. Please log in again.' });
        window.location.hash = '/login';
        window.location.reload();
      } else {
        setErrorDialog({ show: true, message: (error as Error).message || 'Failed to save order. Please check your connection and try again.' });
      }
    }
  };

  const handlePrintAndComplete = async () => {
    if (!existingOrder || orderItems.length === 0 || isPrinting) return;

    const subtotal = calculateTotal();
    const tax = calculateTax();
    const total = subtotal + tax;
    const invoiceNo = `INV-${Date.now()}`;

    // Pre-check: no printer configured
    if (!currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'No printer is configured in settings. Complete order without printing bill?',
        onConfirm: async () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          setIsPrinting(true);
          try {
            await createBill({
              orderId: existingOrder.id,
              tableNumber: table.number,
              invoiceNo,
              subtotal,
              taxTotal: tax,
              discount: 0,
              total,
              paymentMethod,
              customerName: 'Walk-in Customer',
            });
            await completeOrder(existingOrder.id, paymentMethod);
            setShowBillDialog(false);
            closeOrderModal();
            setOrderItems([]);
          } catch (error) {
            console.error('Failed to complete order:', error);
            setErrorDialog({ show: true, message: (error as Error).message || 'Failed to complete order. Please try again.' });
          } finally {
            setIsPrinting(false);
          }
        },
      });
      return;
    }

    setIsPrinting(true);

    try {
      // Create bill
      await createBill({
        orderId: existingOrder.id,
        tableNumber: table.number,
        invoiceNo,
        subtotal,
        taxTotal: tax,
        discount: 0,
        total,
        paymentMethod,
        customerName: 'Walk-in Customer',
      });

      // Print invoice via printer service
      const printItems = orderItems.map(oi => {
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

      try {
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
              name: 'Walk-in Customer',
              mobile: '',
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
            dr_ref: '',
            footer: ['Thank You Visit Again'],
          },
        });
      } catch (printError) {
        console.error('Failed to print invoice:', printError);
        setIsPrinting(false);
        setPrinterConfirm({
          show: true,
          title: 'Print Failed',
          message: 'Failed to print the bill. Complete order without printing?',
          onConfirm: async () => {
            setPrinterConfirm(p => ({ ...p, show: false }));
            setIsPrinting(true);
            try {
              await completeOrder(existingOrder.id, paymentMethod);
              setShowBillDialog(false);
              closeOrderModal();
              setOrderItems([]);
            } catch (err) {
              console.error('Failed to complete order:', err);
              setErrorDialog({ show: true, message: (err as Error).message || 'Failed to complete order. Please try again.' });
            } finally {
              setIsPrinting(false);
            }
          },
        });
        return;
      }

      // Complete order
      await completeOrder(existingOrder.id, paymentMethod);

      // Close modal and reset
      setShowBillDialog(false);
      closeOrderModal();
      setOrderItems([]);
    } catch (error) {
      console.error('Failed to print and complete:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to complete order. Please try again.' });
    } finally {
      setIsPrinting(false);
    }
  };

  const total = calculateTotal() + calculateTax();

  // Calculate visible and overflow categories
  const allCategories = ['all', ...categories.map(cat => cat.id)];
  const visibleCategories = allCategories.slice(0, visibleCategoryCount);
  const overflowCategories = allCategories.slice(visibleCategoryCount);
  const hasOverflow = overflowCategories.length > 0;
  const isOverflowActive = overflowCategories.includes(selectedCategory);

  return (
    <div className="modal-overlay" onClick={closeOrderModal}>
      <div className="modal order-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {viewOnly ? 'View Order' : existingOrder ? 'Edit Order' : 'New Order'} - Table {table.number}
          </h2>
          <button className="close-btn" onClick={closeOrderModal}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body order-modal-body">
          <div className="order-layout-fixed">
            <div className="order-main-fixed">
              {!viewOnly && (
                <>
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
                        onClick={() => addItemToOrder(item)}
                      >
                        <div className="item-name">{item.name}</div>
                        <div className="item-price">{formatCurrency(item.price)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {viewOnly && (
                <div style={{ textAlign: 'center', color: 'var(--gray-600)', padding: '3rem' }}>
                  Order items are shown in the sidebar
                </div>
              )}
            </div>

            <div className="order-sidebar-fixed">
              <h3>Order Items ({orderItems.length})</h3>
              
              {orderItems.length === 0 ? (
                <div className="empty-order">
                  {viewOnly ? 'No items in this order' : 'Click items to add'}
                </div>
              ) : (
                <>
                  <div className="order-items-scrollable">
                    {orderItems.map(oi => (
                      <div key={oi.itemId} className="order-item-compact">
                        <div className="order-item-info">
                          <div className="order-item-name">{oi.item.name}</div>
                          <div className="order-item-price">{formatCurrency(oi.item.price)}</div>
                        </div>
                        <div className="order-item-actions">
                          {!viewOnly && (
                            <>
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
                            </>
                          )}
                          {viewOnly && (
                            <span className="order-item-quantity">x{oi.quantity}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="order-total-fixed">
                    <div className="total-row">
                      <span>Subtotal</span>
                      <span>{formatCurrency(calculateTotal())}</span>
                    </div>
                    <div className="total-row">
                      <span>Tax</span>
                      <span>{formatCurrency(calculateTax())}</span>
                    </div>
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
          {existingOrder && !viewOnly && (
            <button
              className="btn btn-primary"
              onClick={() => setShowBillDialog(true)}
              disabled={orderItems.length === 0}
            >
              <Receipt size={16} />
              Bill
            </button>
          )}
          {!viewOnly && (
            <button
              className="btn btn-primary"
              onClick={() => handleSaveOrder()}
              disabled={orderItems.length === 0}
            >
              {existingOrder ? 'Update Order' : 'Place Order'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={closeOrderModal}>
            {viewOnly ? 'Close' : 'Cancel'}
          </button>
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

        {/* Bill Dialog */}
        {showBillDialog && (
          <div className="modal-overlay" onClick={() => !isPrinting && setShowBillDialog(false)}>
            <div className="modal bill-dialog" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Print Bill</h2>
                <button 
                  className="close-btn" 
                  onClick={() => !isPrinting && setShowBillDialog(false)}
                  disabled={isPrinting}
                >
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body">
                <div className="bill-total-display">
                  <span className="bill-total-label">Total Amount</span>
                  <span className="bill-total-value">{formatCurrency(total)}</span>
                </div>
                
                <div className="payment-method-section">
                  <label className="payment-label">Payment Method</label>
                  <div className="payment-options">
                    <button
                      className={`payment-option ${paymentMethod === 'cash' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('cash')}
                      data-method="cash"
                    >
                      Cash
                    </button>
                    <button
                      className={`payment-option ${paymentMethod === 'card' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('card')}
                      data-method="card"
                    >
                      Card
                    </button>
                    <button
                      className={`payment-option ${paymentMethod === 'upi' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('upi')}
                      data-method="upi"
                    >
                      UPI
                    </button>
                  </div>
                </div>

                <p className="bill-hint">Press Enter or click Print to complete</p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handlePrintAndComplete}
                >
                  <Printer size={18} />
                  {isPrinting ? 'Printing...' : 'Print & Complete'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowBillDialog(false)}
                  disabled={isPrinting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderModal;
