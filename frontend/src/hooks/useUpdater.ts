import { useState, useEffect, useCallback } from 'react';
import { updaterService, UpdateInfo, UpdateProgress } from '../services/updater';
import { isQuietHours } from '../utils/quietHours';

export interface UseUpdaterReturn {
  updateInfo: UpdateInfo | null;
  downgradeInfo: UpdateInfo | null;
  isChecking: boolean;
  isCheckingDowngrade: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  downloadProgress: UpdateProgress | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  checkForDowngrade: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  downgrade: () => Promise<void>;
  dismissUpdate: () => void;
}

export const useUpdater = (autoCheck = true, checkInterval = 3600000): UseUpdaterReturn => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downgradeInfo, setDowngradeInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isCheckingDowngrade, setIsCheckingDowngrade] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Download/install progress arrives as events from the Rust updater.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    updaterService
      .subscribeToProgress((progress) => {
        if (progress.status === 'downloading') {
          setIsDownloading(true);
          setIsInstalling(false);
        } else {
          setIsDownloading(false);
          setIsInstalling(true);
        }
        setDownloadProgress(progress);
      })
      .then((u) => {
        unlisten = u;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      const info = await updaterService.checkForUpdates();
      setUpdateInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
      console.error('Update check failed:', err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkForDowngrade = useCallback(async () => {
    setIsCheckingDowngrade(true);
    try {
      const info = await updaterService.checkForDowngrade();
      setDowngradeInfo(info);
    } catch (err) {
      setDowngradeInfo(null);
      console.error('Downgrade check failed:', err);
    } finally {
      setIsCheckingDowngrade(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setIsDownloading(true);
    setIsInstalling(false);
    setError(null);
    setDownloadProgress(null);

    try {
      await updaterService.downloadAndInstall();
      // Resolves only on failure — on success the app restarts.
      setIsDownloading(false);
      setIsInstalling(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to install update';
      setIsDownloading(false);
      setIsInstalling(false);
      setError(msg);
      console.error('Update install failed:', err);
      throw err;
    }
  }, []);

  const downgrade = useCallback(async () => {
    setIsDownloading(true);
    setIsInstalling(false);
    setError(null);
    setDownloadProgress(null);

    try {
      await updaterService.downloadAndInstallDowngrade();
      // Resolves only on failure — on success the app restarts.
      setIsDownloading(false);
      setIsInstalling(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to install downgrade';
      setIsDownloading(false);
      setIsInstalling(false);
      setError(msg);
      console.error('Downgrade install failed:', err);
      throw err;
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateInfo(null);
    setDownloadProgress(null);
    setError(null);
  }, []);

  // Auto-check for updates on mount
  useEffect(() => {
    if (autoCheck) {
      checkForUpdates();
    }
  }, [autoCheck, checkForUpdates]);

  // Periodic update check
  useEffect(() => {
    if (!autoCheck) return;

    const interval = setInterval(() => {
      if (!isQuietHours()) checkForUpdates();
    }, checkInterval);

    return () => clearInterval(interval);
  }, [autoCheck, checkInterval, checkForUpdates]);

  return {
    updateInfo,
    downgradeInfo,
    isChecking,
    isCheckingDowngrade,
    isDownloading,
    isInstalling,
    downloadProgress,
    error,
    checkForUpdates,
    checkForDowngrade,
    downloadAndInstall,
    downgrade,
    dismissUpdate,
  };
};
