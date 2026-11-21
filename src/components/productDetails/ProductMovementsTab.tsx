import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { productHistoryService, type MovementType, type ProductMovements } from '../../services/productHistoryService';
import { formatNumber } from '../../utils';
import { formatQty } from '../../utils/quantity';
import { exportReportToExcel } from '../../utils/reportExport';
import { CARD, EXPORT_LIMIT, PAGE_SIZE, rangeLabel, rangeQuery, shopDateTime, type HistoryRange } from './historyRange';
import { Empty, LoadError, Loading, Pager, RangeBar, Th } from './HistoryParts';

type Props = { productId: string; productName: string; companyId: number; companyName?: string; range: HistoryRange; onRange: (r: HistoryRange) => void };

const TYPES: Record<MovementType, { label: string; cls: string }> = {
  PURCHASE: { label: 'شراء', cls: 'bg-blue-50 text-blue-700' },
  SALE: { label: 'بيع', cls: 'bg-emerald-50 text-emerald-700' },
  RETURN: { label: 'مرتجع', cls: 'bg-violet-50 text-violet-700' },
  ADJUSTMENT: { label: 'تعديل', cls: 'bg-amber-50 text-amber-800' },
  STOCKTAKE: { label: 'جرد', cls: 'bg-gray-100 text-gray-700' },
};
const ORDER: MovementType[] = ['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'STOCKTAKE'];

/** "Sale INV-2026-0018" / "Return: RET-..." / "Purchase A1" -> the document number alone */
const docOf = (ref: string | null) => (ref ? ref.replace(/^(Sale|Purchase|Return):?\s*/i, '') : '');
/** older rows carry an English reason the badge already says */
const reasonOf = (reason: string | null) => (reason && !/^product (sold|purchased)$/i.test(reason.trim()) ? reason : '');

/** Every stock change of the product with the balance after it */
const ProductMovementsTab: React.FC<Props> = ({ productId, productName, companyId, companyName, range, onRange }) => {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<MovementType | ''>('');
  const [exporting, setExporting] = useState(false);
  const q = rangeQuery(range);
  const { data, isLoading, error, isFetching } = useQuery<ProductMovements>({
    queryKey: ['product-history', 'movements', productId, companyId, q, type, page],
    queryFn: () => productHistoryService.movements(productId, companyId, { ...q, type: type || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all = await productHistoryService.movements(productId, companyId, { ...q, type: type || undefined, page: 1, limit: EXPORT_LIMIT });
      await exportReportToExcel(
        all.rows,
        [
          { header: 'التاريخ', accessor: r => shopDateTime(r.at) },
          { header: 'النوع', accessor: r => TYPES[r.type]?.label || r.type },
          { header: 'الكمية', accessor: r => r.qty },
          { header: 'قبل', accessor: r => r.before },
          { header: 'بعد', accessor: r => r.after },
          { header: 'المستند', accessor: r => docOf(r.reference) },
          { header: 'السبب', accessor: r => reasonOf(r.reason) },
          { header: 'بواسطة', accessor: r => r.user || '' },
        ],
        { title: `حركة مخزون ${productName}`, companyName, subtitle: rangeLabel(range), fileName: `حركة-مخزون-${productName}`.replace(/\s+/g, '-') }
      );
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    } finally {
      setExporting(false);
    }
  };

  if (error) return <LoadError />;
  if (isLoading || !data) return <Loading />;
  const countOf = (t: MovementType) => data.byType.find(b => b.type === t);
  const allCount = data.byType.reduce((s, b) => s + b.count, 0);

  return (
    <div className="space-y-4">
      <RangeBar
        value={range}
        onChange={r => {
          setPage(1);
          onRange(r);
        }}
        onExport={data.total ? exportExcel : undefined}
        exporting={exporting}
      />

      {/* kinds of movement: a filter that also shows the net quantity of each */}
      <div className="flex flex-wrap gap-2">
        {[{ id: '' as const, label: 'الكل', count: allCount, qty: null as number | null }, ...ORDER.map(t => ({ id: t, label: TYPES[t].label, count: countOf(t)?.count || 0, qty: countOf(t)?.qty ?? null }))].map(f => {
          const selected = type === f.id;
          if (f.id && !f.count && !selected) return null;
          return (
            <button
              key={f.id || 'all'}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setType(f.id);
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                selected ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-medium">{f.label}</span>
              <span className="text-xs text-gray-500">{formatNumber(f.count)}</span>
              {f.qty !== null && f.qty !== 0 && (
                <span className={`text-xs font-semibold ${f.qty > 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr">
                  {f.qty > 0 ? '+' : ''}
                  {formatQty(f.qty)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className={`${CARD} overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
        {data.rows.length === 0 ? (
          <Empty text={`لا حركة مخزون في ${rangeLabel(range)}`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>التاريخ</Th>
                  <Th>النوع</Th>
                  <Th>الكمية</Th>
                  <Th>الرصيد بعدها</Th>
                  <Th>المستند / السبب</Th>
                  <Th>بواسطة</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(r => {
                  const t = TYPES[r.type] || { label: r.type, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{shopDateTime(r.at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${t.cls}`}>{t.label}</span>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 font-semibold ${r.qty > 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr" style={{ textAlign: 'right' }}>
                        {r.qty > 0 ? '+' : ''}
                        {formatQty(r.qty)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-medium text-gray-900">{formatQty(r.after, data.unit || 'قطعة')}</span>
                        <span className="mr-1 text-xs text-gray-400">من {formatQty(r.before)}</span>
                      </td>
                      <td className="max-w-[18rem] px-4 py-3 text-gray-700">
                        {docOf(r.reference) && <div className="truncate font-medium">{docOf(r.reference)}</div>}
                        {reasonOf(r.reason) && <div className="truncate text-xs text-gray-500">{reasonOf(r.reason)}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.user || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
      </section>
    </div>
  );
};

export default ProductMovementsTab;
