import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { productHistoryService, type ProductSales } from '../../services/productHistoryService';
import { formatCurrency, formatNumber } from '../../utils';
import { formatQty } from '../../utils/quantity';
import { exportReportToExcel } from '../../utils/reportExport';
import { priceGap, NEGOTIATION_WARN_PERCENT } from '../../utils/negotiation';
import { CARD, EXPORT_LIMIT, PAGE_SIZE, rangeLabel, rangeQuery, shopDateTime, type HistoryRange } from './historyRange';
import { Empty, LoadError, Loading, Pager, RangeBar, Th, Tile } from './HistoryParts';

type Props = { productId: string; productName: string; companyId: number; companyName?: string; isManager: boolean; range: HistoryRange; onRange: (r: HistoryRange) => void };

const pct = (p: number) => `⁦${Math.abs(p) < 10 ? Number(Math.abs(p).toFixed(1)) : Math.round(Math.abs(p))}%⁩`;

/** Every invoice line of the product: who bought it, at what price, and what came back */
const ProductSalesTab: React.FC<Props> = ({ productId, productName, companyId, companyName, isManager, range, onRange }) => {
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = rangeQuery(range);
  const { data, isLoading, error, isFetching } = useQuery<ProductSales>({
    queryKey: ['product-history', 'sales', productId, companyId, q, page],
    queryFn: () => productHistoryService.sales(productId, companyId, { ...q, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const changeRange = (r: HistoryRange) => {
    setPage(1);
    onRange(r);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all = await productHistoryService.sales(productId, companyId, { ...q, page: 1, limit: EXPORT_LIMIT });
      await exportReportToExcel(
        all.rows,
        [
          { header: 'التاريخ', accessor: r => shopDateTime(r.date) },
          { header: 'رقم الفاتورة', accessor: r => r.receiptNumber },
          { header: 'العميل', accessor: r => r.client?.name || 'عميل نقدي' },
          { header: 'الكاشير', accessor: r => r.cashier || '' },
          { header: 'الكمية', accessor: r => (r.pack ? `${formatQty(r.pack.qty)} ${r.pack.name}` : r.qty) },
          { header: 'سعر الوحدة', accessor: r => (r.pack ? r.pack.price : r.unitPrice), format: 'currency' },
          { header: 'سعر القائمة', accessor: r => r.listPrice ?? '', format: 'currency' },
          { header: 'الإجمالي', accessor: r => r.total, format: 'currency' },
          { header: 'مرتجع', accessor: r => r.returnedQty || '' },
          ...(isManager ? [{ header: 'الربح', accessor: (r: ProductSales['rows'][number]) => r.profit ?? '', format: 'currency' as const }] : []),
        ],
        {
          title: `مبيعات ${productName}`,
          companyName,
          subtitle: rangeLabel(range),
          summary: [
            { label: 'الكمية المباعة', value: formatQty(all.summary.qty, all.unit || 'قطعة') },
            { label: 'الإيراد', value: formatCurrency(all.summary.revenue), emphasis: true },
            ...(isManager && all.summary.profit !== undefined ? [{ label: 'الربح', value: formatCurrency(all.summary.profit) }] : []),
          ],
          fileName: `مبيعات-${productName}`.replace(/\s+/g, '-'),
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

  return (
    <div className="space-y-4">
      <RangeBar value={range} onChange={changeRange} onExport={data.total ? exportExcel : undefined} exporting={exporting} />

      <div className={`grid grid-cols-2 gap-3 ${isManager ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <Tile label="الكمية المباعة" value={formatQty(s.qty, data.unit || 'قطعة')} sub={`${formatNumber(s.invoices)} فاتورة`} />
        <Tile label="الإيراد" value={formatCurrency(s.revenue)} sub={rangeLabel(range)} />
        <Tile
          label="متوسط سعر البيع"
          value={s.avgPrice === null ? '—' : formatCurrency(s.avgPrice)}
          sub={s.minPrice !== null && s.maxPrice !== null && s.minPrice !== s.maxPrice ? `من ${formatCurrency(s.minPrice)} إلى ${formatCurrency(s.maxPrice)}` : undefined}
        />
        {isManager && <Tile label="الربح" value={formatCurrency(s.profit || 0)} tone={(s.profit || 0) < 0 ? 'bad' : 'good'} sub="بتكلفة وقت البيع" />}
      </div>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className={`${CARD} min-w-0 overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
          {data.rows.length === 0 ? (
            <Empty text={`لم يُبع هذا المنتج في ${rangeLabel(range)}`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>التاريخ</Th>
                    <Th>الفاتورة</Th>
                    <Th>العميل</Th>
                    <Th>الكمية</Th>
                    <Th>السعر</Th>
                    <Th end>الإجمالي</Th>
                    {isManager && <Th end>الربح</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map(r => {
                    const soldAt = r.pack ? r.pack.price : r.unitPrice;
                    const gap = r.listPrice !== undefined ? priceGap(soldAt, r.listPrice) : 0;
                    const far = Math.abs(gap) > NEGOTIATION_WARN_PERCENT + 1e-9;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{shopDateTime(r.date)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link to={`/sales/${r.saleId}`} className="font-medium text-primary-700 hover:underline">
                            {r.receiptNumber}
                          </Link>
                          {r.cashier && <div className="text-xs text-gray-400">{r.cashier}</div>}
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3 text-gray-700">
                          {r.client ? (
                            <Link to={`/clients/${r.client.id}/statement`} className="hover:text-primary-700 hover:underline">
                              {r.client.name}
                            </Link>
                          ) : (
                            <span className="text-gray-400">عميل نقدي</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-medium text-gray-900">{r.pack ? `${formatQty(r.pack.qty)} ${r.pack.name}` : formatQty(r.qty, data.unit || 'قطعة')}</span>
                          {r.returnedQty > 0 && (
                            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-600">
                              <Undo2 className="h-3 w-3" /> رُدّ {formatQty(r.returnedQty, data.unit || 'قطعة')}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="text-gray-900">{formatCurrency(soldAt)}</span>
                          {r.listPrice !== undefined && (
                            <div
                              className={`mt-0.5 flex items-center gap-1 text-xs ${far ? 'text-amber-700' : 'text-gray-500'}`}
                              title={`سعر القائمة ${formatCurrency(r.listPrice)}`}
                            >
                              {far && <AlertTriangle className="h-3 w-3" />}
                              متفاوض عليه · <s className="text-gray-400">{formatCurrency(r.listPrice)}</s> {gap < 0 ? '−' : '+'}
                              {pct(gap)}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-900">{formatCurrency(r.total)}</td>
                        {isManager && (
                          <td className={`whitespace-nowrap px-4 py-3 text-left ${(r.profit || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {formatCurrency(r.profit || 0)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
        </section>

        <aside className={`${CARD} p-4`}>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">أكثر العملاء شراءً</h3>
          {s.topCustomers.length === 0 ? (
            <p className="text-sm text-gray-500">كل المبيعات لعملاء نقديين في هذه الفترة.</p>
          ) : (
            <ol className="space-y-2.5">
              {s.topCustomers.map((c, i) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{i + 1}</span>
                    <Link to={`/clients/${c.id}/statement`} className="truncate text-gray-800 hover:text-primary-700 hover:underline">
                      {c.name}
                    </Link>
                  </span>
                  <span className="whitespace-nowrap text-left">
                    <span className="font-medium text-gray-900">{formatCurrency(c.revenue)}</span>
                    <span className="block text-xs text-gray-500">{formatQty(c.qty, data.unit || 'قطعة')}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ProductSalesTab;
