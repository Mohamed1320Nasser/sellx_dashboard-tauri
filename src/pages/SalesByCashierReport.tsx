import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../components/layout';
import { HeaderAction } from '../components/common/HeaderAction';
import { formatCurrency, formatNumber } from '../utils';
import { exportReportToExcel } from '../utils/reportExport';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { printA4Document } from '../services/printService';
import { loadA4Info } from '../components/reports/a4Report';
import { salesByCashierA4Html } from '../components/reports/reportsA4Html';
import { reportService, type SalesByCashier } from '../services/reportService';
import { dayLabel, shiftDay, shopToday } from '../components/reports/reportDates';
import { CARD } from '../components/productDetails/historyRange';
import { Empty, LoadError, Loading, Th, Tile } from '../components/productDetails/HistoryParts';

type Preset = 'today' | 'yesterday' | '7' | 'month' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: 'yesterday', label: 'أمس' },
  { id: '7', label: '7 أيام' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'custom', label: 'فترة' },
];
const rangeOf = (p: Exclude<Preset, 'custom'>): [string, string] => {
  const today = shopToday();
  if (p === 'today') return [today, today];
  if (p === 'yesterday') return [shiftDay(today, -1), shiftDay(today, -1)];
  if (p === '7') return [shiftDay(today, -6), today];
  return [`${today.slice(0, 8)}01`, today];
};
/** a drawer difference in words: short, over or matching */
const drawer = (n: number) => (n < 0 ? `عجز ${formatCurrency(-n)}` : n > 0 ? `زيادة ${formatCurrency(n)}` : 'مطابق');

/** Who sold what: invoices, money, discounts, price deals, returns and drawer differences per cashier */
const SalesByCashierReport: React.FC = () => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id || 0;
  const companyName = (company as any)?.company?.name || (company as any)?.name;
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState<[string, string]>(() => rangeOf('today'));
  const [exporting, setExporting] = useState(false);
  const [from, to] = range;
  const valid = !!from && !!to && from <= to;

  const { data, isLoading, error, isFetching } = useQuery<SalesByCashier>({
    queryKey: ['report', 'sales-by-cashier', companyId, from, to],
    queryFn: () => reportService.salesByCashier(companyId, from, to),
    enabled: !!companyId && valid,
    placeholderData: keepPreviousData,
  });

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(rangeOf(p));
  };
  const shifts = data?.cashiers.reduce((n, c) => n + c.shifts.count, 0) ?? 0;
  const period = from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;

  const [printing, setPrinting] = useState(false);
  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const info = await loadA4Info(companyName);
      await printA4Document(fontCss => salesByCashierA4Html(data, info, fontCss));
    } catch {
      toast.error('تعذرت الطباعة');
    } finally {
      setPrinting(false);
    }
  };

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportReportToExcel(
        data.cashiers,
        [
          { header: 'الكاشير', accessor: r => r.name },
          { header: 'الفواتير', accessor: r => r.invoices },
          { header: 'المبيعات', accessor: r => r.sales, format: 'currency' },
          { header: 'النسبة %', accessor: r => r.share },
          { header: 'المحصل', accessor: r => r.collected, format: 'currency' },
          { header: 'آجل', accessor: r => r.unpaid, format: 'currency' },
          { header: 'متوسط الفاتورة', accessor: r => r.average, format: 'currency' },
          { header: 'الخصومات', accessor: r => r.discounts, format: 'currency' },
          { header: 'تخفيض بالتفاوض', accessor: r => r.negotiated.amount, format: 'currency' },
          { header: 'المرتجعات', accessor: r => r.returns.total, format: 'currency' },
          { header: 'الورديات', accessor: r => r.shifts.count },
          { header: 'فرق الدرج', accessor: r => r.shifts.net, format: 'currency' },
        ],
        {
          title: 'المبيعات حسب الكاشير',
          companyName,
          subtitle: period,
          summary: [
            { label: 'المبيعات', value: formatCurrency(data.totals.sales), emphasis: true },
            { label: 'الفواتير', value: formatNumber(data.totals.invoices) },
            { label: 'فرق الدرج', value: drawer(data.totals.shiftsNet) },
          ],
          fileName: 'المبيعات-حسب-الكاشير',
        }
      );
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    } finally {
      setExporting(false);
    }
  };

  const dateInput = 'h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300';

  return (
    <Layout>
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">المبيعات حسب الكاشير</h1>
            <p className="mt-1 text-sm text-gray-600">مبيعات كل كاشير وفواتيره وخصوماته ومرتجعاته وفروق درج ورديته.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="الفترة" className="flex h-9 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm font-medium">
              {PRESETS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={preset === p.id}
                  onClick={() => choose(p.id)}
                  className={`px-2.5 sm:px-3 ${i > 0 ? 'border-r border-gray-200' : ''} ${preset === p.id ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <HeaderAction icon={Printer} label="طباعة" onClick={handlePrint} busy={printing} disabled={!data?.cashiers.length} />
            <HeaderAction icon={Download} label="Excel" onClick={handleExport} busy={exporting} disabled={!data?.cashiers.length} />
          </div>
        </div>

        {preset === 'custom' && (
          <div className={`${CARD} flex flex-wrap items-center gap-2 px-4 py-3 text-sm`}>
            <label className="flex items-center gap-2 text-gray-600">
              من
              <input type="date" value={from} max={shopToday()} onChange={e => setRange([e.target.value, to])} className={dateInput} />
            </label>
            <label className="flex items-center gap-2 text-gray-600">
              إلى
              <input type="date" value={to} max={shopToday()} onChange={e => setRange([from, e.target.value])} className={dateInput} />
            </label>
            {!valid && <span className="text-xs font-medium text-red-600">تاريخ البداية بعد تاريخ النهاية</span>}
          </div>
        )}

        {error ? (
          <LoadError />
        ) : isLoading || !data ? (
          <Loading />
        ) : (
          <div className={`space-y-5 ${isFetching ? 'opacity-70' : ''}`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="المبيعات" value={formatCurrency(data.totals.sales)} sub={`${formatNumber(data.totals.invoices)} فاتورة · ${period}`} />
              <Tile label="الخصومات" value={formatCurrency(data.totals.discounts)} sub={data.totals.negotiated > 0 ? `+ ${formatCurrency(data.totals.negotiated)} تخفيض بالتفاوض` : 'على الفواتير'} />
              <Tile label="المرتجعات" value={formatCurrency(data.totals.returns)} tone={data.totals.returns > 0 ? 'warn' : 'default'} sub="مرتجعات مكتملة" />
              <Tile
                label="فروق الدرج"
                value={shifts ? drawer(data.totals.shiftsNet) : '—'}
                tone={!shifts ? 'default' : data.totals.shiftsNet < 0 ? 'bad' : data.totals.shiftsNet > 0 ? 'warn' : 'good'}
                sub={shifts ? `${formatNumber(shifts)} وردية مغلقة في الفترة` : 'لم تُغلق ورديات في الفترة'}
              />
            </div>

            <section className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-900">{formatNumber(data.totals.cashiers)} كاشير</h2>
                <span className="text-xs text-gray-400">الأعلى مبيعاً أولاً</span>
              </div>
              {data.cashiers.length === 0 ? (
                <Empty text="لا توجد مبيعات في هذه الفترة" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[60rem] text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th>الكاشير</Th>
                        <Th>الفواتير</Th>
                        <Th>المبيعات</Th>
                        <Th>المحصل / آجل</Th>
                        <Th>متوسط الفاتورة</Th>
                        <Th>الخصومات</Th>
                        <Th>بالتفاوض</Th>
                        <Th>المرتجعات</Th>
                        <Th end>فرق الدرج</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.cashiers.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50/60">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{c.name}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatNumber(c.invoices)}</td>
                          <td className="min-w-[10rem] px-4 py-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="whitespace-nowrap font-semibold text-gray-900">{formatCurrency(c.sales)}</span>
                              <span className="text-xs text-gray-400">⁦{c.share.toFixed(0)}%⁩</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(1, c.share)}%` }} />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="text-gray-900">{formatCurrency(c.collected)}</span>
                            {c.unpaid > 0 && <div className="text-xs text-amber-700">آجل {formatCurrency(c.unpaid)}</div>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatCurrency(c.average)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{c.discounts > 0 ? formatCurrency(c.discounts) : '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {c.negotiated.count > 0 ? (
                              <>
                                <span className="text-amber-700">{formatCurrency(c.negotiated.amount)}</span>
                                <div className="text-xs text-gray-400">{formatNumber(c.negotiated.count)} فاتورة</div>
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {c.returns.count > 0 ? (
                              <>
                                <span className="text-gray-900">{formatCurrency(c.returns.total)}</span>
                                <div className="text-xs text-gray-400">{formatNumber(c.returns.count)} مرتجع</div>
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-left">
                            {c.shifts.count === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <>
                                <span className={`font-semibold ${c.shifts.net < 0 ? 'text-red-600' : c.shifts.net > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                  {drawer(c.shifts.net)}
                                </span>
                                <div className="text-xs text-gray-400">
                                  {formatNumber(c.shifts.count)} وردية{c.shifts.short > 0 ? ` · ${formatNumber(c.shifts.short)} بعجز` : ''}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="text-xs text-gray-400">
              المبيعات تُنسب لمن أنشأ الفاتورة. «بالتفاوض» = الفرق بين سعر القائمة والسعر الذي بيع به. فرق الدرج = الفعلي ناقص المتوقع عند غلق الوردية (السالب عجز).
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SalesByCashierReport;
