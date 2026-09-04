import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Sparkles, Loader2, AlertCircle, Check, FileText, ImageIcon, RefreshCw,
  Code, Eye, Save, X, Plus, ArrowRight, Search,
} from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import { cache, cacheKeys } from '../utils/cache';
import type { Store, Category, Item } from '../types';

// ---- Types matching the backend standardized menu format ----

interface ParsedMenuItem {
  name: string;
  description: string;
  price: number;
  hsnCode: string;
  taxPercent: number;
  // frontend-only fields for diffing/editing
  _status?: 'new' | 'price-change' | 'match';
  _currentPrice?: number;
}

interface ParsedMenuCategory {
  name: string;
  description: string;
  items: ParsedMenuItem[];
  _status?: 'new' | 'match';
}

interface ParsedMenu {
  categories: ParsedMenuCategory[];
}

type ItemStatus = 'new' | 'price-change' | 'match';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const MenuUpload: React.FC = () => {
  const { user } = useAuthStore();
  const { stores, fetchCategories, fetchItems } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const [fileMimeType, setFileMimeType] = useState('');
  const [filePreview, setFilePreview] = useState('');

  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedMenu, setParsedMenu] = useState<ParsedMenu | null>(null);
  const [rawResponse, setRawResponse] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [info, setInfo] = useState('');

  // Current menu of the selected store (for comparison)
  const [currentCategories, setCurrentCategories] = useState<Category[]>([]);
  const [currentItems, setCurrentItems] = useState<Item[]>([]);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);

  useEffect(() => {
    setHeaderContent({
      title: 'AI Menu Upload',
      subtitle: 'Parse a menu image/PDF with Gemini and import it into a store - Superadmin only',
      actions: null,
    });
  }, [setHeaderContent]);

  // Load the selected store's current menu whenever the store changes.
  useEffect(() => {
    if (!selectedStoreId) {
      setCurrentCategories([]);
      setCurrentItems([]);
      return;
    }
    loadCurrentMenu(selectedStoreId);
  }, [selectedStoreId]);

  const loadCurrentMenu = async (storeId: string) => {
    setIsLoadingCurrent(true);
    try {
      const [cats, items] = await Promise.all([
        api.getCategories(storeId),
        api.getItems(storeId),
      ]);
      setCurrentCategories(cats || []);
      setCurrentItems(items || []);
      // Re-run comparison if a parsed menu is already present.
      if (parsedMenu) {
        setParsedMenu(applyDiff(parsedMenu, cats || [], items || []));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load current store menu');
    } finally {
      setIsLoadingCurrent(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    setInfo('');
    setParsedMenu(null);
    setRawResponse('');

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      setError('Please upload an image (PNG/JPG) or a PDF file.');
      return;
    }
    // 20MB limit to stay within Gemini inline data limits.
    if (file.size > 20 * 1024 * 1024) {
      setError('File is too large. Maximum size is 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setFileBase64(result);
      setFileMimeType(isPdf ? 'application/pdf' : file.type);
      setFileName(file.name);
      setFilePreview(isPdf ? '' : result);
    };
    if (isImage) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleParse = async () => {
    if (!selectedStoreId) {
      setError('Please select a target store first.');
      return;
    }
    if (!fileBase64) {
      setError('Please upload a menu image or PDF first.');
      return;
    }

    setIsParsing(true);
    setError('');
    setSuccess('');
    setInfo('');
    setParsedMenu(null);
    setRawResponse('');

    try {
      const data = await api.parseMenuImage(selectedStoreId, fileBase64, fileMimeType);
      const menu: ParsedMenu = data.menu || { categories: [] };
      setRawResponse(data.rawResponse || '');
      setUsedModel(data.model || '');
      const diffed = applyDiff(menu, currentCategories, currentItems);
      setParsedMenu(diffed);
      const totalItems = diffed.categories.reduce((n, c) => n + c.items.length, 0);
      setInfo(`Parsed ${diffed.categories.length} categories and ${totalItems} items using ${data.model || 'Gemini'}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to parse menu with Gemini');
    } finally {
      setIsParsing(false);
    }
  };

  // applyDiff compares the parsed menu against the store's current menu and
  // annotates each category/item with a status used for highlighting.
  const applyDiff = (menu: ParsedMenu, cats: Category[], items: Item[]): ParsedMenu => {
    const catByName = new Map<string, Category>();
    cats.forEach(c => catByName.set(norm(c.name), c));
    const itemsByCatName = new Map<string, Map<string, Item>>();
    items.forEach(it => {
      const catName = norm(it.categoryName || '');
      if (!itemsByCatName.has(catName)) itemsByCatName.set(catName, new Map());
      itemsByCatName.get(catName)!.set(norm(it.name), it);
    });

    return {
      categories: (menu.categories || []).map(cat => {
        const key = norm(cat.name);
        const matchedCat = catByName.get(key);
        const catItems = itemsByCatName.get(key);
        const items = (cat.items || []).map(item => {
          const matched = catItems?.get(norm(item.name));
          if (!matched) {
            return { ...item, _status: 'new' as ItemStatus };
          }
          if (Math.abs((matched.price || 0) - (item.price || 0)) > 0.001) {
            return { ...item, _status: 'price-change' as ItemStatus, _currentPrice: matched.price };
          }
          return { ...item, _status: 'match' as ItemStatus, _currentPrice: matched.price };
        });
        return { ...cat, _status: matchedCat ? 'match' : 'new', items };
      }),
    };
  };

  const handleEditItem = (catIdx: number, itemIdx: number, field: keyof ParsedMenuItem, value: string) => {
    setParsedMenu(prev => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      const cat = { ...next.categories[catIdx], items: [...next.categories[catIdx].items] };
      const item = { ...cat.items[itemIdx] };
      if (field === 'price' || field === 'taxPercent') {
        item[field] = parseFloat(value) || 0;
      } else {
        (item as any)[field] = value;
      }
      cat.items[itemIdx] = item;
      next.categories[catIdx] = cat;
      return next;
    });
  };

  const handleEditCategory = (catIdx: number, field: 'name' | 'description', value: string) => {
    setParsedMenu(prev => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      next.categories[catIdx] = { ...next.categories[catIdx], [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (catIdx: number, itemIdx: number) => {
    setParsedMenu(prev => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      const cat = { ...next.categories[catIdx], items: next.categories[catIdx].items.filter((_, i) => i !== itemIdx) };
      next.categories[catIdx] = cat;
      return next;
    });
  };

  const handleRemoveCategory = (catIdx: number) => {
    setParsedMenu(prev => {
      if (!prev) return prev;
      return { ...prev, categories: prev.categories.filter((_, i) => i !== catIdx) };
    });
  };

  const handleAddItem = (catIdx: number) => {
    setParsedMenu(prev => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      const cat = { ...next.categories[catIdx], items: [...next.categories[catIdx].items, { name: '', description: '', price: 0, hsnCode: '', taxPercent: 0, _status: 'new' as ItemStatus }] };
      next.categories[catIdx] = cat;
      return next;
    });
  };

  const handleImport = async () => {
    if (!selectedStoreId) {
      setError('Please select a target store.');
      return;
    }
    if (!parsedMenu || parsedMenu.categories.length === 0) {
      setError('Nothing to import. Parse a menu first.');
      return;
    }

    const confirmMsg = replaceExisting
      ? 'This will REPLACE the entire current menu of this store (existing categories and items will be deactivated) and import the parsed menu. Continue?'
      : 'This will ADD the parsed categories and items to this store. Continue?';
    if (!window.confirm(confirmMsg)) return;

    setIsImporting(true);
    setError('');
    setSuccess('');
    try {
      const payload = parsedMenu.categories.map(c => ({
        name: c.name.trim(),
        description: c.description,
        items: c.items
          .filter(i => i.name.trim() !== '')
          .map(i => ({
            name: i.name.trim(),
            description: i.description,
            price: i.price,
            hsnCode: i.hsnCode,
            taxPercent: i.taxPercent,
          })),
      }));
      const res = await api.bulkCreateMenu(selectedStoreId, payload, replaceExisting);
      setSuccess(res.message || 'Menu imported successfully.');
      // Refresh the current menu view + bust the dataStore cache.
      cache.delete(cacheKeys.categories(selectedStoreId));
      cache.delete(cacheKeys.items(selectedStoreId));
      await loadCurrentMenu(selectedStoreId);
      // Refresh the global dataStore too (in case the admin is viewing that store).
      await Promise.all([fetchCategories(), fetchItems()]);
    } catch (err: any) {
      setError(err.message || 'Failed to import menu');
    } finally {
      setIsImporting(false);
    }
  };

  const resetAll = () => {
    setParsedMenu(null);
    setRawResponse('');
    setUsedModel('');
    setFileBase64('');
    setFileName('');
    setFilePreview('');
    setFileMimeType('');
    setError('');
    setSuccess('');
    setInfo('');
    setShowRaw(false);
    setShowOnlyChanges(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (user?.role !== 'superadmin') {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <AlertCircle size={64} style={{ color: 'var(--danger)', marginBottom: '1.5rem' }} />
        <p style={{ fontSize: '1.125rem', color: 'var(--danger)' }}>Access Denied</p>
        <p style={{ color: 'var(--gray-500)', marginTop: '0.5rem' }}>Only superadmin can use the AI Menu Upload tool.</p>
      </div>
    );
  }

  // Stats for the summary bar
  const stats = parsedMenu
    ? parsedMenu.categories.reduce(
        (acc, c) => {
          acc.cats += 1;
          c.items.forEach(i => {
            acc.items += 1;
            if (i._status === 'new') acc.newItems += 1;
            if (i._status === 'price-change') acc.priceChanges += 1;
          });
          if (c._status === 'new') acc.newCats += 1;
          return acc;
        },
        { cats: 0, items: 0, newCats: 0, newItems: 0, priceChanges: 0 },
      )
    : null;

  const statusBadge = (status?: ItemStatus | 'new' | 'match', currentPrice?: number) => {
    if (!status) return null;
    if (status === 'new') {
      return <span style={badgeStyle('var(--success)')}>NEW</span>;
    }
    if (status === 'price-change') {
      return (
        <span style={badgeStyle('var(--warning, #f59e0b)')}>
          PRICE {currentPrice !== undefined ? `₹${currentPrice}` : ''} → ₹{''}
        </span>
      );
    }
    return <span style={badgeStyle('var(--gray-400)')}>MATCH</span>;
  };

  return (
    <div>
      {success && (
        <div style={alertStyle('var(--success)', 'rgba(43,165,74,0.1)')}>
          <Check size={18} /> {success}
        </div>
      )}
      {error && (
        <div style={alertStyle('var(--danger)', 'rgba(229,57,53,0.1)')}>
          <AlertCircle size={18} /> {error}
          <button onClick={() => setError('')} style={closeBtnStyle}><X size={14} /></button>
        </div>
      )}
      {info && !error && (
        <div style={alertStyle('var(--primary)', 'rgba(0,123,255,0.1)')}>
          <Sparkles size={18} /> {info}
        </div>
      )}

      {/* Step 1: Store + file selection */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={18} /> 1. Select Store & Upload Menu
          </span>
        </div>
        <div className="card-body">
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Target Store</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
            >
              <option value="">-- Select a store --</option>
              {stores.map((s: Store) => (
                <option key={s.id} value={s.id}>{s.name}{s.branch ? ` - ${s.branch}` : ''}</option>
              ))}
            </select>
            <small style={{ color: 'var(--gray-500)', display: 'block', marginTop: '0.25rem' }}>
              The parsed menu will be compared against and imported into this store.
              {isLoadingCurrent && ' Loading current menu...'}
            </small>
          </div>

          <div className="form-group">
            <label>Menu Image or PDF</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--gray-300)',
                borderRadius: 'var(--radius)',
                padding: '2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--gray-50)',
                transition: 'border-color 0.2s',
              }}
            >
              {filePreview ? (
                <div>
                  <img src={filePreview} alt="Menu preview" style={{ maxHeight: '240px', maxWidth: '100%', objectFit: 'contain', marginBottom: '0.75rem' }} />
                  <div style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>{fileName}</div>
                </div>
              ) : fileName ? (
                <div>
                  <FileText size={48} style={{ color: 'var(--gray-400)', marginBottom: '0.75rem' }} />
                  <div style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>{fileName}</div>
                </div>
              ) : (
                <div>
                  <ImageIcon size={48} style={{ color: 'var(--gray-400)', marginBottom: '0.75rem' }} />
                  <div style={{ color: 'var(--gray-600)' }}>Click to upload a menu image (PNG/JPG) or PDF</div>
                  <div style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Max 20MB</div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleParse}
              disabled={isParsing || !fileBase64 || !selectedStoreId}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isParsing ? (
                <><Loader2 size={18} className="animate-spin" /> Parsing with Gemini...</>
              ) : (
                <><Sparkles size={18} /> Parse Menu with Gemini</>
              )}
            </button>
            {(fileBase64 || parsedMenu) && (
              <button className="btn btn-outline" onClick={resetAll} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw size={18} /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: Parsed menu results */}
      {parsedMenu && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} /> 2. Parsed Menu
              {usedModel && <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontWeight: 'normal' }}>({usedModel})</span>}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className={`btn btn-outline ${showOnlyChanges ? 'btn-primary' : ''}`}
                onClick={() => setShowOnlyChanges(!showOnlyChanges)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                title="Show only categories and items that differ from the current store menu"
              >
                <Search size={16} /> Show only changes
              </button>
              <button
                className={`btn btn-outline ${showRaw ? 'btn-primary' : ''}`}
                onClick={() => setShowRaw(!showRaw)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
              >
                <Code size={16} /> {showRaw ? 'Hide' : 'Show'} raw response
              </button>
            </div>
          </div>

          <div className="card-body">
            {stats && (
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <span style={statChipStyle('var(--gray-100)', 'var(--gray-700)')}><strong>{stats.cats}</strong> categories</span>
                <span style={statChipStyle('var(--gray-100)', 'var(--gray-700)')}><strong>{stats.items}</strong> items</span>
                <span style={statChipStyle('rgba(43,165,74,0.15)', 'var(--success)')}><strong>{stats.newCats}</strong> new categories</span>
                <span style={statChipStyle('rgba(43,165,74,0.15)', 'var(--success)')}><strong>{stats.newItems}</strong> new items</span>
                <span style={statChipStyle('rgba(245,158,11,0.15)', 'var(--warning, #f59e0b)')}><strong>{stats.priceChanges}</strong> price changes</span>
              </div>
            )}

            {showRaw && (
              <pre style={{
                background: 'var(--gray-900, #1e1e1e)',
                color: 'var(--gray-100, #e0e0e0)',
                padding: '1rem',
                borderRadius: 'var(--radius)',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '0.8rem',
                marginBottom: '1rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {rawResponse || '(empty)'}
              </pre>
            )}

            {parsedMenu.categories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                No categories were parsed. Try a clearer image or check the raw response.
              </div>
            ) : (
              <div>
                {parsedMenu.categories.map((cat, catIdx) => {
                  const visibleItems = showOnlyChanges
                    ? cat.items.filter(i => i._status === 'new' || i._status === 'price-change')
                    : cat.items;
                  const hideCategory = showOnlyChanges && cat._status !== 'new' && visibleItems.length === 0;
                  if (hideCategory) return null;

                  return (
                    <div key={catIdx} style={{
                      border: '1px solid var(--gray-200)',
                      borderRadius: 'var(--radius)',
                      marginBottom: '1rem',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        background: cat._status === 'new' ? 'rgba(43,165,74,0.08)' : 'var(--gray-50)',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}>
                        {statusBadge(cat._status)}
                        <input
                          value={cat.name}
                          onChange={(e) => handleEditCategory(catIdx, 'name', e.target.value)}
                          style={{ flex: 1, minWidth: '180px', fontWeight: 600, background: 'transparent', border: '1px solid transparent', borderRadius: '4px', padding: '0.25rem 0.5rem' }}
                        />
                        <button
                          className="btn btn-outline"
                          onClick={() => handleAddItem(catIdx)}
                          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <Plus size={14} /> Item
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() => handleRemoveCategory(catIdx)}
                          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: 'var(--danger)' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{ padding: '0.5rem 1rem' }}>
                        <input
                          value={cat.description}
                          onChange={(e) => handleEditCategory(catIdx, 'description', e.target.value)}
                          placeholder="Category description (optional)"
                          style={{ width: '100%', background: 'transparent', border: '1px solid transparent', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}
                        />
                      </div>

                      {visibleItems.length === 0 ? (
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--gray-400)', fontSize: '0.85rem' }}>
                          {showOnlyChanges ? 'No changes in this category.' : 'No items.'}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Item Name</th>
                                <th style={thStyle}>Description</th>
                                <th style={{ ...thStyle, width: '110px' }}>Price (₹)</th>
                                <th style={{ ...thStyle, width: '110px' }}>Tax %</th>
                                <th style={{ ...thStyle, width: '60px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleItems.map((item, itemIdx) => {
                                const actualIdx = cat.items.indexOf(item);
                                const highlight = item._status === 'new'
                                  ? 'rgba(43,165,74,0.06)'
                                  : item._status === 'price-change'
                                    ? 'rgba(245,158,11,0.08)'
                                    : 'transparent';
                                return (
                                  <tr key={itemIdx} style={{ background: highlight, borderBottom: '1px solid var(--gray-100)' }}>
                                    <td style={tdStyle}>
                                      {statusBadge(item._status, item._currentPrice)}
                                      {item._status === 'price-change' && item._currentPrice !== undefined && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>
                                          was ₹{item._currentPrice}
                                        </div>
                                      )}
                                    </td>
                                    <td style={tdStyle}>
                                      <input
                                        value={item.name}
                                        onChange={(e) => handleEditItem(catIdx, actualIdx, 'name', e.target.value)}
                                        style={inputStyle}
                                      />
                                    </td>
                                    <td style={tdStyle}>
                                      <input
                                        value={item.description}
                                        onChange={(e) => handleEditItem(catIdx, actualIdx, 'description', e.target.value)}
                                        style={inputStyle}
                                      />
                                    </td>
                                    <td style={tdStyle}>
                                      <input
                                        type="number"
                                        value={item.price}
                                        onChange={(e) => handleEditItem(catIdx, actualIdx, 'price', e.target.value)}
                                        style={{ ...inputStyle, width: '90px' }}
                                        step="0.01"
                                      />
                                    </td>
                                    <td style={tdStyle}>
                                      <input
                                        type="number"
                                        value={item.taxPercent}
                                        onChange={(e) => handleEditItem(catIdx, actualIdx, 'taxPercent', e.target.value)}
                                        style={{ ...inputStyle, width: '90px' }}
                                        step="0.01"
                                      />
                                    </td>
                                    <td style={tdStyle}>
                                      <button
                                        className="btn btn-outline"
                                        onClick={() => handleRemoveItem(catIdx, actualIdx)}
                                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                                      >
                                        <X size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)', flexWrap: 'wrap', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Replace existing menu
              <small style={{ color: 'var(--gray-500)' }}>(deactivates current categories & items before import)</small>
            </label>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={isImporting || parsedMenu.categories.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isImporting ? (
                <><Loader2 size={18} className="animate-spin" /> Importing...</>
              ) : (
                <><Save size={18} /> {replaceExisting ? 'Replace Menu' : 'Add to Store'} <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Current store menu reference */}
      {selectedStoreId && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Eye size={18} /> Current Menu of Selected Store
              <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)', fontWeight: 'normal' }}>
                ({currentCategories.length} categories, {currentItems.length} items)
              </span>
            </span>
            <button
              className="btn btn-outline"
              onClick={() => loadCurrentMenu(selectedStoreId)}
              disabled={isLoadingCurrent}
              style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isLoadingCurrent ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>
          <div className="card-body">
            {currentCategories.length === 0 ? (
              <div style={{ color: 'var(--gray-500)', padding: '1rem 0' }}>This store has no categories yet.</div>
            ) : (
              currentCategories.map(cat => {
                const catItems = currentItems.filter(i => i.categoryId === cat.id);
                return (
                  <div key={cat.id} style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{cat.name}</div>
                    {catItems.length === 0 ? (
                      <div style={{ color: 'var(--gray-400)', fontSize: '0.85rem', paddingLeft: '1rem' }}>No items</div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)', paddingLeft: '1rem' }}>
                        {catItems.map(i => (
                          <span key={i.id} style={{ display: 'inline-block', marginRight: '0.75rem', marginBottom: '0.25rem' }}>
                            {i.name} <strong>₹{i.price}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Inline style helpers (kept local to avoid touching global CSS) ----

const alertStyle = (color: string, bg: string): React.CSSProperties => ({
  padding: '1rem',
  background: bg,
  color,
  borderRadius: 'var(--radius)',
  marginBottom: '1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
});

const closeBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  padding: '0.25rem',
};

const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '0.15rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.7rem',
  fontWeight: 600,
  color,
  background: `${color}22`,
  whiteSpace: 'nowrap',
});

const statChipStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '0.25rem 0.6rem',
  borderRadius: '999px',
  background: bg,
  color,
});

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  color: 'var(--gray-500)',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  verticalAlign: 'middle',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.3rem 0.5rem',
  border: '1px solid var(--gray-200)',
  borderRadius: '4px',
  fontSize: '0.85rem',
  background: 'var(--surface, #fff)',
};

export default MenuUpload;
