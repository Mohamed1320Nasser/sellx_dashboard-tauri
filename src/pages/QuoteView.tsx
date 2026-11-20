import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Lock,
  Phone,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit,
  Eye,
  FileText,
  Link2,
  Link2Off,
  Copy,
  Mail,
  MessageCircle,
  MoreVertical,
  Printer,
  Receipt,
  ShoppingCart,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadCompanyProfile } from "../services/companyProfile";
import {
  copyText,
  openExternal,
  quoteShareLink,
  whatsappNumber,
} from "../utils/whatsapp";
import SendQuoteModal from "../components/quotes/SendQuoteModal";
import { quoteService } from "../services/quoteService";
import { Layout } from "../components/layout";
import { ConfirmDialog } from "../components/ui";
import ConvertQuoteModal from "../components/quotes/ConvertQuoteModal";
import { Masked, RevealButton, useReveal } from "../components/ui/Secret";
import {
  useConvertQuoteToSale,
  useDeleteQuote,
  useEmailQuote,
  useQuote,
  useUpdateQuote,
} from "../hooks/api/useQuotes";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { formatDateTime, formatTableDate } from "../utils/dateUtils";
import { formatCurrency } from "../utils/currencyUtils";
import { formatQty, unitOf } from "../utils/quantity";
import {
  downloadQuotePdf,
  printQuoteA4,
  printQuoteThermal,
} from "../services/quotePrintService";
import type { Quote, QuoteItem, QuoteStatus } from "../types";
import {
  HeaderAction,
  HeaderDivider,
  headerActionClass,
} from "../components/common/HeaderAction";

const card = "rounded-2xl border border-gray-200 bg-white shadow-sm";

const STATUS: Record<QuoteStatus, { label: string; cls: string }> = {
  DRAFT: { label: "مسودة", cls: "bg-gray-100 text-gray-700" },
  SENT: { label: "مُرسل", cls: "bg-blue-100 text-blue-700" },
  PRINTED: { label: "مطبوع", cls: "bg-sky-100 text-sky-700" },
  ACCEPTED: { label: "مقبول", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "مرفوض", cls: "bg-red-100 text-red-700" },
};

/** A small popup menu: closes on an outside click or Escape */
const Menu: React.FC<{
  label: React.ReactNode;
  ariaLabel: string;
  buttonClass: string;
  children: (close: () => void) => React.ReactNode;
}> = ({ label, ariaLabel, buttonClass, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ icon: Icon, onClick, danger, disabled, children }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm disabled:opacity-50 ${
      danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
    }`}
  >
    <Icon className="h-4 w-4" />
    {children}
  </button>
);

/** How a line's quantity reads: "2 كرتونة" with the pieces under it, or "3 متر" */
function qtyText(item: QuoteItem) {
  const unit = item.productId ? unitOf(item.product) : item.unit || "";
  if (item.packId && item.packQty) {
    return {
      main: formatQty(Number(item.packQty), item.packName || "عبوة"),
      sub: `${formatQty(Number(item.quantity), unit || "قطعة")}`,
    };
  }
  return { main: formatQty(Number(item.quantity), unit), sub: "" };
}
const priceOf = (item: QuoteItem) =>
  item.packId && item.packQty ? Number(item.packPrice) : Number(item.unitPrice);
function discountText(item: QuoteItem) {
  if (Number(item.discountPercent) > 0)
    return `\u2066${Number(item.discountPercent)}%\u2069`;
  if (Number(item.lineDiscount) > 0)
    return formatCurrency(Number(item.lineDiscount));
  return "—";
}

/** "10%" kept left-to-right inside Arabic text (else it shows as "%10") */
const Pct: React.FC<{ v: number }> = ({ v }) => <bdi dir="ltr">{v}%</bdi>;

const isExpired = (q: Quote) =>
  !!q.validUntil &&
  !q.convertedToSaleId &&
  new Date(String(q.validUntil).slice(0, 10) + "T23:59:59") < new Date();

const DAY = 24 * 60 * 60 * 1000;

/** "متبقي 14 يوم" / "ينتهي اليوم" / "منتهي" for the validity date */
function validityOf(
  q: Quote,
  converted: boolean,
): { label: string; cls: string } | null {
  if (!q.validUntil || converted) return null;
  const end = new Date(
    String(q.validUntil).slice(0, 10) + "T00:00:00",
  ).getTime();
  const today = new Date(new Date().toDateString()).getTime();
  const days = Math.round((end - today) / DAY);
  if (days < 0) return { label: "منتهي", cls: "bg-amber-100 text-amber-800" };
  if (days === 0)
    return { label: "ينتهي اليوم", cls: "bg-amber-100 text-amber-800" };
  if (days === 1)
    return { label: "متبقي يوم", cls: "bg-amber-50 text-amber-700" };
  return {
    label: `متبقي ${days} ${days <= 10 ? "أيام" : "يوم"}`,
    cls:
      days <= 3
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700",
  };
}

type HistoryItem = {
  at: string;
  label: string;
  dot: string;
  link?: { to: string; text: string };
};

/** What happened to the quote, oldest first */
function historyOf(q: Quote, views: number): HistoryItem[] {
  const list: HistoryItem[] = [
    { at: q.createdAt, label: "أُنشئ العرض", dot: "bg-gray-400" },
  ];
  if (q.sharePdfAt) {
    // only the latest send is kept: after the first view it was a re-send
    const resent =
      !!q.firstViewedAt && new Date(q.sharePdfAt) > new Date(q.firstViewedAt);
    list.push({
      at: q.sharePdfAt,
      label: resent ? "أُعيد إرساله للعميل" : "أُرسل للعميل",
      dot: "bg-blue-500",
    });
  }
  if (q.firstViewedAt)
    list.push({
      at: q.firstViewedAt,
      label: "فتحه العميل أول مرة",
      dot: "bg-emerald-500",
    });
  if (views > 1 && q.lastViewedAt)
    list.push({
      at: q.lastViewedAt,
      label: `آخر فتح (${views} مرات)`,
      dot: "bg-emerald-500",
    });
  if (q.convertedToSale?.createdAt)
    list.push({
      at: q.convertedToSale.createdAt,
      label: "حُوّل لفاتورة",
      dot: "bg-primary-600",
      link: {
        to: `/sales/${q.convertedToSale.id}`,
        text: q.convertedToSale.receiptNumber,
      },
    });
  return list.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

/** draft → sent → opened → accepted → invoice, with rejected / expired shown where they happen */
const QuoteProgress: React.FC<{
  quote: Quote;
  views: number;
  shared: boolean;
  expired: boolean;
}> = ({ quote, views, shared, expired }) => {
  const converted = !!quote.convertedToSaleId;
  const accepted = converted || quote.status === "ACCEPTED";
  const rejected = !converted && quote.status === "REJECTED";
  const sent =
    converted ||
    accepted ||
    rejected ||
    ["SENT", "PRINTED"].includes(quote.status) ||
    !!quote.sharePdfAt ||
    views > 0;
  type Step = { label: string; state: "done" | "todo" | "bad" | "warn" };
  const steps: Step[] = [
    { label: "مسودة", state: "done" },
    {
      label: quote.status === "PRINTED" && !shared ? "طُبع" : "أُرسل",
      state: sent ? "done" : "todo",
    },
  ];
  if (shared || views > 0)
    steps.push({
      label: views ? `فتحه العميل (${views})` : "فتحه العميل",
      state: views ? "done" : "todo",
    });
  if (rejected) steps.push({ label: "مرفوض", state: "bad" });
  else {
    steps.push({
      label: "مقبول",
      state: accepted ? "done" : expired ? "warn" : "todo",
    });
    steps.push({
      label: converted ? "فاتورة" : "تحويل لفاتورة",
      state: converted ? "done" : "todo",
    });
  }
  const dot = {
    done: "bg-primary-600 text-white",
    todo: "bg-white text-gray-400 ring-1 ring-gray-300",
    bad: "bg-red-600 text-white",
    warn: "bg-amber-500 text-white",
  };
  const text = {
    done: "text-gray-900",
    todo: "text-gray-400",
    bad: "text-red-700",
    warn: "text-amber-700",
  };
  return (
    <div className={`${card} overflow-x-auto px-4 py-3`}>
      <ol className="flex min-w-max items-center">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center">
            {i > 0 && (
              <span
                className={`mx-2 h-px w-8 sm:w-14 ${s.state === "todo" ? "bg-gray-200" : "bg-primary-300"}`}
              />
            )}
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${dot[s.state]}`}
            >
              {s.state === "done" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : s.state === "bad" ? (
                <XCircle className="h-4 w-4" />
              ) : s.state === "warn" ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`mr-2 whitespace-nowrap text-sm font-medium ${text[s.state]}`}
            >
              {s.label}
            </span>
          </li>
        ))}
        {expired && !rejected && (
          <li className="mr-4 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            منتهي الصلاحية
          </li>
        )}
      </ol>
    </div>
  );
};

const StateMessage: React.FC<{
  title: string;
  text: string;
  onBack: () => void;
  tone?: "error";
}> = ({ title, text, onBack, tone }) => (
  <div className="mx-auto max-w-md py-16 text-center">
    <FileText
      className={`mx-auto mb-4 h-14 w-14 ${tone === "error" ? "text-red-300" : "text-gray-300"}`}
    />
    <h2 className="mb-1 text-lg font-semibold text-gray-900">{title}</h2>
    <p className="mb-5 text-sm text-gray-500">{text}</p>
    <button
      type="button"
      onClick={onBack}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
    >
      العودة إلى العروض
    </button>
  </div>
);

const QuoteView: React.FC = () => {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || company?.company?.id) || 0;

  const { data: quote, isLoading, error } = useQuote(id, companyId);
  const { data: profile } = useQuery({
    queryKey: ["company-profile", companyId],
    queryFn: loadCompanyProfile,
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });
  const deleteMutation = useDeleteQuote();
  const convertMutation = useConvertQuoteToSale();
  const emailMutation = useEmailQuote();
  const updateMutation = useUpdateQuote();
  const [showConvert, setShowConvert] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showProfit, toggleProfit] = useReveal();
  const [sending, setSending] = useState(false);
  const [showUnshare, setShowUnshare] = useState(false);
  const [unsharing, setUnsharing] = useState(false);
  const [params, setParams] = useSearchParams();

  // "تحويل لفاتورة" from the quotes list lands here with ?convert=1
  useEffect(() => {
    if (params.get("convert") !== "1" || !quote) return;
    if (!quote.convertedToSaleId) setShowConvert(true);
    setParams({}, { replace: true });
  }, [params, quote, setParams]);

  const queryClient = useQueryClient();
  const back = () => navigate("/quotes");

  /** One runner for every print button: progress, then success or the reason it failed */
  const runPrint = async (
    job: () => Promise<void>,
    busy: string,
    done: string,
  ) => {
    const toastId = "quote-print";
    toast.loading(busy, { id: toastId });
    try {
      await job();
      toast.success(done, { id: toastId });
    } catch (e: any) {
      console.error("Quote print error:", e);
      toast.error(e?.message || "فشلت الطباعة", { id: toastId });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="w-full animate-pulse space-y-4">
          <div className="h-10 w-2/3 rounded-lg bg-gray-200" />
          <div className="h-40 rounded-2xl bg-gray-200" />
          <div className="h-72 rounded-2xl bg-gray-200" />
        </div>
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <StateMessage
          tone="error"
          title="تعذر تحميل العرض"
          text={(error as any)?.message || "حدث خطأ أثناء تحميل العرض السعري"}
          onBack={back}
        />
      </Layout>
    );
  }
  if (!quote) {
    return (
      <Layout>
        <StateMessage
          title="العرض غير موجود"
          text="ربما حُذف هذا العرض السعري."
          onBack={back}
        />
      </Layout>
    );
  }

  const status = STATUS[quote.status] || STATUS.DRAFT;
  const expired = isExpired(quote);
  const converted = !!quote.convertedToSaleId;
  const items = [...(quote.items || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const customCount = items.filter((i) => !i.productId).length;
  const discount = Number(quote.totalDiscount) || 0;
  const fee = Number(quote.additionalFee) || 0;
  const taxable = Number(quote.subtotal) - discount;
  const profit = quote.totalProfit != null ? Number(quote.totalProfit) : null;
  const margin =
    profit != null && taxable > 0
      ? Math.round((profit / taxable) * 1000) / 10
      : null;
  const terms = quote.terms || [];

  const setStatus = (s: QuoteStatus) =>
    updateMutation.mutate({ id: quote.id, data: { companyId, status: s } });

  const convert = (options: { clientId?: number; customLines: any[] }) =>
    convertMutation.mutate(
      { id: quote.id, companyId, ...options },
      {
        onSuccess: (res: any) => {
          setShowConvert(false);
          const saleId = res?.data?.saleId;
          if (saleId) navigate(`/sales/${saleId}`);
        },
      },
    );

  const sendWhatsApp = () => setSending(true);
  const shareLink = quote.shareToken ? quoteShareLink(quote.shareToken) : "";
  const views = quote.viewCount || 0;
  const phone = quote.customerContact || quote.client?.phone || "";
  const companyInfo = {
    name:
      profile?.name ||
      (company as any)?.company?.name ||
      (company as any)?.name ||
      "",
    address: profile?.address || "",
    phone: profile?.phone || "",
    logoUrl: profile?.logoUrl || "",
  };
  const validity = validityOf(quote, converted);
  const history = historyOf(quote, views);

  const unshare = async () => {
    setUnsharing(true);
    try {
      await quoteService.unshare(quote.id, companyId);
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("تم إيقاف الرابط. لن يفتح عند العميل بعد الآن");
      setShowUnshare(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.msg || e?.message || "تعذر إيقاف الرابط");
    } finally {
      setUnsharing(false);
    }
  };

  const btn = headerActionClass();

  return (
    <Layout>
      <div className="w-full space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={back}
              aria-label="رجوع"
              className="mt-0.5 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">
                  عرض سعر{" "}
                  <span dir="ltr" className="whitespace-nowrap">
                    {quote.quoteNumber}
                  </span>
                </h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}
                >
                  {status.label}
                </span>
                {expired && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    منتهي الصلاحية
                  </span>
                )}
                {converted && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    محوّل لفاتورة
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                <bdi>
                  {quote.customerName || quote.client?.name || "بدون اسم"}
                </bdi>{" "}
                · <bdi>{formatTableDate(quote.createdAt)}</bdi>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Menu
              ariaLabel="طباعة وتحميل"
              buttonClass={btn}
              label={
                <>
                  <Printer className="h-4 w-4 text-gray-500" />
                  طباعة
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </>
              }
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={FileText}
                    onClick={() => {
                      close();
                      runPrint(
                        () => printQuoteA4(quote),
                        "جاري تجهيز الطباعة...",
                        "تم فتح نافذة الطباعة",
                      );
                    }}
                  >
                    طباعة A4
                  </MenuItem>
                  <MenuItem
                    icon={Receipt}
                    onClick={() => {
                      close();
                      runPrint(
                        () => printQuoteThermal(quote),
                        "جاري الطباعة...",
                        "تم إرسال العرض للطابعة",
                      );
                    }}
                  >
                    طباعة حرارية
                  </MenuItem>
                  <MenuItem
                    icon={Download}
                    onClick={() => {
                      close();
                      runPrint(
                        () => downloadQuotePdf(quote),
                        "جاري إنشاء ملف PDF...",
                        "تم تحميل ملف PDF",
                      );
                    }}
                  >
                    تحميل PDF
                  </MenuItem>
                </>
              )}
            </Menu>
            <button
              type="button"
              onClick={sendWhatsApp}
              title={
                whatsappNumber(quote.customerContact || quote.client?.phone)
                  ? `إرسال إلى ${quote.customerContact || quote.client?.phone}`
                  : "إرسال على واتساب"
              }
              className={btn}
            >
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              واتساب
            </button>
            {!converted && <HeaderDivider />}
            {!converted && (
              <HeaderAction
                icon={Edit}
                label="تعديل"
                onClick={() => navigate(`/quotes/${quote.id}/edit`)}
              />
            )}
            {!converted && quote.status !== "REJECTED" && (
              <HeaderAction
                icon={ShoppingCart}
                label="تحويل لفاتورة"
                onClick={() => setShowConvert(true)}
                tone="primary"
              />
            )}
            <Menu
              ariaLabel="إجراءات أخرى"
              buttonClass={headerActionClass("default", true)}
              label={<MoreVertical className="h-4 w-4 text-gray-500" />}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={Copy}
                    onClick={() => {
                      close();
                      navigate(`/quotes/create?from=${quote.id}`);
                    }}
                  >
                    نسخ إلى عرض جديد
                  </MenuItem>
                  {quote.customerEmail && (
                    <MenuItem
                      icon={Mail}
                      disabled={emailMutation.isPending}
                      onClick={() => {
                        close();
                        emailMutation.mutate({ id: quote.id, companyId });
                      }}
                    >
                      إرسال بالبريد
                    </MenuItem>
                  )}
                  {!converted && quote.status !== "ACCEPTED" && (
                    <MenuItem
                      icon={CheckCircle2}
                      onClick={() => {
                        close();
                        setStatus("ACCEPTED");
                      }}
                    >
                      تسجيل كمقبول
                    </MenuItem>
                  )}
                  {!converted && quote.status !== "REJECTED" && (
                    <MenuItem
                      icon={XCircle}
                      onClick={() => {
                        close();
                        setStatus("REJECTED");
                      }}
                    >
                      تسجيل كمرفوض
                    </MenuItem>
                  )}
                  {!converted && (
                    <MenuItem
                      icon={Trash2}
                      danger
                      onClick={() => {
                        close();
                        setShowDelete(true);
                      }}
                    >
                      حذف العرض
                    </MenuItem>
                  )}
                </>
              )}
            </Menu>
          </div>
        </div>

        {/* Where the quote is */}
        <QuoteProgress
          quote={quote}
          views={views}
          shared={!!shareLink}
          expired={expired}
        />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
          {/* Total and validity (first on a phone) */}
          <section className={`${card} p-5 lg:col-start-2 lg:row-start-1`}>
            <p className="text-xs font-medium text-gray-500">إجمالي العرض</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
              {formatCurrency(Number(quote.total))}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {items.length} بند
              {customCount > 0 && ` · ${customCount} غير مسجل`}
              {discount > 0 && <> · خصم {formatCurrency(discount)}</>}
            </p>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-gray-600">
                <CalendarClock className="h-4 w-4 text-gray-400" />
                {quote.validUntil ? (
                  <>
                    صالح حتى <bdi>{formatTableDate(quote.validUntil)}</bdi>
                  </>
                ) : (
                  "بدون مدة صلاحية"
                )}
              </span>
              {validity && (
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${validity.cls}`}
                >
                  {validity.label}
                </span>
              )}
            </div>
            {expired && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                راجع الأسعار قبل التحويل أو عدّل تاريخ الصلاحية.
              </p>
            )}
            {converted && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> حُوّل لفاتورة
                </span>
                {quote.convertedToSale && (
                  <Link
                    to={`/sales/${quote.convertedToSale.id}`}
                    className="whitespace-nowrap font-mono font-semibold hover:underline"
                    dir="ltr"
                  >
                    {quote.convertedToSale.receiptNumber}
                  </Link>
                )}
              </div>
            )}
            {quote.status === "REJECTED" && !converted && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <XCircle className="h-4 w-4" /> سُجّل العرض كمرفوض
              </p>
            )}
          </section>

          {/* The paper: what the customer gets */}
          <article
            className={`${card} overflow-hidden lg:col-start-1 lg:row-span-2 lg:row-start-1`}
          >
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary-600 p-5 sm:p-6">
              <div className="flex min-w-0 items-center gap-3">
                {companyInfo.logoUrl ? (
                  <img
                    src={companyInfo.logoUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-contain"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-lg font-bold text-white">
                    {(companyInfo.name || "S").trim().charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-900">
                    {companyInfo.name}
                  </p>
                  {companyInfo.address && (
                    <p className="text-xs text-gray-500">
                      {companyInfo.address}
                    </p>
                  )}
                  {companyInfo.phone && (
                    <p
                      className="text-xs text-gray-500"
                      dir="ltr"
                      style={{ textAlign: "right" }}
                    >
                      {companyInfo.phone}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-left">
                <span className="inline-block rounded-md bg-gray-900 px-3 py-1 text-sm font-bold text-white">
                  عرض سعر
                </span>
                <p
                  className="mt-1.5 font-mono text-sm font-semibold text-gray-900"
                  dir="ltr"
                >
                  {quote.quoteNumber}
                </p>
              </div>
            </header>

            <div className="grid gap-5 border-b border-gray-100 p-5 sm:grid-cols-2 sm:p-6">
              <section>
                <h2 className="mb-1.5 text-xs font-medium text-gray-500">
                  مقدَّم إلى
                </h2>
                <p className="text-base font-semibold text-gray-900">
                  {quote.customerName || quote.client?.name || "—"}
                </p>
                {(quote.customerContact || quote.client?.phone) && (
                  <p
                    className="mt-0.5 text-sm text-gray-600"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {quote.customerContact || quote.client?.phone}
                  </p>
                )}
                {quote.customerEmail && (
                  <p
                    className="text-sm text-gray-600"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {quote.customerEmail}
                  </p>
                )}
              </section>
              <dl className="grid grid-cols-[auto_auto] content-start gap-x-6 gap-y-1.5 text-sm sm:justify-self-end">
                <dt className="text-gray-500">التاريخ</dt>
                <dd className="text-gray-900">
                  {formatTableDate(quote.createdAt)}
                </dd>
                <dt className="text-gray-500">صالح حتى</dt>
                <dd
                  className={
                    expired ? "font-medium text-amber-700" : "text-gray-900"
                  }
                >
                  {quote.validUntil
                    ? formatTableDate(quote.validUntil)
                    : "بدون مدة"}
                </dd>
              </dl>
            </div>

            {quote.subject && (
              <p className="border-b border-gray-100 px-5 py-3 text-sm sm:px-6">
                <span className="text-gray-500">الموضوع </span>
                <span className="font-semibold text-gray-900">
                  {quote.subject}
                </span>
              </p>
            )}

            {/* Lines */}
            <div>
              <div className="hidden grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_5rem_8rem] gap-3 bg-gray-50 px-6 py-2.5 text-xs font-medium text-gray-500 md:grid">
                <span>#</span>
                <span>البند</span>
                <span className="text-center">الكمية</span>
                <span className="text-center">السعر</span>
                <span className="text-center">الخصم</span>
                <span className="text-left">الإجمالي</span>
              </div>
              {items.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  لا توجد بنود في هذا العرض
                </p>
              )}
              {items.map((item, k) => {
                const q = qtyText(item);
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-gray-100 px-5 py-3 first:border-t-0 md:grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_5rem_8rem] md:items-start md:px-6"
                  >
                    <span className="hidden pt-0.5 text-xs text-gray-400 md:block">
                      {k + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.productName}
                        {!item.productId && (
                          <span className="mr-2 rounded-full bg-violet-100 px-2 py-0.5 align-middle text-[11px] font-medium text-violet-700">
                            غير مسجل
                          </span>
                        )}
                      </p>
                      {item.productSku && (
                        <p
                          className="text-xs text-gray-400"
                          dir="ltr"
                          style={{ textAlign: "right" }}
                        >
                          {item.productSku}
                        </p>
                      )}
                      {item.description && (
                        <p className="mt-1 whitespace-pre-line text-xs leading-5 text-gray-600">
                          {item.description}
                        </p>
                      )}
                      {/* phone: the numbers under the name */}
                      <p className="mt-1 text-xs text-gray-500 md:hidden">
                        {q.main} × {formatCurrency(priceOf(item))}
                        {discountText(item) !== "—" &&
                          ` · خصم ${discountText(item)}`}
                        {q.sub && ` · ${q.sub}`}
                      </p>
                    </div>
                    <div className="hidden text-center text-sm text-gray-800 md:block">
                      {q.main}
                      {q.sub && (
                        <p className="text-xs text-gray-500">{q.sub}</p>
                      )}
                    </div>
                    <span className="hidden text-center text-sm text-gray-800 md:block">
                      {formatCurrency(priceOf(item))}
                    </span>
                    <span
                      className={`hidden text-center text-sm md:block ${discountText(item) === "—" ? "text-gray-400" : "text-emerald-700"}`}
                    >
                      {discountText(item)}
                    </span>
                    <span className="whitespace-nowrap text-left text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(item.lineTotal))}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Terms + totals */}
            <div className="grid gap-6 border-t border-gray-200 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="order-2 space-y-4 md:order-1">
                {terms.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-sm font-semibold text-gray-900">
                      الشروط
                    </h2>
                    <dl className="space-y-1.5 text-sm">
                      {terms.map((t, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"
                        >
                          <dt className="text-gray-500">{t.label}</dt>
                          <dd className="whitespace-pre-line text-gray-900">
                            {t.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {quote.notes && (
                  <section>
                    <h2 className="mb-1 text-sm font-semibold text-gray-900">
                      ملاحظات
                    </h2>
                    <p className="whitespace-pre-line text-sm text-gray-700">
                      {quote.notes}
                    </p>
                  </section>
                )}
                {!terms.length && !quote.notes && (
                  <p className="text-sm text-gray-400">
                    لا شروط أو ملاحظات على هذا العرض.
                  </p>
                )}
              </div>

              <dl className="order-1 overflow-hidden rounded-xl border border-gray-200 text-sm md:order-2">
                <div className="flex justify-between px-4 py-2">
                  <dt className="text-gray-600">المجموع</dt>
                  <dd className="font-medium text-gray-900">
                    {formatCurrency(Number(quote.subtotal))}
                  </dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between border-t border-gray-100 px-4 py-2">
                    <dt className="text-gray-600">
                      خصم
                      {quote.orderDiscountType === "PERCENT" &&
                      quote.orderDiscountValue ? (
                        <>
                          {" "}
                          <Pct v={Number(quote.orderDiscountValue)} />
                        </>
                      ) : null}
                    </dt>
                    <dd className="font-medium text-emerald-700">
                      −{formatCurrency(discount)}
                    </dd>
                  </div>
                )}
                {Number(quote.taxAmount) > 0 && (
                  <div className="flex justify-between border-t border-gray-100 px-4 py-2">
                    <dt className="text-gray-600">
                      الضريبة <Pct v={Number(quote.taxPercent)} />
                    </dt>
                    <dd className="font-medium text-gray-900">
                      {formatCurrency(Number(quote.taxAmount))}
                    </dd>
                  </div>
                )}
                {fee > 0 && (
                  <div className="flex justify-between border-t border-gray-100 px-4 py-2">
                    <dt className="text-gray-600">
                      {quote.additionalFeeLabel || "رسوم إضافية"}
                    </dt>
                    <dd className="font-medium text-gray-900">
                      {formatCurrency(fee)}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between bg-gray-900 px-4 py-3 text-white">
                  <dt className="font-semibold">الإجمالي</dt>
                  <dd className="text-lg font-bold">
                    {formatCurrency(Number(quote.total))}
                  </dd>
                </div>
              </dl>
            </div>
          </article>

          {/* Side: customer, link, history, profit */}
          <aside className="space-y-5 lg:col-start-2 lg:row-start-2">
            <section className={`${card} p-5`}>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">
                العميل
              </h2>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {quote.clientId ? (
                    <Link
                      to={`/clients/${quote.clientId}/statement`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      {quote.customerName || quote.client?.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-gray-900">
                      {quote.customerName || "بدون اسم"}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    {quote.clientId
                      ? "عميل مسجل · كشف الحساب"
                      : "عميل غير مسجل"}
                  </p>
                </div>
              </div>
              {(phone || quote.customerEmail) && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className={headerActionClass()}
                      dir="ltr"
                    >
                      <Phone className="h-4 w-4 text-gray-500" />
                      {phone}
                    </a>
                  )}
                  {phone && (
                    <button
                      type="button"
                      onClick={sendWhatsApp}
                      className={headerActionClass("default", true)}
                      title="واتساب"
                      aria-label="واتساب"
                    >
                      <MessageCircle className="h-4 w-4 text-emerald-600" />
                    </button>
                  )}
                  {quote.customerEmail && (
                    <a
                      href={`mailto:${quote.customerEmail}`}
                      className={headerActionClass("default", true)}
                      title={quote.customerEmail}
                      aria-label="بريد"
                    >
                      <Mail className="h-4 w-4 text-gray-500" />
                    </a>
                  )}
                </div>
              )}
            </section>

            {(shareLink || (!converted && quote.status !== "REJECTED")) && (
              <section className={`${card} p-5`}>
                <h2 className="mb-3 text-sm font-semibold text-gray-900">
                  رابط العميل
                </h2>
                {shareLink ? (
                  <>
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${views ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}
                      >
                        {views ? (
                          <Eye className="h-5 w-5" />
                        ) : (
                          <Link2 className="h-5 w-5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {views
                            ? views === 1
                              ? "فتحه العميل مرة واحدة"
                              : `فتحه العميل ${views} مرات`
                            : "لم يفتحه العميل بعد"}
                        </p>
                        {quote.lastViewedAt && (
                          <p className="text-xs text-gray-500">
                            آخر مرة{" "}
                            <bdi>{formatDateTime(quote.lastViewedAt)}</bdi>
                          </p>
                        )}
                      </div>
                    </div>
                    {!quote.sharePdfAt && (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        عُدّل العرض بعد الإرسال: الصفحة تعرض البيانات الجديدة،
                        والـ PDF يُحدَّث عند الإرسال مرة أخرى.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={async () =>
                          (await copyText(shareLink))
                            ? toast.success("تم نسخ الرابط")
                            : toast.error("تعذر النسخ")
                        }
                        className={headerActionClass()}
                      >
                        <Copy className="h-4 w-4 text-gray-500" /> نسخ
                      </button>
                      <button
                        type="button"
                        onClick={() => openExternal(`${shareLink}?preview=1`)}
                        className={headerActionClass()}
                      >
                        <Eye className="h-4 w-4 text-gray-500" /> معاينة
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowUnshare(true)}
                        className={headerActionClass("danger")}
                      >
                        <Link2Off className="h-4 w-4" /> إيقاف
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-500">
                      لم يُرسل رابط للعميل بعد. أرسله على واتساب لتعرف متى
                      يفتحه.
                    </p>
                    <button
                      type="button"
                      onClick={sendWhatsApp}
                      className={`${headerActionClass()} mt-3`}
                    >
                      <MessageCircle className="h-4 w-4 text-emerald-600" />{" "}
                      إرسال على واتساب
                    </button>
                  </>
                )}
              </section>
            )}

            <section className={`${card} p-5`}>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">
                السجل
              </h2>
              <ol className="relative space-y-3 border-r border-gray-200 pr-4">
                {history.map((h, i) => (
                  <li key={i} className="relative">
                    <span
                      className={`absolute -right-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${h.dot}`}
                    />
                    <p className="text-sm text-gray-900">
                      {h.label}
                      {h.link && (
                        <Link
                          to={h.link.to}
                          className="mr-1 whitespace-nowrap font-mono text-primary-700 hover:underline"
                          dir="ltr"
                        >
                          {h.link.text}
                        </Link>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      <bdi>{formatDateTime(h.at)}</bdi>
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            {/* Internal: never printed */}
            {profit != null && (
              <section className={`${card} p-5`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">
                    التكلفة والربح
                  </h2>
                  <RevealButton
                    shown={showProfit}
                    onToggle={toggleProfit}
                    what="التكلفة والربح"
                  />
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">التكلفة</dt>
                    <dd className="font-medium text-gray-900">
                      <Masked shown={showProfit}>
                        {formatCurrency(Number(quote.totalCost) || 0)}
                      </Masked>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">الربح</dt>
                    <dd
                      className={`font-semibold ${profit < 0 ? "text-red-600" : "text-emerald-700"}`}
                    >
                      <Masked shown={showProfit}>
                        {formatCurrency(profit)}
                      </Masked>
                    </dd>
                  </div>
                  {margin != null && (
                    <div className="flex justify-between">
                      <dt className="text-gray-600">الهامش</dt>
                      <dd className="font-medium text-gray-900">
                        <Masked shown={showProfit}>
                          <Pct v={margin} />
                        </Masked>
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                  <Lock className="h-3.5 w-3.5" /> للإدارة فقط، لا يظهر للعميل
                  {showProfit &&
                    customCount > 0 &&
                    ` · يشمل ${customCount} بند غير مسجل بالتكلفة المكتوبة له`}
                </p>
              </section>
            )}
          </aside>
        </div>
      </div>

      <ConvertQuoteModal
        isOpen={showConvert}
        onClose={() => setShowConvert(false)}
        quote={quote}
        companyId={companyId}
        converting={convertMutation.isPending}
        onConvert={convert}
      />
      <SendQuoteModal
        quote={sending ? quote : null}
        onClose={() => setSending(false)}
        companyId={companyId}
        companyName={
          (company as any)?.company?.name || (company as any)?.name || ""
        }
      />
      <ConfirmDialog
        isOpen={showUnshare}
        onClose={() => setShowUnshare(false)}
        onConfirm={unshare}
        title="إيقاف رابط العميل"
        message="لن يفتح الرابط المرسل عند العميل بعد الآن. إذا أرسلت العرض مرة أخرى سيُنشأ رابط جديد."
        confirmText="إيقاف الرابط"
        isLoading={unsharing}
      />
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() =>
          deleteMutation.mutate(quote.id, {
            onSuccess: () => navigate("/quotes"),
          })
        }
        title="حذف العرض السعري"
        message={`سيُحذف العرض ${quote.quoteNumber} نهائياً. لا يمكن التراجع عن ذلك.`}
        confirmText="حذف"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default QuoteView;
