import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, X, CreditCard, RefreshCw, Repeat, Ban,
  History as HistoryIcon, Building2, CheckCircle2, Loader2, Power,
  ArrowUpCircle, ArrowDownCircle, CalendarClock, Search, CheckCircle,
  XCircle, Inbox, Receipt,
} from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { formatCurrency } from '../utils/currency';
import notify from '../utils/toast';
import type {
  SubscriptionPlan, StoreSubscription, SubscriptionEvent, RecurringType, Store,
  SubscriptionChangeRequest, SubscriptionPayment,
} from '../types';

const RECURRING_LABELS: Record<RecurringType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Bi-Annually',
  yearly: 'Yearly',
};

const RECURRING_SUFFIX: Record<RecurringType, string> = {
  monthly: '/mo',
  quarterly: '/qtr',
  biannually: '/6mo',
  yearly: '/yr',
};

const STATUS_META: Record<string, { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'badge-success' },
  expired: { label: 'Expired', badge: 'badge-danger' },
  cancelled: { label: 'Cancelled', badge: 'badge-warning' },
  replaced: { label: 'Replaced', badge: 'badge-primary' },
};

const REQ_TYPE_META: Record<string, { label: string; badge: string }> = {
  upgrade: { label: 'Upgrade', badge: 'badge-success' },
  downgrade: { label: 'Downgrade', badge: 'badge-warning' },
  plan_change: { label: 'Plan Change', badge: 'badge-primary' },
  cancel: { label: 'Cancel', badge: 'badge-danger' },
};

const REQ_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Pending', badge: 'badge-warning' },
  approved: { label: 'Approved', badge: 'badge-primary' },
  rejected: { label: 'Rejected', badge: 'badge-danger' },
  cancelled: { label: 'Withdrawn', badge: 'badge-primary' },
  applied: { label: 'Applied', badge: 'badge-success' },
};

const ACTION_META: Record<string, { label: string; badge: string }> = {
  created: { label: 'Created', badge: 'badge-success' },
  renewed: { label: 'Renewed', badge: 'badge-primary' },
  expired: { label: 'Expired', badge: 'badge-danger' },
  cancelled: { label: 'Cancelled', badge: 'badge-warning' },
  replaced: { label: 'Replaced', badge: 'badge-warning' },
  upgraded: { label: 'Upgraded', badge: 'badge-success' },
  downgraded: { label: 'Downgraded', badge: 'badge-warning' },
  plan_changed: { label: 'Plan Changed', badge: 'badge-primary' },
  auto_renew_enabled: { label: 'Auto-Renew On', badge: 'badge-primary' },
  auto_renew_disabled: { label: 'Auto-Renew Off', badge: 'badge-warning' },
  request_submitted: { label: 'Requested', badge: 'badge-primary' },
  request_approved: { label: 'Req. Approved', badge: 'badge-success' },
  request_rejected: { label: 'Req. Rejected', badge: 'badge-danger' },
  request_withdrawn: { label: 'Req. Withdrawn', badge: 'badge-warning' },
};

const formatDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (s?: string) =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const todayInput = () => new Date().toISOString().slice(0, 10);

const daysUntil = (s?: string) => (s ? Math.ceil((new Date(s).getTime() - Date.now()) / 86400000) : 0);

type TabKey = 'stores' | 'requests' | 'plans' | 'history';

const Subscriptions: React.FC = () => {
  const { user } = useAuthStore();
  const { stores, fetchStores } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const isSuperadmin = user?.role === 'superadmin';

  const [activeTab, setActiveTab] = useState<TabKey>('stores');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subs, setSubs] = useState<StoreSubscription[]>([]);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [paySub, setPaySub] = useState<StoreSubscription | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'upi', notes: '', renew: true });
  const [requests, setRequests] = useState<SubscriptionChangeRequest[]>([]);
  const [reqStatusFilter, setReqStatusFilter] = useState('all');
  const [isReqLoading, setIsReqLoading] = useState(false);
  const [busyReqId, setBusyReqId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyStoreId, setHistoryStoreId] = useState('');
  const [storeSearch, setStoreSearch] = useState('');

  // Plan form modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({ name: '', price: '', recurringType: 'monthly' as RecurringType, features: '', isActive: true });

  // Subscription assign/change modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [subModalMode, setSubModalMode] = useState<'create' | 'change'>('create');
  const [subForm, setSubForm] = useState({ storeId: '', planId: '', startDate: todayInput(), autoRenew: true, showPrice: false });
  const [changingSub, setChangingSub] = useState<StoreSubscription | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busySubId, setBusySubId] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isSuperadmin) return;
    setIsLoading(true);
    try {
      const [planRes, subRes, reqRes] = await Promise.all([
        api.getSubscriptionPlans(),
        api.getSubscriptions(),
        api.getSubscriptionRequests(),
      ]);
      setPlans(planRes || []);
      setSubs(subRes || []);
      setRequests(reqRes || []);
      await fetchStores();
    } catch (err: any) {
      notify.error(err.message || 'Failed to load subscriptions');
    } finally {
      setIsLoading(false);
    }
  }, [fetchStores, isSuperadmin]);

  const loadRequests = useCallback(async () => {
    if (!isSuperadmin) return;
    setIsReqLoading(true);
    try {
      const res = await api.getSubscriptionRequests();
      setRequests(res || []);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load requests');
    } finally {
      setIsReqLoading(false);
    }
  }, [isSuperadmin]);

  const loadHistory = useCallback(async (storeId: string) => {
    if (!isSuperadmin) return;
    setIsHistoryLoading(true);
    try {
      const [res, payRes] = await Promise.all([
        api.getSubscriptionHistory(storeId || undefined),
        api.getSubscriptionPayments({ storeId: storeId || undefined }),
      ]);
      setEvents(res || []);
      setPayments(payRes || []);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load history');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory(historyStoreId);
    } else if (activeTab === 'requests') {
      loadRequests();
    }
  }, [activeTab, historyStoreId, loadHistory, loadRequests]);

  useEffect(() => {
    setHeaderContent({
      title: 'Subscriptions',
      subtitle: 'Manage subscription plans and store billing',
      actions: activeTab === 'plans' ? (
        <button className="btn btn-primary" onClick={() => openPlanModal()}>
          <Plus size={18} />
          Add Plan
        </button>
      ) : activeTab === 'stores' ? (
        <button className="btn btn-primary" onClick={() => openSubModal()}>
          <Plus size={18} />
          New Subscription
        </button>
      ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, setHeaderContent, plans]);

  const activeSubByStore = useMemo(() => {
    const map = new Map<string, StoreSubscription>();
    subs.forEach((s) => {
      if (s.status === 'active') map.set(s.storeId, s);
    });
    return map;
  }, [subs]);

  const latestSubByStore = useMemo(() => {
    const map = new Map<string, StoreSubscription>();
    subs.forEach((s) => {
      const cur = map.get(s.storeId);
      if (!cur || new Date(s.endDate) > new Date(cur.endDate)) map.set(s.storeId, s);
    });
    return map;
  }, [subs]);

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);

  // ---------- Plan modal ----------

  const openPlanModal = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name,
        price: String(plan.price),
        recurringType: plan.recurringType,
        features: (plan.features || []).join('\n'),
        isActive: plan.isActive,
      });
    } else {
      setEditingPlan(null);
      setPlanForm({ name: '', price: '', recurringType: 'monthly', features: '', isActive: true });
    }
    setShowPlanModal(true);
  };

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(planForm.price);
    if (isNaN(price) || price < 0) {
      notify.error('Enter a valid price');
      return;
    }
    const payload = {
      name: planForm.name.trim(),
      price,
      recurringType: planForm.recurringType,
      features: planForm.features.split('\n').map((f) => f.trim()).filter(Boolean),
      isActive: planForm.isActive,
    };
    setIsSubmitting(true);
    try {
      if (editingPlan) {
        await api.updateSubscriptionPlan(editingPlan.id, payload);
        notify.success(`Plan "${payload.name}" updated`);
      } else {
        await api.createSubscriptionPlan(payload);
        notify.success(`Plan "${payload.name}" created`);
      }
      setShowPlanModal(false);
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to save plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlanToggle = async (plan: SubscriptionPlan) => {
    setBusyPlanId(plan.id);
    try {
      await api.updateSubscriptionPlan(plan.id, {
        name: plan.name,
        price: plan.price,
        features: plan.features,
        recurringType: plan.recurringType,
        isActive: !plan.isActive,
      });
      notify.success(`Plan "${plan.name}" ${plan.isActive ? 'deactivated' : 'activated'}`);
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update plan');
    } finally {
      setBusyPlanId(null);
    }
  };

  const handleApproveReq = async (req: SubscriptionChangeRequest) => {
    const label = req.type === 'cancel'
      ? `Approve cancellation for ${req.storeName || 'store'}? It takes effect at the end of the current cycle.`
      : `Approve ${REQ_TYPE_META[req.type]?.label || 'change'} to ${req.requestedPlanName} for ${req.storeName || 'store'}?`;
    if (!confirm(label)) return;
    setBusyReqId(req.id);
    try {
      await api.approveSubscriptionRequest(req.id);
      notify.success('Request approved');
      loadRequests();
    } catch (err: any) {
      notify.error(err.message || 'Failed to approve request');
    } finally {
      setBusyReqId(null);
    }
  };

  const handleRejectReq = async (req: SubscriptionChangeRequest) => {
    const note = prompt('Reason for rejection (optional):');
    if (note === null) return;
    setBusyReqId(req.id);
    try {
      await api.rejectSubscriptionRequest(req.id, note || undefined);
      notify.success('Request rejected');
      loadRequests();
    } catch (err: any) {
      notify.error(err.message || 'Failed to reject request');
    } finally {
      setBusyReqId(null);
    }
  };

  const handlePlanDelete = async (plan: SubscriptionPlan) => {
    if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    setBusyPlanId(plan.id);
    try {
      await api.deleteSubscriptionPlan(plan.id);
      notify.success('Plan deleted');
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete plan');
    } finally {
      setBusyPlanId(null);
    }
  };

  // ---------- Subscription modal & actions ----------

  const openSubModal = (store?: Store, changeSub?: StoreSubscription) => {
    if (changeSub) {
      setSubModalMode('change');
      setChangingSub(changeSub);
      setSubForm({
        storeId: changeSub.storeId,
        planId: '',
        startDate: todayInput(),
        autoRenew: changeSub.autoRenew,
        showPrice: !!changeSub.showPrice,
      });
    } else {
      setSubModalMode('create');
      setChangingSub(null);
      setSubForm({
        storeId: store?.id || '',
        planId: '',
        startDate: todayInput(),
        autoRenew: true,
        showPrice: false,
      });
    }
    setShowSubModal(true);
  };

  const handleSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subForm.storeId || !subForm.planId) {
      notify.error('Select a store and a plan');
      return;
    }
    setIsSubmitting(true);
    try {
      if (subModalMode === 'change' && changingSub) {
        const res = await api.changeSubscriptionPlan(changingSub.id, {
          planId: subForm.planId,
          startDate: subForm.startDate,
          autoRenew: subForm.autoRenew,
          showPrice: subForm.showPrice,
        });
        notify.success(`Plan changed to ${res.planName || 'new plan'}`);
      } else {
        await api.createSubscription({
          storeId: subForm.storeId,
          planId: subForm.planId,
          startDate: subForm.startDate,
          autoRenew: subForm.autoRenew,
          showPrice: subForm.showPrice,
        });
        notify.success('Subscription created');
      }
      setShowSubModal(false);
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to save subscription');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleShowPrice = async (sub: StoreSubscription) => {
    setBusySubId(sub.id);
    try {
      await api.updateSubscription(sub.id, { showPrice: !sub.showPrice });
      notify.success(`Plan price ${sub.showPrice ? 'hidden from' : 'visible to'} store users`);
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update subscription');
    } finally {
      setBusySubId(null);
    }
  };

  const handleToggleAutoRenew = async (sub: StoreSubscription) => {
    setBusySubId(sub.id);
    try {
      await api.updateSubscription(sub.id, { autoRenew: !sub.autoRenew });
      notify.success(`Auto-renewal ${sub.autoRenew ? 'disabled' : 'enabled'} for ${sub.storeName || 'store'}`);
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update subscription');
    } finally {
      setBusySubId(null);
    }
  };

  const openPayModal = (sub: StoreSubscription) => {
    setPaySub(sub);
    setPayForm({ amount: String(sub.planPrice), method: 'upi', notes: '', renew: true });
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySub) return;
    const amount = parseFloat(payForm.amount);
    if (isNaN(amount) || amount < 0) {
      notify.error('Enter a valid amount');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.recordSubscriptionPayment(paySub.id, {
        amount, method: payForm.method, notes: payForm.notes || undefined, renew: payForm.renew,
      });
      notify.success(payForm.renew ? 'Payment recorded & subscription renewed' : 'Payment recorded');
      setPaySub(null);
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (sub: StoreSubscription) => {
    if (!confirm(`Cancel ${sub.storeName || 'this store'}'s subscription? The store will lose plan coverage.`)) return;
    setBusySubId(sub.id);
    try {
      await api.cancelSubscription(sub.id);
      notify.success('Subscription cancelled');
      loadData();
    } catch (err: any) {
      notify.error(err.message || 'Failed to cancel subscription');
    } finally {
      setBusySubId(null);
    }
  };

  const openHistory = (storeId: string) => {
    setHistoryStoreId(storeId);
    setActiveTab('history');
  };

  const filteredStores = stores.filter((s) => {
    if (!storeSearch.trim()) return true;
    const q = storeSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.branch || '').toLowerCase().includes(q);
  });

  const selectedPlan = plans.find((p) => p.id === subForm.planId);
  const changeDelta = subModalMode === 'change' && changingSub && selectedPlan
    ? selectedPlan.price - changingSub.planPrice
    : null;

  const activeCount = subs.filter((s) => s.status === 'active').length;
  const expiredCount = subs.filter((s) => s.status === 'expired').length;
  const pendingReqCount = requests.filter((r) => r.status === 'pending').length;
  const filteredRequests = reqStatusFilter === 'all'
    ? requests
    : requests.filter((r) => r.status === reqStatusFilter);

  if (user && !isSuperadmin) {
    return <Navigate to="/" />;
  }

  return (
    <div className="subscriptions-page">
      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="status-tab-group">
          <button
            type="button"
            className={`status-tab ${activeTab === 'stores' ? 'active' : ''}`}
            onClick={() => setActiveTab('stores')}
          >
            Store Subscriptions <span className="tab-badge">{activeCount}</span>
          </button>
          <button
            type="button"
            className={`status-tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Requests {pendingReqCount > 0 && <span className="tab-badge badge-open">{pendingReqCount}</span>}
          </button>
          <button
            type="button"
            className={`status-tab ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => setActiveTab('plans')}
          >
            Plans <span className="tab-badge">{plans.length}</span>
          </button>
          <button
            type="button"
            className={`status-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>

        {activeTab === 'stores' && (
          <div className="admin-support-actions">
            <div className="support-search-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search stores..."
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadData} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : undefined} />
              Refresh
            </button>
          </div>
        )}
        {activeTab === 'requests' && (
          <div className="admin-support-actions">
            <select
              value={reqStatusFilter}
              onChange={(e) => setReqStatusFilter(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="all">All requests</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="applied">Applied</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Withdrawn</option>
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadRequests} disabled={isReqLoading}>
              <RefreshCw size={14} className={isReqLoading ? 'animate-spin' : undefined} />
              Refresh
            </button>
          </div>
        )}
        {activeTab === 'history' && (
          <div className="admin-support-actions">
            <select
              value={historyStoreId}
              onChange={(e) => setHistoryStoreId(e.target.value)}
              style={{ minWidth: '200px' }}
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.branch ? ` — ${s.branch}` : ''}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadHistory(historyStoreId)} disabled={isHistoryLoading}>
              <RefreshCw size={14} className={isHistoryLoading ? 'animate-spin' : undefined} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* ===== Store Subscriptions tab ===== */}
      {activeTab === 'stores' && (
        <div className="card">
          <div className="table-scroll-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Plan</th>
                  <th>Billing</th>
                  <th>Started</th>
                  <th>Next Renewal / Expiry</th>
                  <th>Auto-Renew</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>Loading subscriptions...</td></tr>
                ) : filteredStores.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>No stores found</td></tr>
                ) : (
                  filteredStores.map((store) => {
                    const sub = activeSubByStore.get(store.id);
                    const last = latestSubByStore.get(store.id);
                    const days = sub ? daysUntil(sub.endDate) : 0;
                    const busy = busySubId === sub?.id;
                    return (
                      <tr key={store.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Building2 size={15} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                            <div>
                              <strong>{store.name}</strong>
                              {store.branch && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{store.branch}</div>}
                            </div>
                          </div>
                        </td>
                        {sub ? (
                          <>
                            <td><strong>{sub.planName}</strong></td>
                            <td>{formatCurrency(sub.planPrice)} {RECURRING_SUFFIX[sub.recurringType] || ''}
                              {sub.renewalCount > 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>renewed {sub.renewalCount}×</div>
                              )}
                            </td>
                            <td>{formatDate(sub.startDate)}</td>
                            <td>
                              <div>{formatDate(sub.endDate)}</div>
                              <div style={{ fontSize: '0.72rem', color: days <= 7 ? 'var(--danger)' : 'var(--gray-500)' }}>
                                {days < 0 ? `${Math.abs(days)} day(s) overdue` : `in ${days} day(s)`}
                              </div>
                            </td>
                            <td>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                                <input
                                  type="checkbox"
                                  checked={sub.autoRenew}
                                  disabled={busy}
                                  onChange={() => handleToggleAutoRenew(sub)}
                                />
                                {sub.autoRenew ? 'On' : 'Off'}
                              </label>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--gray-600)' }} title="Show plan price to store users on My Plan">
                                <input
                                  type="checkbox"
                                  checked={!!sub.showPrice}
                                  disabled={busy}
                                  onChange={() => handleToggleShowPrice(sub)}
                                />
                                Show ₹
                              </label>
                            </td>
                            <td><span className={`badge ${STATUS_META[sub.status]?.badge || ''}`}>{STATUS_META[sub.status]?.label || sub.status}</span></td>
                          </>
                        ) : (
                          <>
                            <td colSpan={5} style={{ color: 'var(--gray-400)' }}>No active subscription</td>
                            <td>
                              {last ? (
                                <span className={`badge ${STATUS_META[last.status]?.badge || ''}`}>{STATUS_META[last.status]?.label || last.status}</span>
                              ) : (
                                <span className="badge">None</span>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <div className="action-btns" style={{ justifyContent: 'flex-end' }}>
                            {busy && <Loader2 size={14} className="animate-spin" />}
                            {sub ? (
                              <>
                                <button className="action-btn edit" title="Change plan (upgrade / downgrade)" onClick={() => openSubModal(undefined, sub)} disabled={busy}>
                                  <Repeat size={14} />
                                </button>
                                <button className="action-btn" title="Record payment" onClick={() => openPayModal(sub)} disabled={busy} style={{ color: 'var(--success)' }}>
                                  <Receipt size={14} />
                                </button>
                                <button className="action-btn" title="Subscription history" onClick={() => openHistory(store.id)} disabled={busy}>
                                  <HistoryIcon size={14} />
                                </button>
                                <button className="action-btn delete" title="Cancel subscription" onClick={() => handleCancel(sub)} disabled={busy}>
                                  <Ban size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="primary" onClick={() => openSubModal(store)} disabled={busy || activePlans.length === 0} leftIcon={<Plus size={13} />}>
                                  Assign Plan
                                </Button>
                                {last && last.status === 'expired' && (
                                  <button className="action-btn" title="Record payment & renew" onClick={() => openPayModal(last)} style={{ color: 'var(--success)' }}>
                                    <Receipt size={14} />
                                  </button>
                                )}
                                {last && (
                                  <button className="action-btn" title="Subscription history" onClick={() => openHistory(store.id)}>
                                    <HistoryIcon size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && activePlans.length === 0 && (
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--gray-200)', fontSize: '0.82rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CalendarClock size={14} /> No active subscription plans — create one in the Plans tab before assigning.
            </div>
          )}
        </div>
      )}

      {/* ===== Requests tab ===== */}
      {activeTab === 'requests' && (
        <div className="card">
          <div className="table-scroll-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Store</th>
                  <th>Type</th>
                  <th>Change</th>
                  <th>Effective</th>
                  <th>By</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isReqLoading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>Loading requests...</td></tr>
                ) : filteredRequests.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                    <Inbox size={28} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                    <div>No {reqStatusFilter === 'all' ? '' : reqStatusFilter + ' '}requests</div>
                  </td></tr>
                ) : (
                  filteredRequests.map((req) => {
                    const tMeta = REQ_TYPE_META[req.type] || { label: req.type, badge: 'badge-primary' };
                    const sMeta = REQ_STATUS_META[req.status] || { label: req.status, badge: 'badge-primary' };
                    const busy = busyReqId === req.id;
                    return (
                      <tr key={req.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(req.createdAt)}</td>
                        <td>
                          <strong>{req.storeName || req.storeId}</strong>
                          {req.storeBranch && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{req.storeBranch}</div>}
                        </td>
                        <td><span className={`badge ${tMeta.badge}`}>{tMeta.label}</span></td>
                        <td>
                          {req.type === 'cancel' ? (
                            <span>{req.currentPlanName} → <strong>Cancelled</strong></span>
                          ) : (
                            <span>{req.currentPlanName} → <strong>{req.requestedPlanName}</strong>
                              {req.requestedPlanPrice > 0 && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                                  {formatCurrency(req.requestedPlanPrice)}{RECURRING_SUFFIX[req.requestedRecurringType as RecurringType] || ''}
                                </div>
                              )}
                            </span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{req.effectiveDate ? formatDate(req.effectiveDate) : '—'}</td>
                        <td>{req.requestedByName || '—'}</td>
                        <td>
                          <span className={`badge ${sMeta.badge}`}>{sMeta.label}</span>
                          {req.note && <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.2rem', maxWidth: '180px' }}>{req.note}</div>}
                        </td>
                        <td>
                          <div className="action-btns" style={{ justifyContent: 'flex-end' }}>
                            {busy && <Loader2 size={14} className="animate-spin" />}
                            {req.status === 'pending' && (
                              <>
                                <button className="action-btn" title="Approve (applies at end of current cycle)" onClick={() => handleApproveReq(req)} disabled={busy} style={{ color: 'var(--success)' }}>
                                  <CheckCircle size={14} />
                                </button>
                                <button className="action-btn delete" title="Reject" onClick={() => handleRejectReq(req)} disabled={busy}>
                                  <XCircle size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Plans tab ===== */}
      {activeTab === 'plans' && (
        <>
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading plans...</div>
          ) : plans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-500)' }}>
              <CreditCard size={64} style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
              <p style={{ fontSize: '1.125rem' }}>No subscription plans</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Create a plan to start assigning subscriptions to stores</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {plans.map((plan) => (
                <div key={plan.id} className="card" style={{ position: 'relative', opacity: plan.isActive ? 1 : 0.72 }}>
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '42px', height: '42px', borderRadius: 'var(--radius)',
                        background: 'var(--primary)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: 'white',
                      }}>
                        <CreditCard size={20} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{plan.name}</h3>
                        <span className="badge badge-primary">{RECURRING_LABELS[plan.recurringType] || plan.recurringType}</span>
                      </div>
                    </div>
                    <div className="action-btns">
                      <button
                        className="action-btn"
                        onClick={() => handlePlanToggle(plan)}
                        disabled={busyPlanId === plan.id}
                        title={plan.isActive ? 'Deactivate plan' : 'Activate plan'}
                        style={{ color: plan.isActive ? 'var(--success)' : 'var(--gray-400)' }}
                      >
                        {busyPlanId === plan.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                      </button>
                      <button className="action-btn edit" onClick={() => openPlanModal(plan)} disabled={busyPlanId === plan.id}>
                        <Edit2 size={14} />
                      </button>
                      <button className="action-btn delete" onClick={() => handlePlanDelete(plan)} disabled={busyPlanId === plan.id}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                      {formatCurrency(plan.price)}
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--gray-500)' }}> {RECURRING_SUFFIX[plan.recurringType]}</span>
                    </div>
                    {plan.features && plan.features.length > 0 ? (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.4rem' }}>
                        {plan.features.map((f, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', fontSize: '0.85rem', color: 'var(--gray-700)' }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '0.15rem' }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: 'var(--gray-400)' }}>No features listed</span>
                    )}
                    {!plan.isActive && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <span className="badge badge-warning">Inactive</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== History tab ===== */}
      {activeTab === 'history' && (
        <>
        <div className="card">
          <div className="table-scroll-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Store</th>
                  <th>Event</th>
                  <th>Plan Change</th>
                  <th>By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {isHistoryLoading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>Loading history...</td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>No subscription history yet</td></tr>
                ) : (
                  events.map((ev) => {
                    const meta = ACTION_META[ev.action] || { label: ev.action, badge: 'badge-primary' };
                    return (
                      <tr key={ev.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(ev.createdAt)}</td>
                        <td><strong>{ev.storeName || ev.storeId}</strong></td>
                        <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
                        <td>
                          {ev.fromPlanName && ev.toPlanName && ev.fromPlanName !== ev.toPlanName ? (
                            <span>{ev.fromPlanName} → <strong>{ev.toPlanName}</strong></span>
                          ) : (
                            <span>{ev.toPlanName || ev.fromPlanName || '—'}</span>
                          )}
                        </td>
                        <td>{ev.createdByName || 'System'}</td>
                        <td style={{ maxWidth: '340px', fontSize: '0.82rem', color: 'var(--gray-600)' }}>{ev.notes || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div className="card-header" style={{ paddingBottom: 0 }}>
            <span className="card-title" style={{ fontSize: '0.95rem' }}>Payments</span>
          </div>
          <div className="table-scroll-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Date</th><th>Store</th><th>Plan</th><th>Amount</th>
                  <th>Method</th><th>Period</th><th>Status</th><th>By</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>No payments recorded</td></tr>
                ) : payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(p.paidAt || p.createdAt)}</td>
                    <td><strong>{p.storeName}</strong></td>
                    <td>{p.planName || '—'}</td>
                    <td><strong>{formatCurrency(p.amount)}</strong></td>
                    <td>{p.method === 'auto' ? 'Auto (renewal)' : p.method.replace(/_/g, ' ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.periodStart && p.periodEnd ? `${formatDate(p.periodStart)} → ${formatDate(p.periodEnd)}` : '—'}</td>
                    <td><span className={`badge ${p.status === 'paid' ? 'badge-success' : p.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>{p.status}</span></td>
                    <td>{p.recordedByName || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* ===== Plan modal ===== */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPlan ? 'Edit Plan' : 'Add Subscription Plan'}</h2>
              <button className="close-btn" onClick={() => setShowPlanModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePlanSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Plan Name *</label>
                    <input
                      type="text"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="e.g., Starter, Pro"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Price (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={planForm.price}
                      onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                      placeholder="e.g., 999"
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Billing Cycle *</label>
                    <select
                      value={planForm.recurringType}
                      onChange={(e) => setPlanForm({ ...planForm, recurringType: e.target.value as RecurringType })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="biannually">Bi-Annually (6 months)</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.35rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={planForm.isActive}
                        onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
                      />
                      Active (can be assigned to stores)
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label>Features Included (optional)</label>
                  <textarea
                    value={planForm.features}
                    onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                    placeholder={'One feature per line, e.g.\nUnlimited orders\nGST reports\nPriority support'}
                    rows={4}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={() => setShowPlanModal(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText={editingPlan ? 'Updating...' : 'Creating...'}>
                  {editingPlan ? 'Update Plan' : 'Create Plan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Record payment modal ===== */}
      {paySub && (
        <div className="modal-overlay" onClick={() => setPaySub(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Payment</h2>
              <button className="close-btn" onClick={() => setPaySub(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleRecordPayment}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Subscription</label>
                  <input type="text" value={`${paySub.storeName || paySub.storeId} — ${paySub.planName} (${RECURRING_LABELS[paySub.recurringType]}, ${paySub.status})`} disabled />
                  <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                    Current cycle ends {formatDate(paySub.endDate)}{paySub.status !== 'active' ? ` (${paySub.status})` : ''}
                  </small>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₹) *</label>
                    <input type="number" min="0" step="0.01" value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Method</label>
                    <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <input type="text" value={payForm.notes}
                    onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                    placeholder="e.g., transaction reference" />
                </div>
                <div className="form-group">
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={payForm.renew}
                      onChange={(e) => setPayForm({ ...payForm, renew: e.target.checked })} />
                    Renew subscription by one {RECURRING_LABELS[paySub.recurringType].toLowerCase()} period
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={() => setPaySub(null)} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText="Recording..." leftIcon={<Receipt size={14} />}>
                  Record Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Subscription assign/change modal ===== */}
      {showSubModal && (
        <div className="modal-overlay" onClick={() => setShowSubModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{subModalMode === 'change' ? 'Change Plan' : 'New Subscription'}</h2>
              <button className="close-btn" onClick={() => setShowSubModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubSubmit}>
              <div className="modal-body">
                {subModalMode === 'change' && changingSub ? (
                  <div className="form-group">
                    <label>Store</label>
                    <input type="text" value={changingSub.storeName || changingSub.storeId} disabled />
                    <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                      Current plan: <strong>{changingSub.planName}</strong> ({formatCurrency(changingSub.planPrice)}{RECURRING_SUFFIX[changingSub.recurringType]})
                    </small>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Store *</label>
                    <select
                      value={subForm.storeId}
                      onChange={(e) => setSubForm({ ...subForm, storeId: e.target.value })}
                      required
                    >
                      <option value="">Select store...</option>
                      {stores
                        .filter((s) => !activeSubByStore.has(s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.branch ? ` — ${s.branch}` : ''}</option>
                        ))}
                    </select>
                    <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                      Only stores without an active subscription are listed.
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label>{subModalMode === 'change' ? 'New Plan *' : 'Plan *'}</label>
                  <select
                    value={subForm.planId}
                    onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}
                    required
                  >
                    <option value="">Select plan...</option>
                    {activePlans
                      .filter((p) => subModalMode !== 'change' || p.id !== changingSub?.planId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatCurrency(p.price)}{RECURRING_SUFFIX[p.recurringType]} ({RECURRING_LABELS[p.recurringType]})
                        </option>
                      ))}
                  </select>
                  {changeDelta !== null && subForm.planId && (
                    <div style={{ marginTop: '0.4rem' }}>
                      {changeDelta > 0 ? (
                        <span className="badge badge-success"><ArrowUpCircle size={11} style={{ marginRight: '0.25rem' }} />Upgrade (+{formatCurrency(changeDelta)})</span>
                      ) : changeDelta < 0 ? (
                        <span className="badge badge-warning"><ArrowDownCircle size={11} style={{ marginRight: '0.25rem' }} />Downgrade (−{formatCurrency(Math.abs(changeDelta))})</span>
                      ) : (
                        <span className="badge badge-primary">Same price</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{subModalMode === 'change' ? 'Effective Date *' : 'Start Date *'}</label>
                    <input
                      type="date"
                      value={subForm.startDate}
                      onChange={(e) => setSubForm({ ...subForm, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.35rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={subForm.autoRenew}
                        onChange={(e) => setSubForm({ ...subForm, autoRenew: e.target.checked })}
                      />
                      Auto-renew subscription
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0, marginTop: '0.4rem' }}>
                      <input
                        type="checkbox"
                        checked={subForm.showPrice}
                        onChange={(e) => setSubForm({ ...subForm, showPrice: e.target.checked })}
                      />
                      Show plan price to store users
                    </label>
                  </div>
                </div>

                {selectedPlan && (
                  <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem', display: 'block' }}>
                    {subModalMode === 'change'
                      ? 'The current period ends now and a fresh billing period starts on the effective date.'
                      : `First ${subForm.autoRenew ? 'renewal' : 'expiry'} date is calculated from the start date and the plan's billing cycle.`}
                  </small>
                )}
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={() => setShowSubModal(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText="Saving...">
                  {subModalMode === 'change' ? 'Change Plan' : 'Create Subscription'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
