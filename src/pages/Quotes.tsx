import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Edit,
  Eye,
  FileDown,
  FileText,
  Hourglass,
  Mail,
  MessageCircle,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { ConfirmDialog, DataTable } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useDeleteQuote, useEmailQuote, useQuotes } from "../hooks/api/useQuotes";
import { formatTableDate } from "../utils/dateUtils";
import { formatCurrency } from "../utils/currencyUtils";
import { downloadQuotePdf, printQuoteA4, printQuoteThermal } from "../services/quotePrintService";
import SendQuoteModal from "../components/quotes/SendQuoteModal";
import type { Quote, QuoteListSummary } from "../types";

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "مسودة", cls: "bg-gray-100 text-gray-700" },
  SENT: { label: "مُرسل", cls: "bg-blue-100 text-blue-700" },
  PRINTED: { label: "مطبوع", cls: "bg-sky-100 text-sky-700" },
  ACCEPTED: { label: "مقبول", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "مرفوض", cls: "bg-red-100 text-red-700" },
};

const DAY = 864e5;
/** Whole days from today to the valid-until date (negative once past) */
function daysLeft(validUntil: string): number {
  const end = new Date(String(validUntil).slice(0, 10) + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / DAY);
}
const waiting = (q: Quote) => !q.convertedToSaleId && (q.status === "DRAFT" || q.status === "SENT" || q.status === "PRINTED");

const Quotes: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || (company as any)?.company?.id) || 0;
  const companyName = (company as any)?.company?.name || (company as any)?.name || "";
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleting, setDeleting] = useState<Quote | null>(null);
  const [sending, setSending] = useState<Quote | null>(null);

  const { data: quotesData, isLoading } = useQuotes({
    companyId,
    page: currentPage,
    limit: pageSize,
    search: searchTerm,
    status: statusFilter,
  });
  const summary: QuoteListSummary | undefined = (quotesData as any)?.data?.summary;

  const deleteMutation = useDeleteQuote();
  const emailMutation = useEmailQuote();

  const columns: Column<Quote>[] = [
    {
      key: "quoteNumber",
      label: "العرض",
      render: (q: Quote) => (
        <div className="min-w-0 max-w-[16rem]">
          <span className="font-semibold text-primary-700" dir="ltr">
            {q.quoteNumber}
          </span>
          {q.subject && (
            <p className="truncate text-xs text-gray-500" title={q.subject}>
              {q.subject}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "customerName",
      label: "العميل",
      render: (q: Quote) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{q.customerName || q.client?.name || "—"}</p>
          {(q.customerContact || q.client?.phone) && (
            <p className="text-xs text-gray-500" dir="ltr" style={{ textAlign: "right" }}>
              {q.customerContact || q.client?.phone}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "total",
      label: "الإجمالي",
      render: (q: Quote) => <span className="whitespace-nowrap font-semibold text-gray-900">{formatCurrency(Number(q.total))}</span>,
    },
    {
      key: "status",
      label: "الحالة",
      render: (q: Quote) => {
        if (q.convertedToSaleId) {
          return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <ShoppingCart className="h-3 w-3" />
              محوّل لفاتورة
            </span>
          );
        }
        const s = STATUS[q.status] || STATUS.DRAFT;
        const views = q.shareToken ? q.viewCount || 0 : 0;
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
            {views > 0 && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-emerald-700" title={q.lastViewedAt ? `آخر مرة ${formatTableDate(q.lastViewedAt)}` : undefined}>
                <Eye className="h-3 w-3" />
                {views === 1 ? "فتحه العميل" : `فتحه العميل ${views} مرات`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "validUntil",
      label: "الصلاحية",
      render: (q: Quote) => {
        if (!q.validUntil) return <span className="text-xs text-gray-400">بدون مدة</span>;
        const left = daysLeft(q.validUntil);
        const open = waiting(q);
        return (
          <div className="whitespace-nowrap">
            <p className={`text-sm ${open && left < 0 ? "font-medium text-amber-700" : "text-gray-700"}`}>{formatTableDate(q.validUntil)}</p>
            {open && (
              <p className={`text-xs ${left < 0 ? "text-amber-700" : left <= 3 ? "text-amber-600" : "text-gray-500"}`}>
                {left < 0 ? `انتهى منذ ${-left} يوم` : left === 0 ? "آخر يوم اليوم" : `باقي ${left} يوم`}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "createdAt",
      label: "التاريخ",
      render: (q: Quote) => <span className="whitespace-nowrap text-sm text-gray-600">{formatTableDate(q.createdAt)}</span>,
    },
  ];

  /** One runner for every print button: shows progress, then success or the reason it failed */
  const runPrint = async (job: () => Promise<void>, busy: string, done: string) => {
    const id = "quote-print";
    toast.loading(busy, { id });
    try {
      await job();
      toast.success(done, { id });
    } catch (error: any) {
      console.error("Quote print error:", error);
      toast.error(error?.message || "فشلت الطباعة", { id });
    }
  };

  const setFilter = useCallback((value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const statusOptions = useMemo(
    () => [
      { value: "", label: "جميع الحالات" },
      { value: "DRAFT", label: "مسودة" },
      { value: "SENT", label: "مُرسل" },
      { value: "PRINTED", label: "مطبوع" },
      { value: "EXPIRED", label: "منتهي الصلاحية" },
      { value: "ACCEPTED", label: "مقبول" },
      { value: "REJECTED", label: "مرفوض" },
    ],
    []
  );

  const tableFilters: TableFilter[] = useMemo(
    () => [
      {
        key: "status",
        label: "الحالة",
        type: "select",
        options: statusOptions,
        value: statusFilter,
        onChange: value => setFilter(value as string),
      },
    ],
    [statusOptions, statusFilter, setFilter]
  );

  /** The cards double as quick filters */
  const cards: { key: string; label: string; value: React.ReactNode; hint?: string; icon: React.ElementType; tone: string }[] = [
    {
      key: "",
      label: "بانتظار رد العميل",
      value: summary ? formatCurrency(summary.openValue) : "—",
      hint: summary ? `${summary.openCount} عرض ساري · ${summary.total} إجمالي العروض` : undefined,
      icon: Hourglass,
      tone: "text-primary-700 bg-primary-50",
    },
    { key: "DRAFT", label: "مسودات", value: summary?.draft ?? "—", icon: FileText, tone: "text-gray-700 bg-gray-100" },
    {
      key: "EXPIRED",
      label: "انتهت صلاحيتها",
      value: summary?.expired ?? "—",
      hint: summary?.expired ? "تابع العميل أو جدّد التاريخ" : undefined,
      icon: AlertTriangle,
      tone: "text-amber-700 bg-amber-50",
    },
    {
      key: "ACCEPTED",
      label: "مقبولة",
      value: summary?.accepted ?? "—",
      hint: summary ? `${summary.converted} محوّلة لفواتير` : undefined,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
    },
    { key: "REJECTED", label: "مرفوضة", value: summary?.rejected ?? "—", icon: XCircle, tone: "text-red-700 bg-red-50" },
  ];

  return (
    <Layout>
      <div className="w-full space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">عروض الأسعار</h1>
            <p className="text-sm text-gray-500">أرسل العرض للعميل، ثم حوّله إلى فاتورة عند الموافقة</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/quotes/create")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            عرض سعر جديد
          </button>
        </div>

        {/* Summary: the whole company, each card filters the list */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {cards.map((c, i) => {
            const Icon = c.icon;
            const active = statusFilter === c.key;
            return (
              <button
                key={c.key || "all"}
                type="button"
                onClick={() => setFilter(active && c.key ? "" : c.key)}
                aria-pressed={active}
                className={`flex min-w-0 items-start gap-3 rounded-2xl border bg-white p-3 text-right shadow-sm transition hover:border-gray-300 ${
                  i === 0 ? "col-span-2 md:col-span-1" : ""
                } ${active ? "border-primary-400 ring-1 ring-primary-400" : "border-gray-200"}`}
              >
                <span className={`rounded-lg p-2 ${c.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-gray-500">{c.label}</span>
                  <span className="block truncate text-lg font-bold text-gray-900">{isLoading && !summary ? "…" : c.value}</span>
                  {c.hint && <span className="block truncate text-[11px] text-gray-500">{c.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <DataTable<Quote>
          title={statusFilter ? `عروض: ${statusOptions.find(o => o.value === statusFilter)?.label || ""}` : "كل العروض"}
          columns={columns}
          data={quotesData?.data?.list || []}
          loading={isLoading}
          searchPlaceholder="ابحث برقم العرض أو العميل أو الهاتف أو الموضوع"
          onSearch={handleSearch}
          filters={tableFilters}
          onClearFilters={() => setFilter("")}
          actions={[
            { icon: Eye, label: "فتح العرض", onClick: q => navigate(`/quotes/${q.id}`), variant: "primary" },
            {
              icon: ShoppingCart,
              label: "تحويل لفاتورة",
              onClick: q => navigate(`/quotes/${q.id}?convert=1`),
              variant: "success",
              show: q => !q.convertedToSaleId && q.status !== "REJECTED",
            },
            {
              icon: MessageCircle,
              label: "إرسال واتساب",
              onClick: q => setSending(q),
              variant: "success",
            },
            {
              icon: Mail,
              label: "إرسال بالبريد",
              onClick: q => emailMutation.mutate({ id: q.id, companyId }),
              variant: "primary",
              show: q => !!q.customerEmail && !q.convertedToSaleId,
            },
            { icon: Copy, label: "نسخ إلى عرض جديد", onClick: q => navigate(`/quotes/create?from=${q.id}`), variant: "primary" },
            {
              icon: FileDown,
              label: "تحميل PDF",
              onClick: q => runPrint(() => downloadQuotePdf(q), "جاري إنشاء ملف PDF...", "تم تحميل ملف PDF"),
              variant: "primary",
            },
            {
              icon: FileText,
              label: "طباعة A4",
              onClick: q => runPrint(() => printQuoteA4(q), "جاري تجهيز الطباعة...", "تم فتح نافذة الطباعة"),
              variant: "primary",
            },
            {
              icon: Printer,
              label: "طباعة حرارية",
              onClick: q => runPrint(() => printQuoteThermal(q), "جاري الطباعة...", "تم إرسال العرض للطابعة"),
              variant: "primary",
            },
            { icon: Edit, label: "تعديل", onClick: q => navigate(`/quotes/${q.id}/edit`), variant: "warning", show: q => !q.convertedToSaleId },
            { icon: Trash2, label: "حذف", onClick: q => setDeleting(q), variant: "danger", show: q => !q.convertedToSaleId },
          ]}
          totalItems={quotesData?.data?.totalCount || 0}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={newSize => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          emptyMessage={
            statusFilter || searchTerm ? "لا توجد عروض بهذا البحث أو الحالة" : "لا توجد عروض أسعار بعد. أنشئ أول عرض سعر من الزر أعلاه."
          }
        />

        <SendQuoteModal quote={sending} onClose={() => setSending(null)} companyId={companyId} companyName={companyName} />
        <ConfirmDialog
          isOpen={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && deleteMutation.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
          title="حذف العرض السعري"
          message={`سيُحذف العرض ${deleting?.quoteNumber || ""} نهائياً. لا يمكن التراجع عن ذلك.`}
          confirmText="حذف"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default Quotes;
