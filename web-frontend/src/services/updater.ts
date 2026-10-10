// Web updater service — a hosted web app is always the latest deployed build,
// so all update operations are no-ops. The interface mirrors the desktop
// (Tauri) updater so shared components work unchanged.

import { api } from './api';

export const UPDATE_PROGRESS_EVENT = 'desktop-update-progress';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
  date?: string;
}

export interface UpdateProgress {
  status: 'downloading' | 'installing';
  total: number;
  downloaded: number;
  percentage: number;
}

const APP_VERSION =
  (import.meta as any).env?.VITE_APP_VERSION || 'unknown';

class UpdaterService {
  /**
   * Check for available updates — always false on web; a deploy updates everyone.
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    return { available: false, currentVersion: APP_VERSION };
  }

  /**
   * Not supported in the browser.
   */
  async downloadAndInstall(): Promise<void> {
    throw new Error('Updates are only available in the desktop app.');
  }

  /**
   * No progress events are emitted on web — returns an unsubscribe no-op.
   */
  async subscribeToProgress(_onProgress: (progress: UpdateProgress) => void): Promise<() => void> {
    return () => {};
  }

  /**
   * Get current app version
   */
  async getCurrentVersion(): Promise<string> {
    return APP_VERSION;
  }

  /**
   * Report the running app version to the backend (per-store telemetry).
   * Reports the web build version.
   */
  async reportAppVersion(storeId?: string): Promise<void> {
    try {
      const version = await this.getCurrentVersion();
      if (!version || version === 'unknown') return;
      await api.reportAppVersion(`web-${version}`, storeId);
    } catch (error) {
      console.debug('App version report skipped:', error);
    }
  }
}

export const updaterService = new UpdaterService();
