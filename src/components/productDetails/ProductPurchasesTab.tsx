import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Award, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { productHistoryService, type ProductPurchases } from '../../services/productHistoryService';
import { formatCurrency, formatNumber } from '../../utils';
import { formatQty } from '../../utils/quantity';
import { exportReportToExcel } from '../../utils/reportExport';
import { CARD, EXPORT_LIMIT, PAGE_SIZE, rangeLabel, rangeQuery, shopDate, type HistoryRange } from './historyRange';
import { Empty, LoadError, Loading, Pager, RangeBar, Th, Tile } from './HistoryParts';

type Props = { productId: string; productName: string; companyId: number; companyName?: string; range: HistoryRange; onRange: (r: HistoryRange) => void };

/** Every purchase of the product and how its suppliers compare (managers and owners) */
const ProductPurchasesTab: React.FC<Props> = ({ productId, productName, companyId, companyName, range, onRange }) => {
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = rangeQuery(range);
  const { data, isLoading, error, isFetching } = useQuery<ProductPurchases>({
    queryKey: ['product-history', 'purchases', productId, companyId, q, page],
    queryFn: () => productHistoryService.purchases(productId, companyId, { ...q, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const changeRange = (r: HistoryRange) => {
    setPage(1);
    onRange(r);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all = await productHistoryService.purchases(productId, companyId, { ...q, page: 1, limit: EXPORT_LIMIT });
      await exportReportToExcel(
        all.rows,
        [
          { header: 'التاريخ', accessor: r => shopDate(r.date) },
          { header: 'رقم الفاتورة', accessor: r => r.invoiceNumber },
          { header: 'المورد', accessor: r => r.supplier?.name || '' },
          { header: 'الكمية', accessor: r => r.qty },
          { header: 'سعر الفاتورة', accessor: r => r.unitPrice, format: 'currency' },
          { header: 'التكلفة الفعلية', accessor: r => r.unitCost ?? r.unitPrice, format: 'currency' },
          { header: 'الإجمالي', accessor: r => r.total, format: 'currency' },
          { header: 'مرتجع للمورد', accessor: r => r.returnedQty || '' },
        ],
        {
          title: `مشتريات ${productName}`,
          companyName,
          subtitle: rangeLabel(range),
          summary: [
            { label: 'الكمية المشتراة', value: formatQty(all.summary.qty, all.unit || 'قطعة') },
            { label: 'متوسط التكلفة', value: all.summary.avgCost === null ? '—' : formatCurrency(all.summary.avgCost) },
            { label: 'الإجمالي', value: formatCurrency(all.summary.total), emphasis: true },
          ],
          fileName: `مشتريات-${productName}`.replace(/\s+/g, '-'),
        }
      );
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    } finally {
      setExporting(false);
    }
  };

  if (error) return <LoadError />;
  if (isLoading || !data) return <Loading />;
  const s = data.summary;
  const cheapest = s.suppliers[0];

  return (
    <div className="space-y-4">
      <RangeBar value={range} onChange={changeRange} onExport={data.total ? exportExcel : undefined} exporting={exporting} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="الكمية المشتراة" value={formatQty(s.qty, data.unit || 'قطعة')} sub={`${formatNumber(s.invoices)} فاتورة شراء`} />
        <Tile label="إجمالي المشتريات" value={formatCurrency(s.total)} sub={rangeLabel(range)} />
        <Tile label="متوسط التكلفة" value={s.avgCost === null ? '—' : formatCurrency(s.avgCost)} sub="بعد الخصم والشحن" />
        <Tile
          label="آخر تكلفة"
          value={s.lastCost === null ? '—' : formatCurrency(s.lastCost)}
          tone={s.lastCost !== null && s.avgCost !== null && s.lastCost > s.avgCost + 0.005 ? 'warn' : 'default'}
          sub={s.lastCost !== null && s.avgCost !== null && s.lastCost > s.avgCost + 0.005 ? 'أعلى من المتوسط' : undefined}
        />
      </div>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={`${CARD} min-w-0 overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
          {data.rows.length === 0 ? (
            <Empty text={`لم يُشترَ هذا المنتج في ${rangeLabel(range)}`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>التاريخ</Th>
                    <Th>الفاتورة</Th>
                    <Th>المورد</Th>
                    <Th>الكمية</Th>
                    <Th>سعر الفاتورة</Th>
                    <Th>التكلفة الفعلية</Th>
                    <Th end>الإجمالي</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map(r => {
                    const cost = r.unitCost ?? r.unitPrice;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{shopDate(r.date)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link to={`/purchases/${r.purchaseId}`} className="font-medium text-primary-700 hover:underline">
                            {r.invoiceNumber}
                          </Link>
                          {r.user && <div className="text-xs text-gray-400">{r.user}</div>}
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3 text-gray-700">
                          {r.supplier ? (
                            <Link to={`/suppliers/${r.supplier.id}/statement`} className="hover:text-primary-700 hover:underline">
                              {r.supplier.name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-medium text-gray-900">{formatQty(r.qty, data.unit || 'قطعة')}</span>
                          {r.returnedQty > 0 && (
                            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-600">
                              <Undo2 className="h-3 w-3" /> رُدّ للمورد {formatQty(r.returnedQty, data.unit || 'قطعة')}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatCurrency(r.unitPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-medium text-gray-900">{formatCurrency(cost)}</span>
                          {Math.abs(cost - r.unitPrice) >= 0.005 && (
                            <div className="text-xs text-gray-500">{cost < r.unitPrice ? 'بعد الخصم' : 'مع الشحن'}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-900">{formatCurrency(r.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
        </section>

        <aside className={`${CARD} overflow-hidden`}>
          <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">مقارنة الموردين</h3>
          {s.suppliers.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">لا مشتريات في هذه الفترة.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {s.suppliers.map(sup => (
                <li key={sup.id} className={`px-4 py-3 text-sm ${sup === cheapest && s.suppliers.length > 1 ? 'bg-emerald-50/60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/suppliers/${sup.id}/statement`} className="min-w-0 truncate font-medium text-gray-900 hover:text-primary-700 hover:underline">
                      {sup.name}
                    </Link>
                    <span className="whitespace-nowrap font-semibold text-gray-900">{formatCurrency(sup.avgCost)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-gray-500">
                    <span>
                      {formatQty(sup.qty, data.unit || 'قطعة')} · آخر شراء {shopDate(sup.lastAt)} بـ {formatCurrency(sup.lastCost)}
                    </span>
                    {sup === cheapest && s.suppliers.length > 1 && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <Award className="h-3 w-3" /> الأرخص
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {s.suppliers.length > 1 && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">مرتبون حسب متوسط التكلفة، الأرخص أولاً.</p>}
        </aside>
      </div>
    </div>
  );
};

export default ProductPurchasesTab;
