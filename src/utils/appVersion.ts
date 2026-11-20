import changelog from '../changelog.json';

/** One released version and what it changed (newest first in changelog.json) */
export interface VersionEntry {
  version: string;
  /** yyyy-MM-dd; null until the version is released */
  date: string | null;
  items: string[];
}

/** The version this build is (package.json, set at build time) */
export const APP_VERSION: string = import.meta.env.APP_VERSION || '0.0.0';

export const CHANGELOG: VersionEntry[] = changelog as VersionEntry[];

export const entryOf = (version: string) => CHANGELOG.find(e => e.version === version) || null;

const SEEN_KEY = 'sellx.seenVersion';

/** The version whose "what's new" this device already saw (per device, best effort) */
export function seenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markVersionSeen(version = APP_VERSION) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* private window or blocked storage: the bar shows again next time, nothing breaks */
  }
}
