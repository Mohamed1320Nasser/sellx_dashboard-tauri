import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '../ui';
import { formatCurrency } from '../../utils';
import { methodOf } from '../payments/paymentLabels';

export interface Collections {
  byMethod: { method: string; amount: number }[];
  total: number;
  /** what the period's invoices still owe */
  unpaid: number;
}

const COLOR: Record<string, string> = { CASH: '#10b981', CARD: '#3b82f6', MOBILE_WALLET: '#8b5cf6', BANK_TRANSFER: '#f59e0b' };

/** Money taken in the period, per payment method (real figures) */
const RevenueBreakdownChart: React.FC<{ data?: Collections; isLoading?: boolean }> = ({ data, isLoading }) => {
  const rows = (data?.byMethod || []).map(r => ({ ...r, name: methodOf(r.method).label, color: COLOR[r.method] || '#94a3b8' }));
  const total = data?.total || 0;
  return (
    <Card padding="lg" shadow="xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">المحصّل حسب طريقة الدفع</h3>
        <p className="text-sm text-gray-500">آخر 30 يوم · {formatCurrency(total)}</p>
      </div>
      {isLoading ? (
        <div className="h-[220px] animate-pulse rounded-xl bg-gray-100" />
      ) : total === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">لم يُحصّل مال في هذه الفترة</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={rows} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={rows.length > 1 ? 3 : 0}>
              {rows.map(r => (
                <Cell key={r.method} fill={r.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontFamily: 'Almarai', direction: 'rtl' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      {rows.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.method} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                {r.name}
              </span>
              <span className="text-left">
                <span className="block text-sm font-semibold text-gray-900">{formatCurrency(r.amount)}</span>
                <span className="block text-xs text-gray-500">
                  <bdi dir="ltr">{total ? Math.round((r.amount / total) * 1000) / 10 : 0}%</bdi>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {!isLoading && (data?.unpaid || 0) > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          لم يُحصّل بعد من فواتير الفترة: <b>{formatCurrency(data!.unpaid)}</b>
        </p>
      )}
    </Card>
  );
};

export default RevenueBreakdownChart;
