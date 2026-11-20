import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Save, X, RotateCcw, Plus, Minus, Search, Package, Loader2, FileText, Info,
} from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Input, Card, Badge } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCreateReturn } from "../hooks/api/useReturns";
import { useSales } from "../hooks/api/useSales";
import { useCurrentShift } from "../hooks/api/useShifts";
import { formatCurrency } from "../utils/currencyUtils";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { saleService } from "../services/saleService";
import QtyInput from "../components/ui/QtyInput";
import { addQty, allowsDecimal, cartCountLabel, formatQty, qtyTimes, subQty, sumQty, toQty, unitOf } from "../utils/quantity";
import { METHOD } from "../components/payments/paymentLabels";
import type { PaymentMethodCode } from "../services/paymentService";
import { salePaymentLabel } from "../utils/paymentMethods";
import { CONDITIONS, defaultRefundMethod, isUnsellable, type ItemCondition } from "../components/returns/returnLabels";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dateOf = (d?: string) => (d ? new Date(d).toLocaleDateString("en-GB") : "");

interface ReturnItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
  condition: ItemCondition;
  allowDecimalQty?: boolean;
  unit?: string | null;
}

const PAY_STATUS: Record<string, { label: string; variant: "success" | "warning" | "error" }> = {
  PAID: { label: "مدفوعة", variant: "success" },
  PARTIAL: { label: "مدفوعة جزئياً", variant: "warning" },
  UNPAID: { label: "غير مدفوعة", variant: "error" },
};

/** Finds the invoice to return from: by number, customer name or phone, any date */
const SalePicker: React.FC<{ companyId: number; onPick: (id: number) => void }> = ({ companyId, onPick }) => {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isFetching } = useSales({ companyId, page: 1, limit: 8, ...(search && { search }) });
  const list: any[] = (data as any)?.data?.list || [];

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        الفاتورة الأصلية <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ابحث برقم الفاتورة أو اسم العميل أو رقم هاتفه"
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-9 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {isFetching && <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>
      <p className="mt-1 text-xs text-gray-500">{search ? "نتائج البحث" : "أحدث الفواتير"}</p>
      <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
        {list.length === 0 && !isFetching ? (
          <div className="px-4 py-6 text-center text-sm text-gray-500">لا توجد فواتير مطابقة</div>
        ) : (
          list.map((sale) => {
            const st = PAY_STATUS[sale.paymentStatus] || PAY_STATUS.PAID;
            return (
              <button
                key={sale.id}
                type="button"
                onClick={() => onPick(sale.id)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-right transition hover:bg-primary-50"
              >
                <span className="font-mono text-sm font-semibold text-gray-900" dir="ltr">{sale.receiptNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {sale.client?.name || sale.clientName || "عميل نقدي"}
                  {sale.client?.phone && <span className="mr-2 text-xs text-gray-400" dir="ltr">{sale.client.phone}</span>}
                </span>
                <span className="text-xs text-gray-500" dir="ltr">{dateOf(sale.saleDate || sale.createdAt)}</span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(Number(sale.totalAmount))}</span>
                <Badge variant={st.variant}>{st.label}</Badge>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const ReturnsCreate: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Managers can approve right away; a cashier's return waits for a manager
  const canApprove = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [completeNow, setCompleteNow] = useState(true);
  const [saleId, setSaleId] = useState<number | null>(Number(params.get("saleId")) || null);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundText, setRefundText] = useState<string | null>(null); // null = the suggested full refund
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [productSearch, setProductSearch] = useState("");
  const productsRef = React.useRef<HTMLDivElement>(null);

  // The full invoice: lines, what was already returned and what the client still owes on it
  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ["sale", saleId, companyId],
    queryFn: () => saleService.getById(String(saleId), companyId!),
    enabled: !!saleId && !!companyId,
    select: (data: any) => data?.data || data,
  });
  const shift = useCurrentShift(companyId || 0);
  const hasShift = !!(shift.data as any)?.hasOpenShift;

  useEffect(() => {
    if (sale?.id) setRefundMethod(defaultRefundMethod(sale));
  }, [sale?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSale = (id: number) => {
    setSaleId(id);
    setItems([]);
    setRefundText(null);
    setTimeout(() => productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  };
  const clearSale = () => {
    setSaleId(null);
    setItems([]);
    setRefundText(null);
  };

  // Price the customer actually paid per unit: line price with the invoice discount and tax spread over it
  const priceFactor = useMemo(() => {
    const subtotal = Number(sale?.subtotal) || 0;
    if (subtotal <= 0) return 1;
    return (subtotal - (Number(sale?.discountAmount) || 0) + (Number(sale?.taxAmount) || 0)) / subtotal;
  }, [sale]);

  const saleLines = (productId: any) => (sale?.items || []).filter((item: any) => item.product.id === productId);
  const soldQtyOf = (productId: any) => sumQty(saleLines(productId).map((l: any) => l.quantity));
  const unitPriceOf = (productId: any) => {
    const lines = saleLines(productId);
    const qty = sumQty(lines.map((l: any) => l.quantity));
    const value = lines.reduce((s: number, l: any) => s + toQty(l.quantity) * Number(l.unitPrice), 0);
    return qty ? round2((value / qty) * priceFactor) : 0;
  };
  const maxQtyOf = (productId: any) =>
    Math.max(0, subQty(soldQtyOf(productId), sale?.returnedQuantities?.[productId] || 0));

  const createReturnMutation = useCreateReturn();

  const addItem = (product: any) => {
    const existing = items.find((item) => item.productId === product.id);
    const maxQuantity = maxQtyOf(product.id);
    if (maxQuantity <= 0) {
      toast.error("تم إرجاع كل الكمية المباعة من هذا المنتج");
      return;
    }
    if (existing) {
      // weighed goods are typed; whole pieces go up by one
      if (existing.quantity >= maxQuantity || existing.allowDecimalQty) return;
      const next = Math.min(maxQuantity, addQty(existing.quantity, 1));
      setItems(items.map((item) => (item.productId === product.id ? { ...item, quantity: next, total: qtyTimes(next, item.unitPrice) } : item)));
      return;
    }
    const price = unitPriceOf(product.id);
    const weighed = allowsDecimal(product);
    // Weighed goods start with all that is left to return; the cashier can type less
    const quantity = weighed ? maxQuantity : 1;
    setItems([
      ...items,
      {
        productId: product.id, productName: product.name, quantity, unitPrice: price, total: qtyTimes(quantity, price),
        condition: "NEW", allowDecimalQty: weighed, unit: unitOf(product) || null,
      },
    ]);
  };

  const removeItem = (productId: number) => setItems(items.filter((item) => item.productId !== productId));

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    const q = Math.min(quantity, maxQtyOf(productId));
    setItems(items.map((item) => (item.productId === productId ? { ...item, quantity: q, total: qtyTimes(q, item.unitPrice) } : item)));
  };
  const setCondition = (productId: number, condition: ItemCondition) =>
    setItems(items.map((item) => (item.productId === productId ? { ...item, condition } : item)));

  const returnAllItems = () => {
    if (!sale?.items) return;
    const productIds = [...new Set(sale.items.map((item: any) => item.product.id))];
    const all = productIds
      .map((productId: any) => {
        const line = saleLines(productId)[0];
        const quantity = maxQtyOf(productId);
        const price = unitPriceOf(productId);
        return {
          productId, productName: line.product.name, quantity, unitPrice: price, total: qtyTimes(quantity, price),
          reason: "إرجاع كامل للفاتورة", condition: "NEW" as ItemCondition,
          allowDecimalQty: allowsDecimal(line.product), unit: unitOf(line.product) || null,
        };
      })
      .filter((item: any) => item.quantity > 0);
    if (all.length === 0) {
      toast.error("تم إرجاع كل أصناف هذه الفاتورة من قبل");
      return;
    }
    setItems(all);
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return (sale?.items || []).filter(
      (item: any) => !q || item.product.name.toLowerCase().includes(q) || item.product.sku?.toLowerCase().includes(q)
    );
  }, [sale, productSearch]);
  // one card per product even when the invoice has it on several lines
  const productCards = useMemo(() => {
    const seen = new Set();
    return filteredProducts.filter((item: any) => (seen.has(item.product.id) ? false : (seen.add(item.product.id), true)));
  }, [filteredProducts]);

  // Money: cash can only go back for the part the customer paid; the rest comes off his debt
  const subtotal = round2(items.reduce((sum, item) => sum + item.total, 0));
  const stillOwed = Number(sale?.remainingAmount) || 0;
  const maxRefund = round2(Math.max(0, subtotal - stillOwed));
  const refundAmount = refundText === null ? maxRefund : Math.max(0, Number(refundText) || 0);
  const debtCut = round2(Math.max(0, subtotal - refundAmount));
  const refundTooHigh = refundAmount > maxRefund + 0.001;
  const writtenOff = items.filter((i) => isUnsellable(i.condition));

  const approveNow = canApprove && completeNow;
  const needsShift = approveNow && refundAmount > 0 && refundMethod === "CASH";
  const blockedByShift = needsShift && !hasShift && !shift.isLoading;
  const canSubmit = !!sale && items.length > 0 && !refundTooHigh && !blockedByShift && !createReturnMutation.isPending;

  const submit = async () => {
    if (!sale) return toast.error("اختر الفاتورة الأصلية أولاً");
    if (items.length === 0) return toast.error("اختر المنتجات المرتجعة");
    if (refundTooHigh) return toast.error(`أقصى مبلغ يمكن رده ${formatCurrency(maxRefund)}`);
    try {
      const created: any = await createReturnMutation.mutateAsync({
        originalSaleId: sale.id,
        clientId: sale.clientId || undefined,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
        refundAmount,
        ...(refundAmount > 0 && { refundMethod }),
        completeNow: approveNow,
        items: items.map((item) => ({
          productId: String(item.productId),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          reason: item.reason,
          condition: item.condition,
        })),
        companyId: companyId!,
      });
      const id = created?.data?.id || created?.id;
      navigate(id ? `/returns/${id}` : "/returns");
    } catch {
      // the mutation already showed the server's message
    }
  };

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" />
              <span>العودة</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">إرجاع جديد</h1>
              <p className="text-sm text-gray-500">إرجاع أصناف من فاتورة بيع</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate("/returns")} variant="outline" className="text-gray-600 hover:text-gray-900">
              <X className="ml-1 h-4 w-4" />
              إلغاء
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {createReturnMutation.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
              {approveNow ? "حفظ واعتماد" : "حفظ المرتجع"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Invoice and details */}
          <Card padding="lg" className="lg:col-span-2">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-100 p-2">
                  <RotateCcw className="h-5 w-5 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">معلومات الإرجاع</h3>
              </div>

              {!saleId ? (
                <SalePicker companyId={companyId!} onPick={pickSale} />
              ) : saleLoading || !sale ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الفاتورة...
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <Link to={`/sales/${sale.id}`} className="whitespace-nowrap font-mono font-semibold text-primary-700 hover:underline" dir="ltr">
                        {sale.receiptNumber}
                      </Link>
                      <span className="text-xs text-gray-500" dir="ltr">{dateOf(sale.saleDate)}</span>
                    </div>
                    <button type="button" onClick={clearSale} className="text-xs font-medium text-primary-700 hover:underline">
                      تغيير الفاتورة
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <div className="text-xs text-gray-500">العميل</div>
                      <div className="font-medium text-gray-900">{sale.client?.name || "عميل نقدي"}</div>
                      {sale.client?.phone && <div className="text-xs text-gray-500" dir="ltr">{sale.client.phone}</div>}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">الإجمالي</div>
                      <div className="font-medium text-gray-900">{formatCurrency(Number(sale.totalAmount))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">طريقة الدفع</div>
                      <div className="font-medium text-gray-900">{salePaymentLabel(sale)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">المتبقي على العميل</div>
                      <div className={`font-medium ${stillOwed > 0 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(stillOwed)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input label="سبب الإرجاع" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: مقاس غير مناسب" />
                <Input label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية" />
              </div>

              {/* Refund */}
              {sale && items.length > 0 && (
                <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Input
                        label="المبلغ المردود للعميل"
                        type="number"
                        step="0.01"
                        min="0"
                        max={maxRefund}
                        value={refundText ?? String(maxRefund)}
                        onChange={(e) => setRefundText(e.target.value)}
                        error={refundTooHigh ? `أقصى مبلغ يمكن رده ${formatCurrency(maxRefund)}` : undefined}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        الحد الأقصى {formatCurrency(maxRefund)}
                        {stillOwed > 0 && ` (على الفاتورة ${formatCurrency(stillOwed)} غير مدفوعة تُخصم من المديونية أولاً)`}
                      </p>
                    </div>
                    {refundAmount > 0 && (
                      <div>
                        <span className="mb-1 block text-sm font-medium text-gray-700">طريقة رد المبلغ</span>
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="طريقة رد المبلغ">
                          {(Object.keys(METHOD) as PaymentMethodCode[]).map((code) => {
                            const m = METHOD[code];
                            const Icon = m.icon;
                            const on = refundMethod === code;
                            return (
                              <button
                                key={code}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setRefundMethod(code)}
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
                      </div>
                    )}
                  </div>
                  {blockedByShift ? (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        لا توجد وردية مفتوحة لك. المبلغ النقدي يخرج من درج الوردية، فافتح وردية أولاً{" "}
                        <Link to="/shifts" className="font-semibold underline">من صفحة الورديات</Link>
                        ، أو اختر طريقة رد أخرى.
                      </span>
                    </p>
                  ) : needsShift ? (
                    <p className="text-xs text-gray-500">يُخصم المبلغ من درج ورديتك الحالية.</p>
                  ) : null}
                </div>
              )}

              {canApprove ? (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} />
                  اعتماد المرتجع فوراً (إرجاع المخزون وخصم المديونية ورد المبلغ الآن)
                </label>
              ) : (
                <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  يُحفظ المرتجع في انتظار اعتماد المدير؛ يعود المخزون ويُرد المبلغ عند الاعتماد.
                </p>
              )}
            </div>
          </Card>

          {/* Summary */}
          <Card padding="lg">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <Package className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">ملخص الإرجاع</h3>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">عدد المنتجات</span>
                <span className="font-medium">{cartCountLabel(items)}</span>
              </div>
              {items.length > 0 && (
                <div className={`space-y-1 border-t border-gray-200 pt-2 ${items.length > 4 ? "max-h-28 overflow-y-auto" : ""}`}>
                  {items.map((item) => (
                    <div key={item.productId} className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-gray-600">
                        {item.productName}
                        {isUnsellable(item.condition) && <span className="mr-1 text-red-600">({CONDITIONS.find((c) => c.value === item.condition)?.label})</span>}
                      </span>
                      <span className="font-medium text-gray-900">{formatQty(item.quantity, item.unit)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 border-t border-gray-200 pt-3 text-sm">
                <div className="flex justify-between text-base font-semibold">
                  <span>قيمة المرتجع</span>
                  <span className="text-gray-900">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">يُخصم من مديونية العميل</span>
                  <span className="font-medium text-gray-900">{formatCurrency(debtCut)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    يُرد للعميل {approveNow ? "الآن" : "عند الاعتماد"}
                    {refundAmount > 0 && <span className="text-gray-400"> · {METHOD[refundMethod as PaymentMethodCode]?.label}</span>}
                  </span>
                  <span className="font-semibold text-green-600">{formatCurrency(refundAmount)}</span>
                </div>
              </div>
              {writtenOff.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  الأصناف التالفة أو المعيبة لا تعود للمخزون، وتُسجَّل في حركات المخزون كمرتجع مشطوب.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Products */}
        <div ref={productsRef} />
        <Card padding="lg">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Package className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">المنتجات المرتجعة</h3>
              </div>
              {sale && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{productCards.length} منتج في الفاتورة</span>
                  <Button type="button" variant="outline" size="sm" onClick={returnAllItems} className="border-green-200 text-green-600 hover:bg-green-50">
                    إرجاع الكل
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setItems([]); setRefundText(null); }} className="border-red-200 text-red-600 hover:bg-red-50">
                    مسح الكل
                  </Button>
                </div>
              )}
            </div>

            {sale && (
              <div className="relative max-w-md">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input placeholder="ابحث عن منتج في الفاتورة..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pr-10" />
              </div>
            )}

            {!sale ? (
              <div className="py-8 text-center text-gray-500">
                <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p>اختر الفاتورة الأصلية أولاً لعرض أصنافها</p>
              </div>
            ) : productCards.length === 0 ? (
              <div className="py-8 text-center text-gray-500">لا توجد منتجات مطابقة</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {productCards.map((line: any) => {
                  const product = line.product;
                  const selected = items.find((i) => i.productId === product.id);
                  const qty = selected?.quantity || 0;
                  const maxQuantity = maxQtyOf(product.id);
                  const done = maxQuantity <= 0;
                  return (
                    <div
                      key={product.id}
                      className={`rounded-lg border p-4 transition ${
                        selected ? "border-primary-500 bg-primary-50/50 shadow-sm" : done ? "border-gray-100 bg-gray-50 opacity-60" : "cursor-pointer border-gray-200 hover:border-primary-300 hover:shadow-sm"
                      }`}
                      onClick={() => !selected && !done && addItem(product)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-medium text-gray-900">{product.name}</h4>
                          {product.sku && <p className="text-xs text-gray-500" dir="ltr">{product.sku}</p>}
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-green-600">{formatCurrency(unitPriceOf(product.id))}</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        مباع {formatQty(soldQtyOf(product.id), unitOf(product))} · متاح للإرجاع {formatQty(maxQuantity, unitOf(product))}
                      </p>
                      {done && !selected && <p className="mt-1 text-xs text-orange-600">تم إرجاع كل الكمية</p>}

                      {selected && (
                        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-600">الكمية</span>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => updateQuantity(product.id, subQty(qty, 1))} className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="إنقاص">
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <QtyInput
                                product={product}
                                value={qty}
                                onChange={(q) => updateQuantity(product.id, q)}
                                onInvalid={(m) => toast.error(m)}
                                aria-label={`كمية ${product.name}`}
                                className={`${allowsDecimal(product) ? "w-16" : "w-10"} rounded border border-gray-200 px-1 text-center text-sm font-medium`}
                              />
                              <button type="button" onClick={() => updateQuantity(product.id, addQty(qty, 1))} disabled={qty >= maxQuantity} className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="زيادة">
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-600">حالة الصنف</span>
                            <div className="flex gap-1">
                              {CONDITIONS.map((c) => (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={() => setCondition(product.id, c.value)}
                                  className={`rounded-md border px-2 py-0.5 text-xs transition ${
                                    selected.condition === c.value
                                      ? isUnsellable(c.value) ? "border-red-400 bg-red-50 text-red-700" : "border-primary-500 bg-primary-50 text-primary-800"
                                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                                  }`}
                                >
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <button type="button" onClick={() => removeItem(product.id)} className="text-red-600 hover:underline">إزالة</button>
                            <span className="font-semibold text-gray-900">{formatCurrency(selected.total)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default ReturnsCreate;
