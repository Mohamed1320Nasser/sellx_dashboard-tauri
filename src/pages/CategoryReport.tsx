import React, { useState, useMemo, useCallback } from 'react';
import {
  Folder,
  Package,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Card, DataTable, Badge, Select, StatsCard } from '../components/ui';
import type { Column } from '../components/ui/DataTable';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useQuery } from '@tanstack/react-query';
import { categoryService } from '../services/categoryService';
import type { CategoryReportProduct } from '../services/categoryService';
import { useCategories } from '../hooks/api/useCategories';
import { formatCurrency, formatNumber } from '../utils';
import {
  exportReportToPdf,
  exportReportToExcel,
  type ReportColumn,
} from '../utils/reportExport';
import toast from 'react-hot-toast';

interface FlatRow extends CategoryReportProduct {
  categoryName: string;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'error' }> = {
  IN_STOCK: { label: 'متوفر', variant: 'success' },
  LOW_STOCK: { label: 'منخفض', variant: 'warning' },
  OUT_OF_STOCK: { label: 'نفذ', variant: 'error' },
};

const CategoryReport: React.FC = () => {
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;
  const companyName = company?.name || company?.company?.name || company?.companyName || '';

  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: categoriesData } = useCategories({ companyId: companyId!, limit: 100 });

  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['category-report', companyId, selectedCategory, searchTerm],
    queryFn: () =>
      categoryService.getReport({
        companyId: companyId!,
        categoryId: selectedCategory || undefined,
        search: searchTerm || undefined,
      }),
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const report = reportData?.data;
  const summary = report?.summary;

  // Flatten category → products into table rows
  const rows: FlatRow[] = useMemo(() => {
    if (!report?.categories) return [];
    return report.categories.flatMap((cat) =>
      cat.products.map((p) => ({ ...p, categoryName: cat.name }))
    );
  }, [report]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'جميع الفئات' },
      ...((categoriesData?.data?.list || []).map((c) => ({ value: c.id, label: c.name }))),
    ],
    [categoriesData]
  );

  const columns: Column<FlatRow>[] = [
    {
      key: 'name',
      label: 'المنتج',
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center text-white">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{p.name}</p>
            <p className="text-xs text-gray-500">SKU: {p.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'categoryName', label: 'الفئة', render: (p) => <Badge variant="primary">{p.categoryName}</Badge> },
    { key: 'stockQuantity', label: 'المخزون', render: (p) => <span className="font-medium">{formatNumber(p.stockQuantity)}</span> },
    { key: 'purchasePrice', label: 'سعر الشراء', render: (p) => formatCurrency(p.purchasePrice) },
    { key: 'sellingPrice', label: 'سعر البيع', render: (p) => formatCurrency(p.sellingPrice) },
    { key: 'stockValue', label: 'قيمة المخزون', render: (p) => formatCurrency(p.stockValue) },
    {
      key: 'status',
      label: 'الحالة',
      render: (p) => {
        const cfg = statusConfig[p.status] || statusConfig.IN_STOCK;
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
  ];

  const handleSearch = useCallback((value: string) => setSearchTerm(value), []);

  const exportColumns: ReportColumn<FlatRow>[] = useMemo(
    () => [
      { header: 'المنتج', accessor: (p) => p.name },
      { header: 'SKU', accessor: (p) => p.sku },
      { header: 'الفئة', accessor: (p) => p.categoryName },
      { header: 'المخزون', accessor: (p) => p.stockQuantity, format: 'number' },
      { header: 'الحد الأدنى', accessor: (p) => p.minStockLevel, format: 'number' },
      { header: 'سعر الشراء', accessor: (p) => p.purchasePrice, format: 'currency' },
      { header: 'سعر البيع', accessor: (p) => p.sellingPrice, format: 'currency' },
      { header: 'قيمة المخزون', accessor: (p) => p.stockValue, format: 'currency' },
      {
        header: 'الحالة',
        accessor: (p) => (statusConfig[p.status] || statusConfig.IN_STOCK).label,
      },
    ],
    []
  );

  const buildMeta = useCallback(() => {
    const categoryLabel =
      categoryOptions.find((o) => o.value === selectedCategory)?.label || 'جميع الفئات';
    return {
      title: 'تقرير الفئات',
      companyName,
      subtitle: `الفئة: ${categoryLabel}`,
      fileName: 'تقرير-الفئات',
      summary: summary
        ? [
            { label: 'عدد الفئات', value: formatNumber(summary.totalCategories) },
            { label: 'عدد المنتجات', value: formatNumber(summary.totalProducts) },
            { label: 'منتجات منخفضة المخزون', value: formatNumber(summary.totalLowStock) },
            { label: 'الربح المتوقع', value: formatCurrency(summary.totalPotentialProfit) },
            { label: 'إجمالي قيمة المخزون', value: formatCurrency(summary.totalStockValue), emphasis: true },
          ]
        : undefined,
    };
  }, [categoryOptions, selectedCategory, companyName, summary]);

  const handleExportPdf = useCallback(async () => {
    if (rows.length === 0) return toast.error('لا توجد بيانات للتصدير');
    try {
      await exportReportToPdf(rows, exportColumns, buildMeta());
    } catch {
      toast.error('تعذر تصدير ملف PDF');
    }
  }, [rows, exportColumns, buildMeta]);

  const handleExportExcel = useCallback(async () => {
    if (rows.length === 0) return toast.error('لا توجد بيانات للتصدير');
    try {
      await exportReportToExcel(rows, exportColumns, buildMeta());
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    }
  }, [rows, exportColumns, buildMeta]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">تقرير الفئات</h1>
            <p className="text-gray-600 mt-1">المنتجات والمخزون والأسعار حسب الفئة</p>
          </div>
          <div className="flex space-x-3 space-x-reverse">
            <Button variant="outline" onClick={handleExportPdf} className="flex items-center">
              <FileText className="w-4 h-4 ml-1" /> PDF
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="flex items-center">
              <FileSpreadsheet className="w-4 h-4 ml-1" /> Excel
            </Button>
            <Button variant="outline" onClick={() => refetch()} className="flex items-center">
              <RefreshCw className="w-4 h-4 ml-1" /> تحديث
            </Button>
          </div>
        </div>

        {/* Page-level filter */}
        <Card padding="md">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Folder className="w-4 h-4 text-primary-600" />
              <span>الفئة</span>
            </div>
            <div className="min-w-[220px]">
              <Select
                options={categoryOptions}
                value={selectedCategory}
                onChange={(v) => setSelectedCategory(v)}
                placeholder="اختر الفئة"
              />
            </div>
          </div>
        </Card>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatsCard
              title="إجمالي المنتجات"
              value={formatNumber(summary.totalProducts)}
              icon={Package}
              color="primary"
            />
            <StatsCard
              title="قيمة المخزون"
              value={formatCurrency(summary.totalStockValue)}
              icon={TrendingUp}
              color="success"
            />
            <StatsCard
              title="عدد الفئات"
              value={formatNumber(summary.totalCategories)}
              icon={Folder}
              color="primary"
            />
            <StatsCard
              title="مخزون منخفض"
              value={formatNumber(summary.totalLowStock)}
              icon={AlertTriangle}
              color="danger"
            />
          </div>
        )}

        {/* Products table */}
        <DataTable<FlatRow>
          title="منتجات الفئات"
          columns={columns}
          data={rows}
          loading={isLoading}
          searchPlaceholder="البحث في المنتجات..."
          onSearch={handleSearch}
          emptyMessage="لا توجد منتجات في الفئات المحددة"
        />
      </div>
    </Layout>
  );
};

export default CategoryReport;
