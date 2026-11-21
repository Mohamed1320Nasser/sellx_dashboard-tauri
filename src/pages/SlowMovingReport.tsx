import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Printer, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../components/layout';
import { HeaderAction } from '../components/common/HeaderAction';
import { formatCurrency, formatNumber } from '../utils';
import { formatQty } from '../utils/quantity';
import { exportReportToExcel } from '../utils/reportExport';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { printA4Document } from '../services/printService';
import { loadA4Info } from '../components/reports/a4Report';
import { slowMovingA4Html } from '../components/reports/reportsA4Html';
import { reportService, type SlowBucket, type SlowMoving } from '../services/reportService';
import { dayLabel } from '../components/reports/reportDates';
import { CARD, shopDate } from '../components/productDetails/historyRange';
import { Empty, LoadError, Loading, Pager, Th, Tile } from '../components/productDetails/HistoryParts';

const PAGE = 50;
const PERIODS = [30, 60, 90, 180];
const BUCKETS: { key: SlowBucket; label: string; min: number; dot: string }[] = [
  { key: 'd30_60', label: '30 – 60 يوم', min: 30, dot: 'bg-amber-400' },
  { key: 'd60_90', label: '60 – 90 يوم', min: 60, dot: 'bg-orange-500' },
  { key: 'd90_180', label: '90 – 180 يوم', min: 90, dot: 'bg-red-500' },
  { key: 'd180plus', label: 'أكثر من 180 يوم', min: 180, dot: 'bg-red-700' },
];
const bucketOf = (d: number): SlowBucket => (d >= 180 ? 'd180plus' : d >= 90 ? 'd90_180' : d >= 60 ? 'd60_90' : 'd30_60');

/** Goods on the shelf that have not sold for a while, and the money sitting in them */
const SlowMovingReport: React.FC = () => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id || 0;
  const companyName = (company as any)?.company?.name || (company as any)?.name;
  const [days, setDays] = useState(30);
  const [bucket, setBucket] = useState<SlowBucket | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error, isFetching } = useQuery<SlowMoving>({
    queryKey: ['report', 'slow-moving', companyId, days],
    queryFn: () => reportService.slowMoving(companyId, days),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
  });

  const shown = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter(r => (!bucket || bucketOf(r.idleDays) === bucket) && (!q || r.name.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q)));
  }, [data, bucket, search]);
  const pageRows = shown.slice((page - 1) * PAGE, page * PAGE);
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const buckets = BUCKETS.filter(b => b.min >= days || bucketOf(days) === b.key);

  const filterLabel = [bucket && `بلا بيع ${BUCKETS.find(b => b.key === bucket)?.label}`, search.trim() && `بحث: ${search.trim()}`].filter(Boolean).join(' · ') || null;
  const [printing, setPrinting] = useState(false);
  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const info = await loadA4Info(companyName);
      await printA4Document(fontCss => slowMovingA4Html(data, shown, filterLabel, info, fontCss));
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
        shown,
        [
          { header: 'المنتج', accessor: r => r.name },
          { header: 'الفئة', accessor: r => r.category?.name || 'بدون فئة' },
          { header: 'الكمية', accessor: r => r.stock },
          { header: 'القيمة بالتكلفة', accessor: r => r.costValue, format: 'currency' },
          { header: 'آخر بيع', accessor: r => (r.lastSaleAt ? shopDate(r.lastSaleAt) : 'لم يُبع') },
          { header: 'أيام بلا بيع', accessor: r => r.idleDays },
          { header: 'آخر شراء', accessor: r => (r.lastPurchaseAt ? shopDate(r.lastPurchaseAt) : '') },
        ],
        {
          title: 'الأصناف الراكدة',
          companyName,
          subtitle: `لم تُبع منذ ${days} يوم أو أكثر · حتى ${dayLabel(data.asOf)}`,
          summary: [
            { label: 'عدد الأصناف', value: formatNumber(shown.length) },
            { label: 'القيمة المحبوسة', value: formatCurrency(shown.reduce((s, r) => s + r.costValue, 0)), emphasis: true },
          ],
          fileName: 'الأصناف-الراكدة',
        }
      );
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
            <h1 className="text-2xl font-bold text-gray-900">الأصناف الراكدة</h1>
            <p className="mt-1 text-sm text-gray-600">أصناف موجودة في المخزون ولم تُبع منذ مدة، والفلوس المحبوسة فيها بسعر التكلفة.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="لم تُبع منذ" className="flex h-9 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm font-medium">
              {PERIODS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={days === d}
                  onClick={() =>
                    reset(() => {
                      setDays(d);
                      setBucket(null);
                    })
                  }
                  className={`px-3 ${i > 0 ? 'border-r border-gray-200' : ''} ${days === d ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {d} يوم
                </button>
              ))}
            </div>
            <HeaderAction icon={Printer} label="طباعة" onClick={handlePrint} busy={printing} disabled={!shown.length} />
            <HeaderAction icon={Download} label="Excel" onClick={handleExport} busy={exporting} disabled={!shown.length} />
          </div>
        </div>

        {error ? (
          <LoadError />
        ) : isLoading || !data ? (
          <Loading />
        ) : (
          <div className={`space-y-5 ${isFetching ? 'opacity-70' : ''}`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="القيمة المحبوسة" value={formatCurrency(data.totals.costValue)} tone={data.totals.costValue > 0 ? 'warn' : 'default'} sub="بسعر التكلفة" />
              <Tile label="من قيمة المخزون كله" value={`⁦${data.totals.share.toFixed(1)}%⁩`} sub={`من ${formatCurrency(data.totals.stockValue)}`} />
              <Tile label="أصناف راكدة" value={formatNumber(data.totals.products)} sub={`لم تُبع منذ ${days} يوم أو أكثر`} />
              <Tile label="لم تُبع أبداً" value={formatNumber(data.totals.neverSold)} sub="منذ إضافتها أو آخر شراء" />
            </div>

            <div className={`grid grid-cols-2 gap-2 ${buckets.length >= 4 ? 'lg:grid-cols-4' : buckets.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
              {buckets.map(b => {
                const v = data.buckets[b.key];
                const active = bucket === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    disabled={!v.count}
                    onClick={() => reset(() => setBucket(active ? null : b.key))}
                    className={`${CARD} p-3 text-right transition disabled:cursor-default disabled:opacity-50 ${active ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300' : 'hover:border-gray-300'}`}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className={`h-2 w-2 rounded-full ${b.dot}`} /> بلا بيع {b.label}
                    </span>
                    <span className="mt-1 block text-base font-bold text-gray-900">{formatCurrency(v.costValue)}</span>
                    <span className="text-xs text-gray-400">{formatNumber(v.count)} صنف</span>
                  </button>
                );
              })}
            </div>

            <section className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
                <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => reset(() => setSearch(e.target.value))}
                    placeholder="ابحث بالاسم أو الباركود"
                    className="h-9 w-full rounded-lg border border-gray-200 pl-3 pr-9 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300"
                  />
                </div>
                {bucket && (
                  <button type="button" onClick={() => reset(() => setBucket(null))} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-50 px-3 text-xs font-medium text-primary-700 hover:bg-primary-100">
                    {BUCKETS.find(b => b.key === bucket)?.label} <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="mr-auto text-xs text-gray-400">الأعلى قيمة أولاً · الاسم يفتح سجل المنتج</span>
              </div>
              {pageRows.length === 0 ? (
                <Empty text={data.rows.length ? 'لا توجد نتائج مطابقة' : `كل الأصناف بيعت خلال آخر ${days} يوم`} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th>المنتج</Th>
                        <Th>الكمية</Th>
                        <Th end>القيمة بالتكلفة</Th>
                        <Th>آخر بيع</Th>
                        <Th>بلا بيع</Th>
                        <Th>آخر شراء</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pageRows.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50/60">
                          <td className="max-w-[16rem] px-4 py-3">
                            <Link to={`/products/${r.id}?tab=sales`} className="block truncate font-medium text-gray-900 hover:text-primary-700 hover:underline">
                              {r.name}
                            </Link>
                            <span className="text-xs text-gray-400">{r.category?.name || 'بدون فئة'}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatQty(r.stock, r.unit || 'قطعة')}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-900">{formatCurrency(r.costValue)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                            {r.lastSaleAt ? shopDate(r.lastSaleAt) : <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">لم يُبع أبداً</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                r.idleDays >= 180 ? 'bg-red-100 text-red-700' : r.idleDays >= 90 ? 'bg-red-50 text-red-600' : r.idleDays >= 60 ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {formatNumber(r.idleDays)} يوم
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-500">{r.lastPurchaseAt ? shopDate(r.lastPurchaseAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager page={page} limit={PAGE} total={shown.length} onPage={setPage} />
            </section>
            <p className="text-xs text-gray-400">الصنف الذي لم يُبع أبداً تُحسب مدته من آخر شراء له، أو من تاريخ إضافته إن لم يُشترَ.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SlowMovingReport;
