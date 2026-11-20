import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import { formatCurrency } from '../../utils';

export interface DailySale {
  /** yyyy-MM-dd (shop day) */
  date: string;
  revenue: number;
  orders: number;
}

const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Sales per day for the dashboard's period (real figures, one point per day) */
const SalesOverviewChart: React.FC<{ data: DailySale[]; isLoading?: boolean }> = ({ data, isLoading }) => {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const best = data.reduce<DailySale | null>((b, d) => (!b || d.revenue > b.revenue ? d : b), null);
  return (
    <Card padding="lg" shadow="xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">المبيعات اليومية</h3>
          <p className="text-sm text-gray-500">آخر {data.length || 30} يوم</p>
        </div>
        {best && best.revenue > 0 && (
          <p className="text-left text-xs text-gray-500">
            أعلى يوم <bdi className="font-medium text-gray-700">{dayLabel(best.date)}</bdi>
            <span className="block font-semibold text-gray-900">{formatCurrency(best.revenue)}</span>
          </p>
        )}
      </div>
      {isLoading ? (
        <div className="h-[280px] animate-pulse rounded-xl bg-gray-100" />
      ) : total === 0 ? (
        <div className="flex h-[280px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">لا توجد مبيعات في هذه الفترة</div>
      ) : (
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} stroke="#94a3b8" tick={{ fontSize: 11 }} minTickGap={16} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
              <Tooltip
                contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontFamily: 'Almarai', direction: 'rtl' }}
                labelFormatter={(d: string) => dayLabel(d)}
                formatter={(value: number, _name, item: any) => [`${formatCurrency(value)} · ${item?.payload?.orders || 0} فاتورة`, 'المبيعات']}
              />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#salesFill)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default SalesOverviewChart;
