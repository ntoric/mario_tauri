import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Minus, Trash2, Receipt, Search, Printer, X, FileText, ChefHat, Save, Keyboard } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';
import { ConfirmDialog } from './ConfirmDialog';
import OrderTimer from './OrderTimer';
import ShortcutsHelp, { ShortcutGroup } from './ShortcutsHelp';
import { useKeyboardShortcuts, ShortcutBinding } from '../hooks/useKeyboardShortcut';
import { printerService } from '../services/printer';
import { isTaxEnabled } from '../utils/tax';
import type { OrderItem, Item } from '../types';

const OrderPage: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setHeaderContent } = usePageHeader();

  const {
    categories, items, stores, tables,
    createOrder, updateOrder, completeOrder, createBill,
    saveEBill, savePrint, cancelOrder,
    fetchCategories, fetchItems, fetchTables, fetchOrders,
    getActiveOrderByTable,
  } = useDataStore();
  const { user, currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);

  const table = tables.find(t => t.id === tableId);
  const existingOrder = table ? getActiveOrderByTable(table.id) : undefined;
  const viewOnly = false;

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionType, setActionType] = useState<string>('');
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

  // Keyboard navigation state
  const [kbFocusedItemIndex, setKbFocusedItemIndex] = useState<number>(-1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemsGridRef = useRef<HTMLDivElement>(null);

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
    fetchTables();
    fetchOrders();
  }, [fetchCategories, fetchItems, fetchTables, fetchOrders]);

  // Set page header
  useEffect(() => {
    const title = existingOrder ? `Edit Order - Table ${table?.number ?? ''}` : `New Order - Table ${table?.number ?? ''}`;
    setHeaderContent({
      title,
      subtitle: currentStore?.name || '',
      actions: (
        <>
          <button className="btn btn-secondary" onClick={() => setShowShortcutsHelp(true)} title="Keyboard shortcuts (?)">
            <Keyboard size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
            Back to Tables
          </button>
        </>
      ),
    });
  }, [table, existingOrder, currentStore, setHeaderContent, navigate]);

  // Initialize order items when existingOrder is loaded
  useEffect(() => {
    if (existingOrder) {
      setOrderItems(existingOrder.items || []);
      setPaymentMethod(existingOrder.paymentMethod || 'upi');
    } else {
      setOrderItems([]);
      setPaymentMethod('upi');
    }
    setShowBillDialog(false);
    setIsPrinting(false);
    setSelectedCategory('all');
    setSearchQuery('');
  }, [existingOrder?.id]);

  // Log button state for debugging
  useEffect(() => {
    console.log('[BUTTON STATE] orderItems:', orderItems.length, 'isSubmitting:', isSubmitting, 'isPrinting:', isPrinting);
  }, [orderItems.length, isSubmitting, isPrinting]);

  if (!table) {
    return (
      <div className="order-page-empty">
        <p>Table not found</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Tables
        </button>
      </div>
    );
  }

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
    if (!taxEnabled) return 0;
    return orderItems.reduce((sum, oi) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (oi.item.price * oi.quantity * taxPercent / 100);
    }, 0);
  };

  const buildPrintItems = () => {
    return orderItems.map(oi => {
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
  };

  const printKOT = async (orderId: string) => {
    if (!currentStore?.printerName) return;
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
          order_id: parseInt(orderId.slice(-6), 36) || 0,
          table_number: String(table?.number ?? ''),
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
          order_type: 'DINE_IN',
          customer_name: 'Guest',
          customer_mobile: '',
        },
      });
    } catch (error) {
      console.error('Failed to print KOT:', error);
      throw error;
    }
  };

  const printInvoiceBill = async (invoiceNo: string, total: number) => {
    const printItems = buildPrintItems();
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
        footer: ['Thank You Visit Again'],
      },
    });
  };

  const handleSave = async () => {
    if (orderItems.length === 0) return;

    const totalAmount = calculateTotal();
    const taxAmount = calculateTax();

    setActionType('save');
    setIsSubmitting(true);
    try {
      if (existingOrder) {
        await updateOrder(existingOrder.id, {
          items: orderItems,
          totalAmount,
          taxAmount,
        });
      } else {
        await createOrder({
          tableId: table.id,
          tableNumber: table.number,
          items: orderItems,
          totalAmount,
          taxAmount,
          discountAmount: 0,
          paymentMethod,
        });
      }

      await fetchOrders();
      navigate('/');
      setOrderItems([]);
    } catch (error: any) {
      console.error('Failed to save order:', error);
      if (error?.message === 'User or store not authenticated' || error?.message === 'Store not selected') {
        setErrorDialog({ show: true, message: 'Session expired. Please log in again.' });
      } else {
        setErrorDialog({ show: true, message: (error as Error).message || 'Failed to save order. Please check your connection and try again.' });
      }
    } finally {
      setIsSubmitting(false);
      setActionType('');
    }
  };

  const handleKOT = async (withPrint = false) => {
    console.log('[KOT] handleKOT called', { withPrint, orderItemsLength: orderItems.length, orderItems });
    if (orderItems.length === 0) {
      console.log('[KOT] Early return: orderItems is empty');
      return;
    }

    const totalAmount = calculateTotal();
    const taxAmount = calculateTax();

    console.log('[KOT] Starting KOT save', { withPrint, orderItemsLength: orderItems.length, totalAmount, taxAmount, tableId: table.id, existingOrderId: existingOrder?.id });

    // Pre-check: KOT print requested but no printer configured
    if (withPrint && !currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'No printer is configured in settings. Save order without printing KOT?',
        onConfirm: () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          handleKOT(false);
        },
      });
      return;
    }

    setActionType(withPrint ? 'kot-print' : 'kot');
    setIsSubmitting(true);
    try {
      let orderId = existingOrder?.id;
      if (existingOrder) {
        console.log('[KOT] Updating existing order', existingOrder.id);
        await updateOrder(existingOrder.id, {
          items: orderItems,
          totalAmount,
          taxAmount,
        });
        console.log('[KOT] Order updated successfully');
      } else {
        console.log('[KOT] Creating new order', { tableId: table.id, tableNumber: table.number, items: orderItems, totalAmount, taxAmount, paymentMethod });
        const newOrder = await createOrder({
          tableId: table.id,
          tableNumber: table.number,
          items: orderItems,
          totalAmount,
          taxAmount,
          discountAmount: 0,
          paymentMethod,
        });
        console.log('[KOT] New order created', newOrder);
        orderId = newOrder.id;
      }

      console.log('[KOT] Refreshing orders...');
      // Ensure orders are refreshed before navigation
      await fetchOrders();
      console.log('[KOT] Orders refreshed');

      if (withPrint && orderId) {
        try {
          await printKOT(orderId);
        } catch (error) {
          console.error('Failed to print KOT:', error);
          // Don't block the order save if KOT printing fails
        }
      }

      console.log('[KOT] Navigating back to tables');
      navigate('/');
      setOrderItems([]);
    } catch (error: any) {
      console.error('[KOT] Failed to save order:', error);
      console.error('[KOT] Error details:', { message: error?.message, stack: error?.stack, response: error?.response });
      if (error?.message === 'User or store not authenticated' || error?.message === 'Store not selected') {
        console.error('[KOT] Auth error detected, showing error dialog instead of redirect');
        setErrorDialog({ show: true, message: 'Session expired. Please log in again.' });
        // Comment out redirect to see the error
        // window.location.hash = '/login';
        // window.location.reload();
      } else {
        setErrorDialog({ show: true, message: (error as Error).message || 'Failed to save order. Please check your connection and try again.' });
      }
    } finally {
      setIsSubmitting(false);
      setActionType('');
    }
  };

  const handleSaveEBill = async () => {
    if (orderItems.length === 0) return;

    const totalAmount = calculateTotal();
    const taxAmount = calculateTax();

    setActionType('e-bill');
    setIsSubmitting(true);
    try {
      if (existingOrder) {
        // For existing orders: update, then finalize as e-bill (bill + complete)
        await updateOrder(existingOrder.id, {
          items: orderItems,
          totalAmount,
          taxAmount,
        });
        await savePrint(existingOrder.id, {
          orderId: existingOrder.id,
          tableNumber: table.number,
          invoiceNo: `INV-${Date.now()}`,
          subtotal: totalAmount,
          taxTotal: taxAmount,
          discount: 0,
          total: totalAmount + taxAmount,
          paymentMethod,
          customerName: 'Walk-in Customer',
        });
      } else {
        await saveEBill({
          tableId: table.id,
          tableNumber: table.number,
          items: orderItems,
          totalAmount,
          taxAmount,
          discountAmount: 0,
          paymentMethod,
        });
      }
      navigate('/');
      setOrderItems([]);
    } catch (error: any) {
      console.error('Failed to save e-bill:', error);
      if (error?.message === 'User or store not authenticated' || error?.message === 'Store not selected') {
        setErrorDialog({ show: true, message: 'Session expired. Please log in again.' });
        window.location.hash = '/login';
        window.location.reload();
      } else {
        setErrorDialog({ show: true, message: (error as Error).message || 'Failed to save e-bill. Please check your connection and try again.' });
      }
    } finally {
      setIsSubmitting(false);
      setActionType('');
    }
  };

  const handleSavePrint = async () => {
    if (orderItems.length === 0) return;

    const totalAmount = calculateTotal();
    const taxAmount = calculateTax();
    const total = totalAmount + taxAmount;
    const invoiceNo = `INV-${Date.now()}`;

    // Pre-check: no printer configured
    if (!currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'No printer is configured. Save order only?',
        onConfirm: async () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          await handleSave();
        },
      });
      return;
    }

    setActionType('save-print');
    setIsPrinting(true);
    try {
      let orderId = existingOrder?.id;
      if (existingOrder) {
        await updateOrder(existingOrder.id, {
          items: orderItems,
          totalAmount,
          taxAmount,
        });
        orderId = existingOrder.id;
      } else {
        const newOrder = await createOrder({
          tableId: table.id,
          tableNumber: table.number,
          items: orderItems,
          totalAmount,
          taxAmount,
          discountAmount: 0,
          paymentMethod,
        });
        orderId = newOrder.id;
      }

      if (!orderId) throw new Error('Failed to create or update order');

      // Try to print invoice before completing the order
      try {
        await printInvoiceBill(invoiceNo, total);
      } catch (printError) {
        console.error('Failed to print invoice:', printError);
        // Printer not working - ask to save order only (order stays on table, not completed)
        setPrinterConfirm({
          show: true,
          title: 'Printer Not Working',
          message: 'Failed to print the bill. Save order only?',
          onConfirm: async () => {
            setPrinterConfirm(p => ({ ...p, show: false }));
            await fetchOrders();
            navigate('/');
            setOrderItems([]);
          },
        });
        return;
      }

      // Print succeeded - create bill and complete via backend
      await savePrint(orderId, {
        orderId,
        tableNumber: table.number,
        invoiceNo,
        subtotal: totalAmount,
        taxTotal: taxAmount,
        discount: 0,
        total,
        paymentMethod,
        customerName: 'Walk-in Customer',
      });

      navigate('/');
      setOrderItems([]);
    } catch (error: any) {
      console.error('Failed to save and print:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to save and print. Please try again.' });
    } finally {
      setIsPrinting(false);
      setActionType('');
    }
  };

  const handleCancel = () => {
    if (existingOrder) {
      setPrinterConfirm({
        show: true,
        title: 'Cancel Order',
        message: `Are you sure you want to cancel the order for Table ${table.number}?`,
        onConfirm: async () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          try {
            await cancelOrder(existingOrder.id);
            navigate('/');
            setOrderItems([]);
          } catch (error: any) {
            console.error('Failed to cancel order:', error);
            setErrorDialog({ show: true, message: (error as Error).message || 'Failed to cancel order.' });
          }
        },
      });
    } else {
      navigate('/');
      setOrderItems([]);
    }
  };

  const total = calculateTotal() + calculateTax();

  // Keep keyboard focus index in range when the filtered items list changes.
  useEffect(() => {
    setKbFocusedItemIndex(idx => {
      if (filteredItems.length === 0) return -1;
      if (idx < 0 || idx >= filteredItems.length) return -1;
      return idx;
    });
  }, [filteredItems.length]);

  // Scroll focused item card into view.
  useEffect(() => {
    if (kbFocusedItemIndex < 0) return;
    const el = itemsGridRef.current?.querySelector('.item-card.kb-focused') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [kbFocusedItemIndex]);

  const anyModalOpen = !!(showBillDialog || printerConfirm.show || errorDialog.show || showShortcutsHelp);

  const adjustLastItemQty = useCallback((delta: number) => {
    setOrderItems(items => {
      if (items.length === 0) return items;
      const lastIdx = items.length - 1;
      const last = items[lastIdx];
      const newQty = last.quantity + delta;
      if (newQty <= 0) {
        return items.filter((_, i) => i !== lastIdx);
      }
      return items.map((oi, i) => i === lastIdx ? { ...oi, quantity: newQty } : oi);
    });
  }, []);

  const orderShortcuts: ShortcutBinding[] = [
    { key: '?', modifiers: { shift: true }, handler: () => setShowShortcutsHelp(true), preventDefault: true },
    { key: 'Escape', handler: () => {
      if (showShortcutsHelp) { setShowShortcutsHelp(false); return; }
      if (printerConfirm.show) { setPrinterConfirm(p => ({ ...p, show: false })); return; }
      if (errorDialog.show) { setErrorDialog({ show: false, message: '' }); return; }
      if (showBreakdown) { setShowBreakdown(false); return; }
      // If search input is focused, blur it first.
      if (document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
        return;
      }
      handleCancel();
    }, allowInInput: true },
    { key: 's', modifiers: { ctrl: true }, handler: () => { if (!isSubmitting && orderItems.length > 0) handleSave(); }, preventDefault: true },
    { key: 'p', modifiers: { ctrl: true }, handler: () => { if (!isPrinting && !isSubmitting && orderItems.length > 0) handleSavePrint(); }, preventDefault: true },
    { key: 'Enter', modifiers: { ctrl: true }, handler: () => { if (!isPrinting && !isSubmitting && orderItems.length > 0) handleSavePrint(); }, preventDefault: true },
    { key: 'k', modifiers: { ctrl: true }, handler: () => { if (!isSubmitting && orderItems.length > 0) handleKOT(false); }, preventDefault: true },
    { key: 'k', modifiers: { ctrl: true, shift: true }, handler: () => { if (!isSubmitting && orderItems.length > 0) handleKOT(true); }, preventDefault: true },
    { key: 'e', modifiers: { ctrl: true }, handler: () => { if (!isSubmitting && orderItems.length > 0) handleSaveEBill(); }, preventDefault: true },
    { key: '1', handler: () => { if (!anyModalOpen) setPaymentMethod('cash'); }, preventDefault: true },
    { key: '2', handler: () => { if (!anyModalOpen) setPaymentMethod('card'); }, preventDefault: true },
    { key: '3', handler: () => { if (!anyModalOpen) setPaymentMethod('upi'); }, preventDefault: true },
    { key: '/', handler: () => { if (!anyModalOpen) searchInputRef.current?.focus(); }, preventDefault: true },
    { key: '+', modifiers: { shift: true }, handler: () => adjustLastItemQty(1), preventDefault: true },
    { key: '-', handler: () => adjustLastItemQty(-1), preventDefault: true },
    { key: 'ArrowDown', handler: () => {
      if (anyModalOpen) return;
      setKbFocusedItemIndex(idx => {
        if (filteredItems.length === 0) return -1;
        return idx < 0 ? 0 : Math.min(idx + 1, filteredItems.length - 1);
      });
    } },
    { key: 'ArrowUp', handler: () => {
      if (anyModalOpen) return;
      setKbFocusedItemIndex(idx => {
        if (filteredItems.length === 0) return -1;
        return idx <= 0 ? 0 : idx - 1;
      });
    } },
    { key: 'Enter', handler: () => {
      if (anyModalOpen) return;
      const focused = kbFocusedItemIndex >= 0 ? filteredItems[kbFocusedItemIndex] : undefined;
      if (focused) addItemToOrder(focused);
    } },
  ];
  useKeyboardShortcuts(orderShortcuts);

  const orderShortcutGroups: ShortcutGroup[] = [
    {
      title: 'Save & Print',
      entries: [
        { binding: { key: 's', modifiers: { ctrl: true } }, description: 'Save order to table' },
        { binding: { key: 'p', modifiers: { ctrl: true } }, description: 'Save, print bill & release table' },
        { binding: { key: 'Enter', modifiers: { ctrl: true } }, description: 'Save & print (same as Ctrl+P)' },
        { binding: { key: 'k', modifiers: { ctrl: true } }, description: 'KOT (save & keep on table)' },
        { binding: { key: 'k', modifiers: { ctrl: true, shift: true } }, description: 'KOT & print' },
        { binding: { key: 'e', modifiers: { ctrl: true } }, description: 'Save as E-Bill' },
      ],
    },
    {
      title: 'Payment Method',
      entries: [
        { binding: { key: '1' }, description: 'Cash' },
        { binding: { key: '2' }, description: 'Card' },
        { binding: { key: '3' }, description: 'UPI' },
      ],
    },
    {
      title: 'Items & Cart',
      entries: [
        { binding: { key: '/' }, description: 'Focus search box' },
        { binding: { key: 'ArrowDown' }, description: 'Move focus to next item' },
        { binding: { key: 'ArrowUp' }, description: 'Move focus to previous item' },
        { binding: { key: 'Enter' }, description: 'Add focused item to cart' },
        { binding: { key: '+', modifiers: { shift: true } }, description: 'Add one of last cart item' },
        { binding: { key: '-' }, description: 'Remove one of last cart item' },
      ],
    },
    {
      title: 'Navigation',
      entries: [
        { binding: { key: '?', modifiers: { shift: true } }, description: 'Show this help' },
        { binding: { key: 'Escape' }, description: 'Close dialog / back to tables' },
      ],
    },
  ];

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
              placeholder="Search items... (press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="order-search-input"
              ref={searchInputRef}
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

          <div className="items-grid-scrollable" ref={itemsGridRef}>
            {filteredItems.map((item, idx) => (
              <div
                key={item.id}
                className={`item-card ${idx === kbFocusedItemIndex ? 'kb-focused' : ''}`}
                data-tooltip={item.name}
                onClick={() => addItemToOrder(item)}
              >
                <div className="item-name">{item.name}</div>
                <div className="item-price">{formatCurrency(item.price)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Cart / Bill (Petpooja style) */}
        <div className="order-page-right">
          <div className="order-page-left-header">
            <h3>Cart ({orderItems.length})</h3>
            {existingOrder && (
              <OrderTimer createdAt={existingOrder.createdAt} className="detail-timer" />
            )}
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
          )}

          {/* Cart totals summary */}
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
          {!viewOnly && (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleSave}
                disabled={orderItems.length === 0 || isSubmitting}
                title="Save order to table and go back (Ctrl+S)"
              >
                <Save size={14} />
                {actionType === 'save' ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn btn-warning"
                onClick={handleSaveEBill}
                disabled={orderItems.length === 0 || isSubmitting}
                title="Save as E-Bill (no table hold) (Ctrl+E)"
              >
                <FileText size={14} />
                {actionType === 'e-bill' ? 'Saving...' : 'Save & E-Bill'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSavePrint}
                disabled={orderItems.length === 0 || isSubmitting || isPrinting}
                title="Save, Print Bill & Release Table (Ctrl+P)"
              >
                <Printer size={14} />
                {actionType === 'save-print' ? 'Processing...' : 'Save & Print'}
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={(e) => {
                  e.preventDefault();
                  console.log('[KOT BUTTON] KOT button clicked');
                  handleKOT(false);
                }}
                disabled={orderItems.length === 0 || isSubmitting}
                title="Save Order & Keep on Table (Ctrl+K)"
              >
                <Save size={14} />
                {actionType === 'kot' ? 'Saving...' : 'KOT'}
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={(e) => {
                  e.preventDefault();
                  console.log('[KOT BUTTON] KOT & Print button clicked');
                  handleKOT(true);
                }}
                disabled={orderItems.length === 0 || isSubmitting}
                title="Save Order, Print KOT & Keep on Table (Ctrl+Shift+K)"
              >
                <ChefHat size={14} />
                {actionType === 'kot-print' ? 'Saving...' : 'KOT & Print'}
              </button>
            </>
          )}
          <button className="btn btn-danger" onClick={handleCancel} title="Cancel / back (Esc)">
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

      <ShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        groups={orderShortcutGroups}
      />
    </div>
  );
};

export default OrderPage;
