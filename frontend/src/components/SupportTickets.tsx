import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Send,
  Building2,
  Phone,
  MapPin,
  User,
  Search,
  Filter,
  LifeBuoy,
  LucideIcon,
} from 'lucide-react';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { api } from '../services/api';
import notify from '../utils/toast';
import type { SupportTicket, SupportMessage, SupportTicketStatus } from '../types';

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General inquiry',
  bug: 'Issue / Bug',
  billing: 'Billing & Payments',
  feature: 'Feature request',
  account: 'Account & Access',
  other: 'Other',
};

const STATUS_META: Record<SupportTicketStatus, { label: string; class: string; icon: LucideIcon }> = {
  open: { label: 'Open', class: 'status-open', icon: Clock },
  in_progress: { label: 'In Progress', class: 'status-progress', icon: HelpCircle },
  resolved: { label: 'Resolved', class: 'status-resolved', icon: CheckCircle2 },
  closed: { label: 'Closed', class: 'status-closed', icon: AlertCircle },
};

const PRIORITY_BADGES: Record<string, string> = {
  high: 'priority-high',
  medium: 'priority-medium',
  low: 'priority-low',
};

export const SupportTickets: React.FC = () => {
  const { setHeaderContent } = usePageHeader();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<{ ticket: SupportTicket; messages: SupportMessage[] } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    setHeaderContent({
      title: 'Support Tickets',
      subtitle: 'Review and respond to support requests from all stores',
      actions: null,
    });
  }, [setHeaderContent]);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAllSupportTickets(statusFilter);
      setTickets(res.tickets || []);
      // If active ticket is selected, refresh its details
      if (selectedTicketId) {
        loadTicketDetail(selectedTicketId, false);
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to load tickets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const loadTicketDetail = async (id: string, showLoading = true) => {
    setSelectedTicketId(id);
    if (showLoading) setIsLoadingDetail(true);
    try {
      const data = await api.getSupportTicket(id);
      setTicketDetail(data);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load ticket details');
    } finally {
      if (showLoading) setIsLoadingDetail(false);
    }
  };

  const handleSelectTicket = (t: SupportTicket) => {
    loadTicketDetail(t.id);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const res = await api.replySupportTicket(selectedTicketId, replyText.trim());
      setReplyText('');
      setTicketDetail((prev) =>
        prev
          ? {
              ticket: res.ticket || prev.ticket,
              messages: [...prev.messages, res.message],
            }
          : prev
      );
      notify.success('Reply sent to store');
      // Refresh list to update message count / status
      loadTickets();
    } catch (err: any) {
      notify.error(err.message || 'Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: SupportTicketStatus) => {
    if (!selectedTicketId || !ticketDetail) return;
    setIsUpdatingStatus(true);
    try {
      const res = await api.updateSupportTicketStatus(selectedTicketId, newStatus);
      setTicketDetail((prev) => (prev ? { ...prev, ticket: res.ticket } : prev));
      notify.success(`Ticket marked as ${STATUS_META[newStatus]?.label || newStatus}`);
      loadTickets();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.subject.toLowerCase().includes(q) ||
      (t.storeName && t.storeName.toLowerCase().includes(q)) ||
      (t.storeBranch && t.storeBranch.toLowerCase().includes(q)) ||
      (t.createdByName && t.createdByName.toLowerCase().includes(q)) ||
      t.id.toLowerCase().includes(q)
    );
  });

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;

  return (
    <div className="admin-support-page">
      {/* Top Filter & Metric Bar */}
      <div className="admin-support-header">
        <div className="status-tab-group">
          <button
            type="button"
            className={`status-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All <span className="tab-badge">{tickets.length}</span>
          </button>
          <button
            type="button"
            className={`status-tab ${statusFilter === 'open' ? 'active' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            Open <span className="tab-badge badge-open">{openCount}</span>
          </button>
          <button
            type="button"
            className={`status-tab ${statusFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            In Progress <span className="tab-badge badge-progress">{inProgressCount}</span>
          </button>
          <button
            type="button"
            className={`status-tab ${statusFilter === 'resolved' ? 'active' : ''}`}
            onClick={() => setStatusFilter('resolved')}
          >
            Resolved <span className="tab-badge badge-resolved">{resolvedCount}</span>
          </button>
        </div>

        <div className="admin-support-actions">
          <div className="support-search-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search store, subject, requester..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadTickets}
            disabled={isLoading}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Two Column Layout: Master Inbox (Left) + Detail/Workflow (Right) */}
      <div className="admin-support-layout">
        {/* Left Column: Tickets Inbox */}
        <div className="card admin-inbox-card">
          <div className="card-header" style={{ padding: '0.75rem 1rem' }}>
            <span className="card-title" style={{ fontSize: '0.9rem' }}>
              <Inbox size={16} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
              Tickets Inbox ({filteredTickets.length})
            </span>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                Loading tickets...
              </div>
            ) : filteredTickets.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                <Inbox size={36} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                <p style={{ fontWeight: 600, margin: 0 }}>No tickets match your filters</p>
              </div>
            ) : (
              <div className="admin-ticket-list">
                {filteredTickets.map((t) => {
                  const isSelected = selectedTicketId === t.id;
                  const StatusIcon = STATUS_META[t.status]?.icon || Clock;
                  return (
                    <div
                      key={t.id}
                      className={`admin-ticket-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectTicket(t)}
                    >
                      <div className="ticket-item-top">
                        <div className="store-pill">
                          <Building2 size={12} />
                          <span className="store-pill-name">{t.storeName || 'Store'}</span>
                          {t.storeBranch && <span className="store-pill-branch">({t.storeBranch})</span>}
                        </div>
                        <span className={`priority-badge ${PRIORITY_BADGES[t.priority] || ''}`}>
                          {t.priority}
                        </span>
                      </div>

                      <div className="ticket-item-subject-line">{t.subject}</div>

                      {t.lastMessage && (
                        <div className="ticket-item-last-msg">{t.lastMessage}</div>
                      )}

                      <div className="ticket-item-footer">
                        <span className={`ticket-status-pill ${STATUS_META[t.status]?.class || ''}`}>
                          <StatusIcon size={11} />
                          {STATUS_META[t.status]?.label || t.status}
                        </span>
                        <span className="ticket-category-chip-sm">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                        <span className="ticket-date-sm">
                          {new Date(t.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Conversation & Workflow */}
        <div className="card admin-detail-card">
          {selectedTicketId && ticketDetail ? (
            <>
              {/* Header with Store Details & Workflow Status Dropdown */}
              <div className="card-header admin-detail-header">
                <div className="detail-header-left">
                  <div className="detail-subject-line">
                    <span className="detail-ticket-id">#{ticketDetail.ticket.id.slice(0, 8)}</span>
                    <h2 className="detail-subject">{ticketDetail.ticket.subject}</h2>
                  </div>
                  <div className="detail-store-meta">
                    <span className="store-name-strong">
                      <Building2 size={13} />
                      {ticketDetail.ticket.storeName}
                      {ticketDetail.ticket.storeBranch ? ` - ${ticketDetail.ticket.storeBranch}` : ''}
                    </span>
                    {ticketDetail.ticket.storePhone && (
                      <>
                        <span className="dot-sep">•</span>
                        <span>
                          <Phone size={12} /> {ticketDetail.ticket.storePhone}
                        </span>
                      </>
                    )}
                    {ticketDetail.ticket.storeLocation && (
                      <>
                        <span className="dot-sep">•</span>
                        <span>
                          <MapPin size={12} /> {ticketDetail.ticket.storeLocation}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Workflow status selector */}
                <div className="detail-workflow-controls">
                  <div className="workflow-select-wrap">
                    <label className="workflow-label">Workflow Status</label>
                    <select
                      className={`status-select ${STATUS_META[ticketDetail.ticket.status]?.class || ''}`}
                      value={ticketDetail.ticket.status}
                      onChange={(e) => handleUpdateStatus(e.target.value as SupportTicketStatus)}
                      disabled={isUpdatingStatus}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Body: Requester info chip, stream, and reply box */}
              <div className="card-body admin-detail-body">
                <div className="requester-bar">
                  <div className="requester-chip">
                    <User size={13} />
                    <span>
                      Requested by <strong>{ticketDetail.ticket.createdByName || 'User'}</strong>
                    </span>
                  </div>
                  <div className="requester-right">
                    <span className="category-tag-sm">
                      {CATEGORY_LABELS[ticketDetail.ticket.category] || ticketDetail.ticket.category}
                    </span>
                    <span className={`priority-badge ${PRIORITY_BADGES[ticketDetail.ticket.priority] || ''}`}>
                      {ticketDetail.ticket.priority} priority
                    </span>
                    <span className="opened-time">
                      Opened {new Date(ticketDetail.ticket.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Chat message stream */}
                <div className="conversation-stream admin-stream">
                  {ticketDetail.messages.map((m) => {
                    const isSuperadmin = m.senderRole === 'superadmin';
                    return (
                      <div
                        key={m.id}
                        className={`chat-message ${isSuperadmin ? 'agent superadmin' : 'customer'}`}
                      >
                        <div className="chat-avatar">
                          {isSuperadmin ? <LifeBuoy size={16} /> : (m.senderName || 'S')[0].toUpperCase()}
                        </div>
                        <div className="chat-bubble">
                          <div className="chat-bubble-header">
                            <span className="sender-name">
                              {isSuperadmin ? `${m.senderName || 'Super Admin'} (Support)` : `${m.senderName || 'Store'} (${m.senderRole})`}
                            </span>
                            <span className="message-time">
                              {new Date(m.createdAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="chat-text">{m.message}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply composer */}
                <form onSubmit={handleSendReply} className="thread-reply-form admin-reply-box">
                  <textarea
                    className="reply-textarea"
                    placeholder="Write a response to the store... (Replying to an open ticket moves it to In Progress)"
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={isSendingReply}
                  />
                  <div className="reply-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="reply-hint">
                      The store user will see your response in their Business Settings → Support tab.
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSendingReply || !replyText.trim()}
                    >
                      <Send size={15} />
                      {isSendingReply ? 'Sending...' : 'Send Response'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="admin-detail-empty">
              <LifeBuoy size={48} style={{ opacity: 0.35, marginBottom: '0.75rem' }} />
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: 'var(--gray-700)' }}>
                Select a ticket to view conversation
              </h3>
              <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--gray-500)' }}>
                Choose a support request from the inbox on the left to see store details, update workflow status, and reply.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportTickets;
