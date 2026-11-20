import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowDownLeft, ArrowUpRight, Eye, FileText, Pencil, Plus, Scale, Trash2, Users } from "lucide-react";
import { Layout } from "../components/layout";
import { ConfirmDialog, DataTable } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import type { DateRange } from "../components/filters";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { paymentService, type Payment } from "../services/paymentService";
import { METHOD, METHOD_OPTIONS, apiError, methodOf } from "../components/payments/paymentLabels";
import { formatCurrency } from "../utils/currencyUtils";
import { formatTableDate } from "../utils/dateUtils";

type TypeFilter = "" | "IN" | "OUT";

/** What a payment was for: the invoice and who it was with */
export function PaymentTarget({ p, onOpen }: { p: Payment; onOpen?: (path: string) => void }) {
  const isOut = !!p.purchaseId;
  const number = isOut ? p.purchase?.invoiceNumber : p.sale?.receiptNumber;
  const party = isOut ? p.purchase?.supplier?.name : p.sale?.client?.name;
  const path = isOut ? `/purchases/${p.purchaseId}` : `/sales/${p.saleId}`;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-500">{isOut ? "فاتورة شراء" : "فاتورة بيع"}</span>
        {number ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onOpen?.(path);
            }}
            className="whitespace-nowrap font-semibold text-primary-700 hover:underline"
            dir="ltr"
          >
            {number}
          </button>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>
      <div className="truncate text-xs text-gray-500">{party || (isOut ? "مورد" : "عميل نقدي")}</div>
    </div>
  );
}

const Payments: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || company?.company?.id) || 0;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [type, setType] = useState<TypeFilter>("");
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: "", endDate: "" });
  const [deleting, setDeleting] = useState<Payment | null>(null);

  const params = {
    companyId,
    page,
    limit: pageSize,
    search: search || undefined,
    paymentMethod: method || undefined,
    type: type || undefined,
    startDate: dateRange.startDate || undefined,
    endDate: dateRange.endDate || undefined,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["payments", params],
    queryFn: () => paymentService.getList(params),
    enabled: !!companyId,
    placeholderData: prev => prev,
  });
  const list = data?.data?.list || [];
  const summary = data?.data?.summary;
  const manager = !!summary?.canSeeSupplierPayments;

  const remove = useMutation({
    mutationFn: (p: Payment) => paymentService.delete(p.id, companyId),
    onSuccess: () => {
      toast.success("تم حذف الدفعة، وعاد المبلغ متبقياً على الفاتورة");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["current-shift"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(apiError(e, "تعذر حذف الدفعة")),
  });

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const onSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns: Column<Payment>[] = [
    {
      key: "amount",
      label: "المبلغ",
      render: p => {
        const out = !!p.purchaseId;
        const Icon = out ? ArrowUpRight : ArrowDownLeft;
        return (
          <div className="flex items-center gap-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${out ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <div className={`whitespace-nowrap font-bold ${out ? "text-red-700" : "text-gray-900"}`}>
                {out ? "−" : ""}
                {formatCurrency(Number(p.amount))}
              </div>
              <div className="text-[11px] text-gray-500">{out ? "دفع لمورد" : "تحصيل من عميل"}</div>
            </div>
          </div>
        );
      },
    },
    { key: "target", label: "مقابل", render: p => <PaymentTarget p={p} onOpen={navigate} /> },
    {
      key: "paymentMethod",
      label: "الطريقة",
      render: p => {
        const m = methodOf(p.paymentMethod);
        const Icon = m.icon;
        return (
          <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
            <Icon className="h-3 w-3" />
            {m.label}
          </span>
        );
      },
    },
    {
      key: "paymentDate",
      label: "التاريخ",
      render: p => (
        <div className="whitespace-nowrap">
          <div className="text-sm text-gray-800">{formatTableDate(p.paymentDate)}</div>
          {p.user?.fullname && <div className="text-xs text-gray-500">بواسطة {p.user.fullname}</div>}
        </div>
      ),
    },
    {
      key: "reference",
      label: "المرجع / ملاحظات",
      render: p =>
        p.reference || p.notes ? (
          <div className="max-w-[14rem]">
            {p.reference && (
              <div className="truncate text-sm text-gray-800" dir="auto">
                {p.reference}
              </div>
            )}
            {p.notes && (
              <div className="truncate text-xs text-gray-500" title={p.notes}>
                {p.notes}
              </div>
            )}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  const typeOptions = [
    { value: "", label: "الكل" },
    { value: "IN", label: "تحصيل من العملاء" },
    { value: "OUT", label: "دفع للموردين" },
  ];
  const filters: TableFilter[] = useMemo(
    () => [
      ...(manager
        ? [{ key: "type", label: "النوع", type: "select" as const, options: typeOptions, value: type, onChange: (v: any) => resetPage(setType)(v as TypeFilter) }]
        : []),
      {
        key: "method",
        label: "الطريقة",
        type: "select" as const,
        options: [{ value: "", label: "كل الطرق" }, ...METHOD_OPTIONS],
        value: method,
        onChange: (v: any) => resetPage(setMethod)(v as string),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manager, type, method]
  );

  const filtered = !!(search || method || type || dateRange.startDate || dateRange.endDate);
  const byMethod = Object.entries(summary?.byMethod || {}).filter(([, v]) => v.in || v.out);
  const card = "flex min-w-0 items-start gap-3 rounded-2xl border bg-white p-3 text-right shadow-sm transition";
  const loadingValue = isLoading && !summary;

  return (
    <Layout>
      <div className="w-full space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">المدفوعات</h1>
            <p className="text-sm text-gray-500">
              {manager ? "ما حصّلته من العملاء وما دفعته للموردين على الفواتير" : "ما حصّلته من العملاء على الفواتير"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/clients")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              title="اختر العميل ثم «تحصيل من الحساب»"
            >
              <Users className="h-4 w-4" />
              تحصيل من حساب عميل
            </button>
            <button
              type="button"
              onClick={() => navigate("/payments/create")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              تسجيل دفعة
            </button>
          </div>
        </div>

        {/* Totals of everything the filters match; the in / out cards filter too */}
        <div className={`grid grid-cols-2 gap-3 ${manager ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          <button
            type="button"
            onClick={() => manager && resetPage(setType)(type === "IN" ? "" : "IN")}
            aria-pressed={type === "IN"}
            className={`${card} ${type === "IN" ? "border-emerald-400 ring-1 ring-emerald-400" : "border-gray-200"} ${manager ? "hover:border-gray-300" : "cursor-default"}`}
          >
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-gray-500">المحصَّل من العملاء</span>
              <span className="block truncate text-lg font-bold text-gray-900">{loadingValue ? "…" : formatCurrency(summary?.totalIn || 0)}</span>
              <span className="block text-[11px] text-gray-500">{summary ? `${summary.countIn} دفعة` : ""}</span>
            </span>
          </button>
          {manager && (
            <>
              <button
                type="button"
                onClick={() => resetPage(setType)(type === "OUT" ? "" : "OUT")}
                aria-pressed={type === "OUT"}
                className={`${card} hover:border-gray-300 ${type === "OUT" ? "border-red-400 ring-1 ring-red-400" : "border-gray-200"}`}
              >
                <span className="rounded-lg bg-red-50 p-2 text-red-700">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-gray-500">المدفوع للموردين</span>
                  <span className="block truncate text-lg font-bold text-gray-900">{loadingValue ? "…" : formatCurrency(summary?.totalOut || 0)}</span>
                  <span className="block text-[11px] text-gray-500">{summary ? `${summary.countOut} دفعة` : ""}</span>
                </span>
              </button>
              <div className={`${card} cursor-default border-gray-200`}>
                <span className="rounded-lg bg-primary-50 p-2 text-primary-700">
                  <Scale className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-gray-500">الصافي</span>
                  <span className={`block truncate text-lg font-bold ${(summary?.net || 0) < 0 ? "text-red-700" : "text-gray-900"}`}>
                    {loadingValue ? "…" : formatCurrency(summary?.net || 0)}
                  </span>
                  <span className="block text-[11px] text-gray-500">المحصَّل ناقص المدفوع</span>
                </span>
              </div>
            </>
          )}
          <div className={`${card} col-span-2 cursor-default border-gray-200 md:col-span-1`}>
            <span className="min-w-0 flex-1">
              <span className="mb-1 block text-xs text-gray-500">حسب الطريقة</span>
              {byMethod.length ? (
                <span className="block space-y-0.5">
                  {byMethod.map(([code, v]) => {
                    const m = METHOD[code as keyof typeof METHOD];
                    return (
                      <span key={code} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-600">{m?.label || code}</span>
                        <span className="whitespace-nowrap font-semibold text-gray-900">
                          {v.in > 0 && formatCurrency(v.in)}
                          {v.in > 0 && v.out > 0 && " · "}
                          {v.out > 0 && <span className="text-red-700">−{formatCurrency(v.out)}</span>}
                        </span>
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span className="block text-sm text-gray-400">{loadingValue ? "…" : "لا توجد مدفوعات"}</span>
              )}
            </span>
          </div>
        </div>
        {filtered && <p className="-mt-2 text-xs text-gray-500">الإجماليات حسب البحث والفلاتر الحالية.</p>}

        <DataTable<Payment>
          title={type === "IN" ? "تحصيل من العملاء" : type === "OUT" ? "دفع للموردين" : "كل المدفوعات"}
          columns={columns}
          data={list}
          loading={isLoading}
          searchPlaceholder={manager ? "ابحث برقم الفاتورة أو العميل أو المورد أو المرجع" : "ابحث برقم الفاتورة أو العميل أو المرجع"}
          onSearch={onSearch}
          filters={filters}
          dateRangeFilter={{ value: dateRange, onChange: resetPage(setDateRange) }}
          onClearFilters={() => {
            setMethod("");
            setType("");
            setDateRange({ startDate: "", endDate: "" });
            setPage(1);
          }}
          actions={[
            { icon: Eye, label: "تفاصيل الدفعة", onClick: p => navigate(`/payments/${p.id}`), variant: "primary" },
            {
              icon: FileText,
              label: "فتح الفاتورة",
              onClick: p => navigate(p.purchaseId ? `/purchases/${p.purchaseId}` : `/sales/${p.saleId}`),
              variant: "primary",
            },
            { icon: Pencil, label: "تعديل", onClick: p => navigate(`/payments/${p.id}/edit`), variant: "warning", show: () => manager },
            { icon: Trash2, label: "حذف", onClick: p => setDeleting(p), variant: "danger", show: () => manager },
          ]}
          totalItems={data?.data?.totalCount || 0}
          currentPage={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={n => {
            setPageSize(n);
            setPage(1);
          }}
          emptyMessage={filtered ? "لا توجد مدفوعات تطابق البحث" : "لا توجد مدفوعات بعد. سجّل دفعة على فاتورة آجلة أو حصّل من حساب عميل."}
        />
      </div>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="حذف الدفعة"
        message={
          deleting
            ? `ستُحذف دفعة ${formatCurrency(Number(deleting.amount))} ويعود المبلغ متبقياً على ${deleting.purchaseId ? "فاتورة الشراء" : "الفاتورة"} ${
                deleting.purchase?.invoiceNumber || deleting.sale?.receiptNumber || ""
              }.${deleting.paymentMethod === "CASH" ? " المبلغ النقدي يُعكس في درج ورديتك الحالية إذا كانت ورديته مغلقة." : ""}`
            : ""
        }
        confirmText="حذف الدفعة"
        isLoading={remove.isPending}
      />
    </Layout>
  );
};

export default Payments;
