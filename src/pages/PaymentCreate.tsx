import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Info, Loader2, Search } from "lucide-react";
import { Layout } from "../components/layout";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCurrentShift } from "../hooks/api/useShifts";
import { paymentService, type OpenInvoice, type PaymentMethodCode } from "../services/paymentService";
import { saleService } from "../services/saleService";
import { METHOD, apiError } from "../components/payments/paymentLabels";
import { formatCurrency } from "../utils/currencyUtils";
import { formatTableDate, toLocalDay } from "../utils/dateUtils";

type Kind = "sale" | "purchase";

const money = (v: number) => Math.round(v * 100) / 100;

/** Debounced value: searching waits for a pause in typing */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const PaymentCreate: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;
  const [params] = useSearchParams();
  const presetSaleId = params.get("saleId");
  const { company, user } = useSessionAuthStore() as any;
  const companyId = Number(company?.companyId || company?.company?.id) || 0;
  const manager = !!user?.role && user.role !== "CASHIER";
  const shift = useCurrentShift(companyId);
  const hasShift = !!shift.data?.hasOpenShift;

  const [kind, setKind] = useState<Kind>("sale");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const [invoice, setInvoice] = useState<OpenInvoice | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodCode>("CASH");
  const [date, setDate] = useState(toLocalDay(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- edit: load the payment
  const existing = useQuery({
    queryKey: ["payment", editId, companyId],
    queryFn: () => paymentService.getById(editId!, companyId),
    enabled: isEdit && !!companyId,
  });
  const payment = existing.data?.data;
  useEffect(() => {
    if (!payment) return;
    const out = !!payment.purchaseId;
    setKind(out ? "purchase" : "sale");
    setInvoice({
      type: out ? "purchase" : "sale",
      id: (out ? payment.purchaseId : payment.saleId) as number,
      number: (out ? payment.purchase?.invoiceNumber : payment.sale?.receiptNumber) || "",
      date: payment.paymentDate,
      totalAmount: Number(out ? payment.purchase?.totalAmount : payment.sale?.totalAmount) || 0,
      paidAmount: Number(out ? payment.purchase?.paidAmount : payment.sale?.paidAmount) || 0,
      // what's left counting this payment back in
      remaining: money(Number(payment.documentRemaining || 0) + Number(payment.amount)),
      party: (out ? payment.purchase?.supplier : payment.sale?.client) || null,
    });
    setAmount(String(payment.amount));
    setMethod(payment.paymentMethod);
    setDate(toLocalDay(new Date(payment.paymentDate)));
    setReference(payment.reference || "");
    setNotes(payment.notes || "");
  }, [payment]);

  // ---------------------------------------------------------------- create: pick an unpaid invoice
  const open = useQuery({
    queryKey: ["open-invoices", companyId, kind, debounced],
    queryFn: () => paymentService.openInvoices({ companyId, type: kind, search: debounced || undefined }),
    enabled: !isEdit && !!companyId && !invoice,
    placeholderData: prev => prev,
  });
  const choices = open.data?.data?.list || [];

  const pick = (inv: OpenInvoice) => {
    setInvoice(inv);
    setAmount(String(inv.remaining));
    setTouched(false);
    setTimeout(() => amountRef.current?.select(), 0);
  };

  // opened from an invoice ("تسجيل دفعة"): select it straight away
  const [presetState, setPresetState] = useState<"idle" | "loading" | "paid" | "missing">(presetSaleId ? "loading" : "idle");
  useEffect(() => {
    if (!presetSaleId || isEdit || !companyId) return;
    let alive = true;
    (async () => {
      try {
        const res: any = await saleService.getById(presetSaleId, companyId);
        const sale = res?.data ?? res;
        if (!sale?.receiptNumber) throw new Error("missing");
        const found = await paymentService.openInvoices({ companyId, type: "sale", search: sale.receiptNumber });
        const inv = found.data?.list?.find(r => String(r.id) === String(presetSaleId));
        if (!alive) return;
        if (inv) {
          pick(inv);
          setPresetState("idle");
        } else setPresetState("paid");
      } catch {
        if (alive) setPresetState("missing");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSaleId, companyId]);

  // ---------------------------------------------------------------- validation
  const value = Number(amount);
  const max = invoice?.remaining ?? 0;
  const today = toLocalDay(new Date());
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!invoice) e.invoice = "اختر الفاتورة";
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) e.amount = "اكتب مبلغاً أكبر من صفر";
    else if (invoice && value > max + 0.005) e.amount = `أكبر من المتبقي على الفاتورة (${formatCurrency(max)})`;
    if (!date) e.date = "اختر التاريخ";
    else if (date > today) e.date = "لا يمكن أن يكون التاريخ في المستقبل";
    return e;
  }, [invoice, amount, value, max, date, today]);
  const valid = Object.keys(errors).length === 0;

  const wasCash = payment?.paymentMethod === "CASH";
  const cashChange = isEdit
    ? (method === "CASH" || wasCash) && (method !== payment?.paymentMethod || money(value) !== Number(payment?.amount))
    : method === "CASH";
  const closedShift = isEdit && payment?.drawer?.some(d => d.shift.status === "CLOSED");
  const blockedByShift = cashChange && !hasShift && !shift.isLoading;

  // ---------------------------------------------------------------- save
  const done = (saleId?: number | null, purchaseId?: number | null, paymentId?: string) => {
    ["payments", "payment", "sales", "sale", "purchases", "purchase", "current-shift", "open-invoices", "clients"].forEach(k =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
    if (presetSaleId) navigate(`/sales/${presetSaleId}`);
    else if (paymentId) navigate(`/payments/${paymentId}`);
    else navigate(saleId ? `/sales/${saleId}` : purchaseId ? `/purchases/${purchaseId}` : "/payments");
  };
  const save = useMutation({
    mutationFn: async () => {
      const common = { companyId, amount: money(value), paymentMethod: method, reference: reference.trim(), notes: notes.trim(), paymentDate: date };
      if (isEdit) return paymentService.update(editId!, common);
      return paymentService.create({ ...common, ...(kind === "sale" ? { saleId: invoice!.id } : { purchaseId: invoice!.id }) });
    },
    onSuccess: (res: any) => {
      toast.success(isEdit ? "تم حفظ التعديل" : `تم تسجيل دفعة ${formatCurrency(money(value))}`);
      const p = res?.data;
      done(p?.saleId, p?.purchaseId, p?.id);
    },
    onError: (e: any) => toast.error(apiError(e, "تعذر حفظ الدفعة")),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    if (blockedByShift) {
      toast.error("افتح وردية أولاً لتسجيل دفعة نقدية");
      return;
    }
    save.mutate();
  };

  // ---------------------------------------------------------------- view
  const field = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20";
  const border = (k: string) => (touched && errors[k] ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-primary-500");
  const back = () => (presetSaleId ? navigate(`/sales/${presetSaleId}`) : isEdit ? navigate(`/payments/${editId}`) : navigate("/payments"));

  if (isEdit && existing.isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl animate-pulse space-y-4">
          <div className="h-8 w-1/2 rounded bg-gray-200" />
          <div className="h-40 rounded-2xl bg-gray-200" />
          <div className="h-64 rounded-2xl bg-gray-200" />
        </div>
      </Layout>
    );
  }
  if (isEdit && (existing.isError || !payment)) {
    return (
      <Layout>
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="mb-4 text-gray-600">تعذر تحميل الدفعة. ربما حُذفت.</p>
          <Link to="/payments" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">
            العودة إلى المدفوعات
          </Link>
        </div>
      </Layout>
    );
  }

  const after = invoice && Number.isFinite(value) ? money(max - value) : null;

  return (
    <Layout>
      <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-4" noValidate>
        <div className="flex items-start gap-2">
          <button type="button" onClick={back} aria-label="رجوع" className="mt-0.5 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? "تعديل دفعة" : "تسجيل دفعة"}</h1>
            <p className="text-sm text-gray-500">{isEdit ? "يتغير المتبقي على الفاتورة ودرج النقدية تلقائياً" : "دفعة على فاتورة آجلة أو جزء منها"}</p>
          </div>
        </div>

        {/* 1. the invoice */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">الفاتورة</h2>

          {!invoice && !isEdit && (
            <>
              {manager && (
                <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع الدفعة">
                  {(
                    [
                      ["sale", "تحصيل من عميل", ArrowDownLeft, "فاتورة بيع آجلة"],
                      ["purchase", "دفع لمورد", ArrowUpRight, "فاتورة شراء"],
                    ] as const
                  ).map(([k, label, Icon, hint]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      onClick={() => {
                        setKind(k);
                        setSearch("");
                      }}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right transition ${
                        kind === k ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${k === "sale" ? "text-emerald-600" : "text-red-600"}`} />
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">{label}</span>
                        <span className="block text-xs text-gray-500">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {presetState === "loading" ? (
                <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري تحميل الفاتورة...
                </p>
              ) : (
                <>
                  {presetState === "paid" && (
                    <p className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <Check className="h-4 w-4" />
                      هذه الفاتورة مسددة بالكامل. يمكنك اختيار فاتورة أخرى.
                    </p>
                  )}
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={kind === "sale" ? "ابحث برقم الفاتورة أو اسم العميل أو الهاتف" : "ابحث برقم فاتورة الشراء أو اسم المورد"}
                      className={`${field} border-gray-300 pr-9 focus:border-primary-500`}
                      autoFocus={!presetSaleId}
                    />
                  </div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                    {open.isLoading && !choices.length ? (
                      <p className="py-6 text-center text-sm text-gray-500">جاري البحث...</p>
                    ) : choices.length ? (
                      choices.map(inv => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => pick(inv)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-right transition hover:border-primary-300 hover:bg-primary-50/40"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-gray-900">
                              <bdi dir="ltr" className="whitespace-nowrap">{inv.number}</bdi>
                              <span className="mr-2 text-xs font-normal text-gray-500">{formatTableDate(inv.date)}</span>
                            </span>
                            <span className="block truncate text-xs text-gray-500">{inv.party?.name || (kind === "sale" ? "عميل نقدي" : "مورد")}</span>
                          </span>
                          <span className="shrink-0 text-left">
                            <span className="block text-sm font-bold text-gray-900">{formatCurrency(inv.remaining)}</span>
                            <span className="block text-[11px] text-gray-500">متبقي من {formatCurrency(inv.totalAmount)}</span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="py-6 text-center text-sm text-gray-500">
                        {debounced ? "لا توجد فاتورة غير مسددة تطابق البحث" : kind === "sale" ? "لا توجد فواتير بيع غير مسددة" : "لا توجد فواتير شراء غير مسددة"}
                      </p>
                    )}
                  </div>
                  {choices.length >= 30 && <p className="mt-2 text-xs text-gray-500">يظهر أحدث 30 فاتورة. ابحث لتجد الأقدم.</p>}
                </>
              )}
            </>
          )}

          {invoice && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {invoice.type === "sale" ? "فاتورة بيع" : "فاتورة شراء"} <bdi dir="ltr" className="whitespace-nowrap">{invoice.number}</bdi>
                  </p>
                  <p className="truncate text-xs text-gray-500">{invoice.party?.name || (invoice.type === "sale" ? "عميل نقدي" : "مورد")}</p>
                </div>
                {!isEdit && !presetSaleId && (
                  <button type="button" onClick={() => setInvoice(null)} className="text-sm font-medium text-primary-700 hover:underline">
                    تغيير
                  </button>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white p-2">
                  <dt className="text-[11px] text-gray-500">الإجمالي</dt>
                  <dd className="text-sm font-semibold text-gray-900">{formatCurrency(invoice.totalAmount)}</dd>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <dt className="text-[11px] text-gray-500">{isEdit ? "مدفوع قبل هذه الدفعة" : "مدفوع"}</dt>
                  <dd className="text-sm font-semibold text-gray-900">{formatCurrency(money(invoice.totalAmount - invoice.remaining))}</dd>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <dt className="text-[11px] text-gray-500">المتبقي</dt>
                  <dd className="text-sm font-bold text-amber-700">{formatCurrency(invoice.remaining)}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        {/* 2. the payment */}
        {invoice && (
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900">الدفعة</h2>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="pay-amount" className="text-sm font-medium text-gray-700">
                  المبلغ
                </label>
                {Math.abs(value - max) > 0.005 && (
                  <button type="button" onClick={() => setAmount(String(max))} className="text-xs font-medium text-primary-700 hover:underline">
                    كامل المتبقي ({formatCurrency(max)})
                  </button>
                )}
              </div>
              <input
                id="pay-amount"
                ref={amountRef}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                dir="ltr"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && !!errors.amount}
                className={`${field} ${border("amount")} text-right text-lg font-semibold`}
              />
              {touched && errors.amount ? (
                <p className="mt-1 text-xs text-red-600">{errors.amount}</p>
              ) : (
                after !== null &&
                value > 0 && (
                  <p className={`mt-1 text-xs ${after <= 0.005 ? "text-emerald-700" : "text-gray-500"}`}>
                    {after <= 0.005 ? "تُسدَّد الفاتورة بالكامل" : `يتبقى على الفاتورة ${formatCurrency(after)}`}
                  </p>
                )
              )}
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">الطريقة</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="طريقة الدفع">
                {(Object.keys(METHOD) as PaymentMethodCode[]).map(code => {
                  const m = METHOD[code];
                  const Icon = m.icon;
                  const on = method === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setMethod(code)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        on ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-500" : "border-gray-200 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {blockedByShift ? (
                <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    لا توجد وردية مفتوحة لك. الدفعات النقدية تدخل أو تخرج من درج الوردية، فافتح وردية أولاً
                    {" "}
                    <Link to="/shifts" className="font-semibold underline">
                      من صفحة الورديات
                    </Link>
                    ، أو اختر طريقة أخرى.
                  </span>
                </p>
              ) : (
                method === "CASH" &&
                hasShift && (
                  <p className="mt-2 text-xs text-gray-500">
                    {kind === "sale" ? "يُضاف المبلغ إلى درج ورديتك الحالية." : "يُخصم المبلغ من درج ورديتك الحالية."}
                  </p>
                )
              )}
              {closedShift && cashChange && !blockedByShift && (
                <p className="mt-2 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  وردية هذه الدفعة أُغلقت وجُرد درجها، فلن تتغير. الفرق النقدي يُسجَّل كتصحيح في ورديتك الحالية.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pay-date" className="mb-1 block text-sm font-medium text-gray-700">
                  التاريخ
                </label>
                <input
                  id="pay-date"
                  type="date"
                  value={date}
                  max={today}
                  onChange={e => setDate(e.target.value)}
                  className={`${field} ${border("date")}`}
                />
                {touched && errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
              </div>
              <div>
                <label htmlFor="pay-ref" className="mb-1 block text-sm font-medium text-gray-700">
                  المرجع <span className="font-normal text-gray-400">(اختياري)</span>
                </label>
                <input
                  id="pay-ref"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  maxLength={191}
                  placeholder={method === "BANK_TRANSFER" ? "رقم التحويل" : method === "MOBILE_WALLET" ? "رقم العملية" : "رقم إيصال أو شيك"}
                  className={`${field} border-gray-300 focus:border-primary-500`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="pay-notes" className="mb-1 block text-sm font-medium text-gray-700">
                ملاحظات <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <textarea
                id="pay-notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                maxLength={1000}
                className={`${field} resize-y border-gray-300 focus:border-primary-500`}
              />
            </div>
          </section>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={back} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={!invoice || save.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "حفظ التعديل" : value > 0 && invoice ? `حفظ دفعة ${formatCurrency(money(value))}` : "حفظ الدفعة"}
          </button>
        </div>
      </form>
    </Layout>
  );
};

export default PaymentCreate;
