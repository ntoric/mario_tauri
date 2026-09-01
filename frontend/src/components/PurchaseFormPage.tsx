import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDataStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/Button';
import { formatCurrency } from '../utils/currency';
import type { PurchaseItem } from '../types';

interface LineItem {
  inventoryItemId: string;
  quantity: string;
  unitPrice: string;
}

const PurchaseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { purchaseId } = useParams<{ purchaseId: string }>();
  const {
    inventoryItems, purchases,
    fetchInventoryItems, fetchPurchases,
    createPurchase, updatePurchase,
  } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const toast = useToast();

  const isEditing = !!purchaseId;
  const editingPurchase = useMemo(() => purchases.find(p => p.id === purchaseId), [purchases, purchaseId]);

  const [form, setForm] = useState({
    vendor: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    paymentMethod: '',
    receiptNumber: '',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { inventoryItemId: '', quantity: '1', unitPrice: '0' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchInventoryItems();
    if (isEditing) {
      fetchPurchases();
    }
  }, [fetchInventoryItems, fetchPurchases, isEditing]);

  useEffect(() => {
    if (isEditing && editingPurchase) {
      setForm({
        vendor: editingPurchase.vendor || '',
        purchaseDate: editingPurchase.purchaseDate.split('T')[0],
        paymentMethod: editingPurchase.paymentMethod || '',
        receiptNumber: editingPurchase.receiptNumber || '',
        notes: editingPurchase.notes || '',
      });
      setLineItems(
        editingPurchase.items.length > 0
          ? editingPurchase.items.map(it => ({
              inventoryItemId: it.inventoryItemId,
              quantity: String(it.quantity),
              unitPrice: String(it.unitPrice),
            }))
          : [{ inventoryItemId: '', quantity: '1', unitPrice: '0' }]
      );
    } else if (!isEditing && inventoryItems.length > 0) {
      setLineItems(prev => prev.map((it, i) =>
        i === 0 && !it.inventoryItemId ? { ...it, inventoryItemId: inventoryItems[0].id } : it
      ));
    }
  }, [editingPurchase, isEditing, inventoryItems]);

  useEffect(() => {
    setHeaderContent({
      title: isEditing ? 'Edit Purchase' : 'New Purchase',
      subtitle: isEditing ? editingPurchase?.vendor || 'Edit restocking purchase' : 'Record a restocking purchase',
      actions: (
        <Button variant="secondary" onClick={() => navigate('/inventory')}>
          <ArrowLeft size={16} /> Back to Inventory
        </Button>
      ),
    });
  }, [setHeaderContent, isEditing, editingPurchase, navigate]);

  const addLineItem = () => {
    const defaultId = inventoryItems.length > 0 ? inventoryItems[0].id : '';
    setLineItems(prev => [...prev, { inventoryItemId: defaultId, quantity: '1', unitPrice: '0' }]);
  };

  const updateLineItem = (index: number, patch: Partial<LineItem>) => {
    setLineItems(prev => prev.map((it, i) => {
      if (i !== index) return it;
      const updated = { ...it, ...patch };
      // Auto-fill unit price from inventory item's unit cost when selecting a new item
      if (patch.inventoryItemId) {
        const inv = inventoryItems.find(inv => inv.id === patch.inventoryItemId);
        if (inv && (!it.unitPrice || it.unitPrice === '0')) {
          updated.unitPrice = String(inv.unitCost);
        }
      }
      return updated;
    }));
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  const lineTotal = (it: LineItem) => (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
  const grandTotal = lineItems.reduce((sum, it) => sum + lineTotal(it), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = lineItems.filter(it => it.inventoryItemId && parseFloat(it.quantity) > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one valid line item with a quantity');
      return;
    }

    const items: PurchaseItem[] = validItems.map(it => ({
      inventoryItemId: it.inventoryItemId,
      quantity: parseFloat(it.quantity) || 0,
      unitPrice: parseFloat(it.unitPrice) || 0,
      total: (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0),
    }));

    const payload = {
      vendor: form.vendor,
      purchaseDate: new Date(form.purchaseDate).toISOString(),
      paymentMethod: form.paymentMethod,
      receiptNumber: form.receiptNumber,
      notes: form.notes,
      items,
    };

    setIsSubmitting(true);
    try {
      if (isEditing && editingPurchase) {
        await updatePurchase(editingPurchase.id, payload);
        toast.success('Purchase updated successfully');
      } else {
        await createPurchase(payload);
        toast.success('Purchase recorded successfully');
      }
      navigate('/inventory');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{isEditing ? 'Edit Purchase' : 'New Purchase'}</span>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Vendor</label>
              <input
                type="text"
                value={form.vendor}
                onChange={e => setForm({ ...form, vendor: e.target.value })}
                placeholder="Supplier name"
              />
            </div>
            <div className="form-group">
              <label>Purchase Date</label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={e => setForm({ ...form, purchaseDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="">—</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="form-group">
              <label>Receipt Number</label>
              <input
                type="text"
                value={form.receiptNumber}
                onChange={e => setForm({ ...form, receiptNumber: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>Line Items</strong>
            <button type="button" className="btn btn-sm btn-outline" onClick={addLineItem}>
              <Plus size={14} /> Add Item
            </button>
          </div>

          {inventoryItems.length === 0 ? (
            <p style={{ color: 'var(--gray-600)', padding: '1rem 0' }}>
              No inventory items available. Add stock items in the Inventory page first.
            </p>
          ) : (
            <div className="zoho-table-wrap">
              <div className="zoho-table-scroll">
                <table className="zoho-table">
                  <thead>
                    <tr>
                      <th>Inventory Item</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((it, index) => (
                      <tr key={index}>
                        <td>
                          <select
                            value={it.inventoryItemId}
                            onChange={e => updateLineItem(index, { inventoryItemId: e.target.value })}
                            style={{ width: '100%' }}
                          >
                            <option value="">Select item...</option>
                            {inventoryItems.map(inv => (
                              <option key={inv.id} value={inv.id}>
                                {inv.name} ({inv.unit}) — Stock: {inv.quantity}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={it.quantity}
                            onChange={e => updateLineItem(index, { quantity: e.target.value })}
                            style={{ width: '90px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={it.unitPrice}
                            onChange={e => updateLineItem(index, { unitPrice: e.target.value })}
                            style={{ width: '100px' }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(lineTotal(it))}</td>
                        <td>
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => removeLineItem(index)}
                            disabled={lineItems.length === 1}
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Grand Total</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 700 }}>{formatCurrency(grandTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={() => navigate('/inventory')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText="Saving...">
              {isEditing ? 'Update Purchase' : 'Save Purchase'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseFormPage;
