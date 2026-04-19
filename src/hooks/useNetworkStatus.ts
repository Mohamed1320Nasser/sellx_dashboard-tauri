import { useState, useEffect, useCallback } from 'react';
import { isTauri, networkAPI } from '../services/tauriBridge';

interface NetworkStatus {
  isOnline: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
}

/**
 * Hook to monitor network connectivity status
 * Works in Tauri (via Rust commands), Electron (via IPC), and browser (via navigator.onLine)
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    isChecking: false,
    lastChecked: null,
  });

  const isDesktop = isTauri || (typeof window !== 'undefined' && window.isElectron);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    setStatus((prev) => ({ ...prev, isChecking: true }));

    try {
      if (isTauri) {
        const result = await networkAPI.checkNow();
        const online = result?.data?.isOnline ?? true;
        setStatus({ isOnline: online, isChecking: false, lastChecked: new Date() });
        return online;
      } else if (window.networkAPI?.checkNow) {
        const result = await window.networkAPI.checkNow();
        setStatus({ isOnline: result.online, isChecking: false, lastChecked: new Date() });
        return result.online;
      } else {
        if (!navigator.onLine) {
          setStatus({ isOnline: false, isChecking: false, lastChecked: new Date() });
          return false;
        }
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          await fetch('https://www.google.com', { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
          clearTimeout(timeoutId);
          setStatus({ isOnline: true, isChecking: false, lastChecked: new Date() });
          return true;
        } catch {
          setStatus({ isOnline: false, isChecking: false, lastChecked: new Date() });
          return false;
        }
      }
    } catch (error) {
      console.error('[useNetworkStatus] Check failed:', error);
      setStatus((prev) => ({ ...prev, isChecking: false, lastChecked: new Date() }));
      return false;
    }
  }, []);

  useEffect(() => {
    // Initial check
    if (isTauri) {
      networkAPI.getStatus().then((result) => {
        setStatus({
          isOnline: result?.data?.isOnline ?? true,
          isChecking: false,
          lastChecked: new Date(),
        });
      });
    } else if (window.networkAPI?.getStatus) {
      window.networkAPI.getStatus().then((result) => {
        setStatus({ isOnline: result.online, isChecking: false, lastChecked: new Date() });
      });
    } else {
      setStatus({ isOnline: navigator.onLine, isChecking: false, lastChecked: new Date() });
    }

    // Setup listeners
    if (isTauri) {
      const cleanup = networkAPI.onStatusChange((online) => {
        setStatus({ isOnline: online, isChecking: false, lastChecked: new Date() });
      });
      return cleanup;
    } else if (window.networkAPI?.onStatusChange) {
      const cleanup = window.networkAPI.onStatusChange((data) => {
        setStatus({ isOnline: data.online, isChecking: false, lastChecked: new Date() });
      });
      return cleanup;
    } else {
      const handleOnline = () => setStatus({ isOnline: true, isChecking: false, lastChecked: new Date() });
      const handleOffline = () => setStatus({ isOnline: false, isChecking: false, lastChecked: new Date() });
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  return { ...status, checkConnection };
}

export default useNetworkStatus;
