import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Sparkles, Loader2, AlertCircle, Check, FileText, ImageIcon, RefreshCw,
  Code, Eye, Save, X, Plus, ArrowRight, Search, Columns, List,
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
  _matchedItemId?: string;   // id of the existing item matched by name (for merge mode)
}

interface ParsedMenuCategory {
  name: string;
  description: string;
  items: ParsedMenuItem[];
  _status?: 'new' | 'match';
  _matchedCategoryId?: string; // id of the existing category matched by name (for merge mode)
}

interface ParsedMenu {
  categories: ParsedMenuCategory[];
}

type ItemStatus = 'new' | 'price-change' | 'match';
type ImportMode = 'add' | 'replace' | 'merge';
type ViewMode = 'inline' | 'split';

interface MenuFile {
  name: string;
  base64: string;     // full data URL or raw base64
  mimeType: string;
  preview: string;    // data URL for images, '' for PDFs
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const MenuUpload: React.FC = () => {
  const { user } = useAuthStore();
  const { stores, fetchCategories, fetchItems } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [files, setFiles] = useState<MenuFile[]>([]);

  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedMenu, setParsedMenu] = useState<ParsedMenu | null>(null);
  const [rawResponse, setRawResponse] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [viewMode, setViewMode] = useState<ViewMode>('inline');

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
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    setError('');
    setSuccess('');
    setInfo('');
    setParsedMenu(null);
    setRawResponse('');

    for (const file of selected) {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isImage && !isPdf) {
        setError('Please upload image (PNG/JPG) or PDF files only.');
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError(`${file.name} is too large. Maximum size is 20MB per file.`);
        continue;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setFiles(prev => [
          ...prev,
          { name: file.name, base64: result, mimeType: isPdf ? 'application/pdf' : file.type, preview: isPdf ? '' : result },
        ]);
      };
      reader.readAsDataURL(file);
    }
    // Reset the input so selecting the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleParse = async () => {
    if (!selectedStoreId) {
      setError('Please select a target store first.');
      return;
    }
    if (files.length === 0) {
      setError('Please upload at least one menu image or PDF first.');
      return;
    }

    setIsParsing(true);
    setError('');
    setSuccess('');
    setInfo('');
    setParsedMenu(null);
    setRawResponse('');

    try {
      const images = files.map(f => ({ imageBase64: f.base64, mimeType: f.mimeType }));
      const data = await api.parseMenuImages(selectedStoreId, images);
      const menu: ParsedMenu = data.menu || { categories: [] };
      setRawResponse(data.rawResponse || '');
      setUsedModel(data.model || '');
      const diffed = applyDiff(menu, currentCategories, currentItems);
      setParsedMenu(diffed);
      const totalItems = diffed.categories.reduce((n, c) => n + c.items.length, 0);
      setInfo(`Parsed ${diffed.categories.length} categories and ${totalItems} items from ${files.length} file${files.length > 1 ? 's' : ''} using ${data.model || 'Gemini'}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to parse menu with Gemini');
    } finally {
      setIsParsing(false);
    }
  };

  // applyDiff compares the parsed menu against the store's current menu and
  // annotates each category/item with a status used for highlighting. It also
  // records the matched DB ids (_matchedItemId / _matchedCategoryId) so that
  // "merge" imports can update existing rows in place instead of duplicating.
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
            return { ...item, _status: 'price-change' as ItemStatus, _currentPrice: matched.price, _matchedItemId: matched.id };
          }
          return { ...item, _status: 'match' as ItemStatus, _currentPrice: matched.price, _matchedItemId: matched.id };
        });
        return { ...cat, _status: matchedCat ? 'match' : 'new', _matchedCategoryId: matchedCat?.id, items };
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

    const confirmMsg: Record<ImportMode, string> = {
      replace: 'This will REPLACE the entire current menu of this store (existing categories and items will be deactivated) and import the parsed menu. Continue?',
      add: 'This will ADD the parsed categories and items to this store (may create duplicates of matched items). Continue?',
      merge: 'This will UPDATE matched items in place and ADD new items. Items not present in the parsed menu will be left untouched. Continue?',
    };
    if (!window.confirm(confirmMsg[importMode])) return;

    setIsImporting(true);
    setError('');
    setSuccess('');
    try {
      const payload = parsedMenu.categories.map(c => ({
        name: c.name.trim(),
        description: c.description,
        matchedCategoryId: importMode === 'merge' ? c._matchedCategoryId : undefined,
        items: c.items
          .filter(i => i.name.trim() !== '')
          .map(i => ({
            name: i.name.trim(),
            description: i.description,
            price: i.price,
            hsnCode: i.hsnCode,
            taxPercent: i.taxPercent,
            matchedItemId: importMode === 'merge' ? i._matchedItemId : undefined,
          })),
      }));
      const res = await api.bulkCreateMenu(selectedStoreId, payload, importMode === 'replace', importMode);
      const summary = res.itemsUpdated
        ? `${res.message || 'Menu imported.'} (${res.categoriesAdded} new + ${res.categoriesReused} reused categories, ${res.itemsAdded} new + ${res.itemsUpdated} updated items)`
        : res.message || 'Menu imported successfully.';
      setSuccess(summary);
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
    setFiles([]);
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
            <label>Menu Image(s) or PDF(s)</label>
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
              {files.length === 0 ? (
                <div>
                  <ImageIcon size={48} style={{ color: 'var(--gray-400)', marginBottom: '0.75rem' }} />
                  <div style={{ color: 'var(--gray-600)' }}>Click to upload menu image(s) (PNG/JPG) or PDF(s)</div>
                  <div style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Multiple files supported - all parsed together as one menu. Max 20MB each.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ color: 'var(--gray-600)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                    {files.length} file{files.length > 1 ? 's' : ''} selected - click to add more
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                    {files.map((f, idx) => (
                      <div key={idx} style={{ position: 'relative', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '0.4rem', background: 'var(--surface, #fff)' }}>
                        {f.preview ? (
                          <img src={f.preview} alt={f.name} style={{ maxHeight: '120px', maxWidth: '160px', objectFit: 'contain', display: 'block' }} />
                        ) : (
                          <div style={{ width: '120px', height: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                            <FileText size={40} />
                            <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', color: 'var(--gray-600)', wordBreak: 'break-all' }}>{f.name}</div>
                          </div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: '0.25rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveFile(idx); }}
                          style={{
                            position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%',
                            background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}
                          title="Remove file"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleParse}
              disabled={isParsing || files.length === 0 || !selectedStoreId}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isParsing ? (
                <><Loader2 size={18} className="animate-spin" /> Parsing with Gemini...</>
              ) : (
                <><Sparkles size={18} /> Parse {files.length > 1 ? `${files.length} Files` : 'Menu'} with Gemini</>
              )}
            </button>
            {(files.length > 0 || parsedMenu) && (
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
              <div style={{ display: 'flex', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)', overflow: 'hidden' }} title="Toggle inline vs side-by-side (Meld-style) diff view">
                <button
                  className={`btn ${viewMode === 'inline' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setViewMode('inline')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: 0, border: 'none' }}
                >
                  <List size={14} /> Inline
                </button>
                <button
                  className={`btn ${viewMode === 'split' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setViewMode('split')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: 0, border: 'none' }}
                >
                  <Columns size={14} /> Split
                </button>
              </div>
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

                  // Current items belonging to this category (by matched id or name).
                  const currentCat = cat._matchedCategoryId
                    ? currentCategories.find(c => c.id === cat._matchedCategoryId)
                    : currentCategories.find(c => norm(c.name) === norm(cat.name));
                  const currentCatItems = currentCat
                    ? currentItems.filter(i => i.categoryId === currentCat.id)
                    : [];
                  // Parsed item names that match an existing item (for split pairing).
                  const parsedNames = new Set(visibleItems.map(i => norm(i.name)));
                  const onlyInCurrent = currentCatItems.filter(ci => !parsedNames.has(norm(ci.name)));

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

                      {visibleItems.length === 0 && (viewMode === 'inline' || currentCatItems.length === 0) ? (
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--gray-400)', fontSize: '0.85rem' }}>
                          {showOnlyChanges ? 'No changes in this category.' : 'No items.'}
                        </div>
                      ) : viewMode === 'split' ? (
                        <SplitDiffView
                          catIdx={catIdx}
                          currentCatItems={currentCatItems}
                          onlyInCurrent={onlyInCurrent}
                          visibleItems={visibleItems}
                          cat={cat}
                          statusBadge={statusBadge}
                          onEditItem={handleEditItem}
                          onRemoveItem={handleRemoveItem}
                        />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Import mode</span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {([
                  { key: 'merge', label: 'Update matched', hint: 'Update existing items in place; add new ones; leave others untouched' },
                  { key: 'add', label: 'Add all', hint: 'Insert everything (may create duplicates)' },
                  { key: 'replace', label: 'Replace entire menu', hint: 'Deactivate current menu, then insert parsed menu' },
                ] as { key: ImportMode; label: string; hint: string }[]).map(opt => (
                  <button
                    key={opt.key}
                    className={`btn ${importMode === opt.key ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setImportMode(opt.key)}
                    title={opt.hint}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <small style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>
                {importMode === 'merge' && 'Updates matched items in place and adds new items. Items not in the parsed menu stay as-is.'}
                {importMode === 'add' && 'Inserts all parsed categories/items. Matched items will be duplicated.'}
                {importMode === 'replace' && 'Deactivates the entire current menu before inserting the parsed one.'}
              </small>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={isImporting || parsedMenu.categories.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isImporting ? (
                <><Loader2 size={18} className="animate-spin" /> Importing...</>
              ) : (
                <><Save size={18} /> {importMode === 'replace' ? 'Replace Menu' : importMode === 'merge' ? 'Update Menu' : 'Add to Store'} <ArrowRight size={16} /></>
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

// ---- Split (Meld-style) diff view ----
// Renders the current store items on the left and the parsed items on the
// right, pairing matched items on the same row so price changes are easy to
// spot. Items only on one side are shown alone with a NEW / REMOVED badge.

interface SplitDiffViewProps {
  catIdx: number;
  currentCatItems: Item[];
  onlyInCurrent: Item[];
  visibleItems: ParsedMenuItem[];
  cat: ParsedMenuCategory;
  statusBadge: (status?: ItemStatus, currentPrice?: number) => React.ReactNode;
  onEditItem: (catIdx: number, itemIdx: number, field: keyof ParsedMenuItem, value: string) => void;
  onRemoveItem: (catIdx: number, itemIdx: number) => void;
}

const SplitDiffView: React.FC<SplitDiffViewProps> = ({
  catIdx, currentCatItems, onlyInCurrent, visibleItems, cat, statusBadge, onEditItem, onRemoveItem,
}) => {
  // Build paired rows: for each parsed item, find the matching current item by name.
  const usedCurrent = new Set<string>();
  const rows: { parsed?: ParsedMenuItem; parsedActualIdx?: number; current?: Item }[] = [];
  visibleItems.forEach(p => {
    const actualIdx = cat.items.indexOf(p);
    const cur = currentCatItems.find(c => norm(c.name) === norm(p.name));
    if (cur) usedCurrent.add(cur.id);
    rows.push({ parsed: p, parsedActualIdx: actualIdx, current: cur });
  });
  // Items that exist in the current menu but are absent from the parsed menu.
  onlyInCurrent.forEach(c => {
    if (!usedCurrent.has(c.id)) rows.push({ current: c });
  });

  const cellBase: React.CSSProperties = {
    padding: '0.4rem 0.6rem', fontSize: '0.85rem', verticalAlign: 'middle', borderBottom: '1px solid var(--gray-100)',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
            <th style={{ ...thStyle, width: '50%' }}>Current (in store)</th>
            <th style={{ ...thStyle, width: '50%' }}>Parsed (from upload)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const status = row.parsed?._status;
            const leftBg = !row.current && row.parsed
              ? 'transparent'
              : row.parsed?._status === 'price-change'
                ? 'rgba(245,158,11,0.08)'
                : 'transparent';
            const rightBg = status === 'new'
              ? 'rgba(43,165,74,0.06)'
              : status === 'price-change'
                ? 'rgba(245,158,11,0.08)'
                : 'transparent';
            return (
              <tr key={i}>
                {/* Left: current item */}
                <td style={{ ...cellBase, background: leftBg }}>
                  {row.current ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{row.current.name}</span>
                      <span style={{ color: 'var(--gray-500)' }}>₹{row.current.price}</span>
                      {row.parsed?._status === 'price-change' && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>CHANGED</span>
                      )}
                      {row.parsed?._status === 'match' && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>unchanged</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>
                      {status === 'new' ? '(new item - not in store)' : '—'}
                    </span>
                  )}
                </td>
                {/* Right: parsed item (editable) */}
                <td style={{ ...cellBase, background: rightBg }}>
                  {row.parsed ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {statusBadge(row.parsed._status, row.parsed._currentPrice)}
                      <input
                        value={row.parsed.name}
                        onChange={(e) => onEditItem(catIdx, row.parsedActualIdx!, 'name', e.target.value)}
                        style={{ ...inputStyle, flex: '1 1 140px', minWidth: '120px' }}
                      />
                      <input
                        type="number"
                        value={row.parsed.price}
                        onChange={(e) => onEditItem(catIdx, row.parsedActualIdx!, 'price', e.target.value)}
                        style={{ ...inputStyle, width: '80px' }}
                        step="0.01"
                      />
                      <input
                        type="number"
                        value={row.parsed.taxPercent}
                        onChange={(e) => onEditItem(catIdx, row.parsedActualIdx!, 'taxPercent', e.target.value)}
                        style={{ ...inputStyle, width: '70px' }}
                        step="0.01"
                        title="Tax %"
                      />
                      <button
                        className="btn btn-outline"
                        onClick={() => onRemoveItem(catIdx, row.parsedActualIdx!)}
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>
                      (only in store - will be left untouched)
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={2} style={{ ...cellBase, color: 'var(--gray-400)' }}>No items.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default MenuUpload;
