import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Hash, PackageMinus, RotateCcw, Trash2, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { StatisticsCard, DataTable } from "../components/ui";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import type { Column } from "../components/ui/DataTable";
import { DateRangeFilter, type DateRange } from "../components/filters";
import { formatCurrency, formatNumber } from "../utils";
import { formatTableDate } from "../utils/dateUtils";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { supplierReturnService } from "../services/supplierReturnService";
import { useDeleteSupplierReturn } from "../hooks/api/usePurchases";
import { methodOf } from "../components/payments/paymentLabels";
import { exportReportToExcel, type ReportColumn } from "../utils/reportExport";
import { HeaderAction } from '../components/common/HeaderAction';

type Row = any;

/** Goods sent back to suppliers, across all purchases */
const SupplierReturns: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const companyName = (company as any)?.name || company?.company?.name || "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>({ startDate: "", endDate: "" });
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [exporting, setExporting] = useState(false);
  const deleteMutation = useDeleteSupplierReturn();

  const filters = {
    companyId,
    search: search || undefined,
    startDate: range.startDate || undefined,
    endDate: range.endDate || undefined,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-returns", filters, page, pageSize],
    queryFn: () => supplierReturnService.getList({ ...filters, page, limit: pageSize }),
    enabled: !!companyId,
    select: (res: any) => res?.data || res,
  });
  const list: Row[] = data?.list || [];
  const totalValue = Number(data?.summary?.totalAmount) || 0;
  const totalRefund = Number(data?.summary?.refundAmount) || 0;

  const columns: Column<Row>[] = [
    {
      key: "returnNumber",
      label: "رقم المرتجع",
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <RotateCcw className="h-4 w-4 text-orange-600" />
          </div>
          <span className="font-mono font-medium text-primary-700" dir="ltr">{r.returnNumber}</span>
        </div>
      ),
    },
    {
      key: "purchase",
      label: "فاتورة الشراء",
      render: (r) => (
        <Link to={`/purchases/${r.purchase?.id}`} className="font-mono text-sm text-primary-700 hover:underline" dir="ltr">
          {r.purchase?.invoiceNumber || `#${r.purchase?.id}`}
        </Link>
      ),
    },
    {
      key: "supplier",
      label: "المورد",
      render: (r) => <span className="font-medium text-gray-900">{r.supplier?.name || "-"}</span>,
    },
    {
      key: "items",
      label: "الأصناف",
      render: (r) => (
        <span className="text-sm text-gray-600" title={(r.items || []).map((i: any) => i.product?.name).join("، ")}>
          {(r.items || []).length} صنف
        </span>
      ),
    },
    {
      key: "totalAmount",
      label: "قيمة المرتجع",
      render: (r) => <span className="font-semibold text-gray-900">{formatCurrency(Number(r.totalAmount) || 0)}</span>,
    },
    {
      key: "refundAmount",
      label: "استرددناه",
      render: (r) =>
        Number(r.refundAmount) > 0 ? (
          <div>
            <div className="font-semibold text-green-700">{formatCurrency(Number(r.refundAmount))}</div>
            <div className="text-xs text-gray-500">{methodOf(r.refundMethod || "CASH").label}</div>
          </div>
        ) : (
          <span className="text-xs text-gray-500">خصم من المستحق للمورد</span>
        ),
    },
    {
      key: "returnDate",
      label: "التاريخ",
      render: (r) => (
        <div>
          <div className="text-gray-700">{formatTableDate(new Date(r.returnDate || r.createdAt))}</div>
          {r.user?.fullname && <div className="text-xs text-gray-400">{r.user.fullname}</div>}
        </div>
      ),
    },
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const res: any = await supplierReturnService.getList({ ...filters, page: 1, limit: 1000 });
      const rows: Row[] = (res?.data || res)?.list || [];
      const cols: ReportColumn<Row>[] = [
        { header: "رقم المرتجع", accessor: (r) => r.returnNumber },
        { header: "فاتورة الشراء", accessor: (r) => r.purchase?.invoiceNumber || "" },
        { header: "المورد", accessor: (r) => r.supplier?.name || "" },
        { header: "الأصناف", accessor: (r) => (r.items || []).map((i: any) => `${i.product?.name} × ${Number(i.quantity)}`).join("، ") },
        { header: "قيمة المرتجع", accessor: (r) => Number(r.totalAmount) || 0, format: "currency" },
        { header: "المسترد", accessor: (r) => Number(r.refundAmount) || 0, format: "currency" },
        { header: "طريقة الاسترداد", accessor: (r) => (Number(r.refundAmount) > 0 ? methodOf(r.refundMethod || "CASH").label : "") },
        { header: "التاريخ", accessor: (r) => formatTableDate(new Date(r.returnDate || r.createdAt)) },
      ];
      await exportReportToExcel(rows, cols, {
        title: "مرتجعات المشتريات",
        companyName,
        subtitle: range.startDate || range.endDate ? `من ${range.startDate || "البداية"} حتى ${range.endDate || "اليوم"}` : undefined,
        summary: [
          { label: "عدد المرتجعات", value: rows.length },
          { label: "قيمة المرتجعات", value: formatCurrency(rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0)) },
          { label: "إجمالي المسترد", value: formatCurrency(rows.reduce((s, r) => s + (Number(r.refundAmount) || 0), 0)), emphasis: true },
        ],
        fileName: "مرتجعات-المشتريات",
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
              مرتجعات المشتريات
            </h1>
            <p className="mt-1 text-gray-600">البضاعة المرتجعة للموردين؛ تُسجَّل من صفحة فاتورة الشراء</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter
              value={range}
              onChange={(r) => {
                setRange(r);
                setPage(1);
              }}
              size="sm"
            />
            <HeaderAction icon={Download} label="Excel" onClick={handleExport} busy={exporting} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatisticsCard title="عدد المرتجعات" value={formatNumber(data?.totalCount || 0)} icon={Hash} color="#F59E0B" isLoading={isLoading} />
          <StatisticsCard title="قيمة البضاعة المرتجعة" value={formatCurrency(totalValue)} icon={PackageMinus} color="#EF4444" isLoading={isLoading} />
          <StatisticsCard title="استرددناه من الموردين" value={formatCurrency(totalRefund)} icon={Wallet} color="#10B981" isLoading={isLoading} />
        </div>

        <DataTable<Row>
          title="جميع مرتجعات المشتريات"
          columns={columns}
          data={list}
          loading={isLoading}
          searchPlaceholder="ابحث برقم المرتجع أو فاتورة الشراء أو اسم المورد"
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          actions={[
            { icon: Eye, label: "فاتورة الشراء", onClick: (r) => navigate(`/purchases/${r.purchase?.id}`), variant: "primary" },
            { icon: Trash2, label: "حذف المرتجع", onClick: (r) => setToDelete(r), variant: "danger" },
          ]}
          totalItems={data?.totalCount || 0}
          currentPage={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          emptyMessage={search || range.startDate || range.endDate ? "لا توجد مرتجعات مطابقة" : "لا توجد مرتجعات للموردين بعد"}
        />

        <ConfirmDialog
          isOpen={!!toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            if (toDelete) deleteMutation.mutate({ id: toDelete.id, companyId }, { onSettled: () => setToDelete(null) });
          }}
          title="حذف مرتجع المورد"
          message={`سيُلغى المرتجع ${toDelete?.returnNumber || ""}: تعود أصنافه للمخزون ويرجع المستحق للمورد كما كان${
            Number(toDelete?.refundAmount) > 0 && (toDelete?.refundMethod || "CASH") === "CASH"
              ? `، ويخرج ${formatCurrency(Number(toDelete?.refundAmount))} من درج ورديتك`
              : ""
          }.`}
          confirmText="حذف"
          type="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default SupplierReturns;
