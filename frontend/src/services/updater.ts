import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
  date?: string;
}

export interface UpdateProgress {
  total: number;
  downloaded: number;
  percentage: number;
}

class UpdaterService {
  private update: Update | null = null;
  private isDownloading = false;
  private isInstalling = false;

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    if (!isTauri()) {
      return { available: false, currentVersion: 'unknown' };
    }
    try {
      const update = await check();
      
      if (update) {
        this.update = update;
        return {
          available: true,
          currentVersion: update.version,
          latestVersion: update.version,
          body: update.body,
          date: update.date,
        };
      }

      return {
        available: false,
        currentVersion: await this.getCurrentVersion(),
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      throw new Error(`Failed to check for updates: ${error}`);
    }
  }

  /**
   * Download the update
   */
  async downloadUpdate(onProgress?: (progress: UpdateProgress) => void): Promise<void> {
    if (!this.update) {
      throw new Error('No update available. Call checkForUpdates first.');
    }

    if (this.isDownloading) {
      throw new Error('Update is already downloading.');
    }

    try {
      this.isDownloading = true;
      
      await this.update.downloadAndInstall((event) => {
        if (event.event === 'Progress') {
          const chunkLength = event.data.chunkLength;
          // For progress tracking, we'll use the chunk length as a proxy
          // The actual total/loaded may not be available in the callback
          if (onProgress) {
            onProgress({
              total: 100, // Normalized percentage
              downloaded: chunkLength,
              percentage: Math.min(100, chunkLength),
            });
          }
        }
      });

      this.isDownloading = false;
    } catch (error) {
      this.isDownloading = false;
      console.error('Failed to download update:', error);
      throw new Error(`Failed to download update: ${error}`);
    }
  }

  /**
   * Install the downloaded update and relaunch
   */
  async installAndRelaunch(): Promise<void> {
    if (!this.update) {
      throw new Error('No update available. Call checkForUpdates first.');
    }

    if (this.isInstalling) {
      throw new Error('Update is already installing.');
    }

    try {
      this.isInstalling = true;
      
      // downloadAndInstall already installs, just need to relaunch
      await relaunch();
      
      // This line won't be reached if relaunch is successful
      this.isInstalling = false;
    } catch (error) {
      this.isInstalling = false;
      console.error('Failed to install update:', error);
      throw new Error(`Failed to install update: ${error}`);
    }
  }

  /**
   * Close the updater (cancel current operation)
   */
  async closeUpdater(): Promise<void> {
    try {
      this.update = null;
      this.isDownloading = false;
      this.isInstalling = false;
    } catch (error) {
      console.error('Failed to close updater:', error);
      throw new Error(`Failed to close updater: ${error}`);
    }
  }

  /**
   * Get current app version
   */
  async getCurrentVersion(): Promise<string> {
    if (!isTauri()) {
      return 'unknown';
    }
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch (error) {
      console.error('Failed to get current version:', error);
      return 'unknown';
    }
  }

  /**
   * Check if currently downloading
   */
  getIsDownloading(): boolean {
    return this.isDownloading;
  }

  /**
   * Check if currently installing
   */
  getIsInstalling(): boolean {
    return this.isInstalling;
  }

  /**
   * Get current update manifest if available
   */
  getCurrentUpdate(): Update | null {
    return this.update;
  }
}

export const updaterService = new UpdaterService();
