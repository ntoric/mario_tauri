import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Grid3X3, List, Printer, X, ArrowRightLeft, Loader2, Package, Search, Users, ArrowUpRight, CheckCircle2, Clock, HelpCircle, ChevronDown, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency } from '../utils/currency';
import { isTaxEnabled } from '../utils/tax';
import { api } from '../services/api';
import { printerService } from '../services/printer';
import { listenTableStatusUpdates } from '../services/realtime';
import { Button } from '../components/ui/Button';
import BillModal from './BillModal';
import { ConfirmDialog } from './ConfirmDialog';
import OrderTimer from './OrderTimer';
import ShortcutsHelp, { ShortcutGroup } from './ShortcutsHelp';
import { useKeyboardShortcuts, ShortcutBinding } from '../hooks/useKeyboardShortcut';
import type { Table } from '../types';

const Tables: React.FC = () => {
  const { stores, tables, tableSections, getActiveOrderByTable, createTable, deleteTable, createBill, completeOrder, updateOrder, fetchTables, fetchTableSections, fetchOrders, fetchCategories, fetchItems, fetchBillQueue, createTableSection, renameTableSection, deleteTableSection, cancelOrder } = useDataStore();
  const navigate = useNavigate();
  const { user, currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const { setHeaderContent } = usePageHeader();
  const [viewMode, setViewMode] = useState<'layout' | 'list'>('layout');

  // Fetch data on mount
  useEffect(() => {
    fetchTables();
    fetchTableSections();
    fetchOrders();
    fetchCategories();
    fetchItems();
  }, [fetchTables, fetchTableSections, fetchOrders, fetchCategories, fetchItems]);

  // Realtime updates via Tauri events emitted by the embedded local backend
  useEffect(() => {
    if (!currentStoreId) return;

    let isSyncing = false;
    let unlisten: (() => void) | null = null;

    const syncTablesAndOrders = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        await Promise.all([
          fetchTables(),
          fetchOrders(),
        ]);
      } finally {
        isSyncing = false;
      }
    };

    let cancelled = false;
    listenTableStatusUpdates(currentStoreId, () => {
      void syncTablesAndOrders();
    }).then((un) => {
      if (cancelled) {
        un();
      } else {
        unlisten = un;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [currentStoreId, fetchOrders, fetchTables]);

  useEffect(() => {
    if (!currentStoreId || !currentStore?.remoteBillingEnabled) return;

    const hasPrinterConfig = !!(currentStore.printerName || (currentStore.printerVendorId && currentStore.printerProductId));
    if (!hasPrinterConfig) return;

    let pollTimer: number | null = null;
    let isPolling = false;

    const pollQueue = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        await fetchBillQueue();
        const queueItems = useDataStore.getState().billQueue;
        if (!queueItems.length) return;

        await fetchOrders();
        const allOrders = useDataStore.getState().orders;

        for (const queueItem of queueItems) {
          try {
            const billPayload = JSON.parse(queueItem.billData || '{}');
            const order = allOrders.find(o => o.id === queueItem.orderId);
            if (!order) continue;

            const printItems = order.items.map((oi: any) => {
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

            const taxable = printItems.reduce((sum: number, item: any) => sum + item.amount, 0);
            const actualTax = printItems.reduce((sum: number, item: any) => sum + (item.amount * item.tax_percent / 100), 0);
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
                  name: billPayload.customerName || 'Walk-in Customer',
                  mobile: '',
                },
                invoice_no: billPayload.invoiceNo || `INV-${Date.now()}`,
                bill_no: billPayload.invoiceNo || `INV-${Date.now()}`,
                date: new Date().toLocaleString('en-IN'),
                items: printItems,
                summary: {
                  sub_total: taxable,
                  discount: Number(billPayload.discount || 0),
                  taxable,
                  cgst,
                  sgst,
                  grand_total: Number(billPayload.total || order.totalAmount),
                },
                payment: {
                  cash: billPayload.paymentMethod === 'cash' ? Number(billPayload.total || order.totalAmount) : 0,
                  card: billPayload.paymentMethod === 'card' ? Number(billPayload.total || order.totalAmount) : 0,
                  upi: billPayload.paymentMethod === 'upi' ? Number(billPayload.total || order.totalAmount) : 0,
                  balance: 0,
                },
                payment_mode: billPayload.paymentMethod || 'cash',
                footer: ['Thank You Visit Again'],
              },
            });
          } catch {
            // Ignore malformed payload/print failures for poller stability.
          }
        }
      } finally {
        isPolling = false;
      }
    };

    void pollQueue();
    pollTimer = window.setInterval(() => {
      void pollQueue();
    }, 3000);

    return () => {
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [currentStoreId, currentStore?.remoteBillingEnabled, currentStore, fetchBillQueue, fetchOrders]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTable, setNewTable] = useState({ number: '', seats: 4, section: '' });
  const [checkingTableId, setCheckingTableId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteConfirmTable, setDeleteConfirmTable] = useState<Table | null>(null);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'vacant' | 'occupied'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingSectionValue, setEditingSectionValue] = useState('');
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);

  // Keyboard navigation state
  const [kbFocusedIndex, setKbFocusedIndex] = useState<number>(-1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const tableMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableMenuRef.current && !tableMenuRef.current.contains(event.target as Node)) {
        setShowTableMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Bill dialog state
  const [billDialogTable, setBillDialogTable] = useState<Table | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewTable, setPreviewTable] = useState<Table | null>(null);

  // Change table dialog state
  const [changeTableDialog, setChangeTableDialog] = useState<{ fromTable: Table; order: any } | null>(null);
  const [confirmTableChange, setConfirmTableChange] = useState<Table | null>(null);

  // Loading states
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [loadingTableId, setLoadingTableId] = useState<string | null>(null);
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [isChangingTable, setIsChangingTable] = useState(false);
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

  const isAdmin = user?.role === 'superadmin' || user?.role === 'business_owner' || user?.role === 'business_admin';

  // Set page header
  useEffect(() => {
    setHeaderContent({ title: 'Tables', subtitle: 'Dining room management', actions: null });
  }, [setHeaderContent]);

  const handleTableClick = async (table: Table) => {
    if (checkingTableId) return; // Prevent double clicks

    setCheckingTableId(table.id);
    setCheckingTableId(null);
    navigate(`/order/${table.id}`);
  };

  const handleBillClick = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    const activeOrder = getActiveOrderByTable(table.id);
    if (activeOrder) {
      setPaymentMethod('upi');
      setBillDialogTable(table);
    }
  };

  const handleChangeTableClick = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    const activeOrder = getActiveOrderByTable(table.id);
    if (activeOrder) {
      setChangeTableDialog({ fromTable: table, order: activeOrder });
    }
  };

  const handleTableSelect = (toTable: Table) => {
    setConfirmTableChange(toTable);
  };

  const handleTableChange = async () => {
    if (!changeTableDialog || !confirmTableChange) return;

    try {
      await updateOrder(changeTableDialog.order.id, {
        tableId: confirmTableChange.id,
        tableNumber: confirmTableChange.number,
      });
      setConfirmTableChange(null);
      setChangeTableDialog(null);
    } catch (error) {
      console.error('Failed to change table:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to change table. Please try again.' });
    }
  };

  const handlePrintAndComplete = async (table?: Table) => {
    const targetTable = table || billDialogTable;
    if (!targetTable || isPrinting) return;

    const activeOrder = getActiveOrderByTable(targetTable.id);
    if (!activeOrder) return;

    const subtotal = activeOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity), 0);
    const tax = taxEnabled ? activeOrder.items.reduce((sum: number, oi: any) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (oi.item.price * oi.quantity * taxPercent / 100);
    }, 0) : 0;
    const total = subtotal + tax;
    const invoiceNo = `INV-${Date.now()}`;

    // Pre-check: no printer configured
    if (!currentStore?.printerName) {
      setPrinterConfirm({
        show: true,
        title: 'Printer Not Available',
        message: 'No printer is configured. Keep order on table?',
        onConfirm: () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
        },
      });
      return;
    }

    setIsPrinting(true);

    try {
      // Print invoice via printer service
      const printItems = activeOrder.items.map((oi: any) => {
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

      const taxable = printItems.reduce((sum: number, item: any) => sum + item.amount, 0);
      const actualTax = printItems.reduce((sum: number, item: any) => sum + (item.amount * item.tax_percent / 100), 0);
      const cgst = actualTax / 2;
      const sgst = actualTax / 2;

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
      } catch (printError) {
        console.error('Failed to print invoice:', printError);
        setIsPrinting(false);
        setPrinterConfirm({
          show: true,
          title: 'Printer Not Working',
          message: 'Failed to print the bill. Keep order on table?',
          onConfirm: () => {
            setPrinterConfirm(p => ({ ...p, show: false }));
          },
        });
        return;
      }

      // Print succeeded - create bill and complete order
      await createBill({
        orderId: activeOrder.id,
        tableNumber: targetTable.number,
        invoiceNo,
        subtotal,
        taxTotal: tax,
        discount: 0,
        total,
        paymentMethod,
        customerName: 'Walk-in Customer',
      });

      await completeOrder(activeOrder.id, paymentMethod);

      setBillDialogTable(null);
    } catch (error) {
      console.error('Failed to print and complete:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to complete order. Please try again.' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.number) return;

    setIsAddingTable(true);
    try {
      await createTable({
        number: parseInt(newTable.number),
        seats: newTable.seats,
        position: { x: 0, y: 0 },
        ...(newTable.section ? { section: newTable.section } : {}),
      });
      setShowAddModal(false);
      setNewTable({ number: '', seats: 4, section: '' });
    } catch (error) {
      console.error('Failed to add table:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to add table. Please try again.' });
    } finally {
      setIsAddingTable(false);
    }
  };

  const handleDeleteTable = (table: Table) => {
    setDeleteConfirmTable(table);
  };

  const confirmDeleteTable = async () => {
    if (!deleteConfirmTable) return;
    const id = deleteConfirmTable.id;
    setDeleteConfirmTable(null);
    setLoadingTableId(id);
    try {
      await deleteTable(id);
    } finally {
      setLoadingTableId(null);
    }
  };

  // --- Section management ---
  const handleAddSection = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    setSectionLoading(true);
    try {
      await createTableSection(name);
      setNewSectionName('');
    } catch (error) {
      console.error('Failed to add section:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to add section. Please try again.' });
    } finally {
      setSectionLoading(false);
    }
  };

  const handleRenameSection = async (oldName: string) => {
    const newName = editingSectionValue.trim();
    if (!newName || newName === oldName) {
      setEditingSection(null);
      return;
    }
    setSectionLoading(true);
    try {
      // oldName "" means the default (NULL) section — but we display "Ground Floor".
      // The backend treats "" as NULL. We need to send the actual stored value.
      const actualOldName = oldName === 'Ground Floor' ? '' : oldName;
      await renameTableSection(actualOldName, newName);
      setEditingSection(null);
      setEditingSectionValue('');
      // If the active section was the renamed one, switch to the new name
      if (activeSection === oldName) setActiveSection(newName);
    } finally {
      setSectionLoading(false);
    }
  };

  const handleDeleteSection = async () => {
    if (!sectionToDelete) return;
    const name = sectionToDelete;
    setSectionToDelete(null);
    setSectionLoading(true);
    try {
      const actualName = name === 'Ground Floor' ? '' : name;
      await deleteTableSection(actualName);
      if (activeSection === name) setActiveSection('all');
    } finally {
      setSectionLoading(false);
    }
  };

  const billDialogOrder = billDialogTable ? getActiveOrderByTable(billDialogTable.id) : null;
  const previewOrder = previewTable ? getActiveOrderByTable(previewTable.id) : null;
  const billDialogTotal = billDialogOrder ?
    billDialogOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity), 0) +
    (taxEnabled ? billDialogOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity * (oi.item.taxPercent || 0) / 100), 0) : 0)
    : 0;

  // Sections come from the table_sections catalog (independent of tables).
  // We merge in any sections still referenced by tables so nothing is hidden
  // if the catalog and tables drift out of sync, plus the implicit "Ground
  // Floor" default used for tables with no section assigned.
  const sections = React.useMemo(() => {
    const set = new Set<string>();
    tableSections.forEach(s => set.add(s.name));
    tables.forEach(t => {
      if (t.section) set.add(t.section);
      else set.add('Ground Floor');
    });
    return Array.from(set);
  }, [tableSections, tables]);

  const filteredTables = tables
    .filter(t => activeSection === 'all' || (t.section || 'Ground Floor') === activeSection)
    .filter(t => statusFilter === 'all' || (statusFilter === 'occupied' ? !!getActiveOrderByTable(t.id) : !getActiveOrderByTable(t.id)))
    .filter(t => !searchQuery.trim() || `table ${t.number} ${t.section || 'Ground Floor'}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => a.number - b.number);

  const occupiedCount = tables.filter(t => getActiveOrderByTable(t.id)).length;
  const vacantCount = tables.length - occupiedCount;

  const resetFilters = () => { setSearchQuery(''); setActiveSection('all'); setStatusFilter('all'); };
  useEffect(() => { setKbFocusedIndex(-1); }, [searchQuery, activeSection, statusFilter, currentStoreId]);
  useEffect(() => { resetFilters(); }, [currentStoreId]);

  // Keep keyboard focus index in range when the filtered list changes.
  useEffect(() => {
    setKbFocusedIndex(idx => {
      if (filteredTables.length === 0) return -1;
      if (idx < 0 || idx >= filteredTables.length) return -1;
      return idx;
    });
  }, [filteredTables.length]);

  const anyModalOpen = !!(
    billDialogTable || confirmTableChange || changeTableDialog || deleteConfirmTable ||
    showAddModal || showSectionsModal || showStatusDropdown || showShortcutsHelp ||
    printerConfirm.show || errorDialog.show || sectionToDelete || previewTable
  );

  // Close the top-most open modal/dialog (used by Esc).
  const closeTopModal = useCallback(() => {
    if (showShortcutsHelp) { setShowShortcutsHelp(false); return; }
    if (previewTable) { setPreviewTable(null); return; }
    if (printerConfirm.show) { setPrinterConfirm(p => ({ ...p, show: false })); return; }
    if (errorDialog.show) { setErrorDialog({ show: false, message: '' }); return; }
    if (sectionToDelete) { setSectionToDelete(null); return; }
    if (deleteConfirmTable) { setDeleteConfirmTable(null); return; }
    if (billDialogTable) { if (!isPrinting) setBillDialogTable(null); return; }
    if (confirmTableChange) { setConfirmTableChange(null); return; }
    if (changeTableDialog) { setChangeTableDialog(null); return; }
    if (showStatusDropdown) { setShowStatusDropdown(false); return; }
    if (showSectionsModal) { setShowSectionsModal(false); return; }
    if (showAddModal) { setShowAddModal(false); return; }
  }, [showShortcutsHelp, previewTable, printerConfirm.show, errorDialog.show, sectionToDelete, deleteConfirmTable, billDialogTable, isPrinting, confirmTableChange, changeTableDialog, showStatusDropdown, showSectionsModal, showAddModal]);

  const openFocusedTable = useCallback((table: Table) => {
    if (checkingTableId) return;
    setCheckingTableId(table.id);
    setCheckingTableId(null);
    navigate(`/order/${table.id}`);
  }, [checkingTableId, navigate]);

  // Keyboard shortcuts for the Tables page.
  const tablesShortcuts: ShortcutBinding[] = [
    { key: '?', modifiers: { shift: true }, handler: () => setShowShortcutsHelp(true), preventDefault: true },
    { key: 'Escape', handler: () => closeTopModal(), allowInInput: true },
    { key: 'n', handler: () => { if (!anyModalOpen) setShowAddModal(true); }, preventDefault: true },
    { key: 'p', handler: () => { if (!anyModalOpen) navigate('/parcel-order'); }, preventDefault: true },
    { key: 'v', handler: () => { if (!anyModalOpen) setViewMode(v => v === 'layout' ? 'list' : 'layout'); } },
    { key: 'd', handler: () => { if (!anyModalOpen && isAdmin) setDeleteMode(m => !m); }, preventDefault: true },
    {
      key: 'f',
      handler: () => {
        if (anyModalOpen) return;
        setStatusFilter(s => s === 'all' ? 'vacant' : s === 'vacant' ? 'occupied' : 'all');
      },
      preventDefault: true,
    },
    {
      key: 'ArrowDown',
      handler: () => {
        if (anyModalOpen) return;
        setKbFocusedIndex(idx => {
          if (filteredTables.length === 0) return -1;
          return idx < 0 ? 0 : Math.min(idx + 1, filteredTables.length - 1);
        });
      },
    },
    {
      key: 'ArrowUp',
      handler: () => {
        if (anyModalOpen) return;
        setKbFocusedIndex(idx => {
          if (filteredTables.length === 0) return -1;
          return idx <= 0 ? 0 : idx - 1;
        });
      },
    },
    {
      key: 'ArrowRight',
      handler: () => {
        if (anyModalOpen) return;
        setKbFocusedIndex(idx => {
          if (filteredTables.length === 0) return -1;
          return idx < 0 ? 0 : Math.min(idx + 1, filteredTables.length - 1);
        });
      },
    },
    {
      key: 'ArrowLeft',
      handler: () => {
        if (anyModalOpen) return;
        setKbFocusedIndex(idx => {
          if (filteredTables.length === 0) return -1;
          return idx <= 0 ? 0 : idx - 1;
        });
      },
    },
    {
      key: 'Enter',
      handler: (e) => {
        // Bill dialog open -> confirm print & complete.
        if (billDialogTable) {
          if (!isPrinting) handlePrintAndComplete();
          return;
        }
        if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
        if (anyModalOpen) return;
        const focused = kbFocusedIndex >= 0 ? filteredTables[kbFocusedIndex] : undefined;
        if (focused) openFocusedTable(focused);
      },
    },
    // Number keys 1-9 -> jump to table with that number.
    ...(['1','2','3','4','5','6','7','8','9'] as const).map(digit => ({
      key: digit,
      handler: () => {
        if (anyModalOpen) return;
        const target = filteredTables.find(t => String(t.number) === digit);
        if (target) openFocusedTable(target);
      },
    })),
  ];
  useKeyboardShortcuts(tablesShortcuts);

  const tablesShortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation',
      entries: [
        { binding: { key: 'n' }, description: 'Add new table' },
        { binding: { key: 'p' }, description: 'Open Parcel Order' },
        { binding: { key: 'v' }, description: 'Toggle layout / list view' },
        { binding: { key: 'd' }, description: 'Toggle delete mode (admin)' },
        { binding: { key: 'f' }, description: 'Cycle status filter' },
        { binding: { key: '?', modifiers: { shift: true } }, description: 'Show this help' },
      ],
    },
    {
      title: 'Tables',
      entries: [
        { binding: { key: 'ArrowDown' }, description: 'Move focus down' },
        { binding: { key: 'ArrowUp' }, description: 'Move focus up' },
        { binding: { key: 'ArrowRight' }, description: 'Move focus right' },
        { binding: { key: 'ArrowLeft' }, description: 'Move focus left' },
        { binding: { key: 'Enter' }, description: 'Open focused table' },
        { binding: { key: '1' }, description: 'Open table #1 (1-9 jumps to table)' },
      ],
    },
    {
      title: 'Dialogs',
      entries: [
        { binding: { key: 'Enter' }, description: 'Confirm bill dialog (print & complete)' },
        { binding: { key: 'Escape' }, description: 'Close top dialog / help' },
      ],
    },
  ];

  const renderTableActions = (table: Table) => (
    <div className="tables-card-actions">
      {getActiveOrderByTable(table.id) && <>
        <button type="button" className="tables-action tables-action-info" data-tooltip="Preview" aria-label={`Preview order for Table ${table.number}`} onClick={e => { e.stopPropagation(); setPreviewTable(table); }}><Eye size={15} /><span className="tables-action-label">Preview</span></button>
        <button type="button" className="tables-action tables-action-primary" data-tooltip="Bill" aria-label={`Print bill for Table ${table.number}`} onClick={e => handleBillClick(e, table)}><Printer size={15} /><span className="tables-action-label">Bill</span></button>
        <button type="button" className="tables-action tables-action-secondary" data-tooltip="Move" aria-label={`Move order from Table ${table.number}`} onClick={e => handleChangeTableClick(e, table)}><ArrowRightLeft size={15} /><span className="tables-action-label">Move</span></button>
      </>}
      {isAdmin && deleteMode && <button type="button" className="tables-action tables-action-danger" data-tooltip="Delete" aria-label={`Delete Table ${table.number}`} disabled={loadingTableId === table.id} onClick={() => handleDeleteTable(table)}>{loadingTableId === table.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}<span className="tables-action-label">Delete</span></button>}
    </div>
  );

  return (
    <>
      <div className="tables-workspace">
        <div className="tables-heading">
          <div className="tables-summary" role="group" aria-label="Filter tables by status">
            {([
              { filter: 'all', label: 'All tables', count: tables.length, icon: Grid3X3 },
              { filter: 'vacant', label: 'Available', count: vacantCount, icon: CheckCircle2 },
              { filter: 'occupied', label: 'Occupied', count: occupiedCount, icon: Clock },
            ] as const).map(({ filter, label, count, icon: Icon }) => <button type="button" key={filter} className={`tables-summary-card ${filter} ${statusFilter === filter ? 'is-selected' : ''}`} aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)}><span className="tables-summary-icon"><Icon size={14} /></span><span className="tables-summary-copy"><span>{label}</span><strong>{count}</strong></span></button>)}
          </div>
          <div className="tables-heading-actions">
            <div className="tables-search"><Search size={18} aria-hidden="true" /><input aria-label="Search tables" type="search" placeholder="Search tables..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />{searchQuery && <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={16} /></button>}</div>
            <div className="tables-view-switch" role="group" aria-label="Table view"><button type="button" aria-label="Grid view" title="Grid view" aria-pressed={viewMode === 'layout'} className={viewMode === 'layout' ? 'is-selected' : ''} onClick={() => setViewMode('layout')}><Grid3X3 size={17} /></button><button type="button" aria-label="List view" title="List view" aria-pressed={viewMode === 'list'} className={viewMode === 'list' ? 'is-selected' : ''} onClick={() => setViewMode('list')}><List size={18} /></button></div>
            <button type="button" className="tables-control tables-primary" onClick={() => navigate('/parcel-order')}><Package size={18} /> Parcel order</button>
            <div className="tables-menu" ref={tableMenuRef}>
              <button type="button" className="tables-control tables-menu-trigger" aria-label="Table actions" title="Table actions" aria-haspopup="menu" aria-expanded={showTableMenu} onClick={() => setShowTableMenu(open => !open)}><ChevronDown size={18} /></button>
              {showTableMenu && <div className="tables-menu-list" role="menu">
                <button type="button" role="menuitem" className="tables-menu-item" onClick={() => { setShowAddModal(true); setShowTableMenu(false); }}><Plus size={15} /> Add table</button>
                {isAdmin && <button type="button" role="menuitem" className={`tables-menu-item ${deleteMode ? 'is-active' : ''}`} onClick={() => { setDeleteMode(mode => !mode); setShowTableMenu(false); }}><Trash2 size={15} /> {deleteMode ? 'Done managing' : 'Manage tables'}</button>}
              </div>}
            </div>
            <button type="button" className="tables-control tables-help" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShowShortcutsHelp(true)}><HelpCircle size={18} /></button>
          </div>
        </div>
        <section className="tables-panel" aria-label="Dining tables">
          <div className="tables-results-heading"><h3>{activeSection === 'all' ? 'All sections' : activeSection}<span>{filteredTables.length} {filteredTables.length === 1 ? 'table' : 'tables'}</span></h3></div>
          {deleteMode && isAdmin && <div className="tables-manage-notice"><Trash2 size={16} /><span>Table management is on. Choose Delete to remove a table; you’ll be asked to confirm.</span><button type="button" onClick={() => setDeleteMode(false)}>Done</button></div>}
          {filteredTables.length === 0 ? <div className="tables-empty"><span className="tables-empty-icon">{tables.length ? <Search size={28} /> : <Grid3X3 size={28} />}</span><h3>{tables.length ? 'No tables match your filters' : 'Your dining room starts here'}</h3><p>{tables.length ? 'Try another table number, section, or status.' : 'Add your first table to start taking dine-in orders.'}</p><button type="button" className="tables-control tables-primary" onClick={tables.length ? resetFilters : () => setShowAddModal(true)}>{tables.length ? 'Clear filters' : 'Add your first table'}</button></div> : viewMode === 'layout' ? <div className="tables-card-grid">{filteredTables.map((table, idx) => {
            const activeOrder = getActiveOrderByTable(table.id);
            return <article key={table.id} className={`tables-dining-card ${activeOrder ? 'is-occupied' : ''} ${idx === kbFocusedIndex ? 'is-kb-focused' : ''}`}>
              <button type="button" className="tables-card-open" onClick={() => handleTableClick(table)} aria-label={`${activeOrder ? 'View order for' : 'Start order at'} Table ${table.number}`}>
                <span className="tables-card-top"><span className="tables-card-title">Table <strong>{table.number}</strong></span><span className={`tables-status ${activeOrder ? 'occupied' : 'available'}`}><span />{activeOrder ? 'Occupied' : 'Available'}</span></span>
                <span className="tables-card-meta"><Users size={14} />{table.seats} seats<span className="tables-meta-divider">·</span><span className="tables-section-name">{table.section || 'Ground Floor'}</span></span>
                <span className="tables-card-order">{activeOrder ? <><strong>{formatCurrency(activeOrder.totalAmount)}</strong><OrderTimer createdAt={activeOrder.createdAt} className="tables-elapsed" /></> : <span className="tables-start-label"><Plus size={13} /> Start order</span>}</span>
              </button>
              {((!!activeOrder) || (isAdmin && deleteMode)) && renderTableActions(table)}
            </article>;
          })}</div> : <div className="tables-list-scroll"><table className="tables-list"><thead><tr><th scope="col">Table</th><th scope="col">Section</th><th scope="col">Seats</th><th scope="col">Status</th><th scope="col">Current order</th><th scope="col">Actions</th></tr></thead><tbody>{filteredTables.map((table, idx) => {
            const activeOrder = getActiveOrderByTable(table.id);
            return <tr key={table.id} className={idx === kbFocusedIndex ? 'is-kb-focused' : ''}><td><button type="button" className="tables-list-open" onClick={() => handleTableClick(table)}>Table {table.number}<ArrowUpRight size={15} /></button></td><td>{table.section || 'Ground Floor'}</td><td>{table.seats} seats</td><td><span className={`tables-status ${activeOrder ? 'occupied' : 'available'}`}><span />{activeOrder ? 'Occupied' : 'Available'}</span></td><td>{activeOrder ? <div className="tables-list-order"><strong>{formatCurrency(activeOrder.totalAmount)}</strong><OrderTimer createdAt={activeOrder.createdAt} className="tables-elapsed" /></div> : <span className="tables-muted">No active order</span>}</td><td>{activeOrder || (isAdmin && deleteMode) ? renderTableActions(table) : <button type="button" className="tables-action" onClick={() => handleTableClick(table)}><Plus size={15} /> Start order</button>}</td></tr>;
          })}</tbody></table></div>}
        </section>
      </div>

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Table</h2>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddTable}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Table Number</label>
                    <input
                      type="number"
                      min="1"
                      value={newTable.number}
                      onChange={e => setNewTable({ ...newTable, number: e.target.value })}
                      placeholder="e.g., 1"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Seats</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={newTable.seats}
                      onChange={e => setNewTable({ ...newTable, seats: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isAddingTable}
                  loadingText="Adding..."
                >
                  Add Table
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={isAddingTable}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Preview Modal */}
      {previewTable && previewOrder && (
        <div className="modal-overlay" onClick={() => setPreviewTable(null)}>
          <div className="modal tables-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="tables-preview-head">
              <span className="tables-preview-chip">T{previewTable.number}</span>
              <div className="tables-preview-headtext">
                <h2>Order preview</h2>
                <span>Table {previewTable.number} · {previewTable.section || 'Ground Floor'}</span>
              </div>
              <button className="close-btn" onClick={() => setPreviewTable(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="tables-preview-statusbar">
              <span className="tables-status occupied"><span />Occupied</span>
              <OrderTimer createdAt={previewOrder.createdAt} className="tables-elapsed" />
              <span className="tables-preview-count">{previewOrder.items.length} {previewOrder.items.length === 1 ? 'item' : 'items'}</span>
            </div>
            <div className="tables-preview-items">
              {previewOrder.items.map((oi: any, index: number) => (
                <div key={index} className="tables-preview-item">
                  <span className="tables-preview-qty">{oi.quantity}×</span>
                  <div className="tables-preview-item-info">
                    <span className="tables-preview-item-name">{oi.item.name}</span>
                    <span className="tables-preview-item-sub">{formatCurrency(oi.item.price)} each{oi.notes ? ` · ${oi.notes}` : ''}</span>
                  </div>
                  <span className="tables-preview-item-total">{formatCurrency(oi.quantity * oi.item.price)}</span>
                </div>
              ))}
            </div>
            <div className="tables-preview-summary">
              <div className="tables-preview-summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(previewOrder.items.reduce((sum: number, oi: any) => sum + oi.item.price * oi.quantity, 0))}</span>
              </div>
              {previewOrder.discountAmount > 0 && (
                <div className="tables-preview-summary-row">
                  <span>Discount</span>
                  <span>-{formatCurrency(previewOrder.discountAmount)}</span>
                </div>
              )}
              {taxEnabled && previewOrder.taxAmount > 0 && (
                <div className="tables-preview-summary-row">
                  <span>Tax</span>
                  <span>{formatCurrency(previewOrder.taxAmount)}</span>
                </div>
              )}
              <div className="tables-preview-summary-row tables-preview-total">
                <span>TOTAL</span>
                <span>{formatCurrency(previewOrder.totalAmount)}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={e => { setPreviewTable(null); handleBillClick(e, previewTable); }}>
                <Printer size={16} /> Bill
              </button>
              <button className="btn btn-secondary" onClick={() => { const table = previewTable; setPreviewTable(null); handleTableClick(table); }}>
                Open order
              </button>
              <button className="btn btn-danger" onClick={() => setPrinterConfirm({
                show: true,
                title: 'Cancel Order',
                message: `Are you sure you want to cancel the order for Table ${previewTable.number}?`,
                onConfirm: async () => {
                  setPrinterConfirm(p => ({ ...p, show: false }));
                  try {
                    await cancelOrder(previewOrder.id);
                    setPreviewTable(null);
                  } catch (error: any) {
                    setErrorDialog({ show: true, message: error.message || 'Failed to cancel order' });
                  }
                },
              })}>
                Cancel order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Dialog */}
      {billDialogTable && billDialogOrder && (
        <div className="modal-overlay" onClick={() => !isPrinting && setBillDialogTable(null)}>
          <div className="modal bill-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Print Bill - Table {billDialogTable.number}</h2>
              <button 
                className="close-btn" 
                onClick={() => !isPrinting && setBillDialogTable(null)}
                disabled={isPrinting}
              >
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="bill-total-display">
                <span className="bill-total-label">Total Amount</span>
                <span className="bill-total-value">{formatCurrency(billDialogTotal)}</span>
              </div>
              
              <p className="bill-hint">Press Enter or click Print to complete</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-primary btn-lg"
                onClick={() => handlePrintAndComplete()}
              >
                {isPrinting ? 'Completing...' : 'Complete Order'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setBillDialogTable(null)}
                disabled={isPrinting}
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
      <ConfirmDialog
        isOpen={!!deleteConfirmTable}
        title="Delete Table"
        message={`Are you sure you want to delete Table ${deleteConfirmTable?.number}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteTable}
        onCancel={() => setDeleteConfirmTable(null)}
      />

      {/* Change Table Dialog */}
      {changeTableDialog && !confirmTableChange && (
        <div className="modal-overlay" onClick={() => setChangeTableDialog(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Table</h2>
              <button className="close-btn" onClick={() => setChangeTableDialog(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--gray-600)' }}>
                Select a table to move the order from <strong>Table {changeTableDialog.fromTable.number}</strong>:
              </p>
              <div className="change-table-grid">
                {tables
                  .filter(t => t.id !== changeTableDialog.fromTable.id && !getActiveOrderByTable(t.id))
                  .sort((a, b) => a.number - b.number)
                  .map(table => (
                    <button
                      key={table.id}
                      className="change-table-option"
                      onClick={() => handleTableSelect(table)}
                    >
                      <span className="change-table-number">{table.number}</span>
                      <span className="change-table-seats">{table.seats} seats</span>
                    </button>
                  ))}
                {tables.filter(t => t.id !== changeTableDialog.fromTable.id && !getActiveOrderByTable(t.id)).length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '2rem' }}>
                    No available tables to move to
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setChangeTableDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Table Change Dialog */}
      {changeTableDialog && confirmTableChange && (
        <div className="modal-overlay" onClick={() => setConfirmTableChange(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Table Change</h2>
              <button className="close-btn" onClick={() => setConfirmTableChange(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                background: 'rgba(33,150,243, 0.1)', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '0 auto 1.5rem'
              }}>
                <ArrowRightLeft size={32} style={{ color: 'var(--info)' }} />
              </div>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                Move order from <strong>Table {changeTableDialog.fromTable.number}</strong> to <strong>Table {confirmTableChange.number}</strong>?
              </p>
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
                This will release Table {changeTableDialog.fromTable.number} and assign the order to Table {confirmTableChange.number}.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmTableChange(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleTableChange}>
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}

      <BillModal />

      <ShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        groups={tablesShortcutGroups}
      />
    </>
  );
};

export default Tables;
