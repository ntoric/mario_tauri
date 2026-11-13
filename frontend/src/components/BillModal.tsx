import React, { useState } from 'react';
import { X, Printer, Check } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { formatCurrency } from '../utils/currency';
import { orderItemUnitPrice } from '../utils/order';
import { isTaxEnabled, computeCartTotals } from '../utils/tax';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { printerService } from '../services/printer';
import { buildInvoicePrintJob } from '../utils/gstInvoice';
import GstBillSummary from './GstBillSummary';
import { notify } from '../utils/toast';

const BillModal: React.FC = () => {
  const { stores, orders, createBill, completeOrder, fetchOrders } = useDataStore();
  const { user, currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
  const taxEnabled = isTaxEnabled(currentStore);
  const { billModal, closeBillModal } = useUIStore();

  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
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

  const isOpen = billModal.isOpen;
  const { order, table } = billModal.data || {};

  if (!isOpen || !order || !table) return null;

  const { gross: subtotal, totalTax: tax, total } = computeCartTotals(currentStore, order.items.map((oi: any) => ({ unitPrice: orderItemUnitPrice(oi), quantity: oi.quantity, taxPercent: oi.item.taxPercent, taxCategory: oi.item.taxCategory })), 0);

  const handlePrint = async () => {
    setPrintError('');

    const paymentMethod = order.paymentMethod || 'cash';

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
            const bill = await createBill({
              orderId: order.id,
              tableNumber: table.number,
              tableName: table.name,
              subtotal,
              taxTotal: tax,
              discount: 0,
              total,
              paymentMethod,
              customerName: 'Walk-in Customer',
            });
            notify.info(`Bill ${bill.invoiceNo} saved`);
            await completeOrder(order.id, paymentMethod); // No skipRefresh - optimistic update will handle it
            closeBillModal();
          } catch (error: any) {
            setErrorDialog({ show: true, message: error.message || 'Failed to complete order' });
          } finally {
            setIsPrinting(false);
          }
        },
      });
      return;
    }

    setIsPrinting(true);

    try {
      const bill = await createBill({
        orderId: order.id,
        tableNumber: table.number,
        tableName: table.name,
        subtotal,
        taxTotal: tax,
        discount: 0,
        total,
        paymentMethod,
        customerName: 'Walk-in Customer',
      });

      try {
        await printerService.printInvoice(buildInvoicePrintJob(bill, currentStore!, order.items)!);
      } catch (printError: any) {
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
              await completeOrder(order.id, paymentMethod); // No skipRefresh - optimistic update will handle it
              closeBillModal();
            } catch (err: any) {
              setErrorDialog({ show: true, message: err.message || 'Failed to complete order' });
            } finally {
              setIsPrinting(false);
            }
          },
        });
        return;
      }

      // Complete order
      await completeOrder(order.id, paymentMethod); // No skipRefresh - optimistic update will handle it

      closeBillModal();
    } catch (error: any) {
      setErrorDialog({ show: true, message: error.message || 'Failed to print' });
    } finally {
      setIsPrinting(false);
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

  return (
    <div className="gr-modal-live is-open" onClick={closeBillModal}>
      <div className="gr-modal" onClick={e => e.stopPropagation()}>
        <div className="gr-modal__head">
          <h2>Bill Receipt</h2>
          <button className="gr-iconbtn" onClick={closeBillModal}>
            <X size={24} />
          </button>
        </div>

        <div className="gr-modal__body">
          <div className="bill-container">
            <div className="bill-header">
              <h2>Cafe Manager</h2>
              <p>123 Coffee Street, City</p>
              <p>Tel: (555) 123-4567</p>
            </div>

            <div className="bill-table-info">
              <h3>Table {order.tableName || order.tableNumber}</h3>
              <p>{formatDate(new Date().toISOString())}</p>
              <p>Server: {user?.name}</p>
            </div>

            <div className="bill-items">
              {order.items.map((oi: any, index: number) => (
                <div key={index} className="bill-item">
                  <div className="bill-item-details">
                    <div className="bill-item-name">{oi.item.name}</div>
                    <div className="bill-item-qty">{oi.quantity} x {formatCurrency(orderItemUnitPrice(oi))}</div>
                  </div>
                  <div className="bill-item-price">{formatCurrency(oi.quantity * orderItemUnitPrice(oi))}</div>
                </div>
              ))}
            </div>

            <div className="bill-footer">
              <p>Thank you for visiting!</p>
              <p>Please come again</p>
            </div>
          </div>

          <GstBillSummary storeId={currentStoreId!} orderId={order.id} />

          {printError && (
            <div style={{ color: 'var(--danger)', textAlign: 'center', marginTop: '1rem' }}>
            {printError}
            </div>
          )}
        </div>

        <div className="gr-modal__foot">
          <button className="gr-btn gr-btn--primary" onClick={handlePrint} disabled={isPrinting}>
            <Printer size={16} />
            {isPrinting ? 'Printing...' : 'Print Bill'}
          </button>
          <button className="gr-btn gr-btn--secondary" onClick={closeBillModal}>
            Close
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
      </div>
    </div>
  );
};

export default BillModal;
