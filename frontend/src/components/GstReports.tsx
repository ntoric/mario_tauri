import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, FileText } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../stores';
import { useReportPageHeader } from '../hooks/useReportPageHeader';
import { formatCurrency } from '../utils/currency';
import { notify } from '../utils/toast';
import Pagination from './ui/Pagination';
import { Empty } from './gr';
import { useTaxEnabled } from '../hooks/useTaxEnabled';

type Period = 'this_month' | 'last_month' | 'this_quarter' | 'custom';
type Tab = 'summary' | 'gstr1' | 'register';

// Local (IST) calendar date — toISOString() would shift to UTC and land on
// the previous day for dates at local midnight.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PERIOD_LABEL: Record<Period, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  custom: 'Custom',
};

const TAB_LABEL: Record<Tab, string> = {
  summary: 'Summary (GSTR-3B)',
  gstr1: 'GSTR-1',
  register: 'Sales Register',
};

const SUB_LABEL: Record<string, string> = {
  b2b: 'B2B',
  b2cl: 'B2CL',
  b2cs: 'B2CS',
  cdn: 'Credit Notes',
  hsnB2b: 'HSN B2B',
  hsnB2c: 'HSN B2C',
  docs: 'Documents',
  nil: 'Nil / Exempt',
  eco: 'E-commerce',
};

const REGISTER_PAGE_SIZE = 25;

function rangeFor(p: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  if (p === 'this_month') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
  if (p === 'last_month') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  if (p === 'this_quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { from: iso(qStart), to: iso(now) };
  }
  return { from: customFrom, to: customTo };
}

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <div className="gr-card gstr-section">
    <div className="gr-card__head gstr-section-head">
      <h3>{title}</h3>
      {action}
    </div>
    <div className="gr-card__body" style={{ padding: 0 }}>{children}</div>
  </div>
);

const Tbl: React.FC<{ head: string[]; rows: React.ReactNode[][]; numCols?: number[] }> = ({ head, rows, numCols = [] }) => (
  <div className="gstr-table-wrap">
    <table className="gstr-table">
      <thead>
        <tr>{head.map((h, i) => <th key={h} className={numCols.includes(i) ? 'num' : ''}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={head.length} style={{ padding: 0 }}><Empty compact icon={<FileText />} title="No data for this period" /></td></tr>
          : rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={numCols.includes(j) ? 'num' : ''}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

const money = (n?: number) => formatCurrency(n ?? 0);

const GstReports: React.FC = () => {
  const { currentStoreId } = useAuthStore();
  const taxEnabled = useTaxEnabled();
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(iso(new Date()));
  const [tab, setTab] = useState<Tab>('summary');
  const [sub, setSub] = useState('b2b');
  const [summary, setSummary] = useState<any>(null);
  const [gstr1, setGstr1] = useState<any>(null);
  const [register, setRegister] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useReportPageHeader({
    title: 'GST Reports',
    subtitle: 'GSTR-3B summary, GSTR-1 and sales register',
  });

  const { from, to } = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);

  // Debounce the register search box so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!currentStoreId || !taxEnabled) return;
    setLoading(true);
    Promise.all([
      api.getGstSummary(currentStoreId, from, to),
      api.getGstr1(currentStoreId, from, to),
      api.getGstSalesRegister(currentStoreId, { startDate: from, endDate: to, page, pageSize: REGISTER_PAGE_SIZE, search }),
    ]).then(([s, g, r]) => { setSummary(s); setGstr1(g); setRegister(r); })
      .catch((e: any) => notify.error(e?.message || 'Failed to load GST reports'))
      .finally(() => setLoading(false));
  }, [currentStoreId, taxEnabled, from, to, page, search]);

  const downloadGstr1 = async () => {
    if (!currentStoreId) return;
    let data: any;
    try {
      data = await api.getGstr1PortalJson(currentStoreId, from, to);
    } catch (e: any) {
      notify.error(e?.message || 'Failed to build the GSTR-1 JSON');
      return;
    }
    const fp = data.fp || '';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GSTR1_${data.gstin || 'gstin'}_${fp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = (name: string, head: string[], rows: (string | number)[][]) => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const legacyNote = (n?: number) =>
    (n ?? 0) > 0 ? (
      <div className="gstr-legacy">
        {n} older bills created before GST mode are not included.
      </div>
    ) : null;

  const registerTotalPages = Math.max(1, Math.ceil((register?.total || 0) / REGISTER_PAGE_SIZE));

  if (!taxEnabled) {
    return (
      <div className="gr-card">
        <div className="gr-card__body">
          <p className="gstr-note">Tax is turned off for this store. Turn it on in Business Settings → Tax to use GST reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Period toolbar */}
      <div className="gstr-toolbar">
        <div className="gstr-seg">
          {(Object.keys(PERIOD_LABEL) as Period[]).map(p => (
            <button
              key={p}
              className={`gstr-seg-btn${period === p ? ' active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="gstr-dates">
            <input type="date" className="gr-input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="gstr-dates-sep">to</span>
            <input type="date" className="gr-input" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button className="gr-btn gr-btn--secondary gr-btn--sm" onClick={downloadGstr1}>
          <Download size={14} /> Download GSTR-1 JSON
        </button>
      </div>
      <p className="gstr-note">The JSON covers one return month. Validate it in the GST offline tool before uploading.</p>
      {(gstr1?.warnings || []).map((w: string) => (
        <div key={w} className="gstr-legacy">{w}</div>
      ))}
      {legacyNote(summary?.legacyBillsExcluded)}

      {/* Report tabs */}
      <div className="gstr-seg" style={{ marginBottom: '1rem' }}>
        {(Object.keys(TAB_LABEL) as Tab[]).map(t => (
          <button
            key={t}
            className={`gstr-seg-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {loading && <p className="gstr-note">Loading…</p>}

      {!loading && tab === 'summary' && summary && (
        <>
          <div className="gstr-kpi-grid">
            {[['Invoices', summary.invoices?.count], ['Cancelled', summary.invoices?.cancelledCount],
              ['Taxable', money(summary.invoices?.taxableValue)], ['Total Tax', money(summary.invoices?.totalTax)],
              ['Invoice Value', money(summary.invoices?.invoiceValue)], ['Credit Notes', summary.creditNotes?.count],
              ['CN Total', money(summary.creditNotes?.total)], ['Net Taxable', money(summary.net?.taxableValue)],
              ['Net Tax', money(summary.net?.totalTax)]].map(([l, v]) => (
              <div key={l as string} className="gstr-kpi">
                <div className="gstr-kpi-label">{l}</div>
                <div className="gstr-kpi-value">{v}</div>
              </div>
            ))}
          </div>
          <Section title="GSTR-3B — Table 3.1 Outward Supplies">
            <Tbl head={['Section', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess']} numCols={[1, 2, 3, 4, 5]} rows={[
              ['3.1(a) Outward taxable', money(summary.gstr3b?.outwardTaxable?.taxableValue), money(summary.gstr3b?.outwardTaxable?.igst), money(summary.gstr3b?.outwardTaxable?.cgst), money(summary.gstr3b?.outwardTaxable?.sgst), money(summary.gstr3b?.outwardTaxable?.cess)],
              ['3.1(c) Nil-rated / exempt', money(summary.gstr3b?.nilExempt?.taxableValue), '—', '—', '—', '—'],
              ['3.1(e) Non-GST', money(summary.gstr3b?.nonGst?.taxableValue), '—', '—', '—', '—'],
              ['3.1.1(ii) ECO supplies', money(summary.gstr3b?.ecoSupplies?.taxableValue), '—', '—', '—', '—'],
            ]} />
          </Section>
          <Section title="Rate-wise" action={
            <button className="gr-btn gr-btn--secondary gr-btn--sm"
              onClick={() => exportCsv('gst_ratewise.csv', ['Rate', 'B2B', 'B2C', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'],
                (summary.rateWise || []).map((r: any) => [r.rate, r.b2bTaxable, r.b2cTaxable, r.taxableValue, r.igst, r.cgst, r.sgst, r.cess]))}>
              <Download size={14} /> Export CSV
            </button>
          }>
            <Tbl head={['Rate %', 'B2B Taxable', 'B2C Taxable', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess']} numCols={[0, 1, 2, 3, 4, 5, 6, 7]}
              rows={(summary.rateWise || []).map((r: any) => [r.rate, money(r.b2bTaxable), money(r.b2cTaxable), money(r.taxableValue), money(r.igst), money(r.cgst), money(r.sgst), money(r.cess)])} />
          </Section>
          {summary.composition && (
            <Section title="Composition levy">
              <Tbl head={['Turnover', 'CGST', 'SGST', 'Total']} numCols={[0, 1, 2, 3]}
                rows={[[money(summary.composition.turnover), money(summary.composition.cgst), money(summary.composition.sgst), money(summary.composition.total)]]} />
            </Section>
          )}
        </>
      )}

      {!loading && tab === 'gstr1' && gstr1 && (
        <>
          <div className="gstr-seg" style={{ marginBottom: '0.75rem' }}>
            {Object.keys(SUB_LABEL).map(id => (
              <button
                key={id}
                className={`gstr-seg-btn sm${sub === id ? ' active' : ''}`}
                onClick={() => setSub(id)}
              >
                {SUB_LABEL[id]}
              </button>
            ))}
          </div>
          {sub === 'b2b' && (
            <Section title="B2B Invoices">
              <Tbl head={['GSTIN', 'Buyer', 'Invoice', 'Date', 'Value', 'PoS']} numCols={[4]}
                rows={(gstr1.b2b || []).map((x: any) => [x.buyerGstin, x.buyerName, x.invoiceNo, x.invoiceDate, money(x.invoiceValue), x.placeOfSupply])} />
            </Section>
          )}
          {sub === 'b2cl' && (
            <Section title="B2CL — Large Consumer Invoices">
              <Tbl head={['Invoice', 'Date', 'Value', 'PoS']} numCols={[2]}
                rows={(gstr1.b2cl || []).map((x: any) => [x.invoiceNo, x.invoiceDate, money(x.invoiceValue), x.placeOfSupply])} />
            </Section>
          )}
          {sub === 'b2cs' && (
            <Section title="B2CS — Small Consumer Supplies">
              <Tbl head={['Type', 'PoS', 'Rate', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess']} numCols={[2, 3, 4, 5, 6, 7]}
                rows={(gstr1.b2cs || []).map((x: any) => [x.supplyType, x.placeOfSupply, x.rate, money(x.taxableValue), money(x.igst), money(x.cgst), money(x.sgst), money(x.cess)])} />
            </Section>
          )}
          {sub === 'cdn' && (
            <>
              <Section title="CDNR (B2B)">
                <Tbl head={['GSTIN', 'Note', 'Date', 'Orig Invoice', 'Orig Date', 'Value', 'PoS']} numCols={[5]}
                  rows={(gstr1.cdnr || []).map((x: any) => [x.buyerGstin, x.noteNo, x.noteDate, x.originalInvoiceNo, x.originalInvoiceDate, money(x.noteValue), x.placeOfSupply])} />
              </Section>
              <Section title="CDNUR">
                <Tbl head={['Note', 'Date', 'Orig Invoice', 'Orig Date', 'Value', 'PoS']} numCols={[4]}
                  rows={(gstr1.cdnur || []).map((x: any) => [x.noteNo, x.noteDate, x.originalInvoiceNo, x.originalInvoiceDate, money(x.noteValue), x.placeOfSupply])} />
              </Section>
            </>
          )}
          {(sub === 'hsnB2b' || sub === 'hsnB2c') && (
            <Section title={sub === 'hsnB2b' ? 'HSN Summary — B2B' : 'HSN Summary — B2C'}>
              <Tbl head={['HSN', 'Description', 'UQC', 'Qty', 'Rate', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess', 'Total']} numCols={[3, 4, 5, 6, 7, 8, 9, 10]}
                rows={((gstr1 as any)[sub] || []).map((x: any) => [x.hsn, x.description, x.uqc, x.quantity, x.rate, money(x.taxableValue), money(x.igst), money(x.cgst), money(x.sgst), money(x.cess), money(x.totalValue)])} />
            </Section>
          )}
          {sub === 'docs' && (
            <Section title="Document Series">
              <Tbl head={['Doc Type', 'FY', 'From', 'To', 'Total', 'Cancelled', 'Net']} numCols={[4, 5, 6]}
                rows={(gstr1.docs || []).map((x: any) => [x.nature || x.docType, x.fy, x.from, x.to, x.total, x.cancelled, x.net])} />
            </Section>
          )}
          {sub === 'nil' && (
            <Section title="Table 8 — Nil rated, exempt and non-GST supplies">
              <Tbl head={['Supply type', 'Nil rated', 'Exempt', 'Non-GST']} numCols={[1, 2, 3]}
                rows={(gstr1.nil || []).map((x: any) => [x.supplyType, money(x.nilRated), money(x.exempt), money(x.nonGst)])} />
            </Section>
          )}
          {sub === 'eco' && (
            <Section title="Table 14 — Supplies through e-commerce operators (tax paid by operator u/s 9(5))">
              <Tbl head={['Source', 'Operator GSTIN', 'Taxable', 'Invoices']} numCols={[2, 3]}
                rows={(gstr1.eco || []).map((x: any) => [x.orderSource, x.ecoGstin || '— not set —', money(x.taxableValue), x.invoiceCount])} />
            </Section>
          )}
        </>
      )}

      {!loading && tab === 'register' && register && (
        <>
          {legacyNote(register.legacyBillsExcluded)}
          <Section title="Sales Register" action={
            <div className="gstr-search">
              <Search size={14} className="gstr-search-icon" />
              <input
                type="text"
                className="gr-input"
                placeholder="Search invoice no / GSTIN"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>
          }>
            <Tbl head={['Invoice', 'Date', 'Doc', 'Supply', 'GSTIN', 'Buyer', 'PoS', 'Taxable', 'CGST', 'SGST', 'IGST', 'RoundOff', 'Total', 'Status', 'Source']} numCols={[7, 8, 9, 10, 11, 12]}
              rows={(register.rows || []).map((x: any) => [x.invoiceNo, x.invoiceDate, x.documentType, x.supplyType, x.buyerGstin, x.buyerName, x.placeOfSupply, money(x.taxableValue), money(x.cgst), money(x.sgst), money(x.igst), x.roundOff, money(x.total), x.status, x.orderSource])} />
            <div className="gstr-register-totals">
              Totals — taxable {money(register.totals?.taxableValue)}, tax {money(register.totals?.totalTax)}, value {money(register.totals?.total)}
            </div>
            <Pagination
              currentPage={page}
              totalPages={registerTotalPages}
              totalItems={register.total || 0}
              pageSize={register.pageSize || REGISTER_PAGE_SIZE}
              onPageChange={setPage}
            />
          </Section>
        </>
      )}
    </div>
  );
};

export default GstReports;
