import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlarmClock,
  BarChart3,
  Calculator,
  ClipboardList,
  Folder,
  Hourglass,
  Landmark,
  PackageSearch,
  Receipt,
  ShoppingBasket,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { usePermissionStore } from '../stores/permissionStore';

interface ReportCard {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  permission?: 'canViewFinancialReports' | 'canViewAnalytics';
}

const GROUPS: { title: string; items: ReportCard[] }[] = [
  {
    title: 'اليومية',
    items: [
      { title: 'تقرير نهاية اليوم', description: 'مبيعات اليوم، الداخل والخارج بكل طريقة دفع، الأدراج وفروقها، والأصناف المباعة. جاهز للطباعة.', icon: ClipboardList, to: '/reports/end-of-day', permission: 'canViewFinancialReports' },
      { title: 'المبيعات حسب الكاشير', description: 'مبيعات كل كاشير وفواتيره ومرتجعاته وفروق ورديته لأي فترة.', icon: Users },
    ],
  },
  {
    title: 'المالية',
    items: [
      { title: 'التقارير المالية', description: 'قائمة الدخل حتى صافي الربح، وحركة النقد، وفواتير البيع للفترة.', icon: Calculator, to: '/financial-reports', permission: 'canViewFinancialReports' },
      { title: 'أعمار ديون العملاء', description: 'من عليه فلوس، وكم مضى عليها: 0–30، 31–60، 61–90، أكثر من 90 يوم.', icon: Hourglass },
      { title: 'أعمار مستحقات الموردين', description: 'ما علينا للموردين، والمتأخر منه حسب تاريخ الاستحقاق.', icon: AlarmClock },
      { title: 'تقرير الضريبة', description: 'ضريبة المبيعات المحصلة ناقص ضريبة المشتريات، شهرياً.', icon: Landmark },
    ],
  },
  {
    title: 'المبيعات والمخزون',
    items: [
      { title: 'التحليلات', description: 'اتجاه المبيعات، أداء المنتجات، العملاء، والمخزون.', icon: BarChart3, to: '/analytics', permission: 'canViewAnalytics' },
      { title: 'تقرير الفئات', description: 'المبيعات والربح لكل فئة منتجات.', icon: Folder, to: '/category-report', permission: 'canViewFinancialReports' },
      { title: 'قيمة المخزون', description: 'قيمة البضاعة الموجودة بسعر التكلفة وبسعر البيع، لكل فئة.', icon: Warehouse },
      { title: 'الأصناف الراكدة', description: 'أصناف لم تُبع منذ مدة، والفلوس المحبوسة فيها.', icon: PackageSearch },
      { title: 'تقرير إعادة الطلب', description: 'ماذا تشتري وكم، ومن أي مورد، حسب سرعة البيع والحد الأدنى.', icon: ShoppingBasket },
    ],
  },
];

/** Every report in one place; the ones not built yet are marked "soon" */
const Reports: React.FC = () => {
  const can = usePermissionStore(s => s.hasPermission);
  return (
    <Layout>
      <div className="w-full space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Receipt className="h-6 w-6 text-primary-600" /> كل التقارير
          </h1>
          <p className="mt-1 text-sm text-gray-600">كل تقرير يستخدم نفس حسابات لوحة التحكم، فالأرقام واحدة في كل مكان</p>
        </div>
        {GROUPS.map(group => {
          const items = group.items.filter(i => !i.permission || can(i.permission));
          if (!items.length) return null;
          return (
            <section key={group.title}>
              <h2 className="mb-3 text-sm font-semibold text-gray-500">{group.title}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map(item => {
                  const Icon = item.icon;
                  const body = (
                    <>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.to ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className={`flex items-center gap-2 font-semibold ${item.to ? 'text-gray-900' : 'text-gray-500'}`}>
                          {item.title}
                          {!item.to && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">قريباً</span>}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-gray-500">{item.description}</p>
                      </div>
                    </>
                  );
                  return item.to ? (
                    <Link key={item.title} to={item.to} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow">
                      {body}
                    </Link>
                  ) : (
                    <div key={item.title} className="flex gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4" aria-disabled>
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Layout>
  );
};

export default Reports;
