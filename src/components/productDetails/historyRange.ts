import { dayLabel, shiftDay, shopToday } from '../reports/reportDates';

/** The days a history tab shows: the last N shop days, everything, or chosen days */
export type HistoryRange =
  | { preset: 30 | 90 | 365 }
  | { preset: 'all' }
  | { preset: 'custom'; from: string; to: string };

export const DEFAULT_RANGE: HistoryRange = { preset: 90 };

export const RANGE_PRESETS: { id: 30 | 90 | 365 | 'all' | 'custom'; label: string }[] = [
  { id: 30, label: '30 يوم' },
  { id: 90, label: '90 يوم' },
  { id: 365, label: 'سنة' },
  { id: 'all', label: 'الكل' },
  { id: 'custom', label: 'فترة محددة' },
];

export function rangeQuery(r: HistoryRange): { startDate?: string; endDate?: string } {
  if (r.preset === 'all') return {};
  if (r.preset === 'custom') return { startDate: r.from || undefined, endDate: r.to || undefined };
  const today = shopToday();
  return { startDate: shiftDay(today, -(r.preset - 1)), endDate: today };
}

export function rangeLabel(r: HistoryRange): string {
  if (r.preset === 'all') return 'كل الفترات';
  if (r.preset === 'custom') {
    if (r.from && r.to) return `من ${dayLabel(r.from)} إلى ${dayLabel(r.to)}`;
    if (r.from) return `من ${dayLabel(r.from)}`;
    if (r.to) return `حتى ${dayLabel(r.to)}`;
    return 'كل الفترات';
  }
  return `آخر ${r.preset === 365 ? 'سنة' : `${r.preset} يوم`}`;
}

/** "2026-11-21T10:00:00Z" -> "21/11/2026 12:00 م" in the shop's time zone */
export const shopDateTime = (iso: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export const shopDate = (iso: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

export const CARD = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

export const PAGE_SIZE = 25;
/** the Excel export takes the whole window */
export const EXPORT_LIMIT = 5000;
