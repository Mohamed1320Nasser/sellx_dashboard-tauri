import React, { useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, RotateCcw, Eye, CheckCircle, XCircle, Clock, DollarSign, Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { Button, StatisticsCard, DataTable, Badge } from "../components/ui";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import type { Column, TableFilter } from "../components/ui/DataTable";
import { DateRangeFilter, type DateRange } from "../components/filters";
import { formatCurrency, formatNumber } from "../utils";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useReturns, useReturnStatistics, useUpdateReturnStatus, useDeleteReturn } from "../hooks/api/useReturns";
import { returnService } from "../services/returnService";
import { formatTableDate } from "../utils/dateUtils";
import { exportReportToExcel, type ReportColumn } from "../utils/reportExport";
import { methodOf } from "../components/payments/paymentLabels";
import { RETURN_STATUS } from "../components/returns/returnLabels";
import type { Return } from "../types";
import { ReturnStatus } from "../types";

const STATUS_OPTIONS = [
  { value: "", label: "جميع الحالات" },
  { value: "PENDING", label: "في الانتظار" },
  { value: "COMPLETED", label: "مكتمل" },
  { value: "REJECTED", label: "مرفوض" },
];

const Returns: React.FC = () => {
  const navigate = useNavigate();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const companyName = (company as any)?.name || company?.company?.name || "";
  const canManage = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "">("");
  const [range, setRange] = useState<DateRange>({ startDate: "", endDate: "" });
  const [toDelete, setToDelete] = useState<Return | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = {
    companyId,
    search: searchTerm || undefined,
    status: statusFilter || undefined,
    startDate: range.startDate || undefined,
    endDate: range.endDate || undefined,
  };
  const { data: returnsData, isLoading } = useReturns({ ...filters, page: currentPage, limit: pageSize });
  const { data: statistics, isLoading: statsLoading } = useReturnStatistics(companyId, range.startDate || undefined, range.endDate || undefined);
  const updateStatusMutation = useUpdateReturnStatus();
  const deleteMutation = useDeleteReturn();

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const tableFilters: TableFilter[] = useMemo(
    () => [
      {
        key: "status",
        label: "الحالة",
        type: "select",
        options: STATUS_OPTIONS,
        value: statusFilter,
        onChange: (value) => {
          setStatusFilter(value as ReturnStatus | "");
          setCurrentPage(1);
        },
      },
    ],
    [statusFilter]
  );

  const columns: Column<Return>[] = [
    {
      key: "returnNumber",
      label: "رقم المرتجع",
      render: (r: Return) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <RotateCcw className="h-4 w-4 text-orange-600" />
          </div>
          <span className="font-mono font-medium text-primary-700" dir="ltr">{r.returnNumber || "-"}</span>
        </div>
      ),
    },
    {
      key: "originalSale",
      label: "الفاتورة",
      render: (r: Return) =>
        r.originalSale ? (
          <Link
            to={`/sales/${r.originalSale.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-sm text-primary-700 hover:underline"
            dir="ltr"
          >
            {r.originalSale.receiptNumber}
          </Link>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: "client",
      label: "العميل",
      render: (r: Return) =>
        r.client?.name ? (
          <div>
            <div className="font-medium text-gray-900">{r.client.name}</div>
            {r.client.phone && <div className="text-xs text-gray-500" dir="ltr">{r.client.phone}</div>}
          </div>
        ) : (
          <span className="text-gray-500">عميل نقدي</span>
        ),
    },
    {
      key: "totalAmount",
      label: "قيمة المرتجع",
      render: (r: Return) => <span className="font-semibold text-gray-900">{formatCurrency(Number(r.totalAmount) || 0)}</span>,
    },
    {
      key: "refundAmount",
      label: "المردود",
      render: (r: Return) =>
        Number(r.refundAmount) > 0 ? (
          <div>
            <div className="font-semibold text-green-700">{formatCurrency(Number(r.refundAmount))}</div>
            <div className="text-xs text-gray-500">{methodOf(r.refundMethod || "CASH").label}</div>
          </div>
        ) : (
          <span className="text-xs text-gray-500">خصم من المديونية</span>
        ),
    },
    {
      key: "status",
      label: "الحالة",
      render: (r: Return) => {
        const info = RETURN_STATUS[r.status || "PENDING"] || RETURN_STATUS.PENDING;
        return <Badge variant={info.variant}>{info.label}</Badge>;
      },
    },
    {
      key: "returnDate",
      label: "التاريخ",
      render: (r: Return) => <span className="text-gray-600">{r.returnDate ? formatTableDate(new Date(r.returnDate)) : "-"}</span>,
    },
  ];

  const setStatus = (id: string, status: ReturnStatus) =>
    updateStatusMutation.mutate({ id, data: { status, companyId } });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res: any = await returnService.getList({ ...filters, page: 1, limit: 1000 });
      const rows: Return[] = res?.data?.list || [];
      const exportColumns: ReportColumn<Return>[] = [
        { header: "رقم المرتجع", accessor: (r) => r.returnNumber },
        { header: "الفاتورة", accessor: (r) => r.originalSale?.receiptNumber || "" },
        { header: "العميل", accessor: (r) => r.client?.name || "عميل نقدي" },
        { header: "هاتف العميل", accessor: (r) => r.client?.phone || "" },
        { header: "قيمة المرتجع", accessor: (r) => Number(r.totalAmount) || 0, format: "currency" },
        { header: "المردود", accessor: (r) => Number(r.refundAmount) || 0, format: "currency" },
        { header: "طريقة الرد", accessor: (r) => (Number(r.refundAmount) > 0 ? methodOf(r.refundMethod || "CASH").label : "") },
        { header: "الحالة", accessor: (r) => RETURN_STATUS[r.status]?.label || r.status },
        { header: "التاريخ", accessor: (r) => (r.returnDate ? formatTableDate(new Date(r.returnDate)) : "") },
      ];
      const sum = (f: (r: Return) => number) => rows.reduce((s, r) => s + f(r), 0);
      await exportReportToExcel(rows, exportColumns, {
        title: "المرتجعات",
        companyName,
        subtitle: range.startDate || range.endDate ? `من ${range.startDate || "البداية"} حتى ${range.endDate || "اليوم"}` : undefined,
        summary: [
          { label: "عدد المرتجعات", value: rows.length },
          { label: "قيمة المرتجعات", value: formatCurrency(sum((r) => Number(r.totalAmount) || 0)) },
          { label: "إجمالي المردود", value: formatCurrency(sum((r) => Number(r.refundAmount) || 0)), emphasis: true },
        ],
        fileName: "المرتجعات",
      });
    } catch {
      toast.error("تعذر تصدير ملف Excel");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <RotateCcw className="h-6 w-6" />
              مرتجعات المبيعات
            </h1>
            <p className="mt-1 text-gray-600">ما أعاده العملاء من فواتيرهم وما رُد لهم</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter
              value={range}
              onChange={(r) => {
                setRange(r);
                setCurrentPage(1);
              }}
              size="sm"
            />
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="flex items-center gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Excel
            </Button>
            <Button onClick={() => navigate("/returns/create")} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              إرجاع جديد
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatisticsCard title="في الانتظار" value={formatNumber(statistics?.pendingReturns || 0)} icon={Clock} color="#F59E0B" isLoading={statsLoading} />
          <StatisticsCard title="مكتمل" value={formatNumber(statistics?.completedReturns || 0)} icon={CheckCircle} color="#10B981" isLoading={statsLoading} />
          <StatisticsCard title="مرفوض" value={formatNumber(statistics?.rejectedReturns || 0)} icon={XCircle} color="#EF4444" isLoading={statsLoading} />
          <StatisticsCard title="إجمالي المردود" value={formatCurrency(statistics?.totalRefundAmount || 0)} icon={DollarSign} color="#8B5CF6" isLoading={statsLoading} />
        </div>

        <DataTable<Return>
          title="جميع المرتجعات"
          columns={columns}
          data={returnsData?.data?.list || []}
          loading={isLoading}
          searchPlaceholder="ابحث برقم المرتجع أو الفاتورة أو اسم العميل أو هاتفه"
          onSearch={handleSearch}
          filters={tableFilters}
          onClearFilters={() => {
            setStatusFilter("");
            setCurrentPage(1);
          }}
          actions={[
            { icon: Eye, label: "عرض التفاصيل", onClick: (r) => navigate(`/returns/${r.id}`), variant: "primary" },
            {
              icon: CheckCircle,
              label: "اعتماد",
              onClick: (r) => setStatus(r.id, ReturnStatus.COMPLETED),
              variant: "success",
              show: (r) => canManage && r.status === "PENDING",
            },
            {
              icon: XCircle,
              label: "رفض",
              onClick: (r) => setStatus(r.id, ReturnStatus.REJECTED),
              variant: "danger",
              show: (r) => canManage && r.status === "PENDING",
            },
            {
              icon: Trash2,
              label: "حذف",
              onClick: (r) => setToDelete(r),
              variant: "danger",
              show: (r) => canManage && r.status === "PENDING",
            },
          ]}
          totalItems={returnsData?.data?.totalCount || 0}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setCurrentPage(1);
          }}
          emptyMessage={searchTerm || statusFilter || range.startDate || range.endDate ? "لا توجد مرتجعات مطابقة" : "لا توجد مرتجعات بعد"}
        />

        <ConfirmDialog
          isOpen={!!toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            if (toDelete) deleteMutation.mutate({ id: toDelete.id, companyId }, { onSettled: () => setToDelete(null) });
          }}
          title="حذف المرتجع"
          message={`سيُحذف المرتجع ${toDelete?.returnNumber || ""} المعلّق. لم يُعتمد بعد، فلا يتغير المخزون ولا المديونية.`}
          confirmText="حذف"
          type="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default Returns;
