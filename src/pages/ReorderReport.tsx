import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Award, Download, Phone, Printer, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../components/layout';
import { HeaderAction } from '../components/common/HeaderAction';
import { formatCurrency, formatNumber } from '../utils';
import { formatQty } from '../utils/quantity';
import { exportReportToExcel } from '../utils/reportExport';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { reportService, type Reorder, type ReorderItem } from '../services/reportService';
import { printA4Document } from '../services/printService';
import { reorderA4Html } from '../components/reports/reorderA4Html';
import { loadA4Info } from '../components/reports/a4Report';
import { dayLabel } from '../components/reports/reportDates';
import { CARD } from '../components/productDetails/historyRange';
import { Empty, LoadError, Loading, Th, Tile } from '../components/productDetails/HistoryParts';

const COVER = [14, 30, 60];
const URGENCY: Record<ReorderItem['urgency'], { label: string; cls: string }> = {
  out: { label: 'نفد', cls: 'bg-red-100 text-red-700' },
  urgent: { label: 'عاجل', cls: 'bg-amber-100 text-amber-800' },
  soon: { label: 'قريباً', cls: 'bg-gray-100 text-gray-600' },
};

/** What to buy, how much, and from whom: one list per supplier */
const ReorderReport: React.FC = () => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id || 0;
  const companyName = (company as any)?.company?.name || (company as any)?.name;
  const [cover, setCover] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error, isFetching } = useQuery<Reorder>({
    queryKey: ['report', 'reorder', companyId, cover],
    queryFn: () => reportService.reorder(companyId, cover),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
  });

  const print = async (groups: Reorder['groups'], key: string) => {
    if (!data) return;
    setBusy(key);
    try {
      const info = await loadA4Info(companyName);
      await printA4Document(fontCss => reorderA4Html(data, groups, info, fontCss));
    } catch {
      toast.error('تعذرت الطباعة');
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    if (!data) return;
    setBusy('excel');
    try {
      const rows = data.groups.flatMap(g => g.items.map(it => ({ ...it, supplierName: g.supplier?.name || 'بدون مورد سابق' })));
      await exportReportToExcel(
        rows,
        [
          { header: 'المورد', accessor: r => r.supplierName },
          { header: 'الصنف', accessor: r => r.name },
          { header: 'الحالة', accessor: r => URGENCY[r.urgency].label },
          { header: 'المتاح', accessor: r => r.stock },
          { header: 'حد التنبيه', accessor: r => r.minStock || '' },
          { header: 'مبيعات 30 يوم', accessor: r => r.sold30 },
          { header: 'يكفي (يوم)', accessor: r => r.daysLeft ?? '' },
          { header: 'الكمية المطلوبة', accessor: r => r.suggested },
          { header: 'بالعبوة', accessor: r => (r.inPacks ? `${r.inPacks.count} ${r.inPacks.name}` : '') },
          { header: 'آخر سعر شراء', accessor: r => r.lastCost ?? '', format: 'currency' },
          { header: 'التكلفة التقريبية', accessor: r => r.estimatedCost, format: 'currency' },
          { header: 'مورد أرخص', accessor: r => (r.cheaper ? `${r.cheaper.name} (${r.cheaper.avgCost})` : '') },
        ],
        {
          title: 'تقرير إعادة الطلب',
          companyName,
          subtitle: `يكفي ${cover} يوم · ${dayLabel(data.asOf)}`,
          summary: [
            { label: 'عدد الأصناف', value: formatNumber(data.totals.products) },
            { label: 'التكلفة التقريبية', value: formatCurrency(data.totals.estimatedCost), emphasis: true },
          ],
          fileName: 'إعادة-الطلب',
        }
      );
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout>
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">تقرير إعادة الطلب</h1>
            <p className="mt-1 text-sm text-gray-600">الأصناف التي نفدت أو تحت حد التنبيه أو لن تكفي المدة المختارة، بالكمية المقترحة ومن أي مورد.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">اطلب ما يكفي</span>
            <div role="radiogroup" aria-label="اطلب ما يكفي" className="flex h-9 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm font-medium">
              {COVER.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={cover === d}
                  onClick={() => setCover(d)}
                  className={`px-3 ${i > 0 ? 'border-r border-gray-200' : ''} ${cover === d ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {d} يوم
                </button>
              ))}
            </div>
            <HeaderAction icon={Printer} label="طباعة الكل" onClick={() => data && print(data.groups, 'all')} busy={busy === 'all'} disabled={!data?.groups.length} />
            <HeaderAction icon={Download} label="Excel" onClick={handleExport} busy={busy === 'excel'} disabled={!data?.groups.length} />
          </div>
        </div>

        {error ? (
          <LoadError />
        ) : isLoading || !data ? (
          <Loading />
        ) : (
          <div className={`space-y-5 ${isFetching ? 'opacity-70' : ''}`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="أصناف تحتاج طلب" value={formatNumber(data.totals.products)} sub={`${formatNumber(data.totals.suppliers)} مورد`} />
              <Tile label="نفدت" value={formatNumber(data.totals.out)} tone={data.totals.out ? 'bad' : 'default'} sub="المخزون صفر" />
              <Tile label="عاجل" value={formatNumber(data.totals.urgent)} tone={data.totals.urgent ? 'warn' : 'default'} sub="تحت حد التنبيه أو تكفي أسبوعاً أو أقل" />
              <Tile label="التكلفة التقريبية" value={formatCurrency(data.totals.estimatedCost)} sub="بآخر سعر شراء" />
            </div>

            {data.groups.length === 0 ? (
              <section className={CARD}>
                <Empty text={`لا يوجد صنف يحتاج طلب: كل الأصناف تكفي ${cover} يوم وفوق حد التنبيه.`} />
              </section>
            ) : (
              data.groups.map(g => {
                const key = g.supplier ? String(g.supplier.id) : 'none';
                return (
                  <section key={key} className={`${CARD} overflow-hidden`}>
                    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-5 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Truck className="h-4 w-4 text-primary-600" />
                        {g.supplier ? (
                          <Link to={`/suppliers/${g.supplier.id}/statement`} className="truncate font-semibold text-gray-900 hover:text-primary-700 hover:underline">
                            {g.supplier.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-gray-900">لم تُشترَ من قبل</span>
                        )}
                        {g.supplier?.phone && (
                          <a href={`tel:${g.supplier.phone}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-700" dir="ltr">
                            <Phone className="h-3 w-3" /> {g.supplier.phone}
                          </a>
                        )}
                      </div>
                      <span className="text-sm text-gray-600">
                        {formatNumber(g.items.length)} صنف · <span className="font-semibold text-gray-900">{formatCurrency(g.total)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => print([g], key)}
                        disabled={busy === key}
                        className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <Printer className="h-3.5 w-3.5" /> {busy === key ? 'جارٍ…' : 'طباعة القائمة'}
                      </button>
                    </header>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[52rem] text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <Th>الصنف</Th>
                            <Th>المتاح</Th>
                            <Th>مبيعات 30 يوم</Th>
                            <Th>يكفي</Th>
                            <Th>المطلوب</Th>
                            <Th>آخر سعر</Th>
                            <Th end>التكلفة</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {g.items.map(it => {
                            const u = URGENCY[it.urgency];
                            return (
                              <tr key={it.id} className="hover:bg-gray-50/60">
                                <td className="max-w-[16rem] px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <Link to={`/products/${it.id}?tab=purchases`} className="truncate font-medium text-gray-900 hover:text-primary-700 hover:underline">
                                      {it.name}
                                    </Link>
                                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.cls}`}>{u.label}</span>
                                  </div>
                                  {it.cheaper && (
                                    <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-700">
                                      <Award className="h-3 w-3" /> أرخص عند {it.cheaper.name}: {formatCurrency(it.cheaper.avgCost)}
                                    </div>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3">
                                  <span className={it.stock <= 0 ? 'font-semibold text-red-600' : 'text-gray-900'}>{formatQty(it.stock, it.unit || 'قطعة')}</span>
                                  {it.minStock > 0 && <div className="text-xs text-gray-400">الحد {formatQty(it.minStock)}</div>}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{it.sold30 > 0 ? formatQty(it.sold30) : '—'}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                                  {it.daysLeft === null ? '—' : it.stock <= 0 ? <span className="text-red-600">نفد</span> : `${formatNumber(it.daysLeft)} يوم`}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3">
                                  <span className="text-base font-bold text-primary-700">{formatQty(it.suggested, it.unit || 'قطعة')}</span>
                                  {it.inPacks && (
                                    <div className="text-xs text-gray-500">
                                      = {formatNumber(it.inPacks.count)} {it.inPacks.name}
                                    </div>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{it.lastCost != null ? formatCurrency(it.lastCost) : <span className="text-gray-400">{formatCurrency(it.cost)}</span>}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-900">{formatCurrency(it.estimatedCost)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })
            )}
            <p className="text-xs text-gray-400">
              الكمية المطلوبة تكفي مبيعات آخر 30 يوم لمدة {cover} يوم، ولا تقل عن حد التنبيه. الصنف يظهر هنا إذا نفد، أو وصل لحد التنبيه، أو لن يكفي {cover} يوم.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ReorderReport;
