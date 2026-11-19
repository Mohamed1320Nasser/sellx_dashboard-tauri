import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit,
  FileText,
  Mail,
  MoreVertical,
  Printer,
  Receipt,
  ShoppingCart,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { ConfirmDialog } from "../components/ui";
import ConvertQuoteModal from "../components/quotes/ConvertQuoteModal";
import { Masked, RevealButton, useReveal } from "../components/ui/Secret";
import { useConvertQuoteToSale, useDeleteQuote, useEmailQuote, useQuote, useUpdateQuote } from "../hooks/api/useQuotes";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { formatTableDate } from "../utils/dateUtils";
import { formatCurrency } from "../utils/currencyUtils";
import { formatQty, unitOf } from "../utils/quantity";
import { downloadQuotePdf, printQuoteA4, printQuoteThermal } from "../services/quotePrintService";
import type { Quote, QuoteItem, QuoteStatus } from "../types";

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
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
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
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(o => !o)} className={buttonClass}>
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ElementType; onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }> = ({
  icon: Icon,
  onClick,
  danger,
  disabled,
  children,
}) => (
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
    return { main: formatQty(Number(item.packQty), item.packName || "عبوة"), sub: `${formatQty(Number(item.quantity), unit || "قطعة")}` };
  }
  return { main: formatQty(Number(item.quantity), unit), sub: "" };
}
const priceOf = (item: QuoteItem) => (item.packId && item.packQty ? Number(item.packPrice) : Number(item.unitPrice));
function discountText(item: QuoteItem) {
  if (Number(item.discountPercent) > 0) return `\u2066${Number(item.discountPercent)}%\u2069`;
  if (Number(item.lineDiscount) > 0) return formatCurrency(Number(item.lineDiscount));
  return "—";
}

/** "10%" kept left-to-right inside Arabic text (else it shows as "%10") */
const Pct: React.FC<{ v: number }> = ({ v }) => <bdi dir="ltr">{v}%</bdi>;

const isExpired = (q: Quote) => !!q.validUntil && !q.convertedToSaleId && new Date(String(q.validUntil).slice(0, 10) + "T23:59:59") < new Date();

const StateMessage: React.FC<{ title: string; text: string; onBack: () => void; tone?: "error" }> = ({ title, text, onBack, tone }) => (
  <div className="mx-auto max-w-md py-16 text-center">
    <FileText className={`mx-auto mb-4 h-14 w-14 ${tone === "error" ? "text-red-300" : "text-gray-300"}`} />
    <h2 className="mb-1 text-lg font-semibold text-gray-900">{title}</h2>
    <p className="mb-5 text-sm text-gray-500">{text}</p>
    <button type="button" onClick={onBack} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
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
  const deleteMutation = useDeleteQuote();
  const convertMutation = useConvertQuoteToSale();
  const emailMutation = useEmailQuote();
  const updateMutation = useUpdateQuote();
  const [showConvert, setShowConvert] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showProfit, toggleProfit] = useReveal();
  const [params, setParams] = useSearchParams();

  // "تحويل لفاتورة" from the quotes list lands here with ?convert=1
  useEffect(() => {
    if (params.get("convert") !== "1" || !quote) return;
    if (!quote.convertedToSaleId) setShowConvert(true);
    setParams({}, { replace: true });
  }, [params, quote, setParams]);

  const back = () => navigate("/quotes");

  /** One runner for every print button: progress, then success or the reason it failed */
  const runPrint = async (job: () => Promise<void>, busy: string, done: string) => {
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
        <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4">
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
        <StateMessage tone="error" title="تعذر تحميل العرض" text={(error as any)?.message || "حدث خطأ أثناء تحميل العرض السعري"} onBack={back} />
      </Layout>
    );
  }
  if (!quote) {
    return (
      <Layout>
        <StateMessage title="العرض غير موجود" text="ربما حُذف هذا العرض السعري." onBack={back} />
      </Layout>
    );
  }

  const status = STATUS[quote.status] || STATUS.DRAFT;
  const expired = isExpired(quote);
  const converted = !!quote.convertedToSaleId;
  const items = [...(quote.items || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const customCount = items.filter(i => !i.productId).length;
  const discount = Number(quote.totalDiscount) || 0;
  const fee = Number(quote.additionalFee) || 0;
  const taxable = Number(quote.subtotal) - discount;
  const profit = quote.totalProfit != null ? Number(quote.totalProfit) : null;
  const margin = profit != null && taxable > 0 ? Math.round((profit / taxable) * 1000) / 10 : null;
  const terms = quote.terms || [];

  const setStatus = (s: QuoteStatus) => updateMutation.mutate({ id: quote.id, data: { companyId, status: s } });

  const convert = (options: { clientId?: number; customLines: any[] }) =>
    convertMutation.mutate(
      { id: quote.id, companyId, ...options },
      {
        onSuccess: (res: any) => {
          setShowConvert(false);
          const saleId = res?.data?.saleId;
          if (saleId) navigate(`/sales/${saleId}`);
        },
      }
    );

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50";

  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button type="button" onClick={back} aria-label="رجوع" className="mt-0.5 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
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
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>{status.label}</span>
                {expired && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">منتهي الصلاحية</span>}
                {converted && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">محوّل لفاتورة</span>}
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                <bdi>{quote.customerName || quote.client?.name || "بدون اسم"}</bdi> · <bdi>{formatTableDate(quote.createdAt)}</bdi>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!converted && (
              <button type="button" onClick={() => navigate(`/quotes/${quote.id}/edit`)} className={btn}>
                <Edit className="h-4 w-4" />
                تعديل
              </button>
            )}
            <Menu
              ariaLabel="طباعة وتحميل"
              buttonClass={btn}
              label={
                <>
                  <Printer className="h-4 w-4" />
                  طباعة
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              }
            >
              {close => (
                <>
                  <MenuItem
                    icon={FileText}
                    onClick={() => {
                      close();
                      runPrint(() => printQuoteA4(quote), "جاري تجهيز الطباعة...", "تم فتح نافذة الطباعة");
                    }}
                  >
                    طباعة A4
                  </MenuItem>
                  <MenuItem
                    icon={Receipt}
                    onClick={() => {
                      close();
                      runPrint(() => printQuoteThermal(quote), "جاري الطباعة...", "تم إرسال العرض للطابعة");
                    }}
                  >
                    طباعة حرارية
                  </MenuItem>
                  <MenuItem
                    icon={Download}
                    onClick={() => {
                      close();
                      runPrint(() => downloadQuotePdf(quote), "جاري إنشاء ملف PDF...", "تم تحميل ملف PDF");
                    }}
                  >
                    تحميل PDF
                  </MenuItem>
                </>
              )}
            </Menu>
            {!converted && quote.status !== "REJECTED" && (
              <button
                type="button"
                onClick={() => setShowConvert(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                <ShoppingCart className="h-4 w-4" />
                تحويل لفاتورة
              </button>
            )}
            <Menu ariaLabel="إجراءات أخرى" buttonClass="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50" label={<MoreVertical className="h-4 w-4" />}>
              {close => (
                <>
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
                  {converted && !quote.customerEmail && <p className="px-3 py-2 text-xs text-gray-500">لا إجراءات أخرى لعرض محوّل</p>}
                </>
              )}
            </Menu>
          </div>
        </div>

        {/* State banners */}
        {converted && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              تم تحويل هذا العرض إلى فاتورة، ولا يمكن تعديله.
            </span>
            {quote.convertedToSale && (
              <Link to={`/sales/${quote.convertedToSale.id}`} className="font-semibold underline-offset-2 hover:underline">
                فتح الفاتورة <span dir="ltr">#{quote.convertedToSale.receiptNumber}</span>
              </Link>
            )}
          </div>
        )}
        {expired && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            انتهت صلاحية العرض في {formatTableDate(quote.validUntil!)}. راجع الأسعار قبل التحويل أو عدّل تاريخ الصلاحية.
          </div>
        )}

        {/* Document */}
        <article className={`${card} overflow-hidden`}>
          <div className="grid gap-5 border-b border-gray-100 p-5 sm:grid-cols-2 sm:p-6">
            <section>
              <h2 className="mb-2 text-xs font-medium text-gray-500">مقدَّم إلى</h2>
              <p className="flex items-center gap-2 text-base font-semibold text-gray-900">
                {quote.customerName || quote.client?.name || "—"}
                {quote.clientId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                    <User className="h-3 w-3" />
                    عميل مسجل
                  </span>
                )}
              </p>
              {quote.customerContact && (
                <p className="mt-1 text-sm text-gray-600" dir="ltr" style={{ textAlign: "right" }}>
                  {quote.customerContact}
                </p>
              )}
              {quote.customerEmail && (
                <p className="mt-0.5 text-sm text-gray-600" dir="ltr" style={{ textAlign: "right" }}>
                  {quote.customerEmail}
                </p>
              )}
            </section>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:justify-self-end">
              <dt className="text-gray-500">رقم العرض</dt>
              <dd className="font-medium text-gray-900" dir="ltr" style={{ textAlign: "right" }}>
                {quote.quoteNumber}
              </dd>
              <dt className="text-gray-500">التاريخ</dt>
              <dd className="text-gray-900">{formatTableDate(quote.createdAt)}</dd>
              <dt className="text-gray-500">صالح حتى</dt>
              <dd className={expired ? "font-medium text-amber-700" : "text-gray-900"}>{quote.validUntil ? formatTableDate(quote.validUntil) : "بدون مدة"}</dd>
            </dl>
          </div>

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
            {items.length === 0 && <p className="px-6 py-8 text-center text-sm text-gray-500">لا توجد بنود في هذا العرض</p>}
            {items.map((item, k) => {
              const q = qtyText(item);
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-gray-100 px-5 py-3 first:border-t-0 md:grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_5rem_8rem] md:items-start md:px-6"
                >
                  <span className="hidden pt-0.5 text-xs text-gray-400 md:block">{k + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {item.productName}
                      {!item.productId && (
                        <span className="mr-2 rounded-full bg-violet-100 px-2 py-0.5 align-middle text-[11px] font-medium text-violet-700">غير مسجل</span>
                      )}
                    </p>
                    {item.productSku && (
                      <p className="text-xs text-gray-400" dir="ltr" style={{ textAlign: "right" }}>
                        {item.productSku}
                      </p>
                    )}
                    {item.description && <p className="mt-1 whitespace-pre-line text-xs leading-5 text-gray-600">{item.description}</p>}
                    {/* phone: the numbers under the name */}
                    <p className="mt-1 text-xs text-gray-500 md:hidden">
                      {q.main} × {formatCurrency(priceOf(item))}
                      {discountText(item) !== "—" && ` · خصم ${discountText(item)}`}
                      {q.sub && ` · ${q.sub}`}
                    </p>
                  </div>
                  <div className="hidden text-center text-sm text-gray-800 md:block">
                    {q.main}
                    {q.sub && <p className="text-xs text-gray-500">{q.sub}</p>}
                  </div>
                  <span className="hidden text-center text-sm text-gray-800 md:block">{formatCurrency(priceOf(item))}</span>
                  <span className={`hidden text-center text-sm md:block ${discountText(item) === "—" ? "text-gray-400" : "text-emerald-700"}`}>{discountText(item)}</span>
                  <span className="whitespace-nowrap text-left text-sm font-semibold text-gray-900">{formatCurrency(Number(item.lineTotal))}</span>
                </div>
              );
            })}
          </div>

          {/* Totals + terms */}
          <div className="grid gap-6 border-t border-gray-200 bg-gray-50/60 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="order-2 space-y-4 md:order-1">
              {terms.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-gray-900">الشروط</h2>
                  <dl className="space-y-1.5 text-sm">
                    {terms.map((t, i) => (
                      <div key={i} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                        <dt className="text-gray-500">{t.label}</dt>
                        <dd className="whitespace-pre-line text-gray-900">{t.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {quote.notes && (
                <section>
                  <h2 className="mb-1 text-sm font-semibold text-gray-900">ملاحظات</h2>
                  <p className="whitespace-pre-line text-sm text-gray-700">{quote.notes}</p>
                </section>
              )}
              {!terms.length && !quote.notes && <p className="text-sm text-gray-400">لا شروط أو ملاحظات على هذا العرض.</p>}
            </div>

            <dl className="order-1 space-y-2 text-sm md:order-2">
              <div className="flex justify-between">
                <dt className="text-gray-600">المجموع</dt>
                <dd className="font-medium text-gray-900">{formatCurrency(Number(quote.subtotal))}</dd>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">
                    خصم
                    {quote.orderDiscountType === "PERCENT" && quote.orderDiscountValue ? (
                      <>
                        {" "}
                        <Pct v={Number(quote.orderDiscountValue)} />
                      </>
                    ) : null}
                  </dt>
                  <dd className="font-medium text-emerald-700">−{formatCurrency(discount)}</dd>
                </div>
              )}
              {Number(quote.taxAmount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">
                    الضريبة <Pct v={Number(quote.taxPercent)} />
                  </dt>
                  <dd className="font-medium text-gray-900">{formatCurrency(Number(quote.taxAmount))}</dd>
                </div>
              )}
              {fee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">{quote.additionalFeeLabel || "رسوم إضافية"}</dt>
                  <dd className="font-medium text-gray-900">{formatCurrency(fee)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                <dt className="font-semibold text-gray-900">الإجمالي</dt>
                <dd className="text-xl font-bold text-gray-900">{formatCurrency(Number(quote.total))}</dd>
              </div>
            </dl>
          </div>
        </article>

        {/* Internal: never printed */}
        {profit != null && (
          <div className={`${card} flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm`}>
            <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
              <RevealButton shown={showProfit} onToggle={toggleProfit} what="التكلفة والربح" />
              للإدارة فقط — لا يظهر للعميل
            </span>
            <span className="text-gray-600">
              التكلفة{" "}
              <b className="font-semibold text-gray-900">
                <Masked shown={showProfit}>{formatCurrency(Number(quote.totalCost) || 0)}</Masked>
              </b>
            </span>
            <span className="text-gray-600">
              الربح{" "}
              <b className={`font-semibold ${profit < 0 ? "text-red-600" : "text-emerald-700"}`}>
                <Masked shown={showProfit}>
                  {formatCurrency(profit)}
                  {margin != null && (
                    <span className="mr-1 font-normal text-gray-500">
                      هامش <Pct v={margin} />
                    </span>
                  )}
                </Masked>
              </b>
            </span>
            {showProfit && customCount > 0 && <span className="text-xs text-gray-500">يشمل {customCount} بند غير مسجل بالتكلفة المكتوبة له</span>}
          </div>
        )}
      </div>

      <ConvertQuoteModal
        isOpen={showConvert}
        onClose={() => setShowConvert(false)}
        quote={quote}
        companyId={companyId}
        converting={convertMutation.isPending}
        onConvert={convert}
      />
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => deleteMutation.mutate(quote.id, { onSuccess: () => navigate("/quotes") })}
        title="حذف العرض السعري"
        message={`سيُحذف العرض ${quote.quoteNumber} نهائياً. لا يمكن التراجع عن ذلك.`}
        confirmText="حذف"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default QuoteView;
