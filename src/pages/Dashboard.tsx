import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  DollarSign,
  FileText,
  PackagePlus,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Target,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { StatisticsCard } from '../components/ui';
import { useDashboardSummary } from '../hooks/api/useAnalytics';
import SessionRouteGuard from '../components/auth/SessionRouteGuard';
import { SalesOverviewChart, RevenueBreakdownChart, TopProductsChart } from '../components/charts';
import PurchaseDueCard from '../components/purchases/PurchaseDueCard';
import { formatCurrency, formatNumber } from '../utils/currencyUtils';
import { formatTableDate } from '../utils/dateUtils';
import { formatQty } from '../utils/quantity';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { usePermissionStore } from '../stores/permissionStore';
import type { UserPermissions } from '../stores/permissionStore';

const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

/** growth for StatisticsCard: null = nothing to compare with */
const growthOf = (v: number | null | undefined) => ({ value: v ?? 0, isPositive: (v ?? 0) >= 0, isNeutral: v == null });

/** One figure in the "today" strip */
const TodayFigure: React.FC<{ icon: LucideIcon; label: string; value: string; hint?: string; tone: string }> = ({ icon: Icon, label, value, hint, tone }) => (
  <div className="flex items-center gap-3 p-4">
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

const QUICK: { label: string; icon: LucideIcon; to: string; permission: keyof UserPermissions }[] = [
  { label: 'فاتورة بيع', icon: Receipt, to: '/sales/create', permission: 'canCreateSales' },
  { label: 'عرض سعر', icon: FileText, to: '/quotes/create', permission: 'canCreateQuotes' },
  { label: 'فاتورة شراء', icon: Truck, to: '/purchases/create', permission: 'canCreatePurchases' },
  { label: 'تحصيل دفعة', icon: Wallet, to: '/payments/create', permission: 'canCreatePayments' },
  { label: 'مصروف', icon: DollarSign, to: '/expenses/create', permission: 'canManageExpenses' },
  { label: 'منتج جديد', icon: PackagePlus, to: '/products/create', permission: 'canCreateProducts' },
];

/**
 * The dashboard: today at a glance, the last 30 days against the 30 before, alerts.
 * Every figure here exists once on this page; the detailed versions live in the reports.
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id || 0;
  const hasPermission = usePermissionStore(s => s.hasPermission);
  const { data, isLoading, error } = useDashboardSummary();

  const o = data?.overview;
  const period = data?.period;
  const alerts = data?.alerts;
  const showProfit = o?.grossProfit != null;
  const money = (v?: number | null) => (isLoading ? '...' : formatCurrency(v || 0));
  const count = (v?: number | null) => (isLoading ? '...' : formatNumber(v || 0));
  const quick = QUICK.filter(q => hasPermission(q.permission));

  return (
    <SessionRouteGuard>
      <Layout>
        <div className="w-full space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">تعذر تحميل بيانات لوحة التحكم. حدّث الصفحة أو أعد تسجيل الدخول.</div>
          )}

          {/* Supplier invoices due this week */}
          <PurchaseDueCard companyId={companyId} />

          {/* Today */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-gray-900">اليوم</h2>
            <div className={`${card} grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x lg:divide-x-reverse`}>
              <TodayFigure icon={DollarSign} tone="bg-emerald-50 text-emerald-600" label="مبيعات اليوم" value={money(o?.todaysRevenue)} />
              <TodayFigure icon={ShoppingCart} tone="bg-blue-50 text-blue-600" label="فواتير اليوم" value={count(o?.todaysOrders)} />
              <TodayFigure icon={Target} tone="bg-orange-50 text-orange-600" label="متوسط الفاتورة" value={money(o?.todaysAverageOrderValue)} hint="لفواتير اليوم" />
              <TodayFigure icon={UserPlus} tone="bg-violet-50 text-violet-600" label="عملاء جدد" value={count(o?.newCustomersToday)} />
            </div>
          </section>

          {/* Last 30 days */}
          <section>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-gray-900">آخر 30 يوم</h2>
              {period && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <bdi>{formatTableDate(period.from)}</bdi> – <bdi>{formatTableDate(period.to)}</bdi>، مقارنة بالـ 30 يوم السابقة
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatisticsCard
                icon={DollarSign}
                title="المبيعات"
                value={money(o?.currentRevenue)}
                color="#10B981"
                growth={!isLoading ? growthOf(o?.revenueGrowth) : undefined}
                subtitle={isLoading ? undefined : `${formatNumber(o?.currentOrders || 0)} فاتورة · متوسط ${formatCurrency(o?.averageOrderValue || 0)}`}
                isLoading={isLoading}
              />
              <StatisticsCard
                icon={RotateCcw}
                title="المرتجعات"
                value={money(o?.currentReturns)}
                color="#EF4444"
                subtitle={isLoading ? undefined : `${formatNumber(o?.currentReturnOrders || 0)} مرتجع · ⁦${o?.returnRate || 0}%⁩ من المبيعات`}
                isLoading={isLoading}
              />
              {showProfit ? (
                <StatisticsCard
                  icon={TrendingUp}
                  title="الربح الإجمالي"
                  secret
                  value={money(o?.grossProfit)}
                  color="#059669"
                  growth={!isLoading ? growthOf(o?.profitGrowth) : undefined}
                  subtitle={`صافي المبيعات ${formatCurrency(o?.currentNetRevenue || 0)} · هامش ⁦${(o?.profitMargin || 0).toFixed(1)}%⁩`}
                  isLoading={isLoading}
                />
              ) : (
                <StatisticsCard
                  icon={TrendingUp}
                  title="صافي المبيعات"
                  value={money(o?.currentNetRevenue)}
                  color="#059669"
                  growth={!isLoading ? growthOf(o?.netRevenueGrowth) : undefined}
                  subtitle="بعد المرتجعات وبدون الضريبة"
                  isLoading={isLoading}
                />
              )}
              <StatisticsCard
                icon={Truck}
                title="المشتريات"
                value={money(o?.currentPurchases)}
                color="#6366F1"
                growth={!isLoading ? growthOf(o?.purchaseGrowth) : undefined}
                subtitle={isLoading ? undefined : `${formatNumber(o?.currentPurchaseOrders || 0)} فاتورة شراء`}
                isLoading={isLoading}
              />
            </div>
          </section>

          {/* Sales per day, money taken per method */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SalesOverviewChart data={data?.dailySales || []} isLoading={isLoading} />
            <RevenueBreakdownChart data={data?.collections} isLoading={isLoading} />
          </div>

          {/* Best sellers, stock alerts, customers */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TopProductsChart data={data?.topProducts || []} isLoading={isLoading} />
            </div>
            <div className="space-y-5">
              <section className={`${card} p-5`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                    <AlertTriangle className={`h-5 w-5 ${alerts?.lowStockCount ? 'text-amber-500' : 'text-gray-300'}`} />
                    تنبيهات المخزون
                  </h3>
                  {!!alerts?.lowStockCount && (
                    <Link to="/products?lowStock=1" className="flex items-center text-sm font-medium text-primary-700 hover:underline">
                      الكل <ChevronLeft className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-amber-50 px-3 py-2">
                    <p className="text-xl font-bold text-amber-700">{count(alerts?.lowStockCount)}</p>
                    <p className="text-xs text-amber-700">عند الحد الأدنى أو أقل</p>
                  </div>
                  <div className="rounded-xl bg-red-50 px-3 py-2">
                    <p className="text-xl font-bold text-red-700">{count(alerts?.outOfStockCount)}</p>
                    <p className="text-xs text-red-700">نفد من المخزون</p>
                  </div>
                </div>
                {(data?.lowStockProducts || []).length > 0 ? (
                  <ul className="divide-y divide-gray-100">
                    {data!.lowStockProducts.map(p => (
                      <li key={p.id}>
                        <button type="button" onClick={() => navigate(`/products/${p.id}`)} className="flex w-full items-center justify-between gap-2 py-2 text-right hover:bg-gray-50">
                          <span className="min-w-0 truncate text-sm text-gray-900">{p.name}</span>
                          <span className={`whitespace-nowrap text-xs font-medium ${p.stockQuantity <= 0 ? 'text-red-600' : 'text-amber-700'}`}>
                            {formatQty(p.stockQuantity)} / حد {formatQty(p.minStockLevel)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !isLoading && <p className="text-sm text-gray-500">كل الأصناف فوق الحد الأدنى.</p>
                )}
              </section>

              <section className={`${card} flex items-center gap-3 p-5`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">العملاء</p>
                  <p className="text-xs text-gray-500">
                    {count(o?.activeCustomers)} اشتروا خلال آخر 30 يوم من {count(o?.customerCount)}
                  </p>
                </div>
                <Link to="/clients" className="text-sm font-medium text-primary-700 hover:underline">
                  العملاء
                </Link>
              </section>
            </div>
          </div>

          {/* Quick actions */}
          {quick.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-gray-900">إجراء سريع</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {quick.map(q => (
                  <Link
                    key={q.to}
                    to={q.to}
                    className={`${card} flex flex-col items-center gap-2 px-3 py-4 text-sm font-medium text-gray-800 transition hover:-translate-y-0.5 hover:border-primary-200 hover:text-primary-700`}
                  >
                    <q.icon className="h-6 w-6 text-primary-600" />
                    {q.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </Layout>
    </SessionRouteGuard>
  );
};

export default Dashboard;
