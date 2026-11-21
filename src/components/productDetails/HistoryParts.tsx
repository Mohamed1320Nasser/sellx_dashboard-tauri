import React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, Inbox } from 'lucide-react';
import { formatNumber } from '../../utils';
import { CARD as card, RANGE_PRESETS, type HistoryRange } from './historyRange';
import { shopToday } from '../reports/reportDates';


/** The days filter at the top of a tab, with the tab's Excel button */
export const RangeBar: React.FC<{
  value: HistoryRange;
  onChange: (r: HistoryRange) => void;
  onExport?: () => void;
  exporting?: boolean;
  children?: React.ReactNode;
}> = ({ value, onChange, onExport, exporting, children }) => {
  const today = shopToday();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="الفترة" className="inline-flex flex-wrap overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
        {RANGE_PRESETS.map((p, i) => {
          const selected = value.preset === p.id;
          return (
            <button
              key={String(p.id)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                onChange(p.id === 'custom' ? { preset: 'custom', from: value.preset === 'custom' ? value.from : '', to: value.preset === 'custom' ? value.to : today } : ({ preset: p.id } as HistoryRange))
              }
              className={`px-3 py-1.5 font-medium transition-colors ${i > 0 ? 'border-r border-gray-200' : ''} ${
                selected ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {value.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
          <label className="flex items-center gap-1.5">
            من
            <input
              type="date"
              value={value.from}
              max={value.to || today}
              onChange={e => onChange({ ...value, from: e.target.value })}
              className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex items-center gap-1.5">
            إلى
            <input
              type="date"
              value={value.to}
              min={value.from || undefined}
              max={today}
              onChange={e => onChange({ ...value, to: e.target.value })}
              className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>
      )}
      {children}
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> {exporting ? 'جارٍ التصدير…' : 'Excel'}
        </button>
      )}
    </div>
  );
};

/** One number at the top of a tab */
export const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }> = ({
  label,
  value,
  sub,
  tone = 'default',
}) => (
  <div className={`${card} min-w-0 p-4`}>
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p
      className={`mt-1 truncate text-lg font-bold ${
        tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'
      }`}
    >
      {value}
    </p>
    {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
  </div>
);

/** Previous / next under a table */
export const Pager: React.FC<{ page: number; limit: number; total: number; onPage: (p: number) => void }> = ({ page, limit, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
      <span>
        {formatNumber(from)}–{formatNumber(to)} من {formatNumber(total)}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="الصفحة السابقة"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="px-2">
          {formatNumber(page)} / {formatNumber(pages)}
        </span>
        <button
          type="button"
          aria-label="الصفحة التالية"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-gray-500">
    <Inbox className="h-8 w-8 text-gray-300" />
    {text}
  </div>
);

export const LoadError: React.FC = () => (
  <div className={`${card} flex items-center gap-2 p-5 text-sm text-red-700`}>
    <AlertCircle className="h-5 w-5" /> تعذر تحميل البيانات. حاول مرة أخرى.
  </div>
);

export const Loading: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
    <div className="h-72 animate-pulse rounded-2xl bg-gray-100" />
  </div>
);

/** Table header cell */
export const Th: React.FC<{ children?: React.ReactNode; end?: boolean }> = ({ children, end }) => (
  <th className={`whitespace-nowrap px-4 py-3 text-xs font-semibold text-gray-500 ${end ? 'text-left' : 'text-right'}`}>{children}</th>
);
