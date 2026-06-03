import React, { useState, useEffect, useRef } from 'react';
import { Save, Store, Printer, Receipt, Building2, RefreshCw, AlertCircle, Check, Upload, Trash2, Image } from 'lucide-react';
import { useDataStore, useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import { printerService } from '../services/printer';

interface PrinterDevice {
  name: string;
  type: string;
  vendor_id?: string;
  product_id?: string;
  address?: string;
}

const BusinessSettings: React.FC = () => {
  const { currentStoreId, user, ensureStoreSelected } = useAuthStore();
  const { stores, updateStore, fetchStores } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  
  // Ensure store is selected on mount (for business_admin and staff)
  useEffect(() => {
    ensureStoreSelected();
  }, [ensureStoreSelected]);

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);
  
  const currentStore = stores.find(s => s.id === currentStoreId);
  
  const [activeTab, setActiveTab] = useState<'general' | 'printer'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Available printers from printer service
  const [availablePrinters, setAvailablePrinters] = useState<PrinterDevice[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [printerError, setPrinterError] = useState('');
  const [selectedPrinterName, setSelectedPrinterName] = useState('');

  const [generalSettings, setGeneralSettings] = useState({
    name: '',
    branch: '',
    location: '',
    gstin: '',
    fssaiNo: '',
    phone: '',
  });

  // Logo upload state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [printerSettings, setPrinterSettings] = useState({
    printerName: '',
    printerVendorId: '0x0fe6',
    printerProductId: '0x811e',
    invoiceSize: '3inch',
    kotPrintEnabled: true,
    remoteBillingEnabled: false,
  });

  useEffect(() => {
    if (currentStore) {
      setGeneralSettings({
        name: currentStore.name || '',
        branch: currentStore.branch || '',
        location: currentStore.location || '',
        gstin: currentStore.gstin || '',
        fssaiNo: currentStore.fssaiNo || '',
        phone: currentStore.phone || '',
      });
      setPrinterSettings({
        printerName: currentStore.printerName || '',
        printerVendorId: currentStore.printerVendorId || '0x0fe6',
        printerProductId: currentStore.printerProductId || '0x811e',
        invoiceSize: currentStore.invoiceSize || '3inch',
        kotPrintEnabled: currentStore.kotPrintEnabled !== false,
        remoteBillingEnabled: currentStore.remoteBillingEnabled === true,
      });
      setSelectedPrinterName(currentStore.printerName || '');
      setLogoPreview(currentStore.logoUrl || null);
    }
  }, [currentStore]);

  // Fetch available printers when printer tab is active
  useEffect(() => {
    if (activeTab === 'printer') {
      fetchPrinters();
    }
  }, [activeTab]);

  const fetchPrinters = async () => {
    setIsLoadingPrinters(true);
    setPrinterError('');
    try {
      const printers = await printerService.getPrinters();
      if (Array.isArray(printers)) {
        setAvailablePrinters(printers);
      } else {
        setAvailablePrinters([]);
      }
    } catch (error: any) {
      setPrinterError('Cannot connect to printer service: ' + (error?.message || error));
      setAvailablePrinters([]);
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  const handlePrinterSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const printerName = e.target.value;
    setSelectedPrinterName(printerName);

    if (!printerName) {
      // Manual entry selected
      return;
    }

    const selected = availablePrinters.find(p => p.name === printerName);
    if (selected) {
      setPrinterSettings(prev => ({
        ...prev,
        printerName: selected.name,
        printerVendorId: selected.vendor_id || prev.printerVendorId,
        printerProductId: selected.product_id || prev.printerProductId,
      }));
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStore) return;

    setIsSaving(true);
    try {
      await updateStore(currentStore.id, generalSettings);
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStore) return;

    setIsSaving(true);
    try {
      await updateStore(currentStore.id, {
        printerName: printerSettings.printerName,
        printerVendorId: printerSettings.printerVendorId,
        printerProductId: printerSettings.printerProductId,
        invoiceSize: printerSettings.invoiceSize as '2inch' | '3inch',
        kotPrintEnabled: printerSettings.kotPrintEnabled,
        remoteBillingEnabled: printerSettings.remoteBillingEnabled,
      });
      setSaveMessage('Printer settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Logo upload handlers
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveMessage('Please select an image file');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setSaveMessage('Image size should be less than 2MB');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = async () => {
    if (!currentStore || !logoPreview) return;

    setIsUploadingLogo(true);
    try {
      await api.uploadStoreLogo(currentStore.id, logoPreview);
      setSaveMessage('Logo uploaded successfully!');
      // Refresh stores to get updated logo URL
      await fetchStores();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to upload logo');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!currentStore) return;

    if (!confirm('Are you sure you want to remove the logo?')) return;

    setIsUploadingLogo(true);
    try {
      await api.deleteStoreLogo(currentStore.id);
      setLogoPreview(null);
      setSaveMessage('Logo removed successfully!');
      // Refresh stores to get updated logo URL
      await fetchStores();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to remove logo');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsUploadingLogo(false);
    }
  };

    // Set page header
  useEffect(() => {
    if (currentStore) {
      setHeaderContent({
        title: 'Business Settings',
        subtitle: `Configure settings for ${currentStore.name} ${currentStore.branch ? `- ${currentStore.branch}` : ''}`,
        actions: null,
      });
    }
  }, [currentStore, setHeaderContent]);

  if (!currentStore) {
    const isBusinessAdminOrStaff = user?.role === 'business_admin' || user?.role === 'staff';
    return (
      <div className="empty-state">
        <Store size={64} style={{ opacity: 0.5 }} />
        <p>No store selected</p>
        {isBusinessAdminOrStaff && user?.storeId && (
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
            Your assigned store should load automatically. If not, please contact your administrator.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <Building2 size={18} />
          General Info
        </button>
        <button
          className={`tab ${activeTab === 'printer' ? 'active' : ''}`}
          onClick={() => setActiveTab('printer')}
        >
          <Printer size={18} />
          Printer & Invoice
        </button>
      </div>

      {saveMessage && (
        <div style={{ 
          padding: '1rem', 
          background: saveMessage.includes('success') ? 'rgba(72, 187, 120, 0.1)' : 'rgba(245, 101, 101, 0.1)',
          color: saveMessage.includes('success') ? 'var(--success)' : 'var(--danger)',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem'
        }}>
          {saveMessage}
        </div>
      )}

      {activeTab === 'general' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">General Information</span>
          </div>
          <form onSubmit={handleSaveGeneral}>
            <div className="card-body">
              {/* Logo Upload Section */}
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label>Business Logo</label>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginTop: '0.5rem' }}>
                  {/* Logo Preview */}
                  <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: 'var(--radius)',
                    border: '2px dashed var(--gray-300)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: logoPreview ? 'white' : 'var(--gray-50)',
                    overflow: 'hidden',
                  }}>
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Business Logo"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <Image size={40} style={{ color: 'var(--gray-400)' }} />
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoSelect}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                      >
                        <Upload size={16} />
                        {logoPreview ? 'Change Logo' : 'Upload Logo'}
                      </button>
                      {logoPreview && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleLogoUpload}
                            disabled={isUploadingLogo || logoPreview === currentStore?.logoUrl}
                          >
                            <Save size={16} />
                            {isUploadingLogo ? 'Saving...' : 'Save Logo'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={handleLogoDelete}
                            disabled={isUploadingLogo}
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: '0.75rem' }}>
                      Recommended: Square image, at least 200x200 pixels. Max size: 2MB.<br />
                      The logo will appear on the login page and in the store selector.
                    </p>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Store Name *</label>
                  <input
                    type="text"
                    value={generalSettings.name}
                    onChange={e => setGeneralSettings({ ...generalSettings, name: e.target.value })}
                    placeholder="e.g., Main Cafe"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Branch</label>
                  <input
                    type="text"
                    value={generalSettings.branch}
                    onChange={e => setGeneralSettings({ ...generalSettings, branch: e.target.value })}
                    placeholder="e.g., Downtown Branch"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Location Address</label>
                <textarea
                  value={generalSettings.location}
                  onChange={e => setGeneralSettings({ ...generalSettings, location: e.target.value })}
                  placeholder="Full address"
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>GSTIN</label>
                  <input
                    type="text"
                    value={generalSettings.gstin}
                    onChange={e => setGeneralSettings({ ...generalSettings, gstin: e.target.value.toUpperCase() })}
                    placeholder="e.g., 32AAIFJ6501F1ZS"
                  />
                </div>
                <div className="form-group">
                  <label>FSSAI Number</label>
                  <input
                    type="text"
                    value={generalSettings.fssaiNo}
                    onChange={e => setGeneralSettings({ ...generalSettings, fssaiNo: e.target.value })}
                    placeholder="FSSAI License Number"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Contact Phone</label>
                <input
                  type="text"
                  value={generalSettings.phone}
                  onChange={e => setGeneralSettings({ ...generalSettings, phone: e.target.value })}
                  placeholder="Contact number"
                />
              </div>
            </div>
            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                <Save size={18} />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'printer' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">Printer Configuration</span>
            <button 
              type="button" 
              className="btn btn-sm btn-secondary"
              onClick={fetchPrinters}
              disabled={isLoadingPrinters}
            >
              <RefreshCw size={14} style={{ marginRight: '0.5rem', animation: isLoadingPrinters ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
          </div>
          <form onSubmit={handleSavePrinter}>
            <div className="card-body">
              {/* Printer Selection */}
              <div className="form-group">
                <label>Select Printer</label>
                {printerError && (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(245, 101, 101, 0.1)', 
                    color: 'var(--danger)',
                    borderRadius: 'var(--radius)',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <AlertCircle size={16} />
                    <span style={{ fontSize: '0.85rem' }}>{printerError}</span>
                  </div>
                )}
                <select
                  value={selectedPrinterName}
                  onChange={handlePrinterSelect}
                  disabled={isLoadingPrinters || availablePrinters.length === 0}
                  style={{ width: '100%' }}
                >
                  <option value="">
                    {isLoadingPrinters 
                      ? 'Detecting printers...' 
                      : availablePrinters.length === 0 
                        ? 'No printers detected - Enter manually below'
                        : '-- Select a printer --'
                    }
                  </option>
                  {availablePrinters.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.name} {printer.type && `(${printer.type})`}
                    </option>
                  ))}
                </select>
                {availablePrinters.length > 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                    Select a printer from the list above or enter details manually below
                  </p>
                )}
              </div>

              {/* Manual Configuration */}
              <div style={{ 
                marginTop: '1.5rem', 
                padding: '1rem', 
                background: 'var(--gray-50)', 
                borderRadius: 'var(--radius)',
                border: '1px solid var(--gray-200)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  {selectedPrinterName && availablePrinters.find(p => p.name === selectedPrinterName) ? (
                    <>
                      <Check size={16} style={{ color: 'var(--success)' }} />
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>Auto-configured from selected printer</span>
                    </>
                  ) : (
                    <span style={{ fontWeight: 600 }}>Manual Configuration</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor ID</label>
                    <input
                      type="text"
                      value={printerSettings.printerVendorId}
                      onChange={e => setPrinterSettings({ ...printerSettings, printerVendorId: e.target.value })}
                      placeholder="e.g., 0x0fe6"
                    />
                    <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                      USB Vendor ID (e.g., 0x0fe6)
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Product ID</label>
                    <input
                      type="text"
                      value={printerSettings.printerProductId}
                      onChange={e => setPrinterSettings({ ...printerSettings, printerProductId: e.target.value })}
                      placeholder="e.g., 0x811e"
                    />
                    <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                      USB Product ID (e.g., 0x811e)
                    </small>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label>Invoice Size</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <label 
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '1rem',
                      border: '2px solid',
                      borderColor: printerSettings.invoiceSize === '2inch' ? 'var(--primary)' : 'var(--gray-200)',
                      borderRadius: 'var(--radius)',
                      background: printerSettings.invoiceSize === '2inch' ? 'rgba(59, 130, 246, 0.05)' : 'white',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="invoiceSize"
                      value="2inch"
                      checked={printerSettings.invoiceSize === '2inch'}
                      onChange={e => setPrinterSettings({ ...printerSettings, invoiceSize: e.target.value })}
                      style={{ display: 'none' }}
                    />
                    <Receipt size={32} style={{ color: printerSettings.invoiceSize === '2inch' ? 'var(--primary)' : 'var(--gray-400)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>2 Inch</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>58mm paper</span>
                  </label>
                  <label 
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '1rem',
                      border: '2px solid',
                      borderColor: printerSettings.invoiceSize === '3inch' ? 'var(--primary)' : 'var(--gray-200)',
                      borderRadius: 'var(--radius)',
                      background: printerSettings.invoiceSize === '3inch' ? 'rgba(59, 130, 246, 0.05)' : 'white',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="invoiceSize"
                      value="3inch"
                      checked={printerSettings.invoiceSize === '3inch'}
                      onChange={e => setPrinterSettings({ ...printerSettings, invoiceSize: e.target.value })}
                      style={{ display: 'none' }}
                    />
                    <Receipt size={32} style={{ color: printerSettings.invoiceSize === '3inch' ? 'var(--primary)' : 'var(--gray-400)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>3 Inch</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>80mm paper</span>
                  </label>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={printerSettings.kotPrintEnabled}
                    onChange={e => setPrinterSettings({ ...printerSettings, kotPrintEnabled: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: 600 }}>Enable KOT (Kitchen Order Ticket) Printing</span>
                </label>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '0.5rem', marginLeft: '26px' }}>
                  When enabled, KOT tickets will be printed automatically when orders are placed.
                </p>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    id="remote-billing-toggle"
                    checked={printerSettings.remoteBillingEnabled}
                    onChange={e => setPrinterSettings({ ...printerSettings, remoteBillingEnabled: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: 600 }}>Remote Billing</span>
                </label>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '0.5rem', marginLeft: '26px' }}>
                  When enabled, queue-based bill generation and printing will be active.
                </p>
              </div>

              <div style={{ 
                padding: '1rem', 
                background: 'var(--gray-50)', 
                borderRadius: 'var(--radius)',
                marginTop: '1.5rem'
              }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Finding Printer IDs Manually</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                  If your printer is not detected automatically, find the IDs manually:
                </p>
                <ul style={{ fontSize: '0.875rem', color: 'var(--gray-600)', paddingLeft: '1.5rem' }}>
                  <li><strong>macOS:</strong> Run <code>system_profiler SPUSBDataType</code></li>
                  <li><strong>Linux:</strong> Run <code>lsusb</code></li>
                  <li><strong>Windows:</strong> Check Device Manager → Properties → Details → Hardware IDs</li>
                </ul>
              </div>
            </div>
            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                <Save size={18} />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default BusinessSettings;
