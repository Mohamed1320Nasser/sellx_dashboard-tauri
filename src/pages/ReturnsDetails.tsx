import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Check, Download, Loader2, Package, Printer, RotateCcw, User, Wallet, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { Badge, Button, Card } from "../components/ui";
import { formatCurrency } from "../utils/currencyUtils";
import { formatTableDate } from "../utils/dateUtils";
import { useReturn, useUpdateReturnStatus } from "../hooks/api/useReturns";
import { useCurrentShift } from "../hooks/api/useShifts";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { ReturnStatus } from "../types";
import { formatQty, unitOf } from "../utils/quantity";
import { METHOD, methodOf } from "../components/payments/paymentLabels";
import type { PaymentMethodCode } from "../services/paymentService";
import { RETURN_STATUS, conditionLabel, defaultRefundMethod, isUnsellable } from "../components/returns/returnLabels";
import { downloadReturnPdf, printReturnA4 } from "../components/returns/returnDoc";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="mt-0.5 text-sm font-medium text-gray-900">{children}</div>
  </div>
);

const ReturnsDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const { data: raw, isLoading, error } = useReturn(id || "", companyId);
  const ret: any = (raw as any)?.data || raw;
  const updateStatus = useUpdateReturnStatus();
  const shift = useCurrentShift(companyId);
  const hasShift = !!(shift.data as any)?.hasOpenShift;
  const [method, setMethod] = useState("CASH");
  const [busy, setBusy] = useState<"" | "pdf" | "print">("");

  useEffect(() => {
    if (ret?.id) setMethod(ret.refundMethod || defaultRefundMethod(ret.originalSale));
  }, [ret?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحميل...
        </div>
      </Layout>
    );
  }
  if (error || !ret?.id) {
    return (
      <Layout>
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <div className="text-gray-700">لم يتم العثور على المرتجع</div>
          <Button variant="outline" onClick={() => navigate("/returns")}>العودة للمرتجعات</Button>
        </div>
      </Layout>
    );
  }

  const total = Number(ret.totalAmount) || 0;
  const refund = Number(ret.refundAmount) || 0;
  const debtCut = Math.max(0, total - refund);
  const status = RETURN_STATUS[ret.status] || RETURN_STATUS.PENDING;
  const pending = ret.status === "PENDING";
  const canApprove = pending && ret.canManage;
  const blockedByShift = canApprove && refund > 0 && method === "CASH" && !hasShift && !shift.isLoading;

  const decide = (next: ReturnStatus) =>
    updateStatus.mutate({
      id: ret.id,
      data: { status: next, companyId, ...(next === ReturnStatus.COMPLETED && refund > 0 && { refundMethod: method }) },
    });

  const run = async (kind: "pdf" | "print") => {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadReturnPdf(ret);
      else await printReturnA4(ret);
    } catch {
      toast.error(kind === "pdf" ? "تعذر إنشاء ملف PDF" : "تعذرت الطباعة");
    } finally {
      setBusy("");
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
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">مرتجع</h1>
                <span className="whitespace-nowrap font-mono text-lg text-gray-700" dir="ltr">{ret.returnNumber}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="text-sm text-gray-500">
                من الفاتورة{" "}
                <Link to={`/sales/${ret.originalSale?.id}`} className="whitespace-nowrap font-mono text-primary-700 hover:underline" dir="ltr">
                  {ret.originalSale?.receiptNumber}
                </Link>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => run("print")} disabled={!!busy}>
              {busy === "print" ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Printer className="ml-1 h-4 w-4" />}
              طباعة A4
            </Button>
            <Button variant="outline" size="sm" onClick={() => run("pdf")} disabled={!!busy}>
              {busy === "pdf" ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Download className="ml-1 h-4 w-4" />}
              PDF
            </Button>
          </div>
        </div>

        {/* Approve / reject */}
        {canApprove && (
          <Card padding="lg" className="border-amber-200 bg-amber-50/40">
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertTriangle className="h-5 w-5" /> المرتجع في انتظار اعتمادك
              </div>
              <p className="text-sm text-gray-700">
                عند الاعتماد تعود الأصناف السليمة للمخزون، ويُخصم {formatCurrency(debtCut)} من مديونية العميل
                {refund > 0 ? `، ويُرد له ${formatCurrency(refund)}` : ""}.
              </p>
              {refund > 0 && (
                <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="طريقة رد المبلغ">
                  {(Object.keys(METHOD) as PaymentMethodCode[]).map((code) => {
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
                        className={`flex items-center justify-center gap-1.5 rounded-lg border bg-white px-2 py-2 text-sm font-medium transition ${
                          on ? "border-primary-500 text-primary-800 ring-1 ring-primary-500" : "border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {blockedByShift && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    لا توجد وردية مفتوحة لك. المبلغ النقدي يخرج من درج الوردية، فافتح وردية أولاً{" "}
                    <Link to="/shifts" className="font-semibold underline">من صفحة الورديات</Link>، أو اختر طريقة رد أخرى.
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => decide(ReturnStatus.COMPLETED)} disabled={updateStatus.isPending || blockedByShift}>
                  {updateStatus.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Check className="ml-1 h-4 w-4" />}
                  اعتماد المرتجع
                </Button>
                <Button variant="outline" onClick={() => decide(ReturnStatus.REJECTED)} disabled={updateStatus.isPending} className="border-red-200 text-red-600 hover:bg-red-50">
                  <XCircle className="ml-1 h-4 w-4" />
                  رفض
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card padding="lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-primary-100 p-2"><RotateCcw className="h-5 w-5 text-primary-600" /></div>
                <h3 className="text-lg font-semibold text-gray-900">معلومات المرتجع</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="تاريخ المرتجع">{ret.returnDate ? formatTableDate(new Date(ret.returnDate)) : "-"}</Field>
                <Field label="الفاتورة الأصلية">
                  <Link to={`/sales/${ret.originalSale?.id}`} className="whitespace-nowrap font-mono text-primary-700 hover:underline" dir="ltr">
                    {ret.originalSale?.receiptNumber}
                  </Link>
                </Field>
                <Field label="أنشأه">{ret.user?.fullname || "-"}</Field>
                {ret.processedDate && <Field label={ret.status === "REJECTED" ? "تاريخ الرفض" : "تاريخ الاعتماد"}>{formatTableDate(new Date(ret.processedDate))}</Field>}
                {ret.reason && <Field label="سبب الإرجاع">{ret.reason}</Field>}
                {ret.notes && <Field label="ملاحظات">{ret.notes}</Field>}
              </div>
            </Card>

            <Card padding="lg">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-purple-100 p-2"><Package className="h-5 w-5 text-purple-600" /></div>
                  <h3 className="text-lg font-semibold text-gray-900">الأصناف المرتجعة</h3>
                </div>
                <span className="whitespace-nowrap text-sm text-gray-500">{ret.items?.length || 0} صنف</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-right text-xs text-gray-500">
                      <th className="py-2 font-medium">الصنف</th>
                      <th className="py-2 font-medium">الكمية</th>
                      <th className="py-2 font-medium">السعر</th>
                      <th className="py-2 font-medium">الإجمالي</th>
                      <th className="py-2 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(ret.items || []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="py-2.5">
                          <div className="font-medium text-gray-900">{item.product?.name}</div>
                          {item.reason && <div className="text-xs text-gray-500">{item.reason}</div>}
                        </td>
                        <td className="py-2.5">{formatQty(Number(item.quantity), unitOf(item.product))}</td>
                        <td className="py-2.5">{formatCurrency(Number(item.unitPrice))}</td>
                        <td className="py-2.5 font-semibold">{formatCurrency(Number(item.totalPrice))}</td>
                        <td className="py-2.5">
                          {isUnsellable(item.condition) ? (
                            <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">{conditionLabel(item.condition)} · مشطوب</span>
                          ) : (
                            <span className="text-xs text-gray-600">{conditionLabel(item.condition)}{ret.status === "COMPLETED" ? " · عاد للمخزون" : ""}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card padding="lg">
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2"><User className="h-5 w-5 text-green-600" /></div>
                <h3 className="text-lg font-semibold text-gray-900">العميل</h3>
              </div>
              {ret.client ? (
                <div className="space-y-1 text-sm">
                  <Link to={`/clients/${ret.client.id}/statement`} className="font-medium text-primary-700 hover:underline">{ret.client.name}</Link>
                  {ret.client.phone && <div className="text-gray-500" dir="ltr">{ret.client.phone}</div>}
                </div>
              ) : (
                <div className="text-sm text-gray-500">عميل نقدي</div>
              )}
            </Card>

            <Card padding="lg">
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2"><Wallet className="h-5 w-5 text-amber-600" /></div>
                <h3 className="text-lg font-semibold text-gray-900">المبالغ</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-base font-semibold">
                  <span>قيمة المرتجع</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{pending ? "يُخصم" : "خُصم"} من مديونية العميل</span>
                  <span className="font-medium">{formatCurrency(debtCut)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {pending ? "يُرد" : "رُد"} للعميل
                    {refund > 0 && <span className="text-gray-400"> · {methodOf(ret.refundMethod || "CASH").label}</span>}
                  </span>
                  <span className="font-semibold text-green-700">{formatCurrency(refund)}</span>
                </div>
              </div>
              {ret.status === "COMPLETED" && refund > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                  {ret.drawer?.length ? (
                    ret.drawer.map((d: any) => (
                      <div key={d.id}>
                        خرج {formatCurrency(Number(d.amount))} من درج {d.shift?.register?.name || "الوردية"} · وردية {d.shift?.user?.fullname || "-"}
                        {d.shift?.status === "OPEN" ? " (مفتوحة)" : " (مغلقة)"}
                      </div>
                    ))
                  ) : ret.refundMethod && ret.refundMethod !== "CASH" ? (
                    <div>رُد بطريقة {methodOf(ret.refundMethod).label}، لا يمس درج النقدية</div>
                  ) : (
                    <div>رُد نقداً قبل ربط المرتجعات بالورديات</div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ReturnsDetails;
