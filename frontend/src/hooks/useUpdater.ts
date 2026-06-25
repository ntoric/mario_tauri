import { useState, useEffect, useCallback } from 'react';
import { updaterService, UpdateInfo, UpdateProgress } from '../services/updater';

export interface UseUpdaterReturn {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  downloadProgress: UpdateProgress | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installAndRelaunch: () => Promise<void>;
  dismissUpdate: () => void;
}

export const useUpdater = (autoCheck = true, checkInterval = 3600000): UseUpdaterReturn => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const downloadUpdate = useCallback(async () => {
    setIsDownloading(true);
    setError(null);
    setDownloadProgress(null);
    
    try {
      await updaterService.downloadUpdate((progress) => {
        setDownloadProgress(progress);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download update');
      console.error('Update download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const installAndRelaunch = useCallback(async () => {
    setIsInstalling(true);
    setError(null);
    
    try {
      await updaterService.installAndRelaunch();
    } catch (err) {
      setIsInstalling(false);
      setError(err instanceof Error ? err.message : 'Failed to install update');
      console.error('Update installation failed:', err);
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
      checkForUpdates();
    }, checkInterval);

    return () => clearInterval(interval);
  }, [autoCheck, checkInterval, checkForUpdates]);

  return {
    updateInfo,
    isChecking,
    isDownloading,
    isInstalling,
    downloadProgress,
    error,
    checkForUpdates,
    downloadUpdate,
    installAndRelaunch,
    dismissUpdate,
  };
};
