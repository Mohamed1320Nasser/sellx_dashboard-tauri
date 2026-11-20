import React from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, FileBarChart, Wallet } from 'lucide-react';
import { useProfitLossReport } from '../../hooks/api/useFinancialReports';
import { useSessionAuthStore } from '../../stores/sessionAuthStore';
import { formatCurrency, formatNumber } from '../../utils';

interface FinancialReportAnalyticsProps {
  /** the page's days (yyyy-MM-dd); empty = no limit */
  filters?: { startDate?: string; endDate?: string };
}

const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm';
const pct = (v?: number) => `⁦${(Number(v) || 0).toFixed(1)}%⁩`;

/** One line of the statement: label (and a note), amount; `minus` lines are taken off */
const Line: React.FC<{ label: string; note?: string; amount: number; minus?: boolean; tone?: string }> = ({ label, note, amount, minus, tone }) => (
  <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
    <span className="min-w-0 text-sm text-gray-700">
      {minus && <span className="ml-1 text-gray-400">−</span>}
      {label}
      {note && <span className="mr-2 text-xs text-gray-400">{note}</span>}
    </span>
    <span className={`whitespace-nowrap text-sm font-medium ${tone || 'text-gray-900'}`}>{minus && amount ? `(${formatCurrency(amount)})` : formatCurrency(amount)}</span>
  </div>
);

/** A result line: net sales, gross profit, net profit */
const Total: React.FC<{ label: string; amount: number; margin?: number; strong?: boolean }> = ({ label, amount, margin, strong }) => (
  <div className={`flex items-baseline justify-between gap-4 px-5 py-3 ${strong ? 'bg-gray-900 text-white' : 'border-y border-gray-200 bg-gray-50'}`}>
    <span className={`text-sm font-semibold ${strong ? '' : 'text-gray-900'}`}>
      {label}
      {margin != null && <span className={`mr-2 text-xs font-normal ${strong ? 'text-gray-300' : 'text-gray-500'}`}>هامش {pct(margin)}</span>}
    </span>
    <span className={`whitespace-nowrap font-bold ${strong ? 'text-lg' : 'text-base'} ${!strong && amount < 0 ? 'text-red-600' : ''}`}>{formatCurrency(amount)}</span>
  </div>
);

/**
 * The financial report for the chosen days: an income statement (sales → net profit)
 * and where the money went (cash flow, what is still owed). Same figures as the dashboard for the same days.
 */
const FinancialReportAnalytics: React.FC<FinancialReportAnalyticsProps> = ({ filters = {} }) => {
  const { company } = useSessionAuthStore();
  const range = {
    ...(filters.startDate?.trim() && { startDate: filters.startDate }),
    ...(filters.endDate?.trim() && { endDate: filters.endDate }),
  };
  const { data, isLoading, error } = useProfitLossReport(range);
  const pl: any = data;

  if (!company?.companyId) return null;
  if (error) {
    return (
      <div className={`${card} flex items-center gap-2 p-5 text-sm text-red-700`}>
        <AlertCircle className="h-5 w-5" /> تعذر تحميل التقرير المالي لهذه الفترة.
      </div>
    );
  }
  if (isLoading || !pl) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const r = pl.revenue || {};
  const c = pl.costs || {};
  const p = pl.profit || {};
  const cash = pl.cashFlow || {};

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Income statement */}
      <section className={`${card} overflow-hidden`}>
        <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <FileBarChart className="h-5 w-5 text-primary-600" />
          <h3 className="text-base font-semibold text-gray-900">قائمة الدخل</h3>
        </header>
        <Line
          label="المبيعات"
          note={`${formatNumber(r.totalSalesOrders || 0)} فاتورة${r.discounts ? ` · بعد خصومات ${formatCurrency(r.discounts)}` : ''}`}
          amount={r.totalRevenue || 0}
        />
        <Line label="المرتجعات" note={`${formatNumber(r.totalReturnOrders || 0)} مرتجع`} amount={r.totalReturns || 0} minus tone="text-red-600" />
        {!!r.taxCollected && <Line label="الضريبة المحصلة" note="تُورَّد للدولة" amount={r.taxCollected} minus />}
        <Total label="صافي المبيعات" amount={r.netRevenue || 0} />
        <Line label="تكلفة البضاعة المباعة" note="بسعر الشراء وقت البيع" amount={c.costOfGoodsSold || 0} minus />
        <Total label="مجمل الربح" amount={p.grossProfit || 0} margin={p.grossProfitMargin} />
        <Line label="المصروفات" note={`${formatNumber(c.totalExpenseCount || 0)} مصروف، منها الرواتب`} amount={c.operatingExpenses || 0} minus />
        <Total label="صافي الربح" amount={p.netProfit || 0} margin={p.netProfitMargin} strong />
      </section>

      {/* Cash and what is owed */}
      <div className="space-y-5">
        <section className={`${card} overflow-hidden`}>
          <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <Wallet className="h-5 w-5 text-primary-600" />
            <h3 className="text-base font-semibold text-gray-900">حركة النقد</h3>
          </header>
          <Line label="المحصّل من فواتير الفترة" amount={cash.salesReceived || 0} tone="text-emerald-700" />
          <Line label="المدفوع للموردين" amount={cash.purchasesPaid || 0} minus />
          <Line label="المصروفات المدفوعة" amount={cash.expensesPaid || 0} minus />
          <Line label="المردود للعملاء" amount={cash.refundsPaid || 0} minus />
          <Total label="صافي حركة النقد" amount={cash.netCashFlow || 0} />
        </section>

        <section className={`${card} p-5`}>
          <h3 className="mb-3 text-base font-semibold text-gray-900">المستحقات من فواتير الفترة</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <ArrowDownLeft className="h-4 w-4 text-emerald-600" /> على العملاء
              </span>
              <span className="text-sm font-semibold text-gray-900">{formatCurrency(cash.salesOutstanding || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <ArrowUpRight className="h-4 w-4 text-red-600" /> للموردين
              </span>
              <span className="text-sm font-semibold text-gray-900">{formatCurrency(cash.purchasesOutstanding || 0)}</span>
            </div>
            <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
              مشتريات الفترة {formatCurrency(c.totalPurchases || 0)} ({formatNumber(c.totalPurchaseOrders || 0)} فاتورة): تدخل المخزون، ولا تُحسب في الربح إلا عند البيع.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FinancialReportAnalytics;
