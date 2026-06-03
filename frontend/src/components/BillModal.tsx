import React, { useState } from 'react';
import { X, Printer, Check } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { printerService } from '../services/printer';
import { buildPrintItems, buildInvoiceData } from '../utils/printer';
import { calculateSubtotal, calculateTax } from '../utils/orderItems';

const BillModal: React.FC = () => {
  const { stores, orders, createBill, completeOrder } = useDataStore();
  const { user, currentStoreId } = useAuthStore();
  const currentStore = stores.find(s => s.id === currentStoreId);
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

  const subtotal = calculateSubtotal(order.items);
  const tax = calculateTax(order.items);
  const total = subtotal + tax;

  const handlePrint = async () => {
    setPrintError('');

    const paymentMethod = order.paymentMethod || 'cash';
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
              orderId: order.id,
              tableNumber: table.number,
              invoiceNo,
              subtotal,
              taxTotal: tax,
              discount: 0,
              total,
              paymentMethod,
              customerName: 'Walk-in Customer',
            });
            await completeOrder(order.id, paymentMethod);
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
      // Create bill
      await createBill({
        orderId: order.id,
        tableNumber: table.number,
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
          orderItems: order.items,
          invoiceNo,
          total,
          paymentMethod,
        }));
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
              await completeOrder(order.id, paymentMethod);
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
      await completeOrder(order.id, paymentMethod);

      closeBillModal();
    } catch (error: any) {
      setErrorDialog({ show: true, message: error.message || 'Failed to print' });
    } finally {
      setIsPrinting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={closeBillModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bill Receipt</h2>
          <button className="close-btn" onClick={closeBillModal}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="bill-container">
            <div className="bill-header">
              <h2>Cafe Manager</h2>
              <p>123 Coffee Street, City</p>
              <p>Tel: (555) 123-4567</p>
            </div>

            <div className="bill-table-info">
              <h3>Table {order.tableNumber}</h3>
              <p>{formatDate(new Date().toISOString())}</p>
              <p>Server: {user?.name}</p>
            </div>

            <div className="bill-items">
              {order.items.map((oi: any, index: number) => (
                <div key={index} className="bill-item">
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
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="bill-total-row">
                <span>Tax</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="bill-total-row grand-total">
                <span>TOTAL</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="bill-footer">
              <p>Thank you for visiting!</p>
              <p>Please come again</p>
            </div>
          </div>

          {printError && (
            <div style={{ color: 'var(--danger)', textAlign: 'center', marginTop: '1rem' }}>
              {printError}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handlePrint} disabled={isPrinting}>
            <Printer size={16} />
            {isPrinting ? 'Printing...' : 'Print Bill'}
          </button>
          <button className="btn btn-secondary" onClick={closeBillModal}>
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
