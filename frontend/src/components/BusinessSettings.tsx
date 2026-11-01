import React, { useState, useEffect, useRef } from 'react';
import { Save, Store, Printer, Receipt, Building2, RefreshCw, AlertCircle, Check, Upload, Trash2, Image, Palette, Percent, Package, Sun, Moon, Monitor, Usb, ChefHat, Wifi, Zap, LifeBuoy, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useDataStore, useAuthStore, useUIStore, ColorMode } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import { THEME_PRESETS, applyThemeColor } from '../contexts/ThemeContext';
import { printerService } from '../services/printer';
import { getDeviceId } from '../utils/deviceId';
import SoftwareUpdates from './SoftwareUpdates';
import StoreSupport from './StoreSupport';
import notify from '../utils/toast';

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
  const colorMode = useUIStore((state) => state.colorMode);
  const setColorMode = useUIStore((state) => state.setColorMode);
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
  const location = useLocation();
  
  const [activeTab, setActiveTab] = useState<'general' | 'tax' | 'printer' | 'appearance' | 'software-updates' | 'support'>('general');

  // Allow deep linking via ?tab=support
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'support') {
      setActiveTab('support');
    }
  }, [location.search]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const deviceId = getDeviceId();
  const isThisDeviceDesignated = !!currentStore?.remotePrinterDeviceId && currentStore.remotePrinterDeviceId === deviceId;

  // Available printers from printer service
  const [availablePrinters, setAvailablePrinters] = useState<PrinterDevice[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [printerError, setPrinterError] = useState('');
  const [selectedPrinterName, setSelectedPrinterName] = useState('');

  const [generalSettings, setGeneralSettings] = useState({
    name: '',
    branch: '',
    location: '',
    fssaiNo: '',
    phone: '',
  });

  // Superadmin-only: days after which a store's sales history is hidden.
  const [dataRetentionDays, setDataRetentionDays] = useState(0);

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

  const [appearanceSettings, setAppearanceSettings] = useState({
    themeColor: '',
  });

  const [taxSettings, setTaxSettings] = useState({
    taxEnabled: false,
    defaultTaxPercent: 0,
  });
  const [gstSettings, setGstSettings] = useState({
    gstRegistrationType: 'regular',
    gstin: '',
    stateCode: '',
    pricesIncludeTax: false,
    invoicePrefix: 'INV',
    creditNotePrefix: 'CN',
    defaultSacCode: '996331',
    swiggyGstin: '',
    zomatoGstin: '',
    otherEcoGstin: '',
  });
  const [nextInvoiceNo, setNextInvoiceNo] = useState('');
  const { gstMeta, fetchGstMeta } = useDataStore();
  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const PREFIX_RE = /^[A-Z0-9-]{1,5}$/;
  // Operators may quote their TCS registration ("C" in place of "Z").
  const ECO_GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][ZC][0-9A-Z]$/;

  useEffect(() => {
    if (currentStore) {
      setGeneralSettings({
        name: currentStore.name || '',
        branch: currentStore.branch || '',
        location: currentStore.location || '',
        fssaiNo: currentStore.fssaiNo || '',
        phone: currentStore.phone || '',
      });
      setDataRetentionDays(currentStore.dataRetentionDays ?? 0);
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
      setAppearanceSettings({
        themeColor: currentStore.themeColor || '',
      });
      setTaxSettings({
        taxEnabled: currentStore.taxEnabled === true,
        defaultTaxPercent: currentStore.defaultTaxPercent ?? 0,
      });
      setGstSettings({
        gstRegistrationType: currentStore.gstRegistrationType || 'regular',
        gstin: currentStore.gstin || '',
        stateCode: currentStore.stateCode || '',
        pricesIncludeTax: currentStore.pricesIncludeTax === true,
        invoicePrefix: currentStore.invoicePrefix || 'INV',
        creditNotePrefix: currentStore.creditNotePrefix || 'CN',
        defaultSacCode: currentStore.defaultSacCode || '996331',
        swiggyGstin: currentStore.swiggyGstin || '',
        zomatoGstin: currentStore.zomatoGstin || '',
        otherEcoGstin: currentStore.otherEcoGstin || '',
      });
      fetchGstMeta().catch(() => {});
      api.getNextInvoiceNo(currentStore.id).then(setNextInvoiceNo).catch(() => setNextInvoiceNo(''));
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

  const selectPrinter = (printerName: string) => {
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
      await updateStore(currentStore.id, {
        ...generalSettings,
        // Only superadmin may change retention; the backend ignores the
        // field for other roles, but don't send it for clarity.
        ...(user?.role === 'superadmin' ? { dataRetentionDays } : {}),
      });
      notify.success('Settings saved successfully');
    } catch (error) {
      notify.error('Failed to save settings');
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
      notify.success('Printer settings saved');
    } catch (error) {
      notify.error('Failed to save printer settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetRemotePrinterDevice = async () => {
    if (!currentStore) return;
    setIsSavingDevice(true);
    try {
      await updateStore(currentStore.id, { remotePrinterDeviceId: deviceId });
      notify.success('This device is now the remote bill printer');
    } catch (error) {
      notify.error('Failed to set remote bill printer');
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleClearRemotePrinterDevice = async () => {
    if (!currentStore) return;
    setIsSavingDevice(true);
    try {
      await updateStore(currentStore.id, { remotePrinterDeviceId: '' });
      notify.success('Remote bill printer cleared');
    } catch (error) {
      notify.error('Failed to clear remote bill printer');
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleSaveAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStore) return;

    setIsSaving(true);
    try {
      await updateStore(currentStore.id, {
        themeColor: appearanceSettings.themeColor || '',
      });
      notify.success('Appearance settings saved');
    } catch (error) {
      notify.error('Failed to save appearance settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTax = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStore) return;

    setIsSaving(true);
    try {
      // With tax off the GST fields are hidden, so only the toggle is saved
      // (the stored GST profile is kept for when tax is turned back on).
      await updateStore(currentStore.id, taxSettings.taxEnabled
        ? { taxEnabled: true, defaultTaxPercent: taxSettings.defaultTaxPercent, ...gstSettings }
        : { taxEnabled: false });
      notify.success('Tax settings saved');
    } catch (error: any) {
      notify.error(error?.message || 'Failed to save tax settings');
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
      notify.warning('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      notify.warning('Image size should be less than 2MB');
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
      notify.success('Logo uploaded successfully');
      // Refresh stores to get updated logo URL
      await fetchStores();
    } catch (error) {
      notify.error('Failed to upload logo');
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
      notify.success('Logo removed');
      // Refresh stores to get updated logo URL
      await fetchStores();
    } catch (error) {
      notify.error('Failed to remove logo');
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
          className={`tab ${activeTab === 'tax' ? 'active' : ''}`}
          onClick={() => setActiveTab('tax')}
        >
          <Percent size={18} />
          Tax
        </button>
        <button
          className={`tab ${activeTab === 'printer' ? 'active' : ''}`}
          onClick={() => setActiveTab('printer')}
        >
          <Printer size={18} />
          Printer & Invoice
        </button>
        <button
          className={`tab ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          <Palette size={18} />
          Appearance
        </button>
        <button
          className={`tab ${activeTab === 'software-updates' ? 'active' : ''}`}
          onClick={() => setActiveTab('software-updates')}
        >
          <Package size={18} />
          Software Updates
        </button>
        <button
          className={`tab ${activeTab === 'support' ? 'active' : ''}`}
          onClick={() => setActiveTab('support')}
        >
          <LifeBuoy size={18} />
          Support
        </button>
      </div>

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

              {user?.role === 'superadmin' && (
                <div className="form-group" style={{ marginTop: '0.5rem', padding: '1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', background: 'var(--gray-50)' }}>
                  <label>Data Retention — hide sales history after (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={dataRetentionDays}
                    onChange={e => setDataRetentionDays(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0 = keep all history"
                    style={{ maxWidth: '160px' }}
                  />
                  <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: '0.5rem', marginBottom: 0 }}>
                    Orders, bills, sales/profit reports and expenses older than this many days are
                    hidden from store users. Nothing is deleted — the data stays in the database and
                    remains visible to superadmin for analytics. 0 = unlimited.
                  </p>
                </div>
              )}

              {user?.role !== 'superadmin' && (currentStore.dataRetentionDays ?? 0) > 0 && (
                <div className="form-group" style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', background: 'var(--gray-50)' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', margin: 0 }}>
                    Sales, order, report and expense history older than {currentStore.dataRetentionDays} days
                    is hidden for this store. Contact your administrator for older records.
                  </p>
                </div>
              )}
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

      {activeTab === 'tax' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tax Configuration</span>
          </div>
          <form onSubmit={handleSaveTax}>
            <div className="card-body">
              <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
                Enable or disable tax for this store. When disabled, all tax-related fields, calculations, and invoice tax lines will be hidden across the application for this store.
              </p>

              <div className="form-group" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taxSettings.taxEnabled}
                    onChange={e => setTaxSettings({ ...taxSettings, taxEnabled: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600 }}>Enable Tax</span>
                </label>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginTop: '0.5rem', marginLeft: '52px' }}>
                  When enabled, tax percentages on items and tax totals on orders/bills will be calculated and displayed. When disabled, all tax fields are hidden and tax amounts are treated as zero.
                </p>
              </div>

              {taxSettings.taxEnabled && (<>
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label>Default Tax %</label>
                <select
                  value={taxSettings.defaultTaxPercent}
                  onChange={e => setTaxSettings({ ...taxSettings, defaultTaxPercent: parseFloat(e.target.value) })}
                >
                  {(gstMeta?.rates || [0, 5]).map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
                <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                  This rate will be used as the default tax rate when creating new items.
                </small>
              </div>

              <h4 style={{ margin: '1.5rem 0 0.75rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}>GST</h4>

              <div className="form-group">
                <label>Registration type</label>
                <select
                  value={gstSettings.gstRegistrationType}
                  onChange={e => setGstSettings({ ...gstSettings, gstRegistrationType: e.target.value })}
                >
                  <option value="regular">Regular</option>
                  <option value="composition">Composition</option>
                  <option value="unregistered">Unregistered</option>
                </select>
                {gstSettings.gstRegistrationType === 'composition' && (
                  <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
                    Bills will be issued as Bill of Supply without GST
                  </small>
                )}
                {gstSettings.gstRegistrationType === 'regular' && !gstSettings.gstin && (
                  <small style={{ color: 'var(--warning, #e6a23c)', display: 'block', marginTop: '0.25rem' }}>
                    A regular GST registration requires a valid GSTIN.
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>GSTIN</label>
                <input
                  value={gstSettings.gstin}
                  onChange={e => {
                    const g = e.target.value.toUpperCase().slice(0, 15);
                    setGstSettings({
                      ...gstSettings,
                      gstin: g,
                      ...(g.length >= 2 && gstMeta?.states.some(st => st.code === g.slice(0, 2))
                        ? { stateCode: g.slice(0, 2) } : {}),
                    });
                  }}
                  placeholder="27ABCDE1234F1Z0"
                />
                {gstSettings.gstin && !GSTIN_RE.test(gstSettings.gstin) && (
                  <small style={{ color: 'var(--danger, #f66)', display: 'block', marginTop: '0.25rem' }}>Invalid GSTIN format</small>
                )}
              </div>

              <div className="form-group">
                <label>State</label>
                <select
                  value={gstSettings.stateCode}
                  onChange={e => setGstSettings({ ...gstSettings, stateCode: e.target.value })}
                  disabled={!!gstSettings.gstin}
                >
                  <option value="">Select state</option>
                  {(gstMeta?.states || []).map(st => (
                    <option key={st.code} value={st.code}>{st.code} — {st.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={gstSettings.pricesIncludeTax}
                    onChange={e => setGstSettings({ ...gstSettings, pricesIncludeTax: e.target.checked })}
                  />
                  Menu prices include GST
                </label>
              </div>

              <div className="form-group">
                <label>Invoice prefix</label>
                <input
                  value={gstSettings.invoicePrefix}
                  onChange={e => setGstSettings({ ...gstSettings, invoicePrefix: e.target.value.toUpperCase() })}
                  maxLength={5}
                />
                {gstSettings.invoicePrefix && !PREFIX_RE.test(gstSettings.invoicePrefix) && (
                  <small style={{ color: 'var(--danger, #f66)' }}>1–5 chars of A–Z, 0–9, '-'</small>
                )}
                {nextInvoiceNo && (
                  <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>Next invoice: {nextInvoiceNo}</small>
                )}
              </div>

              <div className="form-group">
                <label>Credit note prefix</label>
                <input
                  value={gstSettings.creditNotePrefix}
                  onChange={e => setGstSettings({ ...gstSettings, creditNotePrefix: e.target.value.toUpperCase() })}
                  maxLength={5}
                />
                {gstSettings.creditNotePrefix && !PREFIX_RE.test(gstSettings.creditNotePrefix) && (
                  <small style={{ color: 'var(--danger, #f66)' }}>1–5 chars of A–Z, 0–9, '-'</small>
                )}
              </div>

              <div className="form-group">
                <label>Default SAC</label>
                <input
                  value={gstSettings.defaultSacCode}
                  onChange={e => setGstSettings({ ...gstSettings, defaultSacCode: e.target.value })}
                  placeholder="996331"
                />
              </div>

              <h4 style={{ margin: '1.5rem 0 0.5rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}>Delivery platforms</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
                Swiggy/Zomato pay GST on orders placed through them (Sec 9(5)). Their GSTIN for your state is needed to report these sales in GSTR-1 Table 14 — it is on the platform's monthly tax statement.
              </p>
              {([['swiggyGstin', 'Swiggy GSTIN'], ['zomatoGstin', 'Zomato GSTIN'], ['otherEcoGstin', 'Other platform GSTIN']] as const).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input
                    value={gstSettings[key]}
                    onChange={e => setGstSettings({ ...gstSettings, [key]: e.target.value.toUpperCase().slice(0, 15) })}
                    placeholder="Optional"
                  />
                  {gstSettings[key] && !ECO_GSTIN_RE.test(gstSettings[key]) && (
                    <small style={{ color: 'var(--danger, #f66)' }}>Invalid GSTIN format</small>
                  )}
                </div>
              ))}

              <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                Standalone restaurants charge 5% GST without ITC; 18% applies only to restaurants in hotels with room tariff above ₹7,500.
              </p>
              </>)}
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

      {activeTab === 'appearance' && (
        <>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <span className="card-title">Display Mode</span>
          </div>
          <div className="card-body">
            <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
              Choose between light and dark appearance for this device. "System" follows your operating system's setting.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
              {([
                { id: 'light' as ColorMode, name: 'Light', icon: Sun, preview: 'linear-gradient(135deg, #ffffff 0%, #f4f6f9 100%)' },
                { id: 'dark' as ColorMode, name: 'Dark', icon: Moon, preview: 'linear-gradient(135deg, #1c2330 0%, #10151d 100%)' },
                { id: 'system' as ColorMode, name: 'System', icon: Monitor, preview: 'linear-gradient(135deg, #ffffff 0%, #ffffff 49%, #1c2330 50%, #10151d 100%)' },
              ]).map((mode) => {
                const selected = colorMode === mode.id;
                const ModeIcon = mode.icon;
                return (
                  <label
                    key={mode.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '1rem',
                      border: '2px solid',
                      borderColor: selected ? 'var(--primary)' : 'var(--gray-200)',
                      borderRadius: 'var(--radius)',
                      background: selected ? 'var(--primary-50)' : 'var(--surface)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="colorMode"
                      value={mode.id}
                      checked={selected}
                      onChange={() => setColorMode(mode.id)}
                      style={{ display: 'none' }}
                    />
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: mode.preview,
                      border: '1px solid var(--gray-300)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <ModeIcon size={18} color={mode.id === 'light' ? '#f5a623' : mode.id === 'dark' ? '#a3adc0' : 'var(--gray-500)'} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{mode.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">UI Theme Color</span>
          </div>
          <form onSubmit={handleSaveAppearance}>
            <div className="card-body">
              <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
                Choose a color theme for this store. This will change the primary color used throughout the UI (buttons, active states, highlights). The default theme is Orange.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
                {/* Default / No custom color */}
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    padding: '1rem',
                    border: '2px solid',
                    borderColor: !appearanceSettings.themeColor ? 'var(--primary)' : 'var(--gray-200)',
                    borderRadius: 'var(--radius)',
                    background: !appearanceSettings.themeColor ? 'rgba(245,130,32,0.05)' : 'var(--surface)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="themeColor"
                    value=""
                    checked={!appearanceSettings.themeColor}
                    onChange={() => {
                      setAppearanceSettings({ themeColor: '' });
                      applyThemeColor(undefined);
                    }}
                    style={{ display: 'none' }}
                  />
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f99b3f 0%, #f58220 50%, #e0731a 100%)',
                    boxShadow: '0 2px 8px rgba(245,130,32,0.3)',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Default (Orange)</span>
                </label>

                {THEME_PRESETS.filter(t => t.id !== 'default').map((preset) => {
                  const selected = appearanceSettings.themeColor === preset.primary;
                  return (
                    <label
                      key={preset.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        padding: '1rem',
                        border: '2px solid',
                        borderColor: selected ? preset.primary : 'var(--gray-200)',
                        borderRadius: 'var(--radius)',
                        background: selected ? `${preset.primary}10` : 'var(--surface)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="themeColor"
                        value={preset.primary}
                        checked={selected}
                        onChange={() => {
                          setAppearanceSettings({ themeColor: preset.primary });
                          applyThemeColor(preset.primary);
                        }}
                        style={{ display: 'none' }}
                      />
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${preset.primaryLight} 0%, ${preset.primary} 50%, ${preset.primaryDark} 100%)`,
                        boxShadow: `0 2px 8px ${preset.primary}50`,
                      }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{preset.name}</span>
                    </label>
                  );
                })}
              </div>

              {/* Custom color picker */}
              <div style={{
                marginTop: '2rem',
                padding: '1rem',
                background: 'var(--gray-50)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--gray-200)',
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="color"
                    value={appearanceSettings.themeColor || '#f58220'}
                    onChange={(e) => {
                      setAppearanceSettings({ themeColor: e.target.value });
                      applyThemeColor(e.target.value);
                    }}
                    style={{ width: '44px', height: '44px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', padding: 0 }}
                  />
                  <div>
                    <span style={{ fontWeight: 600 }}>Custom Color</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                      Pick any color using the color picker above.
                    </p>
                  </div>
                </label>
              </div>

              {/* Preview */}
              <div style={{
                marginTop: '1.5rem',
                padding: '1.5rem',
                background: 'var(--gray-50)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--gray-200)',
              }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Preview</h4>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn btn-primary" disabled>
                    Primary Button
                  </button>
                  <button type="button" className="btn btn-outline" disabled>
                    Outline Button
                  </button>
                  <span style={{
                    padding: '0.375rem 0.875rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: 'rgba(245,130,32,0.1)',
                    color: 'var(--primary)',
                  }}>
                    Active Badge
                  </span>
                </div>
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
        </>
      )}

      {activeTab === 'printer' && (
        <div className="card printer-config">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">Printer Configuration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {!isLoadingPrinters && !printerError && (
                <span className={`pc-count-badge ${availablePrinters.length === 0 ? 'muted' : ''}`}>
                  {availablePrinters.length} detected
                </span>
              )}
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={fetchPrinters}
                disabled={isLoadingPrinters}
              >
                <RefreshCw size={14} style={{ animation: isLoadingPrinters ? 'spin 1s linear infinite' : 'none' }} />
                Refresh
              </button>
            </div>
          </div>
          <form onSubmit={handleSavePrinter}>
            <div className="card-body">
              {printerError && (
                <div className="pc-alert pc-alert-error">
                  <AlertCircle size={16} />
                  <span>{printerError}</span>
                </div>
              )}

              {/* Printer Selection */}
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <div className="pc-section-label">
                  <Usb size={13} />
                  Receipt Printer
                </div>
                {isLoadingPrinters ? (
                  <div className="pc-printer-list">
                    <div className="pc-skeleton" />
                    <div className="pc-skeleton" />
                  </div>
                ) : availablePrinters.length > 0 ? (
                  <div className="pc-printer-list">
                    {availablePrinters.map((printer) => (
                      <button
                        type="button"
                        key={printer.name}
                        className={`pc-printer-option ${selectedPrinterName === printer.name ? 'selected' : ''}`}
                        onClick={() => selectPrinter(printer.name)}
                      >
                        <div className="pc-icon-tile">
                          <Printer size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="pc-printer-name">
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {printer.name}
                            </span>
                            {printer.type && <span className="pc-type-badge">{printer.type}</span>}
                          </div>
                          {(printer.vendor_id || printer.product_id || printer.address) && (
                            <div className="pc-printer-ids">
                              {printer.vendor_id && <span className="pc-mono">VID {printer.vendor_id}</span>}
                              {printer.product_id && <span className="pc-mono">PID {printer.product_id}</span>}
                              {printer.address && <span className="pc-printer-address">{printer.address}</span>}
                            </div>
                          )}
                        </div>
                        <span className="pc-check">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="pc-empty">
                    <Printer size={28} />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>No printers detected</span>
                    <span style={{ fontSize: '0.76rem' }}>
                      Connect a printer and hit Refresh to scan again
                    </span>
                  </div>
                )}
              </div>

              {/* Invoice Size */}
              <div className="form-group" style={{ marginTop: '1.75rem' }}>
                <div className="pc-section-label">
                  <Receipt size={13} />
                  Invoice & Thermal Paper Size
                </div>
                <div className="pc-size-grid">
                  {/* 2 Inch / 58mm Option */}
                  <label className={`pc-size-card ${printerSettings.invoiceSize === '2inch' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="invoiceSize"
                      value="2inch"
                      checked={printerSettings.invoiceSize === '2inch'}
                      onChange={e => setPrinterSettings({ ...printerSettings, invoiceSize: e.target.value })}
                      style={{ display: 'none' }}
                    />
                    <div className="pc-size-card-header">
                      <div className="pc-size-radio">
                        <span className="pc-radio-dot">
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                      </div>
                      <div className="pc-size-meta">
                        <div className="pc-size-title-row">
                          <span className="pc-size-title">2 Inch</span>
                          <span className="pc-size-pill">58mm Roll</span>
                        </div>
                        <span className="pc-size-subtitle">Compact bill • Takeaway & Quick POS</span>
                      </div>
                    </div>

                    {/* Printer Slot & Realistic Emerging Paper */}
                    <div className="pc-dispenser">
                      <div className="pc-dispenser-slot">
                        <div className="pc-slot-slit" />
                      </div>
                      <div className="pc-paper-wrap pc-paper-2inch">
                        <div className="pc-mock-receipt">
                          <div className="pc-rcpt-header">
                            <span className="pc-rcpt-store">CAFE MARIO</span>
                            <span className="pc-rcpt-subhead">#102 • Table 3</span>
                          </div>
                          <div className="pc-rcpt-dash">------------------------</div>
                          <div className="pc-rcpt-items">
                            <div className="pc-rcpt-row">
                              <span>1x Cold Coffee</span>
                              <span>₹120.00</span>
                            </div>
                            <div className="pc-rcpt-row">
                              <span>1x Veg Sandwich</span>
                              <span>₹140.00</span>
                            </div>
                          </div>
                          <div className="pc-rcpt-dash">------------------------</div>
                          <div className="pc-rcpt-total-row">
                            <span className="pc-rcpt-total-lbl">TOTAL</span>
                            <span className="pc-rcpt-total-val">₹260.00</span>
                          </div>
                          <div className="pc-rcpt-cutter" />
                        </div>
                      </div>
                    </div>

                    {/* Feature Chips */}
                    <div className="pc-size-features">
                      <span className="pc-feat-chip">32 chars/line</span>
                      <span className="pc-feat-chip">Paper saving</span>
                      <span className="pc-feat-chip">Compact footprint</span>
                    </div>
                  </label>

                  {/* 3 Inch / 80mm Option */}
                  <label className={`pc-size-card ${printerSettings.invoiceSize === '3inch' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="invoiceSize"
                      value="3inch"
                      checked={printerSettings.invoiceSize === '3inch'}
                      onChange={e => setPrinterSettings({ ...printerSettings, invoiceSize: e.target.value })}
                      style={{ display: 'none' }}
                    />
                    <div className="pc-size-card-header">
                      <div className="pc-size-radio">
                        <span className="pc-radio-dot">
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                      </div>
                      <div className="pc-size-meta">
                        <div className="pc-size-title-row">
                          <span className="pc-size-title">3 Inch</span>
                          <span className="pc-size-pill">80mm Roll</span>
                          <span className="pc-recommended-badge">
                            <Sparkles size={10} />
                            Recommended
                          </span>
                        </div>
                        <span className="pc-size-subtitle">Standard bill • Dine-in & Itemized GST</span>
                      </div>
                    </div>

                    {/* Printer Slot & Realistic Emerging Paper */}
                    <div className="pc-dispenser">
                      <div className="pc-dispenser-slot">
                        <div className="pc-slot-slit" />
                      </div>
                      <div className="pc-paper-wrap pc-paper-3inch">
                        <div className="pc-mock-receipt">
                          <div className="pc-rcpt-header">
                            <span className="pc-rcpt-store">CAFE MARIO & RESTAURANT</span>
                            <span className="pc-rcpt-subhead">Tax Invoice #INV-1042 • Table 12</span>
                          </div>
                          <div className="pc-rcpt-dash">--------------------------------</div>
                          <div className="pc-rcpt-col-head">
                            <span>ITEM</span>
                            <span>QTY</span>
                            <span>RATE</span>
                            <span>AMT</span>
                          </div>
                          <div className="pc-rcpt-items">
                            <div className="pc-rcpt-row-4col">
                              <span>Paneer Tikka</span>
                              <span>1</span>
                              <span>280</span>
                              <span>280.00</span>
                            </div>
                            <div className="pc-rcpt-row-4col">
                              <span>Butter Naan</span>
                              <span>2</span>
                              <span>45</span>
                              <span>90.00</span>
                            </div>
                            <div className="pc-rcpt-row-4col">
                              <span>Fresh Lime</span>
                              <span>2</span>
                              <span>60</span>
                              <span>120.00</span>
                            </div>
                          </div>
                          <div className="pc-rcpt-dash">--------------------------------</div>
                          <div className="pc-rcpt-subtotal-row">
                            <span>Subtotal</span>
                            <span>₹490.00</span>
                          </div>
                          <div className="pc-rcpt-subtotal-row">
                            <span>GST (5%)</span>
                            <span>₹24.50</span>
                          </div>
                          <div className="pc-rcpt-total-row">
                            <span className="pc-rcpt-total-lbl">GRAND TOTAL</span>
                            <span className="pc-rcpt-total-val">₹514.50</span>
                          </div>
                          <div className="pc-rcpt-cutter" />
                        </div>
                      </div>
                    </div>

                    {/* Feature Chips */}
                    <div className="pc-size-features">
                      <span className="pc-feat-chip">48 chars/line</span>
                      <span className="pc-feat-chip">Itemized GST breakdown</span>
                      <span className="pc-feat-chip">Full dine-in table</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Features */}
              <div className="form-group" style={{ marginTop: '1.75rem', marginBottom: 0 }}>
                <div className="pc-section-label">
                  <Zap size={13} />
                  Features
                </div>
                <div className="pc-toggle-list">
                  <label className={`pc-toggle-row ${printerSettings.kotPrintEnabled ? 'enabled' : ''}`}>
                    {/* 1. Icon at first */}
                    <div className="pc-icon-tile">
                      <ChefHat size={20} />
                    </div>
                    {/* 2. Labels/texts in right side of icon */}
                    <div className="pc-toggle-content">
                      <div className="pc-toggle-title">KOT Printing</div>
                      <div className="pc-toggle-desc">
                        Kitchen order tickets print automatically when orders are placed
                      </div>
                    </div>
                    {/* 3. Toggle switch at far right end */}
                    <div className="pc-toggle-action">
                      <input
                        type="checkbox"
                        checked={printerSettings.kotPrintEnabled}
                        onChange={e => setPrinterSettings({ ...printerSettings, kotPrintEnabled: e.target.checked })}
                      />
                    </div>
                  </label>
                  <label className={`pc-toggle-row ${printerSettings.remoteBillingEnabled ? 'enabled' : ''}`}>
                    {/* 1. Icon at first */}
                    <div className="pc-icon-tile">
                      <Wifi size={20} />
                    </div>
                    {/* 2. Labels/texts in right side of icon */}
                    <div className="pc-toggle-content">
                      <div className="pc-toggle-title">Remote Billing</div>
                      <div className="pc-toggle-desc">
                        Queue-based bill generation and printing
                      </div>
                    </div>
                    {/* 3. Toggle switch at far right end */}
                    <div className="pc-toggle-action">
                      <input
                        type="checkbox"
                        id="remote-billing-toggle"
                        checked={printerSettings.remoteBillingEnabled}
                        onChange={e => setPrinterSettings({ ...printerSettings, remoteBillingEnabled: e.target.checked })}
                      />
                    </div>
                  </label>
                  {printerSettings.remoteBillingEnabled && (
                    <div className={`pc-toggle-row ${isThisDeviceDesignated ? 'enabled' : ''}`}>
                      <div className="pc-icon-tile">
                        <Printer size={20} />
                      </div>
                      <div className="pc-toggle-content">
                        <div className="pc-toggle-title">Remote Bill Printer</div>
                        <div className="pc-toggle-desc">
                          {isThisDeviceDesignated
                            ? 'This device is the designated bill printer for this store.'
                            : currentStore?.remotePrinterDeviceId
                              ? 'Another device is designated. Take over to print remote bills here.'
                              : 'No device designated — remote bills will not print until one is set.'}
                          <span style={{ display: 'block', fontFamily: 'monospace', fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>
                            This device: {deviceId.slice(0, 8)}…
                          </span>
                        </div>
                      </div>
                      <div className="pc-toggle-action">
                        {isThisDeviceDesignated ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleClearRemotePrinterDevice}
                            disabled={isSavingDevice}
                          >
                            Clear
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSetRemotePrinterDevice}
                            disabled={isSavingDevice}
                          >
                            Use this device
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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

      {activeTab === 'software-updates' && <SoftwareUpdates />}

      {activeTab === 'support' && <StoreSupport storeId={currentStore.id} />}
    </div>
  );
};

export default BusinessSettings;
