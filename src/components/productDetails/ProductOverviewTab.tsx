import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Boxes, Info, ListOrdered, TrendingUp } from 'lucide-react';
import type { ProductInsights } from '../../services/productHistoryService';
import { formatCurrency } from '../../utils';
import { formatQty } from '../../utils/quantity';
import { formatTableDate } from '../../utils/dateUtils';
import { CARD } from './historyRange';

type Props = { product: any; insights?: ProductInsights; unit?: string | null };

const SOURCE_NOTE: Record<string, string> = {
  BASE: 'السعر الأساسي',
  OVERRIDE: 'سعر خاص',
  FORMULA: 'بالمعادلة',
  FALLBACK: 'مثل القطاعي',
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className="min-w-0 text-left text-sm font-medium text-gray-900">{children}</dd>
  </div>
);

const Head: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
    <Icon className="h-4 w-4 text-primary-600" />
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
  </header>
);

/** The product's details, its prices on every list, its packs and the last 30 days' sales */
const ProductOverviewTab: React.FC<Props> = ({ product, insights, unit }) => {
  const daily = (insights?.last30.daily || []).map(d => ({ ...d, label: d.day.slice(8, 10) + '/' + d.day.slice(5, 7) }));
  const soldAny = daily.some(d => d.qty > 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <section className={`${CARD} p-4`}>
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-900">المبيعات آخر 30 يوم</h3>
            {insights && (
              <span className="mr-auto text-xs text-gray-500">
                {formatQty(insights.last30.qty, unit)} · {formatCurrency(insights.last30.revenue)}
              </span>
            )}
          </div>
          {!insights ? (
            <div className="h-52 animate-pulse rounded-xl bg-gray-100" />
          ) : soldAny ? (
            <div className="h-52" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={36} allowDecimals={!!product?.allowDecimalQty} />
                  <Tooltip
                    cursor={{ fill: '#ecfdf5' }}
                    contentStyle={{ direction: 'rtl', borderRadius: 12 }}
                    formatter={(v: any, name: any) => (name === 'qty' ? [formatQty(Number(v), unit), 'الكمية'] : [formatCurrency(Number(v)), 'الإيراد'])}
                  />
                  <Bar dataKey="qty" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">لم يُبع هذا المنتج في آخر 30 يوم.</p>
          )}
        </section>

        <section className={`${CARD} overflow-hidden`}>
          <Head icon={Info} title="بيانات المنتج" />
          <dl className="divide-y divide-gray-100 px-5">
            <Row label="الفئة">{product?.category?.name || '—'}</Row>
            <Row label="الباركود">
              <span className="font-mono" dir="ltr">
                {product?.sku || '—'}
              </span>
            </Row>
            <Row label="طريقة البيع">{product?.allowDecimalQty ? `بالوزن / الطول (${unit || 'وحدة'})` : `بالقطعة${unit ? ` (${unit})` : ''}`}</Row>
            <Row label="حد التنبيه">{formatQty(product?.minStockLevel || 0, unit)}</Row>
            <Row label="تاريخ الإضافة">{product?.createdAt ? formatTableDate(product.createdAt) : '—'}</Row>
          </dl>
          {product?.description && (
            <div className="border-t border-gray-100 px-5 py-3">
              <p className="mb-1 text-sm text-gray-500">الوصف</p>
              <p className="whitespace-pre-line text-sm text-gray-800">{product.description}</p>
            </div>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <section className={`${CARD} overflow-hidden`}>
          <Head icon={ListOrdered} title="الأسعار في القوائم" />
          {!insights ? (
            <div className="m-4 h-20 animate-pulse rounded-xl bg-gray-100" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {insights.prices.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="mr-2 text-xs text-gray-400">{p.isDefault ? 'الأساسية' : SOURCE_NOTE[p.source]}</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold text-gray-900">{formatCurrency(p.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} overflow-hidden`}>
          <Head icon={Boxes} title="العبوات" />
          {!insights ? (
            <div className="m-4 h-12 animate-pulse rounded-xl bg-gray-100" />
          ) : insights.packs.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">يُباع بالقطعة فقط. أضف كرتونة أو علبة من «تعديل».</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {insights.packs.map(p => {
                const perPiece = p.factor > 0 ? p.sellingPrice / p.factor : 0;
                const saving = insights.sellingPrice > 0 ? ((insights.sellingPrice - perPiece) / insights.sellingPrice) * 100 : 0;
                return (
                  <li key={p.id} className="px-5 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {p.name} <span className="text-gray-500">× {formatQty(p.factor)}</span>
                      </span>
                      <span className="whitespace-nowrap font-semibold text-gray-900">{formatCurrency(p.sellingPrice)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-xs text-gray-500">
                      <span>
                        القطعة بـ {formatCurrency(perPiece)}
                        {saving >= 0.5 && <span className="text-emerald-700"> · أوفر ⁦{Math.round(saving)}%⁩</span>}
                      </span>
                      {p.barcode && (
                        <span className="font-mono" dir="ltr">
                          {p.barcode}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProductOverviewTab;
