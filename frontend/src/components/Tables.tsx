import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Grid3X3, List, Printer, X, ArrowRightLeft, Loader2, Package, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { usePagination } from '../hooks/usePagination';
import { useTaxSettings } from '../hooks/useTaxSettings';
import { formatCurrency, formatCurrencyInt } from '../utils/currency';
import { api } from '../services/api';
import { printerService } from '../services/printer';
import { getTableStatusWsUrl } from '../services/realtime';
import { Button } from '../components/ui/Button';
import TablePagination from './TablePagination';
import BillModal from './BillModal';
import { ConfirmDialog } from './ConfirmDialog';
import OrderTimer from './OrderTimer';
import type { Table } from '../types';

const Tables: React.FC = () => {
  const { stores, tables, getActiveOrderByTable, createTable, updateTable, deleteTable, createBill, completeOrder, updateOrder, fetchTables, fetchOrders, fetchCategories, fetchItems, fetchBillQueue } = useDataStore();
  const navigate = useNavigate();
  const { user, currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxSettings = useTaxSettings();
  const { setHeaderContent } = usePageHeader();
  const [viewMode, setViewMode] = useState<'layout' | 'list'>('layout');

  // Fetch data on mount
  useEffect(() => {
    fetchTables();
    fetchOrders();
    fetchCategories();
    fetchItems();
  }, [fetchTables, fetchOrders, fetchCategories, fetchItems]);

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
          fetchOrders(),
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

            const taxable = printItems.reduce((sum: number, item: any) => sum + item.amount, 0);
            const cgst = taxSettings.taxEnabled ? taxable * 0.025 : 0;
            const sgst = taxSettings.taxEnabled ? taxable * 0.025 : 0;

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
                  phone: currentStore?.phone || '',
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
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [newTable, setNewTable] = useState({ number: '', seats: 4 });
  const [checkingTableId, setCheckingTableId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteConfirmTable, setDeleteConfirmTable] = useState<Table | null>(null);
  
  // Bill dialog state
  const [billDialogTable, setBillDialogTable] = useState<Table | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isPrinting, setIsPrinting] = useState(false);

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
    setHeaderContent({
      title: 'Tables',
      subtitle: 'Manage tables and orders',
      actions: (
        <>
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
          <button className="btn btn-primary" onClick={() => navigate('/parcel-order')}>
            <Package size={18} />
            Parcel Order
          </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={18} />
              Add Table
            </button>
          {isAdmin && (
            <button
              className={`btn ${deleteMode ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => setDeleteMode(!deleteMode)}
              title="Toggle edit mode"
            >
              <Pencil size={18} />
              {deleteMode ? 'Done' : 'Edit Tables'}
            </button>
          )}
        </>
      ),
    });
  }, [viewMode, isAdmin, setHeaderContent, navigate, user, deleteMode]);

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
      handlePrintAndComplete(table);
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
    const tax = activeOrder.items.reduce((sum: number, oi: any) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (oi.item.price * oi.quantity * taxPercent / 100);
    }, 0);
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

      const taxable = printItems.reduce((sum: number, item: any) => sum + item.amount, 0);
      const cgst = taxSettings.taxEnabled ? taxable * 0.025 : 0;
      const sgst = taxSettings.taxEnabled ? taxable * 0.025 : 0;

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

  // Handle Enter key in bill dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (billDialogTable && e.key === 'Enter' && !isPrinting) {
        e.preventDefault();
        handlePrintAndComplete();
      }
    };

    if (billDialogTable) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [billDialogTable, isPrinting, paymentMethod]);

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.number) return;

    setIsAddingTable(true);
    try {
      if (editingTable) {
        await updateTable(editingTable.id, {
          number: parseInt(newTable.number),
          seats: newTable.seats,
        });
        setEditingTable(null);
      } else {
        await createTable({
          number: parseInt(newTable.number),
          seats: newTable.seats,
          position: { x: 0, y: 0 },
        });
      }
      setShowAddModal(false);
      setNewTable({ number: '', seats: 4 });
    } finally {
      setIsAddingTable(false);
    }
  };

  const handleEditTable = (table: Table) => {
    setEditingTable(table);
    setNewTable({ number: String(table.number), seats: table.seats });
    setShowAddModal(true);
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

  const billDialogOrder = billDialogTable ? getActiveOrderByTable(billDialogTable.id) : null;
  const billDialogTotal = billDialogOrder ?
    billDialogOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity), 0) +
    billDialogOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity * (oi.item.taxPercent || 0) / 100), 0)
    : 0;

  const sortedTables = useMemo(() => [...tables].sort((a, b) => a.number - b.number), [tables]);
  const tableListPagination = usePagination(sortedTables.length);

  return (
    <>
      <div>
        {viewMode === 'layout' ? (
          <div className="tables-layout-container">
            {tables.length === 0 ? (
              <div className="empty-state">
                <Grid3X3 size={64} style={{ opacity: 0.5 }} />
                <p>No tables configured</p>
                {isAdmin && (
                  <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: '1rem' }}>
                    Add Your First Table
                  </button>
                )}
              </div>
            ) : (
              <div className="tables-layout-grid compact">
                {tables.sort((a, b) => a.number - b.number).map((table) => {
                  const activeOrder = getActiveOrderByTable(table.id);
                  return (
                    <div
                      key={table.id}
                      className={`table-layout-card compact ${activeOrder ? 'occupied' : ''}`}
                      onClick={() => handleTableClick(table)}
                    >
                      {checkingTableId === table.id && (
                        <div className="table-checking-overlay">
                          <Loader2 className="animate-spin" style={{ color: 'var(--primary)' }} size={24} />
                        </div>
                      )}
                      <div className="table-layout-content">
                        <div className="table-layout-number">{table.number}</div>
                        <div className={`table-layout-status ${activeOrder ? 'occupied' : 'available'}`}>
                          {activeOrder ? formatCurrencyInt(activeOrder.totalAmount) : `${table.seats} seats`}
                        </div>
                        {activeOrder && (
                          <OrderTimer createdAt={activeOrder.createdAt} className="table-card-timer" />
                        )}
                      </div>
                      <div className="table-actions-col" onClick={(e) => e.stopPropagation()}>
                        {activeOrder && !deleteMode && (
                          <>
                            <button
                              className="table-action-icon-btn bill"
                              onClick={(e) => handleBillClick(e, table)}
                              title="Print Bill"
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              className="table-action-icon-btn change"
                              onClick={(e) => handleChangeTableClick(e, table)}
                              title="Change Table"
                            >
                              <ArrowRightLeft size={13} />
                            </button>
                          </>
                        )}
                        {isAdmin && deleteMode && !activeOrder && (
                          <>
                            <button
                              className="table-action-icon-btn edit"
                              onClick={(e) => { e.stopPropagation(); handleEditTable(table); }}
                              title="Edit Table"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              className="table-action-icon-btn delete"
                              onClick={(e) => { e.stopPropagation(); handleDeleteTable(table); }}
                              disabled={loadingTableId === table.id}
                              title="Delete Table"
                            >
                              {loadingTableId === table.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <div className="zoho-table-wrap">
                <div className="zoho-table-scroll">
                  <table className="zoho-table">
                    <thead>
                      <tr>
                        <th>Table #</th>
                        <th>Seats</th>
                        <th>Status</th>
                        <th>Current Order</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableListPagination.paginatedItems(sortedTables).map(table => {
                        const activeOrder = getActiveOrderByTable(table.id);
                        return (
                          <tr
                            key={table.id}
                            className="clickable-row"
                            onClick={() => handleTableClick(table)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <strong>Table {table.number}</strong>
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
                                {activeOrder && !deleteMode && (
                                  <>
                                    <button
                                      className="action-btn bill"
                                      onClick={(e) => handleBillClick(e as any, table)}
                                      title="Print Bill"
                                    >
                                      <Printer size={14} />
                                    </button>
                                    <button
                                      className="action-btn change"
                                      onClick={(e) => handleChangeTableClick(e as any, table)}
                                      title="Change Table"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                  </>
                                )}
                                {isAdmin && deleteMode && !activeOrder && (
                                  <>
                                    <button
                                      className="action-btn edit"
                                      onClick={() => handleEditTable(table)}
                                      title="Edit Table"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      className="action-btn delete"
                                      onClick={() => handleDeleteTable(table)}
                                      disabled={loadingTableId === table.id}
                                    >
                                      {loadingTableId === table.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : (
                                        <Trash2 size={14} />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TablePagination pagination={tableListPagination} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTable ? 'Edit Table' : 'Add New Table'}</h2>
              <button className="close-btn" onClick={() => { setShowAddModal(false); setEditingTable(null); setNewTable({ number: '', seats: 4 }); }}>
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
                  loadingText={editingTable ? 'Saving...' : 'Adding...'}
                >
                  {editingTable ? 'Save Changes' : 'Add Table'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { setShowAddModal(false); setEditingTable(null); setNewTable({ number: '', seats: 4 }); }}
                  disabled={isAddingTable}
                >
                  Cancel
                </Button>
              </div>
            </form>
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
                background: 'rgba(66, 153, 225, 0.1)', 
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
    </>
  );
};

export default Tables;
