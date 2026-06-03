import React, { useState } from 'react';
import { X, Printer, Check } from 'lucide-react';
import { useDataStore, useUIStore, useAuthStore } from '../stores';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { printerService } from '../services/printer';

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

  const calculateTotals = () => {
    const subtotal = order.items.reduce((sum: number, oi: any) => sum + (oi.item.price * oi.quantity), 0);
    const tax = order.items.reduce((sum: number, oi: any) => {
      const taxPercent = oi.item.taxPercent || 0;
      return sum + (oi.item.price * oi.quantity * taxPercent / 100);
    }, 0);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const { subtotal, tax, total } = calculateTotals();

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

      // Print invoice via printer service
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
      const cgst = taxable * 0.025;
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
