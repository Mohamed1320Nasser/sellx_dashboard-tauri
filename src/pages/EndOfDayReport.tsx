import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Package,
  Printer,
  Receipt,
  RotateCcw,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '../components/layout';
import { HeaderAction } from '../components/common/HeaderAction';
import { methodOf } from '../components/payments/paymentLabels';
import { formatCurrency, formatNumber } from '../utils';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { reportService, type EndOfDayMoneyRow, type EndOfDayReport as Report } from '../services/reportService';
import { dayLabel, shiftDay, shiftSpan, shopToday } from '../components/reports/reportDates';
import { endOfDayA4Html } from '../components/reports/endOfDayA4Html';
import { printA4Document } from '../services/printService';
import { loadCompanyProfile } from '../services/companyProfile';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

type MoneyCol = Exclude<keyof EndOfDayMoneyRow, 'method' | 'net'>;
const MONEY_COLS: { key: MoneyCol; label: string; out?: boolean; always?: boolean }[] = [
  { key: 'atSale', label: 'تحصيل المبيعات', always: true },
  { key: 'onDebts', label: 'تحصيل ديون' },
  { key: 'fromSuppliers', label: 'مسترد من موردين' },
  { key: 'toSuppliers', label: 'مدفوع لموردين', out: true },
  { key: 'expenses', label: 'مصروفات', out: true },
  { key: 'refunds', label: 'مردود لعملاء', out: true },
];

const Figure: React.FC<{ icon: LucideIcon; label: string; value: string; hint?: string; tone: string }> = ({ icon: Icon, label, value, hint, tone }) => (
  <div className={`${card} flex items-center gap-3 p-4`}>
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="truncate text-lg font-bold text-gray-900">{value}</p>
      {hint && <p className="truncate text-xs text-gray-400">{hint}</p>}
    </div>
  </div>
);

const Section: React.FC<{ icon: LucideIcon; title: string; note?: string; children: React.ReactNode; className?: string }> = ({ icon: Icon, title, note, children, className = '' }) => (
  <section className={`${card} overflow-hidden ${className}`}>
    <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-gray-100 px-5 py-3.5">
      <Icon className="h-4 w-4 self-center text-primary-600" />
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {note && <span className="text-xs text-gray-400">{note}</span>}
    </header>
    {children}
  </section>
);

const Amount: React.FC<{ value: number; out?: boolean; strong?: boolean }> = ({ value, out, strong }) =>
  value ? (
    <span className={`whitespace-nowrap ${strong ? 'font-semibold' : ''} ${value < 0 ? 'text-red-600' : out ? 'text-gray-700' : 'text-gray-900'}`}>
      {out ? `(${formatCurrency(value)})` : formatCurrency(value)}
    </span>
  ) : (
    <span className="text-gray-300">—</span>
  );

/** What happened to the drawer: short, then the money detail */
const varianceText = (v: number | null) =>
  v == null ? { text: 'لم تُغلق بعد', cls: 'bg-amber-50 text-amber-700' } : Math.abs(v) < 0.01 ? { text: 'مطابق', cls: 'bg-emerald-50 text-emerald-700' } : v < 0 ? { text: `عجز ${formatCurrency(-v)}`, cls: 'bg-red-50 text-red-700' } : { text: `زيادة ${formatCurrency(v)}`, cls: 'bg-blue-50 text-blue-700' };

/**
 * End-of-day report: one shop day, printable. Sales (the dashboard's own figures for that day),
 * every pound in and out per payment method, each drawer, sales per cashier, items sold.
 */
const EndOfDayReport: React.FC = () => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const [params, setParams] = useSearchParams();
  const today = shopToday();
  const asked = params.get('date') || '';
  const day = DAY.test(asked) && asked <= today ? asked : today;
  const setDay = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });
  const [printing, setPrinting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', 'end-of-day', companyId, day],
    queryFn: () => reportService.endOfDay(companyId, day),
    enabled: !!companyId,
  });
  const r = data as Report | undefined;

  // only the columns that have money in them (the sales one always)
  const cols = useMemo(() => MONEY_COLS.filter(c => c.always || r?.money.some(m => Math.abs(m[c.key]) > 0.001)), [r]);
  const empty = r && r.sales.invoices === 0 && r.money.length === 0 && r.shifts.length === 0 && r.sales.returnOrders === 0;

  const print = async () => {
    if (!r) return;
    setPrinting(true);
    try {
      const profile: any = await loadCompanyProfile();
      const user: any = (useSessionAuthStore.getState() as any).user;
      await printA4Document(fontCss =>
        endOfDayA4Html(
          r,
          {
            companyName: profile?.name || (company as any)?.name || company?.company?.name || '',
            companyAddress: profile?.address,
            companyPhone: profile?.phone,
            companyLogoUrl: profile?.logoUrl,
            printedBy: user?.fullname,
          },
          cols.map(c => c.key),
          fontCss
        )
      );
    } catch {
      toast.error('تعذرت الطباعة');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Layout>
      <div className="w-full space-y-5">
        {/* Header: title + the day navigator */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">تقرير نهاية اليوم</h1>
            <p className="mt-1 text-sm text-gray-600">{dayLabel(day)} · المبيعات وحركة الأموال والأدراج</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button type="button" onClick={() => setDay(shiftDay(day, -1))} className="flex h-full w-9 items-center justify-center text-gray-500 hover:bg-gray-50" title="اليوم السابق" aria-label="اليوم السابق">
                <ChevronRight className="h-4 w-4" />
              </button>
              <label className="flex h-full items-center border-x border-gray-200 px-2 text-sm text-gray-700" title="اختر اليوم">
                <input type="date" value={day} max={today} onChange={e => DAY.test(e.target.value) && setDay(e.target.value)} className="bg-transparent text-sm outline-none" dir="ltr" />
              </label>
              <button
                type="button"
                onClick={() => setDay(shiftDay(day, 1))}
                disabled={day >= today}
                className="flex h-full w-9 items-center justify-center text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                title="اليوم التالي"
                aria-label="اليوم التالي"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            {day !== today && <HeaderAction icon={CalendarDays} label="اليوم" onClick={() => setDay(today)} />}
            <HeaderAction icon={Printer} label="طباعة" tone="primary" onClick={print} busy={printing} disabled={!r} />
          </div>
        </div>

        {error ? (
          <div className={`${card} flex items-center gap-2 p-5 text-sm text-red-700`}>
            <AlertCircle className="h-5 w-5" /> تعذر تحميل تقرير هذا اليوم.
          </div>
        ) : isLoading || !r ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
          </div>
        ) : (
          <>
            {/* The day in four numbers */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure icon={Receipt} tone="bg-primary-50 text-primary-600" label="المبيعات" value={formatCurrency(r.sales.totalRevenue)} hint={`${formatNumber(r.sales.invoices)} فاتورة · متوسط ${formatCurrency(r.sales.averageOrderValue)}`} />
              <Figure icon={RotateCcw} tone="bg-red-50 text-red-600" label="المرتجعات" value={formatCurrency(r.sales.returns)} hint={`${formatNumber(r.sales.returnOrders)} مرتجع`} />
              {r.sales.grossProfit != null ? (
                <Figure icon={TrendingUp} tone="bg-emerald-50 text-emerald-600" label="مجمل الربح" value={formatCurrency(r.sales.grossProfit)} hint={`صافي المبيعات ${formatCurrency(r.sales.netRevenue)} · هامش ⁦${(r.sales.grossProfitMargin || 0).toFixed(1)}%⁩`} />
              ) : (
                <Figure icon={TrendingUp} tone="bg-emerald-50 text-emerald-600" label="صافي المبيعات" value={formatCurrency(r.sales.netRevenue)} hint="بعد المرتجعات وبدون الضريبة" />
              )}
              <Figure icon={Wallet} tone="bg-amber-50 text-amber-600" label="صافي حركة الأموال" value={formatCurrency(r.moneyTotals.net)} hint={r.sales.unpaid ? `آجل على فواتير اليوم ${formatCurrency(r.sales.unpaid)}` : 'كل الطرق: الداخل ناقص الخارج'} />
            </div>

            {empty && (
              <div className={`${card} p-8 text-center text-sm text-gray-500`}>لا توجد مبيعات أو حركة أموال أو ورديات في هذا اليوم.</div>
            )}

            {!empty && (
              <>
                {/* Money by method */}
                <Section icon={Coins} title="حركة الأموال حسب طريقة الدفع" note="ما دخل وما خرج فعلياً في هذا اليوم">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-5 py-2.5 text-right font-medium">الطريقة</th>
                          {cols.map(c => (
                            <th key={c.key} className="px-4 py-2.5 text-left font-medium">
                              {c.label}
                            </th>
                          ))}
                          <th className="px-5 py-2.5 text-left font-medium">الصافي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {r.money.length === 0 && (
                          <tr>
                            <td colSpan={cols.length + 2} className="px-5 py-6 text-center text-gray-400">
                              لم تدخل أو تخرج أموال
                            </td>
                          </tr>
                        )}
                        {r.money.map(m => {
                          const meta = methodOf(m.method);
                          const Icon = meta.icon;
                          return (
                            <tr key={m.method}>
                              <td className="px-5 py-3">
                                <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                                  <Icon className="h-4 w-4 text-gray-400" /> {meta.label}
                                </span>
                              </td>
                              {cols.map(c => (
                                <td key={c.key} className="px-4 py-3 text-left">
                                  <Amount value={m[c.key]} out={c.out} />
                                </td>
                              ))}
                              <td className="px-5 py-3 text-left">
                                <Amount value={m.net} strong />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {r.money.length > 1 && (
                        <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                          <tr>
                            <td className="px-5 py-3 text-gray-900">الإجمالي</td>
                            {cols.map(c => (
                              <td key={c.key} className="px-4 py-3 text-left">
                                <Amount value={r.moneyTotals[c.key]} out={c.out} />
                              </td>
                            ))}
                            <td className="px-5 py-3 text-left">
                              <Amount value={r.moneyTotals.net} strong />
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </Section>

                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {/* Drawers */}
                  <Section icon={Wallet} title="الأدراج" note="كل وردية كانت مفتوحة في هذا اليوم، محسوبة بالكامل">
                    {r.shifts.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-gray-400">لم تُفتح أي وردية</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {r.shifts.map(sh => {
                          const v = varianceText(sh.status === 'OPEN' ? null : sh.variance ?? 0);
                          return (
                            <li key={sh.id} className="px-5 py-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-gray-900">
                                    {sh.register} · {sh.cashier}
                                  </p>
                                  <p className="text-xs text-gray-500" dir="rtl">
                                    {shiftSpan(sh.startTime, sh.endTime, r.date)} · {formatNumber(sh.invoices)} فاتورة
                                  </p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${v.cls}`}>{v.text}</span>
                              </div>
                              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                                <div>
                                  <dt className="text-xs text-gray-400">رصيد افتتاحي</dt>
                                  <dd className="text-gray-800">{formatCurrency(sh.openingBalance)}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-gray-400">مبيعات نقدية</dt>
                                  <dd className="text-gray-800">{formatCurrency(sh.cashSales)}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-gray-400">داخل / خارج الدرج</dt>
                                  <dd className="text-gray-800">
                                    {formatCurrency(sh.cashIn)} / {formatCurrency(sh.cashOut)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-gray-400">المتوقع في الدرج</dt>
                                  <dd className="font-semibold text-gray-900">{formatCurrency(sh.expectedCash)}</dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-gray-400">الفعلي</dt>
                                  <dd className="font-semibold text-gray-900">{sh.actualCash == null ? '—' : formatCurrency(sh.actualCash)}</dd>
                                </div>
                              </dl>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Section>

                  {/* Per cashier + the rest of the sales detail */}
                  <div className="space-y-5">
                    <Section icon={Users} title="المبيعات حسب الكاشير">
                      {r.cashiers.length === 0 ? (
                        <p className="px-5 py-6 text-center text-sm text-gray-400">لا توجد مبيعات</p>
                      ) : (
                        <ul className="divide-y divide-gray-100">
                          {r.cashiers.map(c => (
                            <li key={c.userId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                              <span className="min-w-0 truncate font-medium text-gray-900">{c.name}</span>
                              <span className="whitespace-nowrap text-gray-500">
                                {formatNumber(c.invoices)} فاتورة · <span className="font-semibold text-gray-900">{formatCurrency(c.total)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Section>
                    <section className={`${card} divide-y divide-gray-100 text-sm`}>
                      {[
                        ['الخصومات', r.sales.discounts],
                        ['الضريبة المحصلة', r.sales.tax],
                        ['آجل على فواتير اليوم', r.sales.unpaid],
                        ...(r.sales.costOfGoodsSold != null ? [['تكلفة البضاعة المباعة', r.sales.costOfGoodsSold] as [string, number]] : []),
                      ].map(([label, value]) => (
                        <div key={label as string} className="flex items-center justify-between px-5 py-2.5">
                          <span className="text-gray-600">{label}</span>
                          <span className="font-medium text-gray-900">{formatCurrency(value as number)}</span>
                        </div>
                      ))}
                    </section>
                  </div>
                </div>

                {/* Items sold */}
                <Section icon={Package} title="الأصناف المباعة" note={`${formatNumber(r.items.length)} صنف، الأعلى قيمة أولاً`}>
                  {r.items.length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-gray-400">لم يُبع شيء</p>
                  ) : (
                    <div className="max-h-[28rem] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="px-5 py-2.5 text-right font-medium">الصنف</th>
                            <th className="px-4 py-2.5 text-left font-medium">الكمية</th>
                            <th className="px-5 py-2.5 text-left font-medium">القيمة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {r.items.map((it, i) => (
                            <tr key={it.productId || i}>
                              <td className="px-5 py-2.5">
                                {it.productId ? (
                                  <Link to={`/products/${it.productId}`} className="text-gray-900 hover:text-primary-700 hover:underline">
                                    {it.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-500">{it.name}</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-left text-gray-700">
                                {formatNumber(it.quantity)} {it.unit || ''}
                              </td>
                              <td className="whitespace-nowrap px-5 py-2.5 text-left font-medium text-gray-900">{formatCurrency(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default EndOfDayReport;
