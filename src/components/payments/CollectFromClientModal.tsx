import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, Printer, X } from "lucide-react";
import { paymentService, type CollectFromClientResult, type PaymentMethodCode } from "../../services/paymentService";
import { useCurrentShift } from "../../hooks/api/useShifts";
import { useSessionAuthStore } from "../../stores/sessionAuthStore";
import { printReceipt } from "../../services/printService";
import { formatCurrency } from "../../utils/currencyUtils";
import { formatTableDate, toLocalDay } from "../../utils/dateUtils";
import { METHOD, apiError } from "./paymentLabels";

interface Props {
  client: { id: number; name: string; phone?: string | null } | null;
  onClose: () => void;
  companyId: number;
}

const money = (v: number) => Math.round(v * 100) / 100;

/**
 * Collect one amount from a customer: it pays their oldest unpaid invoices first.
 * Shows where the money will go before saving, and where it went after.
 */
const CollectFromClientModal: React.FC<Props> = ({ client, onClose, companyId }) => {
  const queryClient = useQueryClient();
  const { company, user } = useSessionAuthStore() as any;
  const shift = useCurrentShift(companyId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodCode>("CASH");
  const [date, setDate] = useState(toLocalDay(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CollectFromClientResult | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const open = useQuery({
    queryKey: ["open-invoices", companyId, "sale", "client", client?.id],
    queryFn: () => paymentService.openInvoices({ companyId, type: "sale", clientId: client!.id }),
    enabled: !!client && !!companyId,
  });
  const invoices = open.data?.data?.list || [];
  const owed = open.data?.data?.totalRemaining || 0;

  useEffect(() => {
    if (!client) return;
    setAmount("");
    setMethod("CASH");
    setDate(toLocalDay(new Date()));
    setReference("");
    setNotes("");
    setResult(null);
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!client) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, onClose]);

  useEffect(() => {
    if (open.isSuccess && invoices.length) setTimeout(() => amountRef.current?.focus(), 50);
  }, [open.isSuccess, invoices.length]);

  const value = Number(amount);
  const today = toLocalDay(new Date());

  /** Where the money goes, oldest invoice first (same rule as the server) */
  const plan = useMemo(() => {
    let left = Number.isFinite(value) && value > 0 ? value : 0;
    return invoices.map(inv => {
      const part = money(Math.min(left, inv.remaining));
      left = money(left - part);
      return { ...inv, part, after: money(inv.remaining - part) };
    });
  }, [invoices, value]);

  const error =
    !amount.trim() || !Number.isFinite(value) || value <= 0
      ? "اكتب المبلغ المستلم"
      : value > owed + 0.005
        ? `أكبر من المستحق على الفواتير (${formatCurrency(owed)})`
        : date > today
          ? "لا يمكن أن يكون التاريخ في المستقبل"
          : "";
  const blockedByShift = method === "CASH" && !shift.isLoading && !shift.data?.hasOpenShift;

  const collect = useMutation({
    mutationFn: () =>
      paymentService.collectFromClient(client!.id, {
        companyId,
        amount: money(value),
        paymentMethod: method,
        paymentDate: date,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: res => {
      setResult(res.data);
      ["payments", "sales", "sale", "current-shift", "open-invoices", "clients", "client-statement"].forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
    },
    onError: (e: any) => toast.error(apiError(e, "تعذر التحصيل")),
  });

  if (!client) return null;

  const printSlip = async () => {
    if (!result) return;
    try {
      const c = company?.company || company || {};
      const now = new Date();
      await printReceipt({
        receiptNumber: result.batch,
        date: now.toLocaleDateString("ar-EG-u-nu-latn"),
        time: now.toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" }),
        cashier: user?.fullname || user?.username || "",
        companyName: c.name || "",
        companyAddress: c.address,
        companyPhone: c.phone,
        companyTaxId: c.taxId || c.taxNumber,
        companyLogo: c.logoUrl,
        customerName: client.name,
        items: [],
        subtotal: result.total,
        discount: 0,
        tax: 0,
        total: result.total,
        paid: result.total,
        change: 0,
        paymentMethod: METHOD[method].label,
        headerText: "إيصال استلام من حساب العميل",
        footerText: [
          ...result.allocations.map(a => `${a.receiptNumber}: ${formatCurrency(a.amount)}${a.remainingAfter > 0 ? ` (يتبقى ${formatCurrency(a.remainingAfter)})` : " (مسددة)"}`),
          result.owedAfter > 0 ? `المتبقي على العميل: ${formatCurrency(result.owedAfter)}` : "سُددت كل فواتير العميل",
        ].join("\n"),
      } as any);
      toast.success("تم إرسال الإيصال للطابعة");
    } catch (e: any) {
      toast.error(`تعذرت الطباعة: ${e?.message || ""}`);
    }
  };

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="collect-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h3 id="collect-title" className="text-lg font-bold text-gray-900">
              تحصيل من حساب العميل
            </h3>
            <p className="truncate text-sm text-gray-500">{client.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <>
            <div className="space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <div>
                  <p className="font-semibold">تم تحصيل {formatCurrency(result.total)}</p>
                  <p className="text-sm">{result.owedAfter > 0.005 ? `المتبقي على العميل ${formatCurrency(result.owedAfter)}` : "سُددت كل فواتير العميل"}</p>
                </div>
              </div>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {result.allocations.map(a => (
                  <li key={a.paymentId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <Link to={`/sales/${a.saleId}`} onClick={onClose} className="font-medium text-primary-700 hover:underline" dir="ltr">
                      {a.receiptNumber}
                    </Link>
                    <span className="text-left">
                      <span className="block font-semibold text-gray-900">{formatCurrency(a.amount)}</span>
                      <span className={`block text-xs ${a.remainingAfter > 0.005 ? "text-gray-500" : "text-emerald-700"}`}>
                        {a.remainingAfter > 0.005 ? `يتبقى ${formatCurrency(a.remainingAfter)}` : "مسددة"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
              <button type="button" onClick={printSlip} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <Printer className="h-4 w-4" />
                طباعة إيصال
              </button>
              <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
                تم
              </button>
            </div>
          </>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={e => {
              e.preventDefault();
              if (error) return toast.error(error);
              if (blockedByShift) return toast.error("افتح وردية أولاً لتسجيل دفعة نقدية");
              collect.mutate();
            }}
            noValidate
          >
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              {open.isLoading ? (
                <p className="flex items-center gap-2 py-8 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري تحميل فواتير العميل...
                </p>
              ) : open.isError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{apiError(open.error, "تعذر تحميل فواتير العميل")}</p>
              ) : !invoices.length ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-400" />
                  <p className="font-medium text-gray-900">لا توجد فواتير غير مسددة</p>
                  <p className="mt-1 text-sm text-gray-500">كل فواتير هذا العميل مسددة.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
                    <span className="text-sm text-amber-900">
                      مستحق على {invoices.length === 1 ? "فاتورة واحدة" : `${invoices.length} فواتير`}
                    </span>
                    <span className="text-lg font-bold text-amber-900">{formatCurrency(owed)}</span>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="collect-amount" className="text-sm font-medium text-gray-700">
                        المبلغ المستلم
                      </label>
                      {Math.abs(value - owed) > 0.005 && (
                        <button type="button" onClick={() => setAmount(String(owed))} className="text-xs font-medium text-primary-700 hover:underline">
                          كامل المستحق
                        </button>
                      )}
                    </div>
                    <input
                      id="collect-amount"
                      ref={amountRef}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      dir="ltr"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className={`${field} text-right text-lg font-semibold ${amount && error && value > 0 ? "border-red-400" : ""}`}
                    />
                    {amount && value > owed + 0.005 && <p className="mt-1 text-xs text-red-600">{error}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="طريقة الدفع">
                    {(Object.keys(METHOD) as PaymentMethodCode[]).map(code => {
                      const m = METHOD[code];
                      const Icon = m.icon;
                      return (
                        <button
                          key={code}
                          type="button"
                          role="radio"
                          aria-checked={method === code}
                          onClick={() => setMethod(code)}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition sm:text-sm ${
                            method === code ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-500" : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  {blockedByShift && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        لا توجد وردية مفتوحة لك، والنقدية تدخل درج الوردية.{" "}
                        <Link to="/shifts" onClick={onClose} className="font-semibold underline">
                          افتح وردية
                        </Link>{" "}
                        أو اختر طريقة أخرى.
                      </span>
                    </p>
                  )}

                  {/* where it goes */}
                  <div>
                    <p className="mb-1 text-sm font-medium text-gray-700">يُوزَّع على الأقدم أولاً</p>
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                      {plan.map(inv => (
                        <li key={inv.id} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${inv.part > 0 ? "" : "opacity-60"}`}>
                          <span className="min-w-0">
                            <bdi dir="ltr" className="whitespace-nowrap font-medium text-gray-900">
                              {inv.number}
                            </bdi>
                            <span className="mr-2 text-xs text-gray-500">{formatTableDate(inv.date)}</span>
                            <span className="block text-xs text-gray-500">متبقي {formatCurrency(inv.remaining)}</span>
                          </span>
                          <span className="shrink-0 text-left">
                            {inv.part > 0 ? (
                              <>
                                <span className="block font-semibold text-emerald-700">{formatCurrency(inv.part)}</span>
                                <span className={`block text-xs ${inv.after > 0.005 ? "text-gray-500" : "text-emerald-700"}`}>
                                  {inv.after > 0.005 ? `يتبقى ${formatCurrency(inv.after)}` : "تُسدَّد"}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="collect-date" className="mb-1 block text-sm font-medium text-gray-700">
                        التاريخ
                      </label>
                      <input id="collect-date" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={field} />
                    </div>
                    <div>
                      <label htmlFor="collect-ref" className="mb-1 block text-sm font-medium text-gray-700">
                        المرجع <span className="font-normal text-gray-400">(اختياري)</span>
                      </label>
                      <input id="collect-ref" value={reference} onChange={e => setReference(e.target.value)} maxLength={191} className={field} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="collect-notes" className="mb-1 block text-sm font-medium text-gray-700">
                      ملاحظات <span className="font-normal text-gray-400">(اختياري)</span>
                    </label>
                    <input id="collect-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} className={field} />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
              <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!invoices.length || collect.isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {collect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {value > 0 && !error ? `تحصيل ${formatCurrency(money(value))}` : "تحصيل"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CollectFromClientModal;
