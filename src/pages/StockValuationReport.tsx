import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Printer, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../components/layout';
import { HeaderAction } from '../components/common/HeaderAction';
import { formatCurrency, formatNumber } from '../utils';
import { formatQty } from '../utils/quantity';
import { exportReportToExcel } from '../utils/reportExport';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { printA4Document } from '../services/printService';
import { loadA4Info } from '../components/reports/a4Report';
import { stockValuationA4Html } from '../components/reports/reportsA4Html';
import { reportService, type StockValuation } from '../services/reportService';
import { dayLabel } from '../components/reports/reportDates';
import { CARD } from '../components/productDetails/historyRange';
import { Empty, LoadError, Loading, Pager, Th, Tile } from '../components/productDetails/HistoryParts';

const PAGE = 50;
const pct = (v: number | null | undefined) => (v == null ? '—' : `⁦${v.toFixed(1)}%⁩`);

/** What the goods on the shelf are worth, at cost and at selling price */
const StockValuationReport: React.FC = () => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id || 0;
  const companyName = (company as any)?.company?.name || (company as any)?.name;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [onlyNoCost, setOnlyNoCost] = useState(false);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery<StockValuation>({
    queryKey: ['report', 'stock-valuation', companyId],
    queryFn: () => reportService.stockValuation(companyId),
    enabled: !!companyId,
  });

  const shown = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter(
      r => (!category || (r.category?.id || 'none') === category) && (!onlyNoCost || r.noCost) && (!q || r.name.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q))
    );
  }, [data, search, category, onlyNoCost]);
  const pageRows = shown.slice((page - 1) * PAGE, page * PAGE);
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const filterLabel =
    [category && `الفئة: ${data?.categories.find(c => c.id === category)?.name ?? ''}`, onlyNoCost && 'بدون سعر تكلفة فقط', search.trim() && `بحث: ${search.trim()}`].filter(Boolean).join(' · ') || null;
  const [printing, setPrinting] = useState(false);
  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const info = await loadA4Info(companyName);
      await printA4Document(fontCss => stockValuationA4Html(data, shown, filterLabel, info, fontCss));
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
          { header: 'الباركود', accessor: r => r.sku },
          { header: 'الفئة', accessor: r => r.category?.name || 'بدون فئة' },
          { header: 'الكمية', accessor: r => r.stock },
          { header: 'التكلفة', accessor: r => r.cost, format: 'currency' },
          { header: 'القيمة بالتكلفة', accessor: r => r.costValue, format: 'currency' },
          { header: 'سعر البيع', accessor: r => r.price, format: 'currency' },
          { header: 'القيمة بسعر البيع', accessor: r => r.saleValue, format: 'currency' },
          { header: 'الربح المتوقع', accessor: r => r.profit, format: 'currency' },
        ],
        {
          title: 'قيمة المخزون',
          companyName,
          subtitle: `حتى ${dayLabel(data.asOf)}`,
          summary: [
            { label: 'القيمة بالتكلفة', value: formatCurrency(data.totals.costValue), emphasis: true },
            { label: 'القيمة بسعر البيع', value: formatCurrency(data.totals.saleValue) },
            { label: 'الربح المتوقع', value: formatCurrency(data.totals.profit) },
          ],
          fileName: 'قيمة-المخزون',
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
            <h1 className="text-2xl font-bold text-gray-900">قيمة المخزون</h1>
            <p className="mt-1 text-sm text-gray-600">قيمة البضاعة الموجودة الآن بسعر التكلفة وبسعر البيع، والربح المتوقع منها.</p>
          </div>
          <HeaderAction icon={Printer} label="طباعة" onClick={handlePrint} busy={printing} disabled={!shown.length} />
            <HeaderAction icon={Download} label="Excel" onClick={handleExport} busy={exporting} disabled={!shown.length} />
        </div>

        {error ? (
          <LoadError />
        ) : isLoading || !data ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="القيمة بسعر التكلفة" value={formatCurrency(data.totals.costValue)} sub={`حتى ${dayLabel(data.asOf)}`} />
              <Tile label="القيمة بسعر البيع" value={formatCurrency(data.totals.saleValue)} sub="لو بيع كله بالسعر الحالي" />
              <Tile label="الربح المتوقع" value={formatCurrency(data.totals.profit)} tone={data.totals.profit < 0 ? 'bad' : 'good'} sub={`هامش ${pct(data.totals.margin)}`} />
              <Tile label="أصناف في المخزون" value={formatNumber(data.totals.products)} sub={`${formatNumber(data.totals.outOfStock)} صنف نفد`} />
            </div>

            {(data.totals.noCost > 0 || data.negative.length > 0) && (
              <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {data.totals.noCost > 0 && (
                  <p className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    {formatNumber(data.totals.noCost)} صنف بدون سعر تكلفة، فقيمتها بالتكلفة صفر والربح المتوقع أعلى من الحقيقي.
                    <button type="button" onClick={() => filter(() => setOnlyNoCost(true))} className="font-medium underline hover:no-underline">
                      اعرضها
                    </button>
                  </p>
                )}
                {data.negative.length > 0 && (
                  <p className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    مخزون بالسالب (لم يُحسب في القيمة، راجعه بجرد):
                    {data.negative.map(n => (
                      <Link key={n.id} to={`/products/${n.id}?tab=movements`} className="font-medium underline hover:no-underline">
                        {n.name} ({formatQty(n.stock, n.unit)})
                      </Link>
                    ))}
                  </p>
                )}
              </div>
            )}

            {/* Per category: how the money is spread */}
            <section className={`${CARD} p-5`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">حسب الفئة</h2>
                <span className="text-xs text-gray-400">اضغط فئة لعرض أصنافها</span>
              </div>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                {data.categories.map(c => {
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => filter(() => setCategory(active ? null : c.id))}
                      className={`rounded-lg p-2 text-right transition-colors ${active ? 'bg-primary-50 ring-1 ring-primary-300' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-gray-900">
                          {c.name} <span className="text-xs font-normal text-gray-400">{formatNumber(c.products)} صنف</span>
                        </span>
                        <span className="whitespace-nowrap font-semibold text-gray-900">{formatCurrency(c.costValue)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(1, c.share)}%` }} />
                        </div>
                        <span className="w-12 text-left text-xs text-gray-500">{pct(c.share)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Every product */}
            <section className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
                <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => filter(() => setSearch(e.target.value))}
                    placeholder="ابحث بالاسم أو الباركود"
                    className="h-9 w-full rounded-lg border border-gray-200 pl-3 pr-9 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300"
                  />
                </div>
                {category && (
                  <button type="button" onClick={() => filter(() => setCategory(null))} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-50 px-3 text-xs font-medium text-primary-700 hover:bg-primary-100">
                    {data.categories.find(c => c.id === category)?.name} <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {onlyNoCost && (
                  <button type="button" onClick={() => filter(() => setOnlyNoCost(false))} className="inline-flex h-8 items-center gap-1 rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100">
                    بدون سعر تكلفة <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="mr-auto text-xs text-gray-400">الأعلى قيمة أولاً</span>
              </div>
              {pageRows.length === 0 ? (
                <Empty text={data.rows.length ? 'لا توجد نتائج مطابقة' : 'لا توجد بضاعة في المخزون'} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th>المنتج</Th>
                        <Th>الكمية</Th>
                        <Th>التكلفة</Th>
                        <Th end>القيمة بالتكلفة</Th>
                        <Th end>القيمة بسعر البيع</Th>
                        <Th end>الربح المتوقع</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pageRows.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50/60">
                          <td className="max-w-[16rem] px-4 py-3">
                            <Link to={`/products/${r.id}`} className="block truncate font-medium text-gray-900 hover:text-primary-700 hover:underline">
                              {r.name}
                            </Link>
                            <span className="text-xs text-gray-400">{r.category?.name || 'بدون فئة'}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatQty(r.stock, r.unit || 'قطعة')}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {r.noCost ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">بدون تكلفة</span> : formatCurrency(r.cost)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-900">{formatCurrency(r.costValue)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-left text-gray-700">{formatCurrency(r.saleValue)}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-left ${r.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(r.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {(category || search || onlyNoCost) && (
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td className="px-4 py-3" colSpan={3}>
                            إجمالي {formatNumber(shown.length)} صنف
                          </td>
                          <td className="px-4 py-3 text-left">{formatCurrency(shown.reduce((s, r) => s + r.costValue, 0))}</td>
                          <td className="px-4 py-3 text-left">{formatCurrency(shown.reduce((s, r) => s + r.saleValue, 0))}</td>
                          <td className="px-4 py-3 text-left">{formatCurrency(shown.reduce((s, r) => s + r.profit, 0))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
              <Pager page={page} limit={PAGE} total={shown.length} onPage={setPage} />
            </section>
            <p className="text-xs text-gray-400">التكلفة = متوسط سعر الشراء الحالي لكل صنف. سعر البيع = سعر القائمة الأساسية.</p>
          </>
        )}
      </div>
    </Layout>
  );
};

export default StockValuationReport;
