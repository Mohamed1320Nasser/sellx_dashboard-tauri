import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { productHistoryService, type ProductPrices } from '../../services/productHistoryService';
import { formatCurrency } from '../../utils';
import { shopDayOf } from '../reports/reportDates';
import { CARD, PAGE_SIZE, rangeLabel, rangeQuery, shopDate, shopDateTime, type HistoryRange } from './historyRange';
import { Empty, LoadError, Loading, Pager, RangeBar, Th, Tile } from './HistoryParts';

type Props = { productId: string; companyId: number; range: HistoryRange; onRange: (r: HistoryRange) => void };

const SOURCES: Record<string, { label: string; cls: string }> = {
  PURCHASE: { label: 'فاتورة شراء', cls: 'bg-blue-50 text-blue-700' },
  MANUAL: { label: 'تعديل يدوي', cls: 'bg-gray-100 text-gray-700' },
  PRICE_LIST: { label: 'قائمة أسعار', cls: 'bg-violet-50 text-violet-700' },
  BULK_UPDATE: { label: 'تحديث جماعي', cls: 'bg-amber-50 text-amber-800' },
};

const margin = (cost: number, price: number) => (price > 0 ? ((price - cost) / price) * 100 : null);
const pctText = (v: number | null) => (v === null ? '—' : `⁦${v.toFixed(1)}%⁩`);

/** One price that moved: old → new and by how much */
const Change: React.FC<{ from: number; to: number; upIsGood?: boolean }> = ({ from, to, upIsGood }) => {
  if (Math.abs(from - to) < 0.005) return <span className="text-gray-400">{formatCurrency(to)}</span>;
  const up = to > from;
  const pct = from > 0 ? Math.abs(((to - from) / from) * 100) : null;
  const good = upIsGood ? up : !up;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 whitespace-nowrap">
      <span className="text-gray-400">{formatCurrency(from)}</span>
      <ArrowLeft className="h-3 w-3 text-gray-400" />
      <span className="font-semibold text-gray-900">{formatCurrency(to)}</span>
      {pct !== null && (
        <span className={`rounded px-1 text-xs font-medium ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {up ? '▲' : '▼'} ⁦{pct < 10 ? Number(pct.toFixed(1)) : Math.round(pct)}%⁩
        </span>
      )}
    </span>
  );
};

/** Every price change of the product, and its cost and price over time (managers and owners) */
const ProductPricesTab: React.FC<Props> = ({ productId, companyId, range, onRange }) => {
  const [page, setPage] = useState(1);
  const q = rangeQuery(range);
  const { data, isLoading, error, isFetching } = useQuery<ProductPrices>({
    queryKey: ['product-history', 'prices', productId, companyId, q, page],
    queryFn: () => productHistoryService.prices(productId, companyId, { ...q, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  if (error) return <LoadError />;
  if (isLoading || !data) return <Loading />;
  const now = data.current;
  const first = data.chart[0];
  // chart axis in plain digits (an Arabic date inside the left-to-right chart reads garbled)
  const multiYear = new Set(data.chart.map(p => shopDayOf(p.at).slice(0, 4))).size > 1;
  const chart = data.chart.map(p => {
    const [y, m, d] = shopDayOf(p.at).split('-');
    return { ...p, label: multiYear ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}`, full: shopDate(p.at) };
  });

  return (
    <div className="space-y-4">
      <RangeBar
        value={range}
        onChange={r => {
          setPage(1);
          onRange(r);
        }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="سعر البيع الحالي" value={formatCurrency(now.sellingPrice)} sub={first ? `كان ${formatCurrency(first.sellingPrice)} أول الفترة` : undefined} />
        <Tile label="التكلفة الحالية" value={formatCurrency(now.purchasePrice)} sub={first ? `كانت ${formatCurrency(first.purchasePrice)} أول الفترة` : undefined} />
        <Tile
          label="هامش الربح الآن"
          value={pctText(margin(now.purchasePrice, now.sellingPrice))}
          tone={(margin(now.purchasePrice, now.sellingPrice) ?? 0) < 0 ? 'bad' : 'good'}
          sub={first ? `كان ${pctText(margin(first.purchasePrice, first.sellingPrice))}` : undefined}
        />
        <Tile label="عدد التغييرات" value={data.total} sub={rangeLabel(range)} />
      </div>

      {chart.length >= 2 && (
        <section className={`${CARD} p-4`}>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">التكلفة وسعر البيع عبر الوقت</h3>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} width={56} domain={[0, 'auto']} />
                <Tooltip formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]} labelFormatter={(_l: any, items: any) => items?.[0]?.payload?.full ?? _l} labelStyle={{ direction: 'rtl' }} contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="stepAfter" dataKey="sellingPrice" name="سعر البيع" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="stepAfter" dataKey="purchasePrice" name="التكلفة" stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-gray-400">أسعار القائمة الأساسية. المسافة بين الخطين هي ربح القطعة.</p>
        </section>
      )}

      <section className={`${CARD} overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
        {data.rows.length === 0 ? (
          <Empty text={`لم يتغير سعر هذا المنتج في ${rangeLabel(range)}`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>التاريخ</Th>
                  <Th>السبب</Th>
                  <Th>التكلفة</Th>
                  <Th>سعر البيع</Th>
                  <Th>بواسطة</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(r => {
                  const src = SOURCES[r.source] || { label: r.source, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{shopDateTime(r.at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${src.cls}`}>{src.label}</span>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {r.purchase ? (
                            <Link to={`/purchases/${r.purchase.id}`} className="text-primary-700 hover:underline">
                              فاتورة {r.purchase.invoiceNumber}
                            </Link>
                          ) : r.priceList ? (
                            `قائمة «${r.priceList.name}»`
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.priceList ? <span className="text-gray-400">—</span> : <Change from={r.purchasePrice.from} to={r.purchasePrice.to} />}
                      </td>
                      <td className="px-4 py-3">
                        <Change from={r.sellingPrice.from} to={r.sellingPrice.to} upIsGood />
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
      <p className="text-xs text-gray-400">التعديل اليدوي للسعر من صفحة المنتج يُسجَّل بداية من هذا الإصدار.</p>
    </div>
  );
};

export default ProductPricesTab;
