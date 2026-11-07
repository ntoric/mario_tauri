import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Crown, CheckCircle2, RefreshCw, Building2, CalendarClock,
  Infinity as InfinityIcon, AlertTriangle, CreditCard, Zap,
  ArrowUpCircle, ArrowDownCircle, Repeat, X, Ban, Clock3, Send,
  Download,
} from 'lucide-react';
import { useAuthStore, useDataStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { load as loadCashfree } from '@cashfreepayments/cashfree-js';
import { formatCurrency } from '../utils/currency';
import { downloadPaymentReceipt, paymentMethodLabel } from '../utils/paymentReceipt';
import notify from '../utils/toast';
import type {
  MySubscription, MySubscriptionHistory, RecurringType, SubscriptionPlan,
  SubscriptionPayment,
} from '../types';

const RECURRING_LABELS: Record<RecurringType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Bi-Annually',
  yearly: 'Yearly',
};

const RECURRING_SUFFIX: Record<RecurringType, string> = {
  monthly: '/month',
  quarterly: '/quarter',
  biannually: '/6 months',
  yearly: '/year',
};

const STATUS_META: Record<string, { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'badge-success' },
  expired: { label: 'Expired', badge: 'badge-danger' },
  cancelled: { label: 'Cancelled', badge: 'badge-warning' },
  replaced: { label: 'Replaced', badge: 'badge-primary' },
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

const DAY_MS = 86400000;

const formatDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (s?: string) =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const MyPlan: React.FC = () => {
  const { user, currentStoreId } = useAuthStore();
  const { stores } = useDataStore();
  const { setHeaderContent } = usePageHeader();
  const currentStore = stores.find((s) => s.id === currentStoreId);

  const [data, setData] = useState<MySubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<'plan' | 'history'>('plan');
  const [history, setHistory] = useState<MySubscriptionHistory | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqPlanId, setReqPlanId] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payPlanId, setPayPlanId] = useState('');
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [payEnabled, setPayEnabled] = useState(false);

  // Re-render the countdown every minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, planRes, payRes] = await Promise.all([
        api.getMySubscription(currentStoreId || undefined),
        api.getSubscriptionPlans(),
        api.getPaymentConfig().catch(() => null),
      ]);
      setData(res);
      setPlans(planRes || []);
      setPayEnabled(!!payRes?.enabled);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load subscription');
    } finally {
      setIsLoading(false);
    }
  }, [currentStoreId]);

  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const res = await api.getMySubscriptionHistory(currentStoreId || undefined);
      setHistory(res);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load subscription history');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  useEffect(() => {
    const refreshing = activeTab === 'history' ? isHistoryLoading : isLoading;
    setHeaderContent({
      title: 'My Plan',
      subtitle: 'Your store subscription & billing status',
      actions: (
        <button
          className="btn btn-secondary"
          onClick={activeTab === 'history' ? loadHistory : load}
          disabled={refreshing}
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      ),
    });
  }, [setHeaderContent, load, loadHistory, isLoading, isHistoryLoading, activeTab]);

  const sub = data?.subscription ?? null;
  const plan = data?.plan ?? null;
  const isActive = sub?.status === 'active';
  const pending = data?.pendingRequest ?? null;

  // business roles may file requests; staff is view-only
  const canRequest = !!user && ['superadmin', 'business_owner', 'business_admin'].includes(user.role);
  const requestablePlans = plans.filter((p) => p.isActive && p.id !== sub?.planId);
  const reqSelectedPlan = requestablePlans.find((p) => p.id === reqPlanId);
  const reqDelta = reqSelectedPlan && sub ? reqSelectedPlan.price - sub.planPrice : null;

  // The page is superadmin-gated per store — non-superadmin users only see it
  // when their store's flag is on (superadmin always sees it).
  const isSuperadmin = user?.role === 'superadmin';
  const pageHidden = !!user && !isSuperadmin && !currentStore?.myPlanEnabled;
  // show_price off => hide amounts for store users (superadmin always sees them)
  const hidePrice = !isSuperadmin && !!sub && !sub.showPrice;

  if (pageHidden) {
    return <Navigate to="/" />;
  }

  const handleRequestChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqPlanId) {
      notify.error('Select a plan');
      return;
    }
    setIsSubmittingReq(true);
    try {
      await api.submitSubscriptionRequest(currentStoreId || undefined, { action: 'change_plan', planId: reqPlanId });
      notify.success('Change request submitted — awaiting admin approval');
      setShowReqModal(false);
      setReqPlanId('');
      load();
    } catch (err: any) {
      notify.error(err.message || 'Failed to submit request');
    } finally {
      setIsSubmittingReq(false);
    }
  };

  const handleRequestCancel = async () => {
    if (!confirm('Request cancellation of your plan? It will remain active until the current cycle ends once approved by the admin.')) return;
    setIsSubmittingReq(true);
    try {
      await api.submitSubscriptionRequest(currentStoreId || undefined, { action: 'cancel' });
      notify.success('Cancellation request submitted — awaiting admin approval');
      load();
    } catch (err: any) {
      notify.error(err.message || 'Failed to submit request');
    } finally {
      setIsSubmittingReq(false);
    }
  };

  const handleWithdraw = async () => {
    if (!pending) return;
    if (!confirm('Withdraw your pending change request?')) return;
    setIsSubmittingReq(true);
    try {
      await api.withdrawSubscriptionRequest(pending.id);
      notify.success('Request withdrawn');
      load();
    } catch (err: any) {
      notify.error(err.message || 'Failed to withdraw request');
    } finally {
      setIsSubmittingReq(false);
    }
  };

  // ---- online payment (Cashfree) ----

  // Poll the verify endpoint until the gateway settles the order (a webhook
  // may beat us to it — verify is idempotent either way).
  const verifyAndFinish = useCallback(async (orderId: string) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await api.verifyPlanPayment(orderId);
        if (res.status === 'paid') {
          notify.success('Payment successful — your plan is now active');
          setPendingOrderId(null);
          load();
          if (activeTab === 'history') loadHistory();
          return;
        }
        if (res.status !== 'pending') {
          notify.error(`Payment ${res.status} — please try again`);
          setPendingOrderId(null);
          return;
        }
      } catch (err: any) {
        notify.error(err.message || 'Could not verify payment status');
        return;
      }
      if (attempt < 5) await new Promise((r) => setTimeout(r, 2500));
    }
    // Still processing — leave a manual re-check option on the page.
    setPendingOrderId(orderId);
    notify.info('Payment is being processed — tap "Check status" in a moment');
  }, [load, loadHistory, activeTab]);

  const openPayModal = () => {
    const currentPlanAvailable = plans.some((p) => p.id === sub?.planId && p.isActive);
    setPayPlanId(currentPlanAvailable ? sub!.planId : '');
    setShowPayModal(true);
  };

  const handlePayNow = async () => {
    // planId empty means "renew current plan" — only valid when one exists.
    const planId = payPlanId || undefined;
    if (!sub && !planId) {
      notify.error('Select a plan');
      return;
    }
    setIsPaying(true);
    try {
      const res = await api.createPlanPaymentOrder(currentStoreId || undefined, planId);
      const cashfree = await loadCashfree({ mode: res.mode === 'production' ? 'production' : 'sandbox' });
      if (!cashfree) throw new Error('Payment SDK failed to load');
      setShowPayModal(false);
      const result = await cashfree.checkout({
        paymentSessionId: res.paymentSessionId,
        redirectTarget: '_modal',
      });
      if (result?.error) {
        notify.error(result.error.message || 'Payment failed');
        setPendingOrderId(res.order.id);
        return;
      }
      await verifyAndFinish(res.order.id);
    } catch (err: any) {
      notify.error(err.message || 'Failed to start payment');
    } finally {
      setIsPaying(false);
    }
  };

  const recheckPayment = async () => {
    if (!pendingOrderId) return;
    setIsPaying(true);
    try {
      await verifyAndFinish(pendingOrderId);
    } finally {
      setIsPaying(false);
    }
  };

  // ---- countdown math ----
  const startMs = sub ? new Date(sub.startDate).getTime() : 0;
  const endMs = sub ? new Date(sub.endDate).getTime() : 0;
  const totalMs = Math.max(endMs - startMs, DAY_MS);
  const totalDays = Math.max(1, Math.round(totalMs / DAY_MS));
  const remainingMs = Math.max(0, endMs - now);
  const remainingDays = isActive ? Math.ceil(remainingMs / DAY_MS) : 0;
  const usedDays = Math.min(totalDays, Math.max(0, totalDays - remainingDays));
  const remainingPct = isActive ? Math.min(100, Math.max(0, (remainingMs / totalMs) * 100)) : 0;
  const urgent = isActive && remainingDays <= 7;

  const statusLabel = sub
    ? { active: 'Active', expired: 'Expired', cancelled: 'Cancelled', replaced: 'Ended' }[sub.status] || sub.status
    : '';

  return (
    <div className="myplan-page">
      <div className="status-tab-group" style={{ width: 'fit-content', marginBottom: '1.25rem' }}>
        <button
          type="button"
          className={`status-tab ${activeTab === 'plan' ? 'active' : ''}`}
          onClick={() => setActiveTab('plan')}
        >
          Current Plan
        </button>
        <button
          type="button"
          className={`status-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {activeTab === 'plan' && (isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-500)' }}>Loading your plan...</div>
      ) : !sub ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--gray-500)' }}>
          <CreditCard size={64} style={{ marginBottom: '1.25rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--gray-700)', margin: 0 }}>No subscription yet</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {currentStore ? `${currentStore.name} doesn't` : 'This store doesn\'t'} have a subscription plan. Contact your administrator to get started.
          </p>
          {canRequest && payEnabled && plans.some((p) => p.isActive) && (
            <Button variant="primary" leftIcon={<CreditCard size={15} />} onClick={openPayModal} style={{ marginTop: '1.5rem' }}>
              Subscribe Online
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* ===== Premium plan card ===== */}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-lg, 18px)',
              padding: '2rem',
              color: '#fff',
              overflow: 'hidden',
              background: isActive
                ? 'linear-gradient(135deg, #141a33 0%, #1d2a52 45%, #4a2d8f 100%)'
                : 'linear-gradient(135deg, #26262e 0%, #33333d 60%, #4a3a3a 100%)',
              boxShadow: '0 18px 45px rgba(15, 18, 40, 0.45)',
            }}
          >
            {/* decorative glows */}
            <div style={{ position: 'absolute', top: '-70px', right: '-50px', width: '240px', height: '240px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,166,35,0.35), transparent 65%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-90px', left: '-60px', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(120,90,255,0.3), transparent 65%)', pointerEvents: 'none' }} />
            <Crown size={150} style={{ position: 'absolute', right: '1.25rem', bottom: '-2.2rem', opacity: 0.08, pointerEvents: 'none' }} />

            {/* header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>
                  <Crown size={13} style={{ color: '#f5a623' }} /> Membership Plan
                </div>
                <h2 style={{ margin: '0.4rem 0 0.2rem', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {sub.planName}
                </h2>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f5a623' }}>{hidePrice ? '•••' : formatCurrency(sub.planPrice)}</span>
                  <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>{RECURRING_SUFFIX[sub.recurringType]}</span>
                </div>
              </div>
              <span
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  background: isActive ? 'rgba(43,165,74,0.25)' : 'rgba(229,57,53,0.3)',
                  color: isActive ? '#7be495' : '#ff9d97',
                  border: `1px solid ${isActive ? 'rgba(123,228,149,0.4)' : 'rgba(255,157,151,0.35)'}`,
                  backdropFilter: 'blur(6px)',
                }}
              >
                {statusLabel}
              </span>
            </div>

            {/* store + meta grid */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.1rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>
              <Building2 size={14} />
              {sub.storeName || currentStore?.name || 'Store'}
              {sub.storeBranch ? ` — ${sub.storeBranch}` : ''}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginTop: '1.25rem',
                padding: '1rem 1.25rem',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(8px)',
                position: 'relative',
              }}
            >
              <div>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)' }}>Started</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.2rem' }}>{formatDate(sub.startDate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)' }}>
                  {sub.autoRenew ? 'Next Renewal' : 'Expires'}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.2rem' }}>{formatDate(sub.endDate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)' }}>Billing Cycle</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.2rem' }}>{RECURRING_LABELS[sub.recurringType] || sub.recurringType}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)' }}>Auto-Renew</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.95rem', fontWeight: 600, marginTop: '0.2rem', color: sub.autoRenew ? '#7be495' : 'rgba(255,255,255,0.7)' }}>
                  <InfinityIcon size={14} /> {sub.autoRenew ? 'On' : 'Off'}
                </div>
              </div>
            </div>

            {/* ===== countdown progress ===== */}
            <div style={{ marginTop: '1.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.55rem' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)' }}>
                    {isActive ? 'Days Remaining' : 'Period Ended'}
                  </div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.1, color: urgent ? '#ffb04d' : '#fff' }}>
                    {isActive ? remainingDays : 0}
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginLeft: '0.35rem' }}>
                      of {totalDays} days
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
                  {isActive ? (
                    <>
                      <CalendarClock size={12} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />
                      {sub.autoRenew ? `Renews ${formatDate(sub.endDate)}` : `Ends ${formatDate(sub.endDate)}`}
                    </>
                  ) : (
                    <>Ended {formatDate(sub.endDate)}</>
                  )}
                </div>
              </div>
              <div
                style={{
                  height: '12px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${remainingPct}%`,
                    borderRadius: '999px',
                    transition: 'width 0.6s ease',
                    background: urgent
                      ? 'linear-gradient(90deg, #ff7a59, #f5a623)'
                      : 'linear-gradient(90deg, #43d98a, #a3e635)',
                    boxShadow: urgent ? '0 0 12px rgba(245,166,35,0.5)' : '0 0 12px rgba(67,217,138,0.45)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
                <span>{usedDays} day{usedDays === 1 ? '' : 's'} elapsed</span>
                <span>{remainingDays} day{remainingDays === 1 ? '' : 's'} left</span>
              </div>
            </div>
          </div>

          {/* pending / scheduled change request */}
          {pending && (
            <div
              className="card"
              style={{
                marginTop: '1.25rem',
                padding: '1rem 1.25rem',
                borderLeft: `4px solid ${pending.status === 'pending' ? 'var(--warning)' : 'var(--success)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Clock3 size={20} style={{ color: pending.status === 'pending' ? 'var(--warning)' : 'var(--success)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>
                  {pending.type === 'cancel' ? (
                    <>
                      <strong>Cancellation requested</strong> — plan stays active until {formatDate(pending.effectiveDate ?? undefined)}.
                    </>
                  ) : (
                    <>
                      <strong>{pending.type === 'upgrade' ? 'Upgrade' : pending.type === 'downgrade' ? 'Downgrade' : 'Plan change'} to {pending.requestedPlanName}</strong> — takes effect {formatDate(pending.effectiveDate ?? undefined)}.
                    </>
                  )}
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>
                    {pending.status === 'pending'
                      ? 'Awaiting admin approval'
                      : 'Approved — will apply at the end of the current cycle'}
                  </div>
                </div>
              </div>
              {pending.status === 'pending' && canRequest && (
                <Button size="sm" variant="outline" onClick={handleWithdraw} isLoading={isSubmittingReq} loadingText="Withdrawing...">
                  Withdraw
                </Button>
              )}
            </div>
          )}

          {/* request actions */}
          {isActive && canRequest && !pending && (requestablePlans.length > 0 || true) && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              {payEnabled && (
                <Button
                  variant="primary"
                  leftIcon={<CreditCard size={15} />}
                  onClick={openPayModal}
                  isLoading={isPaying}
                  loadingText="Processing..."
                >
                  Pay &amp; Renew
                </Button>
              )}
              {requestablePlans.length > 0 && (
                <Button
                  variant="outline"
                  leftIcon={<Repeat size={15} />}
                  onClick={() => setShowReqModal(true)}
                >
                  Request Plan Change
                </Button>
              )}
              <Button
                variant="outline"
                leftIcon={<Ban size={15} />}
                onClick={handleRequestCancel}
                isLoading={isSubmittingReq}
                loadingText="Submitting..."
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                Request Cancellation
              </Button>
            </div>
          )}

          {/* pending payment banner */}
          {pendingOrderId && (
            <div className="card" style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', borderLeft: '4px solid var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Clock3 size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>
                  <strong>Payment is being processed</strong> — your plan will update as soon as the gateway confirms.
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={recheckPayment} isLoading={isPaying} loadingText="Checking...">
                Check status
              </Button>
            </div>
          )}

          {/* alerts */}
          {sub.status === 'expired' && (
            <div className="card" style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderLeft: '4px solid var(--danger)', flexWrap: 'wrap' }}>
              <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)', flex: 1 }}>
                Your subscription expired on <strong>{formatDate(sub.endDate)}</strong>.{' '}
                {payEnabled
                  ? 'Pay online to reactivate instantly, or contact your administrator.'
                  : 'Contact your administrator to reactivate.'}
              </div>
              {canRequest && payEnabled && (
                <Button size="sm" variant="primary" leftIcon={<CreditCard size={14} />} onClick={openPayModal} isLoading={isPaying} loadingText="Processing...">
                  Pay to Reactivate
                </Button>
              )}
            </div>
          )}
          {sub.status === 'cancelled' && (
            <div className="card" style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderLeft: '4px solid var(--warning)', flexWrap: 'wrap' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)', flex: 1 }}>
                This subscription was cancelled.{' '}
                {payEnabled
                  ? 'Pay online to start a new plan, or contact your administrator.'
                  : 'Contact your administrator to start a new plan.'}
              </div>
              {canRequest && payEnabled && plans.some((p) => p.isActive) && (
                <Button size="sm" variant="primary" leftIcon={<CreditCard size={14} />} onClick={openPayModal} isLoading={isPaying} loadingText="Processing...">
                  Choose a Plan &amp; Pay
                </Button>
              )}
            </div>
          )}
          {isActive && !sub.autoRenew && (
            <div className="card" style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderLeft: '4px solid var(--warning)' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>
                Auto-renewal is off — this plan will expire on <strong>{formatDate(sub.endDate)}</strong> unless renewed.
              </div>
            </div>
          )}

          {/* features */}
          {plan?.features && plan.features.length > 0 && (
            <div className="card" style={{ marginTop: '1.25rem' }}>
              <div className="card-header" style={{ paddingBottom: 0 }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                  <Zap size={16} style={{ color: 'var(--primary)' }} /> What's included
                </span>
              </div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--gray-700)' }}>
                    <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '0.15rem' }} />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {sub.renewalCount > 0 && (
            <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--gray-500)' }}>
              This subscription has renewed {sub.renewalCount} time{sub.renewalCount === 1 ? '' : 's'}.
            </div>
          )}
        </>
      ))}

      {/* ===== History tab ===== */}
      {activeTab === 'history' && (
        <>
          <div className="card">
            <div className="card-header" style={{ paddingBottom: 0 }}>
              <span className="card-title" style={{ fontSize: '0.95rem' }}>Billing Periods</span>
            </div>
            <div className="table-scroll-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Price</th>
                    <th>Period</th>
                    <th>Billing</th>
                    <th>Renewals</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistoryLoading ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray-500)' }}>Loading history...</td></tr>
                  ) : !history || history.periods.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray-500)' }}>No subscription history yet</td></tr>
                  ) : (
                    history.periods.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.planName}</strong></td>
                        <td>{hidePrice ? '—' : `${formatCurrency(p.planPrice)}${RECURRING_SUFFIX[p.recurringType]}`}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.startDate)} → {formatDate(p.endDate)}</td>
                        <td>{RECURRING_LABELS[p.recurringType] || p.recurringType}</td>
                        <td>{p.renewalCount > 0 ? `${p.renewalCount}×` : '—'}</td>
                        <td><span className={`badge ${STATUS_META[p.status]?.badge || ''}`}>{STATUS_META[p.status]?.label || p.status}</span></td>
                      </tr>
                    ))
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
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>By</th>
                    <th style={{ width: '90px' }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistoryLoading ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray-500)' }}>Loading history...</td></tr>
                  ) : !history || history.payments.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray-500)' }}>No payments recorded</td></tr>
                  ) : (
                    history.payments.map((p: SubscriptionPayment) => (
                      <tr key={p.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(p.paidAt || p.createdAt)}</td>
                        <td>{p.planName || '—'}</td>
                        <td><strong>{hidePrice ? '—' : formatCurrency(p.amount)}</strong></td>
                        <td>{paymentMethodLabel(p.method)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{p.periodStart && p.periodEnd ? `${formatDate(p.periodStart)} → ${formatDate(p.periodEnd)}` : '—'}</td>
                        <td><span className={`badge ${p.status === 'paid' ? 'badge-success' : p.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>{p.status}</span></td>
                        <td>{p.recordedByName || 'System'}</td>
                        <td>
                          {p.status === 'paid' && !hidePrice ? (
                            <button
                              type="button"
                              className="action-btn"
                              title="Download receipt"
                              style={{ color: 'var(--primary)' }}
                              onClick={() => downloadPaymentReceipt(p, currentStore)}
                            >
                              <Download size={16} />
                            </button>
                          ) : (
                            <span style={{ color: 'var(--gray-400)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.25rem' }}>
            <div className="card-header" style={{ paddingBottom: 0 }}>
              <span className="card-title" style={{ fontSize: '0.95rem' }}>Activity</span>
            </div>
            <div className="table-scroll-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Event</th>
                    <th>Plan Change</th>
                    <th>By</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistoryLoading ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray-500)' }}>Loading history...</td></tr>
                  ) : !history || history.events.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray-500)' }}>No activity yet</td></tr>
                  ) : (
                    history.events.map((ev) => {
                      const meta = ACTION_META[ev.action] || { label: ev.action, badge: 'badge-primary' };
                      return (
                        <tr key={ev.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(ev.createdAt)}</td>
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
        </>
      )}

      {/* ===== change-plan request modal ===== */}
      {showReqModal && sub && (
        <div className="modal-overlay" onClick={() => setShowReqModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request Plan Change</h2>
              <button className="close-btn" onClick={() => setShowReqModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRequestChange}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Current Plan</label>
                  <input type="text" value={hidePrice ? sub.planName : `${sub.planName} (${formatCurrency(sub.planPrice)}${RECURRING_SUFFIX[sub.recurringType]})`} disabled />
                </div>
                <div className="form-group">
                  <label>New Plan *</label>
                  <select value={reqPlanId} onChange={(e) => setReqPlanId(e.target.value)} required>
                    <option value="">Select plan...</option>
                    {requestablePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {hidePrice ? `${p.name} (${RECURRING_LABELS[p.recurringType]})` : `${p.name} — ${formatCurrency(p.price)}${RECURRING_SUFFIX[p.recurringType]} (${RECURRING_LABELS[p.recurringType]})`}
                      </option>
                    ))}
                  </select>
                  {reqDelta !== null && reqPlanId && (
                    <div style={{ marginTop: '0.4rem' }}>
                      {reqDelta > 0 ? (
                        <span className="badge badge-success"><ArrowUpCircle size={11} style={{ marginRight: '0.25rem' }} />Upgrade{hidePrice ? '' : ` (+${formatCurrency(reqDelta)})`}</span>
                      ) : reqDelta < 0 ? (
                        <span className="badge badge-warning"><ArrowDownCircle size={11} style={{ marginRight: '0.25rem' }} />Downgrade{hidePrice ? '' : ` (−${formatCurrency(Math.abs(reqDelta))})`}</span>
                      ) : (
                        <span className="badge badge-primary">Same price</span>
                      )}
                    </div>
                  )}
                </div>
                <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem', display: 'block' }}>
                  The change takes effect at the end of your current cycle
                  {sub.endDate ? ` (${formatDate(sub.endDate)})` : ''} once approved by the admin.
                  Your current plan stays active until then.
                </small>
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={() => setShowReqModal(false)} disabled={isSubmittingReq}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmittingReq} loadingText="Submitting..." leftIcon={<Send size={14} />}>
                  Submit Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== online payment modal ===== */}
      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Pay Online</h2>
              <button className="close-btn" onClick={() => setShowPayModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handlePayNow(); }}>
              <div className="modal-body">
                {sub && (
                  <div className="form-group">
                    <label>Current Plan</label>
                    <input type="text" value={hidePrice ? sub.planName : `${sub.planName} (${formatCurrency(sub.planPrice)}${RECURRING_SUFFIX[sub.recurringType]})`} disabled />
                  </div>
                )}
                <div className="form-group">
                  <label>{sub ? 'Plan to pay for' : 'Choose a plan'} *</label>
                  <select value={payPlanId} onChange={(e) => setPayPlanId(e.target.value)} required>
                    <option value="">Select plan...</option>
                    {plans.filter((p) => p.isActive).map((p) => (
                      <option key={p.id} value={p.id}>
                        {hidePrice ? `${p.name} (${RECURRING_LABELS[p.recurringType]})` : `${p.name} — ${formatCurrency(p.price)}${RECURRING_SUFFIX[p.recurringType]} (${RECURRING_LABELS[p.recurringType]})`}
                      </option>
                    ))}
                  </select>
                </div>
                {payPlanId && sub && payPlanId !== sub.planId && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <span className="badge badge-primary">
                      {(plans.find((p) => p.id === payPlanId)?.price ?? 0) > sub.planPrice ? 'Upgrade' : 'Switch plan'} — applies immediately on payment
                    </span>
                  </div>
                )}
                <small style={{ color: 'var(--gray-500)', fontSize: '0.8rem', display: 'block' }}>
                  You'll be taken to Cashfree's secure checkout. Once the payment succeeds,
                  your plan is recorded and renewed automatically — no admin action needed.
                </small>
              </div>
              <div className="modal-footer">
                <Button type="button" variant="secondary" onClick={() => setShowPayModal(false)} disabled={isPaying}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isPaying} loadingText="Opening checkout..." leftIcon={<CreditCard size={14} />}>
                  {payPlanId && !hidePrice
                    ? `Pay ${formatCurrency(plans.find((p) => p.id === payPlanId)?.price ?? 0)}`
                    : 'Pay Now'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyPlan;
