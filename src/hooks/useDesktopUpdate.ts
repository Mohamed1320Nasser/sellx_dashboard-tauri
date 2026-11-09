/**
 * Desktop app self-update (Tauri updater plugin).
 *
 * The installed app asks the SellX API for a newer version at launch and every 4 hours.
 * When one exists the banner offers to install it: download → verify the signature →
 * install → relaunch. A mandatory update found at launch blocks the app until installed;
 * one found mid-session shows a banner without "later" so the cashier can finish first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { isTauri } from '../services/tauriBridge';

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'error';

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string;
  mandatory: boolean;
}

export interface DesktopUpdateState {
  update: AvailableUpdate | null;
  visible: boolean;
  blocking: boolean;
  phase: UpdatePhase;
  /** 0-100 while the size is known */
  percent: number | null;
  error: string | null;
  install(): Promise<void>;
  postpone(): void;
}

/** Only packaged desktop builds update themselves; dev and web builds never check. */
const UPDATER_ENABLED = isTauri && import.meta.env.PROD;

function toAvailable(update: Update): AvailableUpdate {
  const raw = (update.rawJson ?? {}) as { mandatory?: unknown };
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? '',
    mandatory: raw.mandatory === true,
  };
}

export function useDesktopUpdate(): DesktopUpdateState {
  const handle = useRef<Update | null>(null);
  const firstCheckDone = useRef(false);
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [blockingAtLaunch, setBlockingAtLaunch] = useState(false);
  const [postponed, setPostponed] = useState<string | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const runCheck = useCallback(async () => {
    if (!UPDATER_ENABLED || busy.current) return;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const found = await check();
      const previous = handle.current;
      handle.current = found;
      if (previous && previous !== found) previous.close().catch(() => undefined);
      const available = found ? toAvailable(found) : null;
      setUpdate(available);
      if (!firstCheckDone.current) {
        firstCheckDone.current = true;
        setBlockingAtLaunch(!!available?.mandatory);
      }
    } catch (e) {
      // Offline or server unreachable: try again at the next interval.
      console.warn('[updater] check failed', e);
    }
  }, []);

  useEffect(() => {
    if (!UPDATER_ENABLED) return;
    runCheck();
    const timer = window.setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [runCheck]);

  const install = useCallback(async () => {
    const current = handle.current;
    if (!current || busy.current) return;
    busy.current = true;
    setPhase('downloading');
    setPercent(null);
    setError(null);
    try {
      let total = 0;
      let downloaded = 0;
      await current.downloadAndInstall(event => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setPercent(Math.min(100, Math.round((downloaded / total) * 100)));
        } else if (event.event === 'Finished') {
          setPhase('installing');
        }
      });
      // Windows closes the app when the installer starts; macOS needs a relaunch.
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setPhase('error');
      const message = e instanceof Error ? e.message : String(e ?? '');
      setError(message ? `تعذّر تثبيت التحديث: ${message}` : 'تعذّر تثبيت التحديث');
    } finally {
      busy.current = false;
    }
  }, []);

  const postpone = useCallback(() => {
    if (update && !update.mandatory) setPostponed(update.version);
  }, [update]);

  return {
    update,
    visible: !!update && (update.mandatory || postponed !== update.version),
    blocking: !!update && update.mandatory && blockingAtLaunch,
    phase,
    percent,
    error,
    install,
    postpone,
  };
}
