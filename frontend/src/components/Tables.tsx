import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Grid3X3, List, Printer, X, ArrowRightLeft, Loader2, Package } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { formatCurrency, formatCurrencyInt } from '../utils/currency';
import { api } from '../services/api';
import { printerService } from '../services/printer';
import { buildPrintItems, buildPrinterConfig, buildInvoiceData } from '../utils/printer';
import { getTableStatusWsUrl } from '../services/realtime';
import { Button } from '../components/ui/Button';
import OrderModal from './OrderModal';
import ParcelOrderModal from './ParcelOrderModal';
import BillModal from './BillModal';
import { ConfirmDialog } from './ConfirmDialog';
import type { Table } from '../types';

const Tables: React.FC = () => {
  const { stores, tables, getActiveOrderByTable, createTable, deleteTable, createBill, completeOrder, updateOrder, fetchTables, fetchOrders, fetchCategories, fetchItems, fetchBillQueue } = useDataStore();
  const { openOrderModal, openParcelOrderModal } = useUIStore();
  const { user, currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
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
          fetchOrders(true),
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

        await fetchOrders(true);
        const allOrders = useDataStore.getState().orders;

        for (const queueItem of queueItems) {
          try {
            const billPayload = JSON.parse(queueItem.billData || '{}');
            const order = allOrders.find(o => o.id === queueItem.orderId);
            if (!order) continue;

            const invoiceNo = billPayload.invoiceNo || `INV-${Date.now()}`;
            const grandTotal = Number(billPayload.total || order.totalAmount);
            const paymentMethod = billPayload.paymentMethod || 'cash';

            await printerService.printInvoice(buildInvoiceData({
              store: currentStore,
              orderItems: order.items,
              invoiceNo,
              total: grandTotal,
              discount: Number(billPayload.discount || 0),
              paymentMethod,
              customerName: billPayload.customerName || 'Walk-in Customer',
            }));
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
  const [newTable, setNewTable] = useState({ number: '', seats: 4 });
  const [checkingTableId, setCheckingTableId] = useState<string | null>(null);
  
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
          <button className="btn btn-primary" onClick={openParcelOrderModal}>
            <Package size={18} />
            Parcel Order
          </button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={18} />
              Add Table
            </button>
          )}
        </>
      ),
    });
  }, [viewMode, isAdmin, setHeaderContent, openParcelOrderModal]);

  const handleTableClick = async (table: Table) => {
    if (checkingTableId) return; // Prevent double clicks

    setCheckingTableId(table.id);
    setCheckingTableId(null);
    const activeOrder = getActiveOrderByTable(table.id);
    openOrderModal({ table, existingOrder: activeOrder });
  };

  const handleBillClick = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    const activeOrder = getActiveOrderByTable(table.id);
    if (activeOrder) {
      setBillDialogTable(table);
      setPaymentMethod('upi');
      setIsPrinting(false);
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

  const handlePrintAndComplete = async () => {
    if (!billDialogTable || isPrinting) return;

    const activeOrder = getActiveOrderByTable(billDialogTable.id);
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
        message: 'No printer is configured in settings. Complete order without printing bill?',
        onConfirm: async () => {
          setPrinterConfirm(p => ({ ...p, show: false }));
          setIsPrinting(true);
          try {
            await createBill({
              orderId: activeOrder.id,
              tableNumber: billDialogTable.number,
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
        orderId: activeOrder.id,
        tableNumber: billDialogTable.number,
        invoiceNo,
        subtotal,
        taxTotal: tax,
        discount: 0,
        total,
        paymentMethod,
        customerName: 'Walk-in Customer',
      });

      try {
        await printerService.printInvoice(buildInvoiceData({
          store: currentStore,
          orderItems: activeOrder.items,
          invoiceNo,
          total,
          paymentMethod,
        }));
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
              await completeOrder(activeOrder.id, paymentMethod);
              setBillDialogTable(null);
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
      await completeOrder(activeOrder.id, paymentMethod);

      // Close dialog
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
      await createTable({
        number: parseInt(newTable.number),
        seats: newTable.seats,
        position: { x: 0, y: 0 },
      });
      setShowAddModal(false);
      setNewTable({ number: '', seats: 4 });
    } finally {
      setIsAddingTable(false);
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (confirm('Are you sure you want to delete this table?')) {
      setLoadingTableId(id);
      try {
        await deleteTable(id);
      } finally {
        setLoadingTableId(null);
      }
    }
  };

  const billDialogOrder = billDialogTable ? getActiveOrderByTable(billDialogTable.id) : null;
  const billDialogTotal = billDialogOrder ? 
    billDialogOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity), 0) +
    billDialogOrder.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity * (oi.item.taxPercent || 0) / 100), 0)
    : 0;

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
                      style={{ position: 'relative' }}
                    >
                      {checkingTableId === table.id && (
                        <div className="table-checking-overlay" style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(255, 255, 255, 0.7)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 'inherit',
                          zIndex: 10
                        }}>
                          <Loader2 className="animate-spin" style={{ color: 'var(--primary)' }} size={24} />
                        </div>
                      )}
                      {isAdmin && (
                        <button
                          className="table-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTable(table.id);
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
                      {activeOrder && (
                        <>
                          <button
                            className="table-bill-btn new-design"
                            onClick={(e) => handleBillClick(e, table)}
                            title="Print Bill"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            className="table-change-btn"
                            onClick={(e) => handleChangeTableClick(e, table)}
                            title="Change Table"
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                        </>
                      )}
                      <div className="table-layout-number">{table.number}</div>
                      <div className="table-layout-seats">{table.seats}s</div>
                      <div className={`table-layout-status ${activeOrder ? 'occupied' : 'available'}`}>
                        {activeOrder ? formatCurrencyInt(activeOrder.totalAmount) : 'Free'}
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
                <tbody>
                  {tables.sort((a, b) => a.number - b.number).map(table => {
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
                            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                              {formatCurrency(activeOrder.totalAmount)} ({activeOrder.items.length} items)
                            </span>
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
                                  style={{ background: 'rgba(255, 107, 53, 0.1)', color: 'var(--primary)' }}
                                  onClick={(e) => handleBillClick(e as any, table)}
                                  title="Print Bill"
                                >
                                  <Printer size={14} />
                                </button>
                                <button 
                                  className="action-btn" 
                                  style={{ background: 'rgba(66, 153, 225, 0.1)', color: 'var(--info)' }}
                                  onClick={(e) => handleChangeTableClick(e as any, table)}
                                  title="Change Table"
                                >
                                  <ArrowRightLeft size={14} />
                                </button>
                              </>
                            )}
                            {isAdmin && (
                              <button 
                                className="action-btn delete" 
                                onClick={() => handleDeleteTable(table.id)}
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

      <OrderModal />
      <ParcelOrderModal />
      <BillModal />
    </>
  );
};

export default Tables;
