import React, { useState, useEffect } from 'react';
import {
  Send,
  Mail,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  RefreshCw,
  Plus,
  MessageSquare,
  ArrowLeft,
  LifeBuoy,
  LucideIcon,
} from 'lucide-react';
import { api } from '../services/api';
import notify from '../utils/toast';
import type { SupportTicket, SupportMessage, SupportTicketStatus } from '../types';

interface StoreSupportProps {
  storeId: string;
}

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

export const StoreSupport: React.FC<StoreSupportProps> = ({ storeId }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<{ ticket: SupportTicket; messages: SupportMessage[] } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // New ticket form
  const [showNewForm, setShowNewForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSupportTickets(storeId);
      setTickets(res.tickets || []);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load support requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (storeId) {
      loadTickets();
      setActiveTicketId(null);
      setTicketDetail(null);
    }
  }, [storeId]);

  const openTicketDetail = async (id: string) => {
    setActiveTicketId(id);
    setIsLoadingDetail(true);
    try {
      const data = await api.getSupportTicket(id);
      setTicketDetail(data);
    } catch (err: any) {
      notify.error(err.message || 'Failed to load ticket conversation');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      notify.warning('Please fill in both subject and message');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.createSupportTicket({
        storeId,
        subject: subject.trim(),
        category,
        priority,
        message: message.trim(),
      });
      notify.success('Support request submitted');
      setSubject('');
      setMessage('');
      setCategory('general');
      setPriority('medium');
      setShowNewForm(false);
      await loadTickets();
      if (res?.ticket?.id) {
        openTicketDetail(res.ticket.id);
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicketId || !replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const res = await api.replySupportTicket(activeTicketId, replyText.trim());
      setReplyText('');
      setTicketDetail((prev) =>
        prev
          ? {
              ticket: res.ticket || prev.ticket,
              messages: [...prev.messages, res.message],
            }
          : prev
      );
      notify.success('Reply sent');
      loadTickets();
    } catch (err: any) {
      notify.error(err.message || 'Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="store-support-container">
      {/* Left Column: Form & Tickets List / Thread */}
      <div className="support-left-col">
        {activeTicketId && ticketDetail ? (
          <div className="card ticket-thread-card">
            <div className="card-header ticket-thread-header">
              <button
                type="button"
                className="btn btn-sm btn-outline back-btn"
                onClick={() => {
                  setActiveTicketId(null);
                  setTicketDetail(null);
                }}
              >
                <ArrowLeft size={14} /> Back to requests
              </button>
              <div className="ticket-header-meta">
                <span className={`ticket-status-pill ${STATUS_META[ticketDetail.ticket.status]?.class || ''}`}>
                  {STATUS_META[ticketDetail.ticket.status]?.label || ticketDetail.ticket.status}
                </span>
                <span className="ticket-id-chip">#{ticketDetail.ticket.id.slice(0, 8)}</span>
              </div>
            </div>

            <div className="card-body ticket-thread-body">
              <div className="ticket-title-block">
                <h3 className="ticket-thread-subject">{ticketDetail.ticket.subject}</h3>
                <div className="ticket-submeta">
                  <span className="category-tag">{CATEGORY_LABELS[ticketDetail.ticket.category] || ticketDetail.ticket.category}</span>
                  <span className="dot-sep">•</span>
                  <span>Priority: <strong>{ticketDetail.ticket.priority}</strong></span>
                  <span className="dot-sep">•</span>
                  <span>Created {new Date(ticketDetail.ticket.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="conversation-stream">
                {ticketDetail.messages.map((m) => {
                  const isAgent = m.senderRole === 'superadmin';
                  return (
                    <div key={m.id} className={`chat-message ${isAgent ? 'agent' : 'customer'}`}>
                      <div className="chat-avatar">
                        {isAgent ? <LifeBuoy size={16} /> : (m.senderName || 'U')[0].toUpperCase()}
                      </div>
                      <div className="chat-bubble">
                        <div className="chat-bubble-header">
                          <span className="sender-name">
                            {isAgent ? 'Support Team' : m.senderName || 'You'}
                          </span>
                          <span className="message-time">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="chat-text">{m.message}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ticketDetail.ticket.status === 'closed' ? (
                <div className="ticket-closed-notice">
                  <CheckCircle2 size={16} /> This ticket is closed. Sending a reply will reopen it.
                </div>
              ) : null}

              <form onSubmit={handleSendReply} className="thread-reply-form">
                <textarea
                  className="reply-textarea"
                  placeholder="Type your reply here..."
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={isSendingReply}
                />
                <div className="reply-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSendingReply || !replyText.trim()}
                  >
                    <Send size={15} />
                    {isSendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <>
            {/* Create new request panel */}
            <div className="card new-request-card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title">
                  <LifeBuoy size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle', color: 'var(--primary)' }} />
                  Submit a Support Request
                </span>
                {!showNewForm && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setShowNewForm(true)}
                  >
                    <Plus size={14} /> New Request
                  </button>
                )}
              </div>

              {showNewForm ? (
                <form onSubmit={handleCreateTicket}>
                  <div className="card-body">
                    <div className="form-row">
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Category</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          disabled={isSubmitting}
                        >
                          <option value="general">General inquiry</option>
                          <option value="bug">Issue / Bug</option>
                          <option value="billing">Billing & Payments</option>
                          <option value="feature">Feature request</option>
                          <option value="account">Account & Access</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Priority</label>
                        <select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value)}
                          disabled={isSubmitting}
                        >
                          <option value="low">Low - General query</option>
                          <option value="medium">Medium - Normal issue</option>
                          <option value="high">High - Urgent / business blocker</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label>Subject *</label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Brief summary of the issue (e.g. Printer not printing KOT tickets)"
                        required
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label>Description / Message *</label>
                      <textarea
                        rows={4}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Please describe what happened, steps to reproduce, or what you need help with..."
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-200)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowNewForm(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmitting}
                    >
                      <Send size={15} />
                      {isSubmitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="card-body" style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                  Have an issue or need assistance? Submit a ticket and our support team will reply directly.
                </div>
              )}
            </div>

            {/* My Support Requests list */}
            <div className="card my-requests-card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title">
                  <MessageSquare size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle', color: 'var(--primary)' }} />
                  My Support Requests ({tickets.length})
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={loadTickets}
                  disabled={isLoading}
                >
                  <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh
                </button>
              </div>

              <div className="card-body" style={{ padding: 0 }}>
                {isLoading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                    Loading requests...
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="empty-requests-state">
                    <LifeBuoy size={42} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                    <p style={{ fontWeight: 600, margin: 0 }}>No support requests yet</p>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      When you submit a request, you can track and continue the conversation here.
                    </span>
                  </div>
                ) : (
                  <div className="ticket-list">
                    {tickets.map((t) => {
                      const StatusIcon = STATUS_META[t.status]?.icon || Clock;
                      return (
                        <div
                          key={t.id}
                          className="ticket-list-item"
                          onClick={() => openTicketDetail(t.id)}
                        >
                          <div className="ticket-item-main">
                            <div className="ticket-item-header">
                              <span className={`ticket-status-pill ${STATUS_META[t.status]?.class || ''}`}>
                                <StatusIcon size={12} />
                                {STATUS_META[t.status]?.label || t.status}
                              </span>
                              <span className="ticket-category-chip">
                                {CATEGORY_LABELS[t.category] || t.category}
                              </span>
                              <span className="ticket-item-time">
                                {new Date(t.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="ticket-item-subject">{t.subject}</div>
                            {t.lastMessage && (
                              <div className="ticket-item-snippet">{t.lastMessage}</div>
                            )}
                          </div>
                          <div className="ticket-item-arrow">
                            <span className="ticket-msg-count">
                              <MessageSquare size={12} /> {t.messageCount}
                            </span>
                            <ChevronRight size={18} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Column: Direct Contact Row Cards */}
      <div className="support-right-col">
        <div className="support-channels-heading">Direct Contact</div>

        {/* Email Support Card */}
        <a
          href="mailto:support@runerail.com"
          className="contact-channel-card email-card"
        >
          <div className="channel-icon-tile email-tile">
            <Mail size={22} />
          </div>
          <div className="channel-info">
            <span className="channel-label">Email Support</span>
            <span className="channel-value">support@runerail.com</span>
            <span className="channel-desc">Send us an email anytime; we usually respond within a few hours.</span>
          </div>
          <ChevronRight size={18} className="channel-chevron" />
        </a>

        {/* WhatsApp Support Card */}
        <a
          href="https://wa.me/918129490227"
          target="_blank"
          rel="noopener noreferrer"
          className="contact-channel-card whatsapp-card"
        >
          <div className="channel-icon-tile whatsapp-tile">
            <MessageCircle size={22} />
          </div>
          <div className="channel-info">
            <span className="channel-label">WhatsApp Support</span>
            <span className="channel-value">+91 8129490227</span>
            <span className="channel-desc">Chat instantly with our dedicated support executive.</span>
          </div>
          <ChevronRight size={18} className="channel-chevron" />
        </a>

        {/* Support hours card */}
        <div className="support-hours-card">
          <div className="hours-header">
            <Clock size={16} /> Support Availability
          </div>
          <p className="hours-line">Monday – Saturday</p>
          <p className="hours-sub">9:00 AM – 9:00 PM IST</p>
          <div className="hours-footnote">
            Urgent billing / operational blockers are monitored 24/7.
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreSupport;
