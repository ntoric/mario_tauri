import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Grid3X3, List, Printer, X, ArrowRightLeft, Loader2, Package, Filter, ChevronDown, HelpCircle, Combine, Eye, MoreVertical, Layers, Pencil, Check, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency, formatCurrencyInt } from '../utils/currency';
import { orderItemUnitPrice } from '../utils/order';
import { isTaxEnabled } from '../utils/tax';
import { printerService } from '../services/printer';
import { getTableStatusWsUrl } from '../services/realtime';
import { Button } from '../components/ui/Button';
import BillModal from './BillModal';
import { ConfirmDialog } from './ConfirmDialog';
import OrderTimer from './OrderTimer';
import ShortcutsHelp, { ShortcutGroup } from './ShortcutsHelp';
import { useKeyboardShortcuts, ShortcutBinding } from '../hooks/useKeyboardShortcut';
import notify from '../utils/toast';
import type { Table } from '../types';

// Tables without an explicit section (NULL in the DB) belong to the store's
// default section. Falls back to this label when no catalog row is flagged.
const DEFAULT_SECTION = 'Section 1';

const Tables: React.FC = () => {
  const { stores, tables, tableSections, getActiveOrderByTable, createTable, deleteTable, createBill, completeOrder, updateOrder, mergeOrders, cancelOrder, fetchTables, fetchTableSections, fetchOrders, fetchCategories, fetchItems, createTableSection, renameTableSection, deleteTableSection, setDefaultTableSection } = useDataStore();
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
    fetchOrders({ status: 'active' }); // Only fetch active orders for Tables page
    fetchCategories();
    fetchItems();
  }, [fetchTables, fetchTableSections, fetchOrders, fetchCategories, fetchItems]);

  // Realtime updates via websocket
  useEffect(() => {
    if (!currentStoreId) return;

    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let isClosed = false;
    let isSyncing = false;

    const syncTablesAndOrders = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        await Promise.all([
          fetchTables(),
          fetchOrders({ status: 'active' }), // Only fetch active orders
        ]);
      } finally {
        isSyncing = false;
      }
    };

    const connect = () => {
      const url = getTableStatusWsUrl(currentStoreId);
      if (!url) return;

      ws = new WebSocket(url);

      ws.onopen = () => {
        // Connection established
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg?.type === 'table_status_update') {
            void syncTablesAndOrders();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (isClosed) return;
        retryTimer = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      isClosed = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      ws?.close();
    };
  }, [currentStoreId, fetchOrders, fetchTables]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTable, setNewTable] = useState({ number: '', name: '', seats: 4, section: '' });
  const [checkingTableId, setCheckingTableId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteConfirmTable, setDeleteConfirmTable] = useState<Table | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'vacant' | 'occupied'>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingSectionValue, setEditingSectionValue] = useState('');
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);

  // Keyboard navigation state
  const [kbFocusedIndex, setKbFocusedIndex] = useState<number>(-1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Bill dialog state
  const [billDialogTable, setBillDialogTable] = useState<Table | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPrintingOnly, setIsPrintingOnly] = useState(false);

  // Change table dialog state
  const [changeTableDialog, setChangeTableDialog] = useState<{ fromTable: Table; order: any } | null>(null);
  const [confirmTableChange, setConfirmTableChange] = useState<Table | null>(null);

  // Combine bill dialog state
  const [combineDialog, setCombineDialog] = useState<{ intoTable: Table; order: any } | null>(null);
  const [confirmCombineTable, setConfirmCombineTable] = useState<Table | null>(null);
  const [isCombining, setIsCombining] = useState(false);

  // Order preview dialog state
  const [previewTable, setPreviewTable] = useState<Table | null>(null);
  const [cancelOrderConfirm, setCancelOrderConfirm] = useState<any | null>(null);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);

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

  // Display label: alphanumeric name when set, otherwise the numeric table number.
  const tableLabel = (t: Table) => t.name || String(t.number);

  // The catalog section flagged is_default is the bucket for tables with no
  // explicit section; falls back to "Section 1" when nothing is flagged.
  const defaultSectionName = tableSections.find(s => s.isDefault)?.name || DEFAULT_SECTION;
  const sectionNameOf = useCallback(
    (t: Table) => t.section || defaultSectionName,
    [defaultSectionName]
  );
  const catalogSectionNames = React.useMemo(
    () => new Set(tableSections.map(s => s.name)),
    [tableSections]
  );

  // Set page header
  useEffect(() => {
    setHeaderContent({
      title: 'Tables',
      subtitle: 'Manage tables and orders',
      actions: (
        <>
          <button className="btn btn-primary" onClick={() => navigate('/parcel-order')}>
            <Package size={18} />
            Parcel Order
          </button>
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'layout' ? 'active' : ''}`}
              onClick={() => setViewMode('layout')}
              title="Layout View"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={18} />
            </button>
          </div>
          <div className="header-dropdown">
            <button
              className={`btn btn-icon ${deleteMode ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => setShowTableMenu(s => !s)}
              title="Table actions"
            >
              <MoreVertical size={18} />
            </button>
            {showTableMenu && (
              <>
                <div className="header-dropdown-overlay" onClick={() => setShowTableMenu(false)} />
                <div className="header-dropdown-menu">
                  <button
                    className="header-dropdown-option"
                    onClick={() => { setShowTableMenu(false); setShowAddModal(true); }}
                  >
                    <Plus size={14} />
                    Add Table
                  </button>
                  <button
                    className="header-dropdown-option"
                    onClick={() => { setShowTableMenu(false); setShowSectionsModal(true); }}
                  >
                    <Layers size={14} />
                    Manage Sections
                  </button>
                  {isAdmin && (
                    <button
                      className={`header-dropdown-option ${deleteMode ? 'danger' : ''}`}
                      onClick={() => { setShowTableMenu(false); setDeleteMode(m => !m); }}
                    >
                      <Trash2 size={14} />
                      {deleteMode ? 'Done' : 'Delete Tables'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setShowShortcutsHelp(true)}
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle size={18} />
          </button>
        </>
      ),
    });
  }, [viewMode, isAdmin, setHeaderContent, navigate, user, deleteMode, showTableMenu]);

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
      }); // Optimistic update will handle refresh
      setConfirmTableChange(null);
      setChangeTableDialog(null);
    } catch (error) {
      console.error('Failed to change table:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to change table. Please try again.' });
    }
  };

  const handleCombineClick = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    const activeOrder = getActiveOrderByTable(table.id);
    if (activeOrder) {
      setCombineDialog({ intoTable: table, order: activeOrder });
    }
  };

  const handlePreviewClick = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    const activeOrder = getActiveOrderByTable(table.id);
    if (activeOrder) {
      setPreviewTable(table);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelOrderConfirm) return;
    setIsCancellingOrder(true);
    try {
      await cancelOrder(cancelOrderConfirm.id, undefined); // Optimistic update will handle refresh
      setCancelOrderConfirm(null);
      setPreviewTable(null);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to cancel order. Please try again.' });
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const handleCombine = async () => {
    if (!combineDialog || !confirmCombineTable) return;
    const mergeOrder = getActiveOrderByTable(confirmCombineTable.id);
    if (!mergeOrder) {
      setConfirmCombineTable(null);
      setCombineDialog(null);
      setErrorDialog({ show: true, message: 'That table no longer has an active order.' });
      return;
    }

    setIsCombining(true);
    try {
      await mergeOrders(combineDialog.order.id, mergeOrder.id);
      setConfirmCombineTable(null);
      setCombineDialog(null);
    } catch (error) {
      console.error('Failed to combine orders:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to combine orders. Please try again.' });
    } finally {
      setIsCombining(false);
    }
  };

  const printOrderInvoice = async (activeOrder: any, invoiceNo: string, total: number) => {
    const printItems = activeOrder.items.map((oi: any) => {
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

  const handlePrintAndComplete = async (table?: Table) => {
    const targetTable = table || billDialogTable;
    if (!targetTable || isPrinting) return;

    const activeOrder = getActiveOrderByTable(targetTable.id);
    if (!activeOrder) return;

    const subtotal = activeOrder.items.reduce((sum: number, oi: any) => sum + (orderItemUnitPrice(oi) * oi.quantity), 0);
    const tax = taxEnabled ? activeOrder.items.reduce((sum: number, oi: any) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (orderItemUnitPrice(oi) * oi.quantity * taxPercent / 100);
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
      try {
        await printOrderInvoice(activeOrder, invoiceNo, total);
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
        tableName: targetTable.name,
        invoiceNo,
        subtotal,
        taxTotal: tax,
        discount: 0,
        total,
        paymentMethod,
        customerName: 'Walk-in Customer',
      });

      await completeOrder(activeOrder.id, paymentMethod); // Optimistic update frees the table immediately

      setBillDialogTable(null);
    } catch (error) {
      console.error('Failed to print and complete:', error);
      setErrorDialog({ show: true, message: (error as Error).message || 'Failed to complete order. Please try again.' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintOnly = async () => {
    if (!billDialogTable || isPrinting || isPrintingOnly) return;

    const activeOrder = getActiveOrderByTable(billDialogTable.id);
    if (!activeOrder) return;

    if (!currentStore?.printerName) {
      notify.warning('No printer configured. Set one up in Settings.');
      return;
    }

    const subtotal = activeOrder.items.reduce((sum: number, oi: any) => sum + (orderItemUnitPrice(oi) * oi.quantity), 0);
    const tax = taxEnabled ? activeOrder.items.reduce((sum: number, oi: any) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (orderItemUnitPrice(oi) * oi.quantity * taxPercent / 100);
    }, 0) : 0;
    const total = subtotal + tax;
    const invoiceNo = `INV-${Date.now()}`;

    setIsPrintingOnly(true);
    try {
      await printOrderInvoice(activeOrder, invoiceNo, total);
      notify.success('Bill printed');
    } catch (printError) {
      console.error('Failed to print bill:', printError);
      notify.error('Failed to print bill. Check your printer connection and settings.');
    } finally {
      setIsPrintingOnly(false);
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newTable.name.trim();
    if (!newTable.number && !trimmedName) return;

    setIsAddingTable(true);
    try {
      await createTable({
        // 0 lets the backend auto-assign the next internal number.
        number: parseInt(newTable.number) || 0,
        ...(trimmedName ? { name: trimmedName } : {}),
        seats: newTable.seats,
        position: { x: 0, y: 0 },
        ...(newTable.section ? { section: newTable.section } : {}),
      });
      notify.success(`Table ${trimmedName || newTable.number} added`);
      setShowAddModal(false);
      setNewTable({ number: '', name: '', seats: 4, section: '' });
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
      notify.success('Table deleted');
    } catch (error) {
      notify.error((error as Error).message || 'Failed to delete table');
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
      notify.success(`Section "${name}" added`);
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
      // oldName "" targets the default (NULL) bucket. Only send "" when the
      // renamed section is that bucket AND has no catalog row — a flagged
      // catalog row renames like a normal section and keeps its default flag.
      const actualOldName = oldName === defaultSectionName && !catalogSectionNames.has(oldName) ? '' : oldName;
      await renameTableSection(actualOldName, newName);
      notify.success(`Section renamed to "${newName}"`);
      setEditingSection(null);
      setEditingSectionValue('');
    } catch (error) {
      notify.error((error as Error).message || 'Failed to rename section');
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
      const actualName = name === defaultSectionName && !catalogSectionNames.has(name) ? '' : name;
      await deleteTableSection(actualName);
      notify.success(`Section "${name}" deleted`);
    } catch (error) {
      notify.error((error as Error).message || 'Failed to delete section');
    } finally {
      setSectionLoading(false);
    }
  };

  const handleSetDefaultSection = async (name: string) => {
    setSectionLoading(true);
    try {
      await setDefaultTableSection(name);
      notify.success(`"${name}" is now the default section`);
    } catch (error) {
      notify.error((error as Error).message || 'Failed to set default section');
    } finally {
      setSectionLoading(false);
    }
  };

  const billDialogOrder = billDialogTable ? getActiveOrderByTable(billDialogTable.id) : null;
  const billDialogTotal = billDialogOrder ?
    billDialogOrder.items.reduce((sum: number, oi: any) => sum + (orderItemUnitPrice(oi) * oi.quantity), 0) +
    (taxEnabled ? billDialogOrder.items.reduce((sum: number, oi: any) => sum + (orderItemUnitPrice(oi) * oi.quantity * (oi.item.taxPercent || 0) / 100), 0) : 0)
    : 0;

  const previewOrder = previewTable ? getActiveOrderByTable(previewTable.id) : null;
  const previewSubtotal = previewOrder ?
    previewOrder.items.reduce((sum: number, oi: any) => sum + (orderItemUnitPrice(oi) * oi.quantity), 0) : 0;
  const previewTax = previewOrder && taxEnabled ?
    previewOrder.items.reduce((sum: number, oi: any) => sum + (orderItemUnitPrice(oi) * oi.quantity * (oi.item.taxPercent || 0) / 100), 0) : 0;

  // Sections come from the table_sections catalog (independent of tables).
  // We merge in any sections still referenced by tables so nothing is hidden
  // if the catalog and tables drift out of sync. The default section — the
  // bucket for tables with no section assigned — is always listed first.
  const sections = React.useMemo(() => {
    const set = new Set<string>();
    tableSections.forEach(s => set.add(s.name));
    tables.forEach(t => {
      if (t.section) set.add(t.section);
    });
    set.delete(defaultSectionName);
    const rest = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return [defaultSectionName, ...rest];
  }, [tableSections, tables, defaultSectionName]);

  // Table counts per section — drives the section filter pills in the toolbar.
  const sectionCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    tables.forEach(t => {
      const name = sectionNameOf(t);
      map.set(name, (map.get(name) || 0) + 1);
    });
    return map;
  }, [tables, sectionNameOf]);

  // Only sections that actually contain tables get a filter pill.
  const pillSections = React.useMemo(() => {
    return sections.filter(name => (sectionCounts.get(name) || 0) > 0);
  }, [sections, sectionCounts]);

  const filteredTables = React.useMemo(() => {
    return tables
      .filter(t => {
        if (sectionFilter !== 'all' && sectionNameOf(t) !== sectionFilter) return false;
        if (statusFilter === 'all') return true;
        const occupied = !!getActiveOrderByTable(t.id);
        return statusFilter === 'occupied' ? occupied : !occupied;
      })
      .sort((a, b) => a.number - b.number);
  }, [tables, statusFilter, sectionFilter, sectionNameOf, getActiveOrderByTable]);

  // Tables grouped per section — each section renders as its own group of rows.
  const groupedTables = React.useMemo(() => {
    return sections
      .map(name => ({ name, tables: filteredTables.filter(t => sectionNameOf(t) === name) }))
      .filter(g => g.tables.length > 0);
  }, [sections, filteredTables, sectionNameOf]);

  // Flat index of each table in filteredTables, used for keyboard focus.
  const tableIndexById = React.useMemo(() => {
    return new Map<string, number>(filteredTables.map((t, i) => [t.id, i]));
  }, [filteredTables]);

  const occupiedCount = tables.filter(t => getActiveOrderByTable(t.id)).length;
  const vacantCount = tables.length - occupiedCount;

  // Reset the section pill filter if its section no longer has any tables.
  useEffect(() => {
    if (sectionFilter !== 'all' && (sectionCounts.get(sectionFilter) || 0) === 0) {
      setSectionFilter('all');
    }
  }, [sectionCounts, sectionFilter]);

  // Keep keyboard focus index in range when the filtered list changes.
  useEffect(() => {
    setKbFocusedIndex(idx => {
      if (filteredTables.length === 0) return -1;
      if (idx < 0 || idx >= filteredTables.length) return -1;
      return idx;
    });
  }, [filteredTables.length]);

  const anyModalOpen = !!(
    billDialogTable || confirmTableChange || changeTableDialog || combineDialog ||
    confirmCombineTable || deleteConfirmTable || previewTable || cancelOrderConfirm ||
    showAddModal || showSectionsModal || showStatusDropdown || showTableMenu ||
    showShortcutsHelp || printerConfirm.show || errorDialog.show || sectionToDelete
  );

  // Close the top-most open modal/dialog (used by Esc).
  const closeTopModal = useCallback(() => {
    if (showShortcutsHelp) { setShowShortcutsHelp(false); return; }
    if (printerConfirm.show) { setPrinterConfirm(p => ({ ...p, show: false })); return; }
    if (errorDialog.show) { setErrorDialog({ show: false, message: '' }); return; }
    if (sectionToDelete) { setSectionToDelete(null); return; }
    if (deleteConfirmTable) { setDeleteConfirmTable(null); return; }
    if (billDialogTable) { if (!isPrinting && !isPrintingOnly) setBillDialogTable(null); return; }
    if (confirmTableChange) { setConfirmTableChange(null); return; }
    if (changeTableDialog) { setChangeTableDialog(null); return; }
    if (confirmCombineTable) { setConfirmCombineTable(null); return; }
    if (combineDialog) { setCombineDialog(null); return; }
    if (cancelOrderConfirm) { if (!isCancellingOrder) setCancelOrderConfirm(null); return; }
    if (previewTable) { setPreviewTable(null); return; }
    if (showTableMenu) { setShowTableMenu(false); return; }
    if (showStatusDropdown) { setShowStatusDropdown(false); return; }
    if (showSectionsModal) { setShowSectionsModal(false); return; }
    if (showAddModal) { setShowAddModal(false); return; }
  }, [showShortcutsHelp, printerConfirm.show, errorDialog.show, sectionToDelete, deleteConfirmTable, billDialogTable, isPrinting, isPrintingOnly, confirmTableChange, changeTableDialog, confirmCombineTable, combineDialog, cancelOrderConfirm, isCancellingOrder, previewTable, showStatusDropdown, showTableMenu, showSectionsModal, showAddModal]);

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
      handler: () => {
        // Bill dialog open -> confirm print & complete.
        if (billDialogTable) {
          if (!isPrinting && !isPrintingOnly) handlePrintAndComplete();
          return;
        }
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

  return (
    <>
      <div className="tables-page">
        {viewMode === 'layout' ? (
          <div className="tables-layout-container">
            {tables.length === 0 ? (
              <div className="empty-state">
                <div className="tables-empty-icon">
                  <Grid3X3 size={30} />
                </div>
                <p>No tables configured</p>
                {isAdmin && (
                  <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: '1rem' }}>
                    Add Your First Table
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Section filter pills + status filter */}
                <div className="tables-section-tabs">
                  <button
                    className={`tables-section-tab ${sectionFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setSectionFilter('all')}
                  >
                    All
                  </button>
                  {pillSections.map(name => (
                    <button
                      key={name}
                      className={`tables-section-tab ${sectionFilter === name ? 'active' : ''}`}
                      onClick={() => setSectionFilter(f => f === name ? 'all' : name)}
                    >
                      {name} <span className="tab-count">{sectionCounts.get(name)}</span>
                    </button>
                  ))}

                  <div className="status-filter-dropdown">
                    <button
                      className={`tables-section-tab status-filter-trigger ${statusFilter !== 'all' ? 'active' : ''}`}
                      onClick={() => setShowStatusDropdown(s => !s)}
                      title="Filter by status"
                    >
                      <Filter size={13} />
                      {statusFilter === 'all' ? 'All Status' : statusFilter === 'vacant' ? `Vacant (${vacantCount})` : `Occupied (${occupiedCount})`}
                      <ChevronDown size={13} />
                    </button>
                    {showStatusDropdown && (
                      <>
                        <div className="status-filter-overlay" onClick={() => setShowStatusDropdown(false)} />
                        <div className="status-filter-menu">
                          <button
                            className={`status-filter-option ${statusFilter === 'all' ? 'active' : ''}`}
                            onClick={() => { setStatusFilter('all'); setShowStatusDropdown(false); }}
                          >
                            All Tables <span className="tab-count">{tables.length}</span>
                          </button>
                          <button
                            className={`status-filter-option ${statusFilter === 'vacant' ? 'active' : ''}`}
                            onClick={() => { setStatusFilter('vacant'); setShowStatusDropdown(false); }}
                          >
                            Vacant <span className="tab-count">{vacantCount}</span>
                          </button>
                          <button
                            className={`status-filter-option ${statusFilter === 'occupied' ? 'active' : ''}`}
                            onClick={() => { setStatusFilter('occupied'); setShowStatusDropdown(false); }}
                          >
                            Occupied <span className="tab-count">{occupiedCount}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {groupedTables.map(group => (
                  <div key={group.name} className="tables-section-group">
                    <div className="tables-section-header">
                      {group.name}
                      <span className="tab-count">{group.tables.length}</span>
                    </div>
                    <div className="tables-layout-grid">
                {group.tables.map((table) => {
                  const idx = tableIndexById.get(table.id) ?? -1;
                  const activeOrder = getActiveOrderByTable(table.id);
                  return (
                    <div
                      key={table.id}
                      className={`table-layout-card ${activeOrder ? 'occupied' : ''} ${idx === kbFocusedIndex ? 'kb-focused' : ''}`}
                      onClick={() => handleTableClick(table)}
                      style={{ animationDelay: `${Math.min(idx, 15) * 25}ms` }}
                    >
                      {checkingTableId === table.id && (
                        <div className="table-checking-overlay">
                          <Loader2 className="animate-spin" style={{ color: 'var(--primary)' }} size={24} />
                        </div>
                      )}
                      {isAdmin && deleteMode && (
                        <button
                          className="table-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTable(table);
                          }}
                          disabled={loadingTableId === table.id}
                        >
                          {loadingTableId === table.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      )}
                      <div className="table-card-head">
                        {activeOrder ? (
                          <OrderTimer createdAt={activeOrder.createdAt} className="table-card-timer" />
                        ) : (
                          <span className="table-status-chip available">Available</span>
                        )}
                      </div>
                      <div className="table-card-body">
                        <div className="table-layout-number">{tableLabel(table)}</div>
                        <div className={`table-card-sub ${activeOrder ? 'amount' : ''}`}>
                          {activeOrder
                            ? `${formatCurrencyInt(activeOrder.totalAmount)} · ${activeOrder.items.length} item${activeOrder.items.length === 1 ? '' : 's'}`
                            : `${table.seats} seats`}
                        </div>
                      </div>
                      {activeOrder && (
                        <div className="table-card-actions">
                          <button
                            className="table-bill-btn new-design"
                            onClick={(e) => handleBillClick(e, table)}
                            data-tooltip="Print Bill"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            className="table-change-btn"
                            onClick={(e) => handleChangeTableClick(e, table)}
                            data-tooltip="Change Table"
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                          <button
                            className="table-combine-btn"
                            onClick={(e) => handleCombineClick(e, table)}
                            data-tooltip="Merge Bill"
                          >
                            <Combine size={14} />
                          </button>
                          <button
                            className="table-preview-btn"
                            onClick={(e) => handlePreviewClick(e, table)}
                            data-tooltip="Preview Order"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Table #</th>
                    <th>Seats</th>
                    <th>Status</th>
                    <th>Current Order</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                {groupedTables.map(group => (
                <tbody key={group.name}>
                  <tr className="tables-section-row">
                    <td colSpan={5}>
                      {group.name} <span className="tab-count">{group.tables.length}</span>
                    </td>
                  </tr>
                  {group.tables.map((table) => {
                    const idx = tableIndexById.get(table.id) ?? -1;
                    const activeOrder = getActiveOrderByTable(table.id);
                    return (
                      <tr
                        key={table.id}
                        className={`clickable-row ${idx === kbFocusedIndex ? 'kb-focused' : ''}`}
                        onClick={() => handleTableClick(table)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong>Table {tableLabel(table)}</strong>
                            {checkingTableId === table.id && (
                              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
                            )}
                          </div>
                        </td>
                        <td>{table.seats} seats</td>
                        <td>
                          <span className={`badge ${activeOrder ? 'badge-warning' : 'badge-success'}`}>
                            {activeOrder ? 'Occupied' : 'Available'}
                          </span>
                        </td>
                        <td>
                          {activeOrder ? (
                            <div>
                              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                {formatCurrency(activeOrder.totalAmount)} ({activeOrder.items.length} items)
                              </span>
                              <div style={{ marginTop: '0.25rem' }}>
                                <OrderTimer createdAt={activeOrder.createdAt} className="list-timer" />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--gray-500)' }}>-</span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="action-btns">
                            {activeOrder && (
                              <>
                                <button
                                  className="action-btn"
                                  style={{ background: 'rgba(245,130,32, 0.1)', color: 'var(--primary)' }}
                                  onClick={(e) => handleBillClick(e as any, table)}
                                  title="Print Bill"
                                >
                                  <Printer size={14} />
                                </button>
                                <button 
                                  className="action-btn" 
                                  style={{ background: 'rgba(33,150,243, 0.1)', color: 'var(--info)' }}
                                  onClick={(e) => handleChangeTableClick(e as any, table)}
                                  title="Change Table"
                                >
                                  <ArrowRightLeft size={14} />
                                </button>
                                <button
                                  className="action-btn"
                                  style={{ background: 'rgba(245,166,35, 0.1)', color: 'var(--warning)' }}
                                  onClick={(e) => handleCombineClick(e as any, table)}
                                  title="Merge Bill"
                                >
                                  <Combine size={14} />
                                </button>
                                <button
                                  className="action-btn"
                                  style={{ background: 'rgba(45,55,72, 0.1)', color: 'var(--secondary)' }}
                                  onClick={(e) => handlePreviewClick(e as any, table)}
                                  title="Preview Order"
                                >
                                  <Eye size={14} />
                                </button>
                              </>
                            )}
                            {isAdmin && deleteMode && (
                              <button 
                                className="action-btn delete" 
                                onClick={() => handleDeleteTable(table)}
                                disabled={loadingTableId === table.id}
                                style={{
                                  opacity: loadingTableId === table.id ? 0.5 : 1,
                                  cursor: loadingTableId === table.id ? 'not-allowed' : 'pointer'
                                }}
                              >
                                {loadingTableId === table.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                ))}
              </table>
            </div>
          </div>
        )}
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
                    <label>Table Name</label>
                    <input
                      type="text"
                      value={newTable.name}
                      onChange={e => setNewTable({ ...newTable, name: e.target.value })}
                      placeholder="e.g., 1A, 2C, 4AA"
                    />
                  </div>
                  <div className="form-group">
                    <label>Table Number</label>
                    <input
                      type="number"
                      min="1"
                      value={newTable.number}
                      onChange={e => setNewTable({ ...newTable, number: e.target.value })}
                      placeholder="Auto if empty"
                    />
                  </div>
                </div>
                <div className="form-row">
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
                  <div className="form-group">
                    <label>Section</label>
                    <select
                      value={newTable.section || defaultSectionName}
                      onChange={e => setNewTable({ ...newTable, section: e.target.value })}
                    >
                      {sections.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
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

      {/* Manage Sections Modal */}
      {showSectionsModal && (
        <div className="modal-overlay" onClick={() => setShowSectionsModal(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Floor Sections</h2>
              <button className="close-btn" onClick={() => setShowSectionsModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="sections-add-row">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSection();
                    }
                  }}
                  placeholder="New section name (e.g., First Floor)"
                  disabled={sectionLoading}
                />
                <Button
                  variant="primary"
                  onClick={handleAddSection}
                  isLoading={sectionLoading}
                  disabled={!newSectionName.trim()}
                  leftIcon={<Plus size={14} />}
                >
                  Add
                </Button>
              </div>
              <div className="sections-list">
                {sections.map(name => {
                  const count = tables.filter(t => sectionNameOf(t) === name).length;
                  const isDefault = name === defaultSectionName;
                  return (
                    <div className="section-item" key={name}>
                      {editingSection === name ? (
                        <>
                          <input
                            className="section-rename-input"
                            value={editingSectionValue}
                            autoFocus
                            onChange={e => setEditingSectionValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameSection(name);
                              }
                              if (e.key === 'Escape') setEditingSection(null);
                            }}
                            disabled={sectionLoading}
                          />
                          <button
                            className="section-icon-btn"
                            title="Save"
                            onClick={() => handleRenameSection(name)}
                            disabled={sectionLoading}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="section-icon-btn"
                            title="Cancel"
                            onClick={() => setEditingSection(null)}
                            disabled={sectionLoading}
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="section-item-name">
                            {name}
                            {isDefault && <span className="section-default-badge">default</span>}
                          </span>
                          <span className="section-item-count">
                            {count} table{count === 1 ? '' : 's'}
                          </span>
                          {!isDefault && (
                            <button
                              className="section-icon-btn"
                              title="Set as default — unassigned tables go here"
                              onClick={() => handleSetDefaultSection(name)}
                              disabled={sectionLoading}
                            >
                              <Star size={14} />
                            </button>
                          )}
                          <button
                            className="section-icon-btn"
                            title="Rename section"
                            onClick={() => { setEditingSection(name); setEditingSectionValue(name); }}
                            disabled={sectionLoading}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="section-icon-btn danger"
                            title={isDefault ? 'The default section cannot be deleted' : 'Delete section'}
                            onClick={() => setSectionToDelete(name)}
                            disabled={sectionLoading || isDefault}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bill Dialog */}
      {billDialogTable && billDialogOrder && (
        <div className="modal-overlay" onClick={() => !isPrinting && !isPrintingOnly && setBillDialogTable(null)}>
          <div className="modal bill-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Print Bill - Table {tableLabel(billDialogTable)}</h2>
              <button 
                className="close-btn" 
                onClick={() => !isPrinting && !isPrintingOnly && setBillDialogTable(null)}
                disabled={isPrinting || isPrintingOnly}
              >
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="bill-total-display">
                <span className="bill-total-label">Total Amount</span>
                <span className="bill-total-value">{formatCurrency(billDialogTotal)}</span>
              </div>
              
              <p className="bill-hint">Print Bill prints without completing · Enter completes the order</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={handlePrintOnly}
                disabled={isPrinting || isPrintingOnly}
              >
                <Printer size={16} />
                {isPrintingOnly ? 'Printing...' : 'Print Bill'}
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => handlePrintAndComplete()}
                disabled={isPrinting || isPrintingOnly}
              >
                {isPrinting ? 'Completing...' : 'Complete Order'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setBillDialogTable(null)}
                disabled={isPrinting || isPrintingOnly}
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
        message={`Are you sure you want to delete Table ${deleteConfirmTable ? tableLabel(deleteConfirmTable) : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteTable}
        onCancel={() => setDeleteConfirmTable(null)}
      />
      <ConfirmDialog
        isOpen={!!sectionToDelete}
        title="Delete Section"
        message={`Delete section "${sectionToDelete || ''}"? Its tables will be moved to ${defaultSectionName}.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteSection}
        onCancel={() => setSectionToDelete(null)}
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
                Select a table to move the order from <strong>Table {tableLabel(changeTableDialog.fromTable)}</strong>:
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
                      <span className="change-table-number">{tableLabel(table)}</span>
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
                Move order from <strong>Table {tableLabel(changeTableDialog.fromTable)}</strong> to <strong>Table {tableLabel(confirmTableChange)}</strong>?
              </p>
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
                This will release Table {tableLabel(changeTableDialog.fromTable)} and assign the order to Table {tableLabel(confirmTableChange)}.
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

      {/* Merge Bill Dialog */}
      {combineDialog && !confirmCombineTable && (
        <div className="modal-overlay" onClick={() => setCombineDialog(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Merge Bill</h2>
              <button className="close-btn" onClick={() => setCombineDialog(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--gray-600)' }}>
                Select an occupied table to merge into <strong>Table {tableLabel(combineDialog.intoTable)}</strong>'s order:
              </p>
              <div className="change-table-grid">
                {tables
                  .filter(t => t.id !== combineDialog.intoTable.id && getActiveOrderByTable(t.id))
                  .sort((a, b) => a.number - b.number)
                  .map(table => {
                    const otherOrder = getActiveOrderByTable(table.id);
                    return (
                      <button
                        key={table.id}
                        className="change-table-option"
                        onClick={() => setConfirmCombineTable(table)}
                      >
                        <span className="change-table-number">{tableLabel(table)}</span>
                        <span className="change-table-seats">
                          {otherOrder ? formatCurrencyInt(otherOrder.totalAmount) : `${table.seats} seats`}
                        </span>
                      </button>
                    );
                  })}
                {tables.filter(t => t.id !== combineDialog.intoTable.id && getActiveOrderByTable(t.id)).length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '2rem' }}>
                    No other occupied tables to merge with
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCombineDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Combine Dialog */}
      {combineDialog && confirmCombineTable && (
        <div className="modal-overlay" onClick={() => !isCombining && setConfirmCombineTable(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Merge</h2>
              <button className="close-btn" onClick={() => setConfirmCombineTable(null)} disabled={isCombining}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                background: 'rgba(245,166,35, 0.1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem'
              }}>
                <Combine size={32} style={{ color: 'var(--warning)' }} />
              </div>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                Merge <strong>Table {tableLabel(confirmCombineTable)}</strong>'s order into <strong>Table {tableLabel(combineDialog.intoTable)}</strong>?
              </p>
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
                Table {tableLabel(confirmCombineTable)} will be freed and its items will appear on Table {tableLabel(combineDialog.intoTable)}'s bill.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmCombineTable(null)} disabled={isCombining}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCombine} disabled={isCombining}>
                {isCombining ? 'Merging...' : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Preview Dialog */}
      {previewTable && previewOrder && (
        <div className="modal-overlay" onClick={() => setPreviewTable(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Order Details - Table {tableLabel(previewTable)}</h2>
              <button className="close-btn" onClick={() => setPreviewTable(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="bill-items">
                {previewOrder.items.map((oi: any, idx: number) => (
                  <div className="bill-item" key={oi.itemId || idx}>
                    <div className="bill-item-details">
                      <div className="bill-item-name">{oi.item.name}</div>
                      <div className="bill-item-qty">
                        {oi.quantity} × {formatCurrency(orderItemUnitPrice(oi))}
                        {oi.notes ? ` — ${oi.notes}` : ''}
                      </div>
                    </div>
                    <div className="bill-item-price">{formatCurrency(orderItemUnitPrice(oi) * oi.quantity)}</div>
                  </div>
                ))}
              </div>
              <div className="bill-totals">
                <div className="bill-total-row">
                  <span>Subtotal</span>
                  <span>{formatCurrency(previewSubtotal)}</span>
                </div>
                {taxEnabled && (
                  <div className="bill-total-row">
                    <span>Tax</span>
                    <span>{formatCurrency(previewTax)}</span>
                  </div>
                )}
                <div className="bill-total-row grand-total">
                  <span>Total</span>
                  <span>{formatCurrency(previewSubtotal + previewTax)}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                className="btn btn-danger"
                onClick={() => setCancelOrderConfirm(previewOrder)}
              >
                Cancel Order
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setPreviewTable(null);
                  setChangeTableDialog({ fromTable: previewTable, order: previewOrder });
                }}
              >
                Move
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const t = previewTable;
                  setPreviewTable(null);
                  setPaymentMethod('upi');
                  setBillDialogTable(t);
                }}
              >
                Bill
              </button>
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/order/${previewTable.id}`)}
              >
                Open Order
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!cancelOrderConfirm}
        title="Cancel Order"
        message={`Are you sure you want to cancel the order${previewTable ? ` on Table ${tableLabel(previewTable)}` : ''}? The table will be freed.`}
        confirmLabel={isCancellingOrder ? 'Cancelling...' : 'Yes, Cancel Order'}
        cancelLabel="No"
        variant="danger"
        onConfirm={handleCancelOrder}
        onCancel={() => !isCancellingOrder && setCancelOrderConfirm(null)}
      />

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
