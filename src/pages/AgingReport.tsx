import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, FileText, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../components/layout';
import { HeaderAction } from '../components/common/HeaderAction';
import { formatCurrency, formatNumber } from '../utils';
import { formatTableDate } from '../utils/dateUtils';
import { exportReportToExcel, type ReportColumn } from '../utils/reportExport';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { reportService, type AgingBucket, type AgingBuckets, type PayablesAging, type ReceivablesAging } from '../services/reportService';
import { dayLabel } from '../components/reports/reportDates';

type Kind = 'customers' | 'suppliers';

/** one row for both kinds */
interface Row {
  id: number;
  name: string;
  phone: string | null;
  total: number;
  buckets: AgingBuckets;
  documents: number;
  oldestDays: number | null;
  /** customers: last money received; suppliers: the next bill falling due */
  dateNote: string | null;
  overLimit?: boolean;
  creditLimit?: number | null;
  overdue?: number;
  /** the "invoices without a customer" line */
  walkIn?: boolean;
}

const BUCKETS: Record<Kind, { key: AgingBucket; label: string; bar: string; dot: string }[]> = {
  customers: [
    { key: 'd0_30', label: 'حتى 30 يوم', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
    { key: 'd31_60', label: '31 – 60 يوم', bar: 'bg-amber-400', dot: 'bg-amber-400' },
    { key: 'd61_90', label: '61 – 90 يوم', bar: 'bg-orange-500', dot: 'bg-orange-500' },
    { key: 'd90plus', label: 'أكثر من 90 يوم', bar: 'bg-red-600', dot: 'bg-red-600' },
  ],
  suppliers: [
    { key: 'notDue', label: 'لم يستحق بعد', bar: 'bg-sky-400', dot: 'bg-sky-400' },
    { key: 'd0_30', label: 'متأخر حتى 30 يوم', bar: 'bg-amber-400', dot: 'bg-amber-400' },
    { key: 'd31_60', label: 'متأخر 31 – 60', bar: 'bg-orange-400', dot: 'bg-orange-400' },
    { key: 'd61_90', label: 'متأخر 61 – 90', bar: 'bg-orange-600', dot: 'bg-orange-600' },
    { key: 'd90plus', label: 'متأخر أكثر من 90', bar: 'bg-red-600', dot: 'bg-red-600' },
  ],
};

const TEXT: Record<Kind, { title: string; sub: string; party: string; docs: string; date: string; empty: string; credit: string; statement: (id: number) => string }> = {
  customers: {
    title: 'أعمار ديون العملاء',
    sub: 'ما على كل عميل، مقسماً حسب عمر الفاتورة. أي رصيد دائن للعميل يُخصم من أقدم دين.',
    party: 'العميل',
    docs: 'فاتورة مفتوحة',
    date: 'آخر دفعة',
    empty: 'لا توجد ديون على العملاء',
    credit: 'عملاء لهم رصيد عندنا',
    statement: id => `/clients/${id}/statement`,
  },
  suppliers: {
    title: 'أعمار مستحقات الموردين',
    sub: 'ما علينا لكل مورد، حسب تاريخ الاستحقاق (أو تاريخ الشراء إن لم يُحدد).',
    party: 'المورد',
    docs: 'فاتورة مفتوحة',
    date: 'الاستحقاق القادم',
    empty: 'لا توجد مستحقات للموردين',
    credit: 'موردون لنا رصيد عندهم',
    statement: id => `/suppliers/${id}/statement`,
  },
};

const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

/** Receivables / payables aging: who owes what, and how old it is */
const AgingReport: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const companyName = (company as any)?.name || company?.company?.name || '';
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<AgingBucket | null>(null);
  const [exporting, setExporting] = useState(false);
  const t = TEXT[kind];
  const cols = BUCKETS[kind];

  const { data, isLoading, error } = useQuery<ReceivablesAging | PayablesAging>({
    queryKey: ['report', kind === 'customers' ? 'receivables-aging' : 'payables-aging', companyId],
    queryFn: (): Promise<ReceivablesAging | PayablesAging> => (kind === 'customers' ? reportService.receivablesAging(companyId) : reportService.payablesAging(companyId)),
    enabled: !!companyId,
  });

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    if (kind === 'customers' && 'customers' in data)
      return data.customers.map((c): Row => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        total: c.total,
        buckets: c.buckets,
        documents: c.openInvoices,
        oldestDays: c.oldestDays,
        dateNote: c.lastPaymentAt,
        overLimit: c.overLimit,
        creditLimit: c.creditLimit,
      })).concat(
        data.withoutCustomer
          ? [{ id: 0, name: 'فواتير بدون عميل', phone: null, total: data.withoutCustomer.total, buckets: data.withoutCustomer.buckets, documents: data.withoutCustomer.openInvoices, oldestDays: data.withoutCustomer.oldestDays, dateNote: null, walkIn: true } as Row]
          : []
      );
    if ('suppliers' in data)
      return data.suppliers.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        total: s.total,
        buckets: s.buckets,
        documents: s.openBills,
        oldestDays: s.oldestDays,
        dateNote: s.nextDueAt,
        overdue: s.overdue,
      }));
    return [];
  }, [data, kind]);

  const shown = rows.filter(r => {
    if (bucket && r.buckets[bucket] <= 0.005) return false;
    const q = search.trim();
    return !q || r.name.includes(q) || (r.phone || '').includes(q);
  });
  const total = data?.total || 0;
  const overdue = data && 'overdue' in data ? data.overdue : null;

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const columns: ReportColumn<Row>[] = [
        { header: t.party, accessor: r => r.name },
        { header: 'الهاتف', accessor: r => r.phone || '' },
        ...cols.map(c => ({ header: c.label, accessor: (r: Row) => r.buckets[c.key], format: 'currency' as const })),
        { header: 'الإجمالي', accessor: r => r.total, format: 'currency' },
        { header: 'أقدم دين (يوم)', accessor: r => r.oldestDays ?? '' },
        { header: t.date, accessor: r => (r.dateNote ? formatTableDate(new Date(r.dateNote)) : '') },
      ];
      await exportReportToExcel(shown, columns, {
        title: t.title,
        companyName,
        subtitle: `حتى ${dayLabel(data.asOf)}`,
        summary: [
          ...cols.map(c => ({ label: c.label, value: formatCurrency(data.buckets[c.key]) })),
          { label: 'الإجمالي', value: formatCurrency(total), emphasis: true },
        ],
        fileName: t.title.replace(/\s+/g, '-'),
      });
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
            <p className="mt-1 text-sm text-gray-600">{t.sub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm font-medium">
              {(['customers', 'suppliers'] as Kind[]).map(k => (
                <Link
                  key={k}
                  to={k === 'customers' ? '/reports/receivables-aging' : '/reports/payables-aging'}
                  className={`flex items-center px-3 ${k === kind ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {k === 'customers' ? 'العملاء' : 'الموردين'}
                </Link>
              ))}
            </div>
            <HeaderAction icon={Download} label="Excel" onClick={handleExport} busy={exporting} disabled={!rows.length} />
          </div>
        </div>

        {error ? (
          <div className={`${card} flex items-center gap-2 p-5 text-sm text-red-700`}>
            <AlertCircle className="h-5 w-5" /> تعذر تحميل التقرير.
          </div>
        ) : isLoading || !data ? (
          <div className="space-y-5">
            <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
            <div className="h-72 animate-pulse rounded-2xl bg-gray-100" />
          </div>
        ) : (
          <>
            {/* Total, how it splits by age; a tile filters the list */}
            <section className={`${card} p-5`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">{kind === 'customers' ? 'إجمالي ما على العملاء' : 'إجمالي ما علينا للموردين'}</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatNumber(rows.filter(r => !r.walkIn).length)} {kind === 'customers' ? 'عميل' : 'مورد'} · حتى {dayLabel(data.asOf)}
                    {overdue != null && overdue > 0 && <span className="font-medium text-red-600"> · متأخر {formatCurrency(overdue)}</span>}
                  </p>
                </div>
              </div>
              {total > 0 && (
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-gray-100" dir="ltr">
                  {[...cols].reverse().map(c =>
                    data.buckets[c.key] > 0 ? <div key={c.key} className={c.bar} style={{ width: `${(data.buckets[c.key] / total) * 100}%` }} title={c.label} /> : null
                  )}
                </div>
              )}
              <div className={`mt-4 grid grid-cols-2 gap-2 ${cols.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                {cols.map(c => {
                  const amount = data.buckets[c.key];
                  const active = bucket === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setBucket(active ? null : c.key)}
                      disabled={amount <= 0}
                      className={`rounded-xl border p-3 text-right transition disabled:cursor-default disabled:opacity-50 ${
                        active ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      title={amount > 0 ? 'اعرض من لهم مبالغ في هذه الفترة فقط' : undefined}
                    >
                      <span className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} /> {c.label}
                      </span>
                      <span className="mt-1 block text-base font-bold text-gray-900">{formatCurrency(amount)}</span>
                      <span className="text-xs text-gray-400">{total > 0 ? `⁦${((amount / total) * 100).toFixed(0)}%⁩` : '—'}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Who */}
            <section className={`${card} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
                <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الهاتف"
                    className="h-9 w-full rounded-lg border border-gray-200 pr-9 pl-3 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300"
                  />
                </div>
                {bucket && (
                  <button type="button" onClick={() => setBucket(null)} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-50 px-3 text-xs font-medium text-primary-700 hover:bg-primary-100">
                    {cols.find(c => c.key === bucket)?.label} <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="mr-auto text-xs text-gray-400">الأعلى {kind === 'customers' ? 'ديناً' : 'تأخراً'} أولاً · الاسم يفتح كشف الحساب</span>
              </div>

              {shown.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-500">{rows.length ? 'لا توجد نتائج مطابقة' : t.empty}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-5 py-2.5 text-right font-medium">{t.party}</th>
                        {cols.map(c => (
                          <th key={c.key} className="px-3 py-2.5 text-left font-medium">
                            {c.label}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left font-medium">الإجمالي</th>
                        <th className="px-5 py-2.5 text-right font-medium">{t.date}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {shown.map(r => (
                        <tr key={r.walkIn ? 'walk-in' : r.id} className={r.walkIn ? 'bg-amber-50/60' : 'hover:bg-gray-50/60'}>
                          <td className="px-5 py-3">
                            {r.walkIn ? (
                              <>
                                <Link to="/sales?paymentStatus=UNPAID" className="inline-flex items-center gap-1.5 font-medium text-amber-800 hover:underline">
                                  <AlertCircle className="h-3.5 w-3.5" /> {r.name}
                                </Link>
                                <div className="mt-0.5 text-xs text-amber-700">
                                  {formatNumber(r.documents)} فاتورة لم تُحصَّل ولا تظهر في كشف أي عميل، راجعها
                                </div>
                              </>
                            ) : (
                            <>
                            <Link to={t.statement(r.id)} className="inline-flex items-center gap-1.5 font-medium text-gray-900 hover:text-primary-700 hover:underline">
                              <FileText className="h-3.5 w-3.5 text-gray-400" /> {r.name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                              {r.phone && <bdi dir="ltr">{r.phone}</bdi>}
                              <span>
                                {formatNumber(r.documents)} {t.docs}
                                {r.oldestDays != null && ` · أقدمها ${formatNumber(r.oldestDays)} يوم`}
                              </span>
                              {r.overLimit && (
                                <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700" title={`حد الائتمان ${formatCurrency(r.creditLimit || 0)}`}>
                                  تجاوز حد الائتمان
                                </span>
                              )}
                            </div>
                            </>
                            )}
                          </td>
                          {cols.map(c => (
                            <td key={c.key} className={`whitespace-nowrap px-3 py-3 text-left ${bucket === c.key ? 'bg-primary-50/50' : ''}`}>
                              {r.buckets[c.key] > 0.005 ? (
                                <span className={c.key === 'd90plus' || c.key === 'd61_90' ? 'font-medium text-red-700' : 'text-gray-800'}>{formatCurrency(r.buckets[c.key])}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                          <td className="whitespace-nowrap px-3 py-3 text-left font-semibold text-gray-900">{formatCurrency(r.total)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-gray-600">{r.dateNote ? formatTableDate(new Date(r.dateNote)) : <span className="text-gray-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    {shown.length > 1 && (
                      <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                        <tr>
                          <td className="px-5 py-3 text-gray-900">الإجمالي ({formatNumber(shown.length)})</td>
                          {cols.map(c => (
                            <td key={c.key} className="whitespace-nowrap px-3 py-3 text-left text-gray-900">
                              {formatCurrency(shown.reduce((s, r) => s + r.buckets[c.key], 0))}
                            </td>
                          ))}
                          <td className="whitespace-nowrap px-3 py-3 text-left text-gray-900">{formatCurrency(shown.reduce((s, r) => s + r.total, 0))}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </section>

            {/* The other side: parties holding a credit */}
            {data.inCredit.count > 0 && (
              <details className={`${card} group`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 text-sm">
                  <span className="font-medium text-gray-900">
                    {t.credit} ({formatNumber(data.inCredit.count)})
                  </span>
                  <span className="text-gray-600">
                    {formatCurrency(data.inCredit.total)} <span className="text-xs text-gray-400 group-open:hidden">· عرض</span>
                  </span>
                </summary>
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {data.inCredit.list.map(p => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <Link to={t.statement(p.id)} className="truncate text-gray-800 hover:text-primary-700 hover:underline">
                        {p.name}
                      </Link>
                      <span className="whitespace-nowrap font-medium text-emerald-700">{formatCurrency(p.credit)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default AgingReport;
