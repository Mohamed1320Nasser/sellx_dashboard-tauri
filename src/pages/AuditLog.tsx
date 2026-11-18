import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Eye, FileSpreadsheet, FileText, Lock, Monitor, Globe, ShieldCheck, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { Badge, Button, DataTable, Modal } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import type { DateRange } from "../components/filters";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { usePermissionStore } from "../stores/permissionStore";
import { useCompanyUsers } from "../hooks/api/useUsers";
import { auditLogService, type AuditLogQuery, type AuditLogRow } from "../services/auditLogService";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_GROUP_OPTIONS,
  FIELD_LABELS,
  ROLE_LABELS,
  SOURCE_LABELS,
  actionTone,
  entityLink,
} from "../utils/auditLabels";
import { formatCurrency } from "../utils";
import { SALE_METHOD_LABELS } from "../utils/paymentMethods";
import { formatDateTime } from "../utils/dateUtils";
import { exportReportToExcel, exportReportToPdf, type ReportColumn } from "../utils/reportExport";

const isChange = (v: unknown): v is { before: unknown; after: unknown } =>
  !!v && typeof v === "object" && !Array.isArray(v) && "before" in (v as object) && "after" in (v as object);

/** A value in the details panel, readable for a shop owner */
function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
    return ROLE_LABELS[v] || (SALE_METHOD_LABELS as Record<string, string>)[v] || v;
  }
  return JSON.stringify(v);
}

/** One-line summary of what changed, for the table */
function summaryOf(row: AuditLogRow): string {
  const d = row.details || {};
  const changes = Object.entries(d).filter(([, v]) => isChange(v));
  if (changes.length) {
    return changes
      .slice(0, 2)
      .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${show((v as any).before)} ← ${show((v as any).after)}`)
      .join(" · ");
  }
  if (row.action === "SALE_DISCOUNT" && d.discountPercent) return `خصم ${d.discountPercent}%`;
  if (row.action === "SALE_PRICE_OVERRIDE" && Array.isArray(d.lines)) {
    return d.lines.slice(0, 2).map((l: any) => `${l.name}: ${l.listPrice} ← ${l.soldAt}`).join(" · ");
  }
  if (row.action === "PRODUCT_STOCK_ADJUST" && d.change !== undefined) return `${d.change > 0 ? "+" : ""}${d.change}${d.reason ? ` · ${d.reason}` : ""}`;
  if (row.action === "CASH_OUT" || row.action === "CASH_IN") return d.reason || "";
  if (row.action === "PRICE_LIST_ADJUST") return `${d.percent > 0 ? "+" : ""}${d.percent}% · ${d.count} منتج`;
  if (row.action === "STOCKTAKE_COMPLETE") return `${d.withDifference} صنف بفروق من ${d.counted}`;
  if (row.action === "PRODUCT_BULK_DELETE" && Array.isArray(d.products)) return d.products.slice(0, 3).map((p: any) => p.name).join("، ");
  return "";
}

const AuditLog: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;
  const companyName = company?.name || company?.company?.name || company?.companyName || "";
  const role = usePermissionStore(s => s.role);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [userId, setUserId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: "", endDate: "" });
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const query: AuditLogQuery = useMemo(
    () => ({
      companyId: companyId!,
      page,
      limit: pageSize,
      search: search || undefined,
      group: group || undefined,
      userId: userId ? Number(userId) : undefined,
      from: dateRange.startDate || undefined,
      to: dateRange.endDate || undefined,
    }),
    [companyId, page, pageSize, search, group, userId, dateRange]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", query],
    queryFn: () => auditLogService.list(query),
    enabled: !!companyId && role === "ADMIN",
    staleTime: 30 * 1000,
  });
  const { data: usersData } = useCompanyUsers({ companyId: companyId!, limit: 100 });
  // rows are shop permissions with the person under `user` (their own id is the permission's)
  const users: { id: number; fullname: string }[] = ((usersData as any)?.data?.list || [])
    .map((r: any) => ({ id: r.user?.id ?? r.userId, fullname: r.user?.fullname ?? r.fullname ?? "" }))
    .filter((u: { id?: number }) => !!u.id);

  const resetPage = () => setPage(1);
  const filters: TableFilter[] = [
    {
      key: "group",
      label: "نوع العملية",
      type: "select",
      options: [{ value: "", label: "كل العمليات" }, ...AUDIT_GROUP_OPTIONS],
      value: group,
      onChange: v => { setGroup(String(v)); resetPage(); },
    },
    {
      key: "user",
      label: "المستخدم",
      type: "select",
      options: [{ value: "", label: "كل المستخدمين" }, ...users.map(u => ({ value: String(u.id), label: u.fullname }))],
      value: userId,
      onChange: v => { setUserId(String(v)); resetPage(); },
    },
  ];

  const columns: Column<AuditLogRow>[] = [
    {
      key: "createdAt",
      label: "الوقت",
      width: "150px",
      render: r => <span className="whitespace-nowrap text-sm text-gray-700">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "user",
      label: "المستخدم",
      render: r => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{r.user?.fullname || "—"}</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            {r.role ? ROLE_LABELS[r.role] : ""}
            {r.source === "DESKTOP" ? <Monitor className="h-3 w-3" aria-label="برنامج الكمبيوتر" /> : r.source === "WEB" ? <Globe className="h-3 w-3" aria-label="المتصفح" /> : null}
          </p>
        </div>
      ),
    },
    {
      key: "action",
      label: "العملية",
      render: r => <Badge variant={actionTone(r.action)}>{AUDIT_ACTION_LABELS[r.action] || r.action}</Badge>,
    },
    {
      key: "label",
      label: "على",
      render: r => {
        const href = entityLink(r.entityType, r.entityId, r.details);
        const text = r.label || "—";
        return href ? (
          <Link to={href} className="text-sm font-medium text-primary-700 hover:underline" onClick={e => e.stopPropagation()}>
            {text}
          </Link>
        ) : (
          <span className="text-sm text-gray-800">{text}</span>
        );
      },
    },
    {
      key: "summary",
      label: "التفاصيل",
      render: r => <span className="line-clamp-2 text-xs text-gray-600">{summaryOf(r)}</span>,
    },
    {
      key: "amount",
      label: "المبلغ",
      render: r => (r.amount === null ? <span className="text-gray-400">—</span> : <span className="whitespace-nowrap text-sm font-semibold">{formatCurrency(r.amount)}</span>),
    },
  ];

  const exportColumns: ReportColumn<AuditLogRow>[] = [
    { header: "الوقت", accessor: r => formatDateTime(r.createdAt), width: 20 },
    { header: "المستخدم", accessor: r => r.user?.fullname || "", width: 18 },
    { header: "الصلاحية", accessor: r => (r.role ? ROLE_LABELS[r.role] : ""), width: 10 },
    { header: "العملية", accessor: r => AUDIT_ACTION_LABELS[r.action] || r.action, width: 26 },
    { header: "على", accessor: r => r.label || "", width: 24 },
    { header: "التفاصيل", accessor: r => summaryOf(r), width: 40 },
    { header: "المبلغ", accessor: r => r.amount, format: "currency", width: 14 },
    { header: "من", accessor: r => SOURCE_LABELS[r.source] || r.source, width: 14 },
  ];

  const exportAs = useCallback(
    async (kind: "pdf" | "excel") => {
      if (!companyId) return;
      setExporting(true);
      try {
        const rows = await auditLogService.listAll({ ...query, page: 1 });
        if (!rows.length) return void toast.error("لا توجد بيانات للتصدير");
        const groupLabel = AUDIT_GROUP_OPTIONS.find(g => g.value === group)?.label;
        const userLabel = users.find(u => String(u.id) === userId)?.fullname;
        const period = dateRange.startDate || dateRange.endDate ? `${dateRange.startDate || "…"} → ${dateRange.endDate || "…"}` : "كل الفترات";
        const meta = {
          title: "سجل العمليات",
          companyName,
          subtitle: [groupLabel, userLabel, period].filter(Boolean).join(" · "),
          fileName: "سجل-العمليات",
          summary: [{ label: "عدد العمليات", value: rows.length, emphasis: true }],
        };
        if (kind === "pdf") await exportReportToPdf(rows, exportColumns, meta);
        else await exportReportToExcel(rows, exportColumns, meta);
      } catch {
        toast.error(kind === "pdf" ? "تعذر تصدير ملف PDF" : "تعذر تصدير ملف Excel");
      } finally {
        setExporting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyId, query, group, userId, users, dateRange, companyName]
  );

  if (role && role !== "ADMIN") {
    return (
      <Layout>
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <h1 className="mb-1 text-lg font-bold text-gray-900">سجل العمليات لمالك المحل فقط</h1>
          <p className="text-sm text-gray-600">هذه الصفحة تعرض ما قام به كل مستخدم، لذلك لا تظهر إلا للمالك.</p>
          <Button className="mt-5" variant="outline" onClick={() => navigate(-1)}>رجوع</Button>
        </div>
      </Layout>
    );
  }

  const d = selected?.details || {};
  const changeRows = Object.entries(d).filter(([, v]) => isChange(v));
  const listRows = Object.entries(d).filter(([, v]) => Array.isArray(v) && v.length && typeof v[0] === "object");
  const plainRows = Object.entries(d).filter(([, v]) => !isChange(v) && !(Array.isArray(v) && v.length && typeof v[0] === "object") && v !== null && v !== undefined && v !== "");
  const selectedLink = selected ? entityLink(selected.entityType, selected.entityId, selected.details) : null;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">سجل العمليات</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
              <ShieldCheck className="h-4 w-4 text-primary-600" />
              من فعل ماذا ومتى. لا يمكن تعديل السجل أو حذفه، ويُحفظ لمدة سنتين.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportAs("excel")} disabled={exporting} className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportAs("pdf")} disabled={exporting} className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {(error as any)?.message || String(error) || "تعذر تحميل السجل"}
          </div>
        ) : null}

        <DataTable<AuditLogRow>
          title="العمليات"
          columns={columns}
          data={data?.list || []}
          loading={isLoading}
          searchPlaceholder="ابحث برقم فاتورة، اسم منتج أو مستخدم..."
          onSearch={q => { setSearch(q); resetPage(); }}
          filters={filters}
          onClearFilters={() => { setGroup(""); setUserId(""); setSearch(""); setDateRange({ startDate: "", endDate: "" }); resetPage(); }}
          dateRangeFilter={{ value: dateRange, onChange: r => { setDateRange(r); resetPage(); } }}
          actions={[{ icon: Eye, label: "التفاصيل", onClick: r => setSelected(r), variant: "primary" }]}
          totalItems={data?.filterCount || 0}
          currentPage={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={n => { setPageSize(n); resetPage(); }}
          emptyMessage="لا توجد عمليات مسجلة لهذا البحث"
        />
      </div>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected ? AUDIT_ACTION_LABELS[selected.action] || selected.action : ""} size="lg">
        {selected && (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <div><dt className="text-xs text-gray-500">الوقت</dt><dd className="font-medium">{formatDateTime(selected.createdAt)}</dd></div>
              <div><dt className="text-xs text-gray-500">المستخدم</dt><dd className="font-medium">{selected.user?.fullname || "—"} {selected.role ? `(${ROLE_LABELS[selected.role]})` : ""}</dd></div>
              <div><dt className="text-xs text-gray-500">من</dt><dd className="font-medium">{SOURCE_LABELS[selected.source] || selected.source}</dd></div>
              <div>
                <dt className="text-xs text-gray-500">على</dt>
                <dd className="font-medium">
                  {selectedLink ? (
                    <Link to={selectedLink} className="inline-flex items-center gap-1 text-primary-700 hover:underline">
                      {selected.label || "فتح"} <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : selected.label || "—"}
                </dd>
              </div>
              {selected.amount !== null && (
                <div><dt className="text-xs text-gray-500">المبلغ</dt><dd className="font-bold">{formatCurrency(selected.amount)}</dd></div>
              )}
            </dl>

            {changeRows.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold text-gray-900">قبل ← بعد</h3>
                <table className="w-full overflow-hidden rounded-lg border border-gray-200">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr><th className="p-2 text-right">الحقل</th><th className="p-2 text-right">قبل</th><th className="p-2 text-right">بعد</th></tr>
                  </thead>
                  <tbody>
                    {changeRows.map(([k, v]) => (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="p-2 text-gray-600">{FIELD_LABELS[k] || k}</td>
                        <td className="p-2 text-red-700 line-through decoration-red-300">{show((v as any).before)}</td>
                        <td className="p-2 font-semibold text-green-700">{show((v as any).after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {listRows.map(([k, v]) => {
              const items = v as Record<string, unknown>[];
              const keys = Object.keys(items[0]).filter(x => x !== "productId" && x !== "id");
              return (
                <div key={k}>
                  <h3 className="mb-2 font-semibold text-gray-900">الأصناف ({items.length})</h3>
                  <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-gray-50 text-xs text-gray-600">
                        <tr>{keys.map(x => <th key={x} className="p-2 text-right">{ITEM_LABELS[x] || x}</th>)}</tr>
                      </thead>
                      <tbody>
                        {items.map((it, i) => (
                          <tr key={i} className="border-t border-gray-100">{keys.map(x => <td key={x} className="p-2">{show(it[x])}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {plainRows.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-3">
                {plainRows.map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-gray-500">{DETAIL_LABELS[k] || FIELD_LABELS[k] || k}</dt><dd className="font-medium text-gray-800">{show(v)}</dd></div>
                ))}
              </dl>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
};

/** Column names in the item lists of a row (sale lines, price lines) */
const ITEM_LABELS: Record<string, string> = {
  name: "الصنف",
  quantity: "الكمية",
  unitPrice: "السعر",
  listPrice: "سعر القائمة",
  soldAt: "سعر البيع",
  before: "قبل",
  after: "بعد",
  condition: "الحالة",
  sku: "الكود",
};

/** Other detail fields */
const DETAIL_LABELS: Record<string, string> = {
  paid: "المدفوع",
  paymentMethod: "طريقة الدفع",
  saleDate: "تاريخ الفاتورة",
  discountType: "نوع الخصم",
  discountPercent: "نسبة الخصم",
  subtotal: "الإجمالي قبل الخصم",
  total: "الإجمالي",
  priceList: "قائمة الأسعار",
  debtMoved: "مديونية نُقلت",
  paymentId: "رقم الدفعة",
  remainingBefore: "المتبقي قبلها",
  supplierPayment: "دفعة لمورد",
  saleId: "رقم الفاتورة",
  reason: "السبب",
  cashFromDrawer: "نقداً من الدرج",
  change: "التغيير",
  unit: "الوحدة",
  from: "من شاشة",
  reference: "المرجع",
  shiftOwner: "صاحب الوردية",
  closedByOwner: "أغلقها صاحبها",
  openingBalance: "رصيد البداية",
  expectedCash: "النقدية المتوقعة",
  actualCash: "النقدية الفعلية",
  variance: "الفرق",
  totalSales: "عدد المبيعات",
  startTime: "بداية الوردية",
  type: "النوع",
  otherCashiersShift: "على وردية كاشير آخر",
  counted: "أصناف تم عدها",
  withDifference: "أصناف بفروق",
  valueDifference: "قيمة الفروق",
  username: "اسم المستخدم",
  newAccount: "حساب جديد",
  source: "من",
  percent: "النسبة",
  count: "عدد المنتجات",
  categoryId: "التصنيف",
  refundMethod: "طريقة الاسترداد",
  purchaseId: "فاتورة الشراء",
  usedBySales: "مستخدمة في فواتير",
  heldBy: "علّقها",
  heldAt: "وقت التعليق",
  items: "الأصناف",
  month: "الشهر",
  year: "السنة",
  expenseId: "رقم المصروف",
  createdBy: "سجّله",
  category: "التصنيف",
  expenseDate: "التاريخ",
  skipped: "تم تخطيه",
  clientsMoved: "عملاء نُقلوا للقائمة الأساسية",
  sku: "الكود",
  purchasePrice: "سعر الشراء",
  supplierId: "المورد",
  notes: "ملاحظات",
};

export default AuditLog;
