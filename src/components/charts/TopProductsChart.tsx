import React from 'react';
import { Card } from '../ui';
import { formatCurrency } from '../../utils';

export interface TopProduct {
  id: string;
  name: string;
  revenue: number;
  unitsSold: number;
}

const COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

/** The period's best sellers by sales value (real figures): name, bar, value; reads right-to-left */
const TopProductsChart: React.FC<{ data: TopProduct[]; isLoading?: boolean }> = ({ data, isLoading }) => {
  const max = Math.max(...data.map(p => p.revenue), 0);
  return (
    <Card padding="lg" shadow="xl">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-900">الأكثر مبيعاً</h3>
        <p className="text-sm text-gray-500">حسب قيمة المبيعات · آخر 30 يوم</p>
      </div>
      {isLoading ? (
        <div className="h-[220px] animate-pulse rounded-xl bg-gray-100" />
      ) : data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">لا توجد مبيعات في هذه الفترة</div>
      ) : (
        <ol className="space-y-3">
          {data.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[1.5rem_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[1.5rem_minmax(0,14rem)_minmax(0,1fr)_auto]">
              <span className="text-center text-xs font-semibold text-gray-400">{i + 1}</span>
              <span className="truncate text-sm font-medium text-gray-900" title={p.name}>
                {p.name}
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-gray-100">
                <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(3, (p.revenue / max) * 100) : 0}%`, backgroundColor: COLORS[i] || COLORS[4] }} />
              </span>
              <span className="whitespace-nowrap text-left">
                <span className="block text-sm font-semibold text-gray-900">{formatCurrency(p.revenue)}</span>
                <span className="block text-xs text-gray-500">{p.unitsSold} وحدة</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
};

export default TopProductsChart;
