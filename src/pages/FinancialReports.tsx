import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSalesReport } from '../hooks/api/useFinancialReports';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { ReportPeriod } from '../types/business';
import { formatCurrency, formatNumber } from '../utils';
import { formatTableDate, toLocalDay } from '../utils/dateUtils';
import { DateRange, DateRangeFilter } from '../components/filters';
import {
  Eye,
  AlertCircle,
  RefreshCw,
  Receipt,
  User,
  Calendar,
  Package,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { DataTable, Card, Select } from '../components/ui';
import type { Column } from '../components/ui/DataTable';
import { FinancialReportAnalytics } from '../components/financialReports';
import { Layout } from '../components/layout';
import {
  exportReportToPdf,
  exportReportToExcel,
  type ReportColumn,
} from '../utils/reportExport';
import toast from 'react-hot-toast';
import { HeaderAction } from '../components/common/HeaderAction';

const DAYS_OF: Partial<Record<ReportPeriod, number>> = {
  [ReportPeriod.DAILY]: 1,
  [ReportPeriod.WEEKLY]: 7,
  [ReportPeriod.MONTHLY]: 30,
  [ReportPeriod.QUARTERLY]: 90,
  [ReportPeriod.YEARLY]: 365,
};

/** The chosen period as whole days ending today (or the custom days); empty = no limit */
function rangeOf(period: ReportPeriod, custom: DateRange): { startDate?: string; endDate?: string } {
  if (period === ReportPeriod.CUSTOM) {
    return {
      ...(custom.startDate?.trim() && { startDate: custom.startDate }),
      ...(custom.endDate?.trim() && { endDate: custom.endDate }),
    };
  }
  const days = DAYS_OF[period] || 30;
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { startDate: toLocalDay(from), endDate: toLocalDay(new Date()) };
}

const FinancialReports: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    dateRange: { startDate: '', endDate: '' } as DateRange,
    period: ReportPeriod.MONTHLY as ReportPeriod,
  });

  // One date range for everything on the page (cards, best sellers, chart, table, export)
  const range = useMemo(() => rangeOf(filters.period, filters.dateRange), [filters.period, filters.dateRange]);

  // Get sales report data
  const { data: salesData, isLoading, error, refetch } = useSalesReport({
    page: currentPage,
    limit: pageSize,
    ...(searchTerm && { search: searchTerm }),
    ...range,
  });

  // Computed values
  const sales = useMemo(() => salesData?.list || [], [salesData]);
  const totalCount = salesData?.totalCount || 0;


  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const handlePeriodChange = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, period: value as ReportPeriod }));
    setCurrentPage(1);
  }, []);

  const handleDateRangeChange = useCallback((dateRange: DateRange) => {
    setFilters(prev => ({ ...prev, dateRange }));
    setCurrentPage(1);
  }, []);

  // Filter options
  const periodOptions = useMemo(() => [
    { value: ReportPeriod.DAILY, label: 'اليوم' },
    { value: ReportPeriod.WEEKLY, label: 'آخر 7 أيام' },
    { value: ReportPeriod.MONTHLY, label: 'آخر 30 يوم' },
    { value: ReportPeriod.QUARTERLY, label: 'آخر 90 يوم' },
    { value: ReportPeriod.YEARLY, label: 'آخر سنة' },
    { value: ReportPeriod.CUSTOM, label: 'فترة مخصصة' },
  ], []);

  const handleViewDetails = (sale: any) => {
    // Navigate to the existing SalesDetails page
    navigate(`/sales/${sale.id}`);
  };


  const handleRefresh = () => {
    refetch();
  };

  // Columns for the exported report (PDF + Excel) — numeric values stay numeric
  const exportColumns: ReportColumn<any>[] = useMemo(() => [
    { header: 'رقم الإيصال', accessor: (s) => s.receiptNumber },
    { header: 'تاريخ البيع', accessor: (s) => formatTableDate(s.saleDate) },
    { header: 'العميل', accessor: (s) => s.client?.name || 'عميل عام' },
    { header: 'المبلغ', accessor: (s) => Number(s.totalAmount ?? 0), format: 'currency' },
    { header: 'الربح', accessor: (s) => Number(s.totalProfit ?? 0), format: 'currency' },
    { header: 'حالة الدفع', accessor: (s) => ({ PAID: 'مدفوع', PARTIAL: 'جزئي', UNPAID: 'غير مدفوع' }[(s.paymentStatus as string) || 'PAID'] || 'مدفوع') },
    { header: 'الأصناف', accessor: (s) => Number(s._count?.items ?? 0), format: 'number' },
    { header: 'الموظف', accessor: (s) => s.user?.fullname || 'غير محدد' },
  ], []);

  const periodLabel = useMemo(
    () => periodOptions.find((o) => o.value === filters.period)?.label || '',
    [periodOptions, filters.period]
  );

  const buildReportMeta = useCallback(() => {
    const summary = salesData?.summary;
    const companyName =
      company?.name || company?.company?.name || company?.companyName || '';
    const subtitleParts = [`الفترة: ${periodLabel}`];
    if (range.startDate || range.endDate) {
      subtitleParts.push(`${range.startDate || 'البداية'} → ${range.endDate || 'اليوم'}`);
    }
    return {
      title: 'تقرير المبيعات',
      companyName,
      subtitle: subtitleParts.join(' — '),
      fileName: 'تقرير-المبيعات',
      summary: summary
        ? [
            { label: 'عدد الطلبات', value: formatNumber(summary.totalOrders) },
            { label: 'إجمالي الربح', value: formatCurrency(summary.totalProfit) },
            { label: 'المبالغ المستحقة', value: formatCurrency(summary.outstandingBalance) },
            { label: 'إجمالي المبيعات', value: formatCurrency(summary.totalSales), emphasis: true },
          ]
        : undefined,
    };
  }, [salesData, company, periodLabel, range]);

  const handleExportPdf = useCallback(async () => {
    if (sales.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    try {
      await exportReportToPdf(sales, exportColumns, buildReportMeta());
    } catch {
      toast.error('تعذر تصدير ملف PDF');
    }
  }, [sales, exportColumns, buildReportMeta]);

  const handleExportExcel = useCallback(async () => {
    if (sales.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    try {
      await exportReportToExcel(sales, exportColumns, buildReportMeta());
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    }
  }, [sales, exportColumns, buildReportMeta]);

  const columns: Column<any>[] = [
    {
      key: 'receiptNumber',
      label: 'رقم الإيصال',
      render: (sale: any) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/30">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-primary-600">#{sale.receiptNumber}</span>
        </div>
      ),
    },
    {
      key: 'saleDate',
      label: 'تاريخ البيع',
      render: (sale: any) => (
        <div className="flex items-center text-gray-600">
          <Calendar className="w-4 h-4 ml-1" />
          {formatTableDate(sale.saleDate)}
        </div>
      ),
    },
    {
      key: 'client',
      label: 'العميل',
      render: (sale: any) => (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-900">{sale.client?.name || 'عميل عام'}</span>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      label: 'المبلغ',
      render: (sale: any) => (
        <span className="text-gray-900 font-medium">{formatCurrency(sale.totalAmount)}</span>
      ),
    },
    {
      key: 'profit',
      label: 'الربح',
      render: (sale: any) => {
        const profit = sale.totalProfit ?? 0;
        return (
          <span className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(profit)}
          </span>
        );
      },
    },
    {
      key: 'paymentStatus',
      label: 'حالة الدفع',
      render: (sale: any) => {
        const status = sale.paymentStatus || 'PAID';
        const config: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
          PAID: { label: 'مدفوع', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
          PARTIAL: { label: 'جزئي', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
          UNPAID: { label: 'غير مدفوع', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
        };
        const statusConfig = config[status] || config.PAID;
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
            {statusConfig.icon}
            {statusConfig.label}
          </span>
        );
      },
    },
    {
      key: 'items',
      label: 'الأصناف',
      render: (sale: any) => (
        <div className="flex items-center gap-1">
          <Package className="w-4 h-4 text-primary-600" />
          <span className="font-medium text-primary-600">{sale._count?.items || 0}</span>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'الموظف',
      render: (sale: any) => (
        <span className="text-sm text-gray-600">{sale.user?.fullname || 'غير محدد'}</span>
      ),
    },
  ];

  // Check if company is available
  if (!company || !company.companyId || company.companyId === 0) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">خطأ في المصادقة</h2>
            <p className="text-gray-600">يرجى التأكد من تسجيل الدخول والانضمام لشركة</p>
            <p className="text-sm text-gray-500 mt-2">يرجى التأكد من تسجيل الدخول والانضمام لشركة صالحة</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">التقارير المالية</h1>
            <p className="text-gray-600 mt-1">
              قائمة الدخل وحركة النقد وفواتير البيع للفترة المختارة
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderAction icon={FileText} label="PDF" onClick={handleExportPdf} />
            <HeaderAction icon={FileSpreadsheet} label="Excel" onClick={handleExportExcel} />
            <HeaderAction icon={RefreshCw} label="تحديث" onClick={handleRefresh} iconOnly />
          </div>
        </div>

        {/* Page-level Period Filter — governs the whole page (analytics, table, exports) */}
        <Card padding="md">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Calendar className="w-4 h-4 text-primary-600" />
              <span>الفترة الزمنية</span>
            </div>
            <div className="min-w-[200px]">
              <Select
                options={periodOptions}
                value={filters.period}
                onChange={(value) => handlePeriodChange(value)}
                placeholder="اختر الفترة"
              />
            </div>
            {filters.period === ReportPeriod.CUSTOM && (
              <DateRangeFilter
                value={filters.dateRange}
                onChange={handleDateRangeChange}
                size="md"
                showPresets
                showClearButton
                showResetButton={false}
              />
            )}
            <span className="text-xs text-gray-400 mr-auto">
              تُطبَّق على قائمة الدخل والفواتير والتصدير
            </span>
          </div>
        </Card>

        {/* Income statement + cash for the chosen days */}
        <FinancialReportAnalytics filters={range} />

        {/* Error Display */}
        {error && (
          <Card padding="lg">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-400 ml-2" />
              <div>
                <h3 className="text-sm font-medium text-red-800">خطأ في تحميل البيانات</h3>
                <p className="text-sm text-red-600 mt-1">
                  حدث خطأ في تحميل تقارير المبيعات. يرجى المحاولة مرة أخرى.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Sales Report Table */}
        <DataTable<any>
          title="تقرير المبيعات"
          columns={columns}
          data={sales}
          loading={isLoading}
          searchPlaceholder="البحث في أرقام الإيصالات..."
          onSearch={handleSearch}
          actions={[
            {
              icon: Eye,
              label: "عرض التفاصيل",
              onClick: (sale) => handleViewDetails(sale),
              variant: "primary",
            },
          ]}
          totalItems={totalCount}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          emptyMessage="لا توجد مبيعات حتى الآن"
        />
      </div>
    </Layout>
  );
};

export default FinancialReports;
