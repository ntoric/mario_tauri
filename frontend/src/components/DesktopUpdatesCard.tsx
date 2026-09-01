import React, { useEffect, useState, useCallback } from 'react';
import {
  Download, Loader2, RefreshCw, CheckCircle2, Smartphone, Monitor,
  ArrowUpCircle, ExternalLink, Tag, Calendar,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import {
  checkDesktopForUpdates,
  downloadAndInstallDesktopUpdate,
  getDesktopAppVersion,
  hasDesktopUpdater,
  isTauriShell,
  subscribeDesktopUpdateProgress,
  type DesktopUpdateCheckResult,
  type DesktopUpdateProgress,
} from '../lib/desktopBridge';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './ui/Button';
import { api } from '../services/api';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

interface AppRelease {
  id: string;
  platform: string;
  enabled: boolean;
  version: string;
  downloadUrl: string;
  releaseNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const DesktopUpdatesCard: React.FC = () => {
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const toast = useToast();
  const isDesktop = isTauriShell();
  const hasUpdater = hasDesktopUpdater();

  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<DesktopUpdateProgress | null>(null);
  const [nativeResult, setNativeResult] = useState<DesktopUpdateCheckResult | null>(null);

  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(true);

  // Load app version from Tauri if available
  useEffect(() => {
    if (!hasUpdater) return;
    void getDesktopAppVersion().then((v) => {
      if (v) setVersion(v);
    });
  }, [hasUpdater]);

  // Subscribe to native update progress
  useEffect(() => {
    if (!hasUpdater) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void subscribeDesktopUpdateProgress((next) => {
      if (!cancelled) setProgress(next);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [hasUpdater]);

  // Fetch releases from backend
  const loadReleases = useCallback(async () => {
    setIsLoadingReleases(true);
    try {
      const data = await api.getAllAppUpdates();
      const list: AppRelease[] = (data.updates || []).map((u: any) => ({
        id: u.id,
        platform: u.platform,
        enabled: u.enabled,
        version: u.version,
        downloadUrl: u.downloadUrl,
        releaseNotes: u.releaseNotes,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));
      // Sort by updatedAt desc (latest first), then by createdAt desc
      list.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setReleases(list);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load app updates');
    } finally {
      setIsLoadingReleases(false);
    }
  }, [toast]);

  useEffect(() => {
    loadReleases();
  }, [loadReleases]);

  const onCheck = async () => {
    if (!hasUpdater) {
      toast.info('Native updater is only available in the desktop app.');
      return;
    }
    setChecking(true);
    setNativeResult(null);
    try {
      const next = await checkDesktopForUpdates();
      if (!next) {
        toast.error('Updater is not available in this build.');
        return;
      }
      setNativeResult(next);
      if (next.currentVersion) setVersion(next.currentVersion);
      if (next.available) {
        toast.success(`New version ${next.version} is available!`);
      } else {
        toast.info('You are on the latest version.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const onInstall = async () => {
    if (!nativeResult?.available) return;
    const confirmed = await confirm({
      title: `Install Mario ${nativeResult.version || ''}?`,
      message: 'Download and install this update? The app will restart when finished.',
      confirmLabel: 'Install',
    });
    if (!confirmed) return;
    setInstalling(true);
    setProgress({ status: 'downloading', downloaded: 0, contentLength: null, percent: null });
    try {
      await downloadAndInstallDesktopUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to install update');
      setInstalling(false);
      setProgress(null);
    }
  };

  const percent =
    progress?.percent != null && Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(100, progress.percent))
      : null;
  const progressLabel =
    progress?.status === 'installing'
      ? 'Installing update...'
      : percent != null
        ? `Downloading update... ${Math.round(percent)}%`
        : 'Downloading update...';
  const sizeLabel =
    progress && progress.status === 'downloading'
      ? progress.contentLength
        ? `${formatBytes(progress.downloaded)} of ${formatBytes(progress.contentLength)}`
        : progress.downloaded > 0
          ? formatBytes(progress.downloaded)
          : null
      : null;

  // Determine the latest release
  const latestRelease = releases.length > 0 ? releases[0] : null;
  const updateAvailable = nativeResult?.available === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Current Version & Check for Updates Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowUpCircle size={20} style={{ color: 'var(--primary)' }} />
            <span className="card-title">App Updates</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onCheck} disabled={checking || installing || !hasUpdater}>
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check for updates
          </Button>
        </div>
        <div className="card-body">
          {/* Current version info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            background: 'var(--gray-50)',
            borderRadius: '8px',
            border: '1px solid var(--gray-200)',
            marginBottom: '1rem',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: 'var(--primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {isDesktop ? <Monitor size={24} /> : <Smartphone size={24} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                {isDesktop ? 'Desktop App' : 'Web App'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--dark)' }}>
                {version || (latestRelease?.version ?? '—')}
              </div>
              {latestRelease && (
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  Latest available: v{latestRelease.version}
                </div>
              )}
            </div>
            {updateAvailable && (
              <div style={{
                padding: '0.35rem 0.75rem',
                background: 'var(--success)',
                color: 'white',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}>
                <ArrowUpCircle size={14} />
                Update available
              </div>
            )}
          </div>

          {/* Native updater: update available banner */}
          {updateAvailable && !installing && (
            <div style={{
              padding: '1rem',
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
                <strong>New version {nativeResult.version} is available!</strong>
              </div>
              {nativeResult.notes && (
                <p style={{
                  margin: '0 0 0.75rem',
                  fontSize: '0.85rem',
                  color: 'var(--gray-600)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {nativeResult.notes}
                </p>
              )}
              <Button variant="primary" size="sm" onClick={onInstall} disabled={installing || checking}>
                {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Install {nativeResult.version}
              </Button>
            </div>
          )}

          {/* Install progress */}
          {installing && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                fontSize: '0.875rem',
                marginBottom: '0.5rem',
              }}>
                <span>{progressLabel}</span>
                {sizeLabel && (
                  <span style={{ color: 'var(--gray-500)', fontVariantNumeric: 'tabular-nums' }}>
                    {sizeLabel}
                  </span>
                )}
              </div>
              <div style={{
                height: '8px',
                width: '100%',
                overflow: 'hidden',
                borderRadius: '9999px',
                background: 'var(--gray-200)',
              }}>
                {percent != null ? (
                  <div style={{
                    height: '100%',
                    borderRadius: '9999px',
                    background: 'var(--primary)',
                    transition: 'width 0.2s ease-out',
                    width: `${percent}%`,
                  }} />
                ) : (
                  <div style={{
                    height: '100%',
                    width: '33%',
                    borderRadius: '9999px',
                    background: 'var(--primary)',
                    opacity: 0.7,
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                )}
              </div>
              {progress?.status === 'installing' && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  The app will restart when installation finishes.
                </p>
              )}
            </div>
          )}

          {/* Up to date message */}
          {nativeResult && !nativeResult.available && !installing && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--gray-600)',
              padding: '0.75rem',
              background: 'var(--gray-50)',
              borderRadius: '6px',
            }}>
              <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
              You are on the latest version.
            </div>
          )}

          {/* Not in desktop app notice */}
          {!hasUpdater && (
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--gray-500)',
              padding: '0.75rem',
              background: 'var(--gray-50)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <Smartphone size={14} />
              Native update checking is only available in the desktop app. Below are the configured releases.
            </div>
          )}
        </div>
      </div>

      {/* Releases List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Release History</span>
        </div>
        <div className="card-body">
          {isLoadingReleases ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto', color: 'var(--gray-400)' }} />
            </div>
          ) : releases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)', fontSize: '0.875rem' }}>
              No releases have been configured yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {releases.map((release, idx) => {
                const isLatest = idx === 0;
                const platformIcon = release.platform === 'desktop' ? <Monitor size={16} /> : <Smartphone size={16} />;
                return (
                  <div
                    key={release.id}
                    style={{
                      padding: '1rem',
                      borderRadius: '8px',
                      border: `1px solid ${isLatest ? 'var(--primary)' : 'var(--gray-200)'}`,
                      background: isLatest ? 'rgba(59, 130, 246, 0.03)' : 'var(--gray-50)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: isLatest ? 'var(--primary)' : 'var(--gray-300)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {platformIcon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--dark)' }}>
                            v{release.version}
                          </span>
                          {isLatest && (
                            <span style={{
                              padding: '0.15rem 0.5rem',
                              background: 'var(--primary)',
                              color: 'white',
                              borderRadius: '9999px',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}>
                              Latest
                            </span>
                          )}
                          {!release.enabled && (
                            <span style={{
                              padding: '0.15rem 0.5rem',
                              background: 'var(--gray-300)',
                              color: 'var(--gray-700)',
                              borderRadius: '9999px',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                            }}>
                              Disabled
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', textTransform: 'capitalize' }}>
                            {platformIcon}
                            {release.platform}
                          </span>
                          {release.updatedAt && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Calendar size={12} />
                              {formatDate(release.updatedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      {release.downloadUrl && (
                        <a
                          href={release.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.4rem 0.75rem',
                            background: 'white',
                            border: '1px solid var(--gray-300)',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: 'var(--dark)',
                            textDecoration: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <ExternalLink size={14} />
                          Download
                        </a>
                      )}
                    </div>
                    {release.releaseNotes && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.75rem',
                        background: 'white',
                        borderRadius: '6px',
                        border: '1px solid var(--gray-200)',
                        fontSize: '0.825rem',
                        color: 'var(--gray-700)',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                      }}>
                        {release.releaseNotes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default DesktopUpdatesCard;
