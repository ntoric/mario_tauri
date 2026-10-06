import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { api } from './api';

export const UPDATE_PROGRESS_EVENT = 'desktop-update-progress';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

interface DesktopUpdateCheckResult {
  available: boolean;
  currentVersion: string;
  version: string | null;
  notes: string | null;
  date: string | null;
}

type DesktopUpdateProgressStatus = 'downloading' | 'installing';

interface DesktopUpdateProgress {
  status: DesktopUpdateProgressStatus;
  downloaded: number;
  contentLength: number | null;
  percent: number | null;
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
  date?: string;
}

export interface UpdateProgress {
  status: DesktopUpdateProgressStatus;
  total: number;
  downloaded: number;
  percentage: number;
}

class UpdaterService {
  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    if (!isTauri()) {
      return { available: false, currentVersion: 'unknown' };
    }
    try {
      const result = await invoke<DesktopUpdateCheckResult>('check_for_updates');
      return {
        available: result.available,
        currentVersion: result.currentVersion,
        latestVersion: result.version ?? undefined,
        body: result.notes ?? undefined,
        date: result.date ?? undefined,
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      throw new Error(`Failed to check for updates: ${error}`);
    }
  }

  /**
   * Download and install the update, then restart the app.
   * The invoke promise only resolves on failure — on success the app restarts.
   * Download/install progress is delivered via subscribeToProgress().
   */
  async downloadAndInstall(): Promise<void> {
    if (!isTauri()) {
      throw new Error('Updates are only available in the desktop app.');
    }
    try {
      await invoke('download_and_install_update');
    } catch (error) {
      console.error('Failed to install update:', error);
      throw new Error(`Failed to install update: ${error}`);
    }
  }

  /**
   * Subscribe to download/install progress emitted by the Rust updater.
   */
  async subscribeToProgress(onProgress: (progress: UpdateProgress) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return () => {};
    }
    return listen<DesktopUpdateProgress>(UPDATE_PROGRESS_EVENT, (event) => {
      const p = event.payload;
      const total = p.contentLength ?? 0;
      const percentage =
        p.percent != null
          ? Math.min(100, Math.round(p.percent))
          : total > 0
            ? Math.min(100, Math.round((p.downloaded / total) * 100))
            : 0;
      onProgress({
        status: p.status,
        total,
        downloaded: p.downloaded,
        percentage,
      });
    });
  }

  /**
   * Get current app version
   */
  async getCurrentVersion(): Promise<string> {
    if (!isTauri()) {
      return 'unknown';
    }
    try {
      return await invoke<string>('app_version');
    } catch (error) {
      console.error('Failed to get current version:', error);
      return 'unknown';
    }
  }

  /**
   * Report the running desktop app version to the backend (per-store telemetry).
   * Fire-and-forget — silently skipped in the browser.
   */
  async reportAppVersion(storeId?: string): Promise<void> {
    if (!isTauri()) {
      return;
    }
    try {
      const version = await this.getCurrentVersion();
      if (!version || version === 'unknown') return;
      await api.reportAppVersion(version, storeId);
    } catch (error) {
      console.debug('App version report skipped:', error);
    }
  }
}

export const updaterService = new UpdaterService();
