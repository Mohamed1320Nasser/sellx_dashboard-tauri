import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Edit, FileText, Inbox, Printer, Trash2, Wallet } from "lucide-react";
import { Layout } from "../components/layout";
import { ConfirmDialog } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { paymentService } from "../services/paymentService";
import { printReceipt } from "../services/printService";
import { apiError, methodOf } from "../components/payments/paymentLabels";
import { formatCurrency } from "../utils/currencyUtils";
import { formatDateTime, formatTableDate } from "../utils/dateUtils";
import { HeaderAction, HeaderDivider } from '../components/common/HeaderAction';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-0">
    <dt className="shrink-0 text-sm text-gray-500">{label}</dt>
    <dd className="min-w-0 text-left text-sm font-medium text-gray-900">{children}</dd>
  </div>
);

const PaymentDetails: React.FC = () => {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company, user } = useSessionAuthStore() as any;
  const companyId = Number(company?.companyId || company?.company?.id) || 0;
  const [confirm, setConfirm] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["payment", id, companyId],
    queryFn: () => paymentService.getById(id, companyId),
    enabled: !!id && !!companyId,
  });
  const p = data?.data;

  const remove = useMutation({
    mutationFn: () => paymentService.delete(id, companyId),
    onSuccess: () => {
      toast.success("تم حذف الدفعة، وعاد المبلغ متبقياً على الفاتورة");
      ["payments", "sales", "sale", "purchases", "purchase", "current-shift", "open-invoices", "clients"].forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      navigate("/payments");
    },
    onError: (e: any) => toast.error(apiError(e, "تعذر حذف الدفعة")),
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl animate-pulse space-y-4">
          <div className="h-10 w-1/2 rounded bg-gray-200" />
          <div className="h-48 rounded-2xl bg-gray-200" />
        </div>
      </Layout>
    );
  }
  if (isError || !p) {
    return (
      <Layout>
        <div className="mx-auto max-w-md py-16 text-center">
          <Inbox className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h2 className="mb-1 font-semibold text-gray-900">الدفعة غير موجودة</h2>
          <p className="mb-5 text-sm text-gray-500">ربما حُذفت، أو ليست لديك صلاحية عرضها.</p>
          <Link to="/payments" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            العودة إلى المدفوعات
          </Link>
        </div>
      </Layout>
    );
  }

  const out = !!p.purchaseId;
  const m = methodOf(p.paymentMethod);
  const MethodIcon = m.icon;
  const number = out ? p.purchase?.invoiceNumber : p.sale?.receiptNumber;
  const party = out ? p.purchase?.supplier : p.sale?.client;
  const docPath = out ? `/purchases/${p.purchaseId}` : `/sales/${p.saleId}`;
  const docTotal = Number(out ? p.purchase?.totalAmount : p.sale?.totalAmount) || 0;
  const shortId = p.id.slice(0, 8).toUpperCase();

  const print = async () => {
    setPrinting(true);
    try {
      const c = company?.company || company || {};
      const when = new Date(p.paymentDate || p.createdAt);
      await printReceipt({
        receiptNumber: `PAY-${shortId}`,
        date: when.toLocaleDateString("ar-EG-u-nu-latn"),
        time: when.toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" }),
        cashier: p.user?.fullname || user?.fullname || user?.username || "",
        companyName: c.name || "",
        companyAddress: c.address,
        companyPhone: c.phone,
        companyTaxId: c.taxId || c.taxNumber,
        companyLogo: c.logoUrl,
        items: [],
        subtotal: Number(p.amount),
        discount: 0,
        tax: 0,
        total: Number(p.amount),
        paid: Number(p.amount),
        change: 0,
        paymentMethod: m.label,
        headerText: out ? "إيصال دفع لمورد" : "إيصال استلام دفعة",
        footerText: [
          `${out ? "فاتورة شراء" : "فاتورة"} ${number || ""}${party?.name ? ` - ${party.name}` : ""}`,
          p.documentRemaining != null ? (p.documentRemaining > 0 ? `المتبقي على الفاتورة: ${formatCurrency(p.documentRemaining)}` : "الفاتورة مسددة بالكامل") : "",
          p.reference ? `المرجع: ${p.reference}` : "",
          p.notes || "",
        ]
          .filter(Boolean)
          .join("\n"),
      } as any);
      toast.success("تم إرسال الإيصال للطابعة");
    } catch (e: any) {
      toast.error(`تعذرت الطباعة: ${e?.message || ""}`);
    } finally {
      setPrinting(false);
    }
  };


  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => navigate("/payments")} aria-label="رجوع" className="mt-0.5 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{out ? "دفعة لمورد" : "دفعة من عميل"}</h1>
              <p className="text-sm text-gray-500">
                <bdi dir="ltr">PAY-{shortId}</bdi> · {formatTableDate(p.paymentDate)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderAction icon={Printer} label="طباعة إيصال" onClick={print} busy={printing} />
            {p.canManage && (
              <>
                <HeaderDivider />
                <HeaderAction icon={Edit} label="تعديل" onClick={() => navigate(`/payments/${p.id}/edit`)} tone="primary" />
                <HeaderAction icon={Trash2} label="حذف الدفعة" onClick={() => setConfirm(true)} tone="danger" iconOnly />
              </>
            )}
          </div>
        </div>

        {/* amount */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${out ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
              {out ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6" />}
            </span>
            <div>
              <p className="text-xs text-gray-500">{out ? "دُفع للمورد" : "استُلم من العميل"}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(Number(p.amount))}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${m.cls}`}>
            <MethodIcon className="h-4 w-4" />
            {m.label}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* the invoice */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <FileText className="h-4 w-4 text-gray-400" />
              {out ? "فاتورة الشراء" : "الفاتورة"}
            </h2>
            <dl>
              <Row label="الرقم">
                <Link to={docPath} className="text-primary-700 hover:underline" dir="ltr">
                  {number || "—"}
                </Link>
              </Row>
              <Row label={out ? "المورد" : "العميل"}>{party?.name || (out ? "—" : "عميل نقدي")}</Row>
              <Row label="إجمالي الفاتورة">{formatCurrency(docTotal)}</Row>
              <Row label="المتبقي الآن">
                {p.documentRemaining != null && p.documentRemaining <= 0.005 ? (
                  <span className="text-emerald-700">مسددة بالكامل</span>
                ) : (
                  <span className="text-amber-700">{formatCurrency(p.documentRemaining || 0)}</span>
                )}
              </Row>
            </dl>
          </section>

          {/* the payment */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">بيانات الدفعة</h2>
            <dl>
              <Row label="التاريخ">{formatTableDate(p.paymentDate)}</Row>
              <Row label="سجّلها">{p.user?.fullname || "—"}</Row>
              <Row label="المرجع">{p.reference ? <bdi>{p.reference}</bdi> : <span className="text-gray-400">—</span>}</Row>
              <Row label="ملاحظات">{p.notes ? <span className="whitespace-pre-line font-normal">{p.notes}</span> : <span className="text-gray-400">—</span>}</Row>
              <Row label="آخر تعديل">{formatDateTime(p.updatedAt)}</Row>
            </dl>
          </section>
        </div>

        {/* where the cash went */}
        {p.paymentMethod === "CASH" && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Wallet className="h-4 w-4 text-gray-400" />
              درج النقدية
            </h2>
            {p.drawer.length ? (
              <ul className="divide-y divide-gray-100">
                {p.drawer.map(d => {
                  const minus = !(d.type === "CASH_IN" || d.type === "CASH_CORRECTION");
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block text-gray-800">{d.reason}</span>
                        <span className="block text-xs text-gray-500">
                          {d.shift.register?.name ? `${d.shift.register.name} · ` : ""}وردية {formatTableDate(d.shift.startTime)} ·{" "}
                          {d.shift.status === "OPEN" ? <span className="text-emerald-700">مفتوحة</span> : "مغلقة"}
                        </span>
                      </span>
                      <span className={`font-semibold ${minus ? "text-red-700" : "text-emerald-700"}`}>
                        {minus ? "−" : "+"}
                        {formatCurrency(d.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">سُجلت هذه الدفعة بدون وردية مفتوحة، فلم تدخل أي درج.</p>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        title="حذف الدفعة"
        message={`ستُحذف دفعة ${formatCurrency(Number(p.amount))} ويعود المبلغ متبقياً على ${out ? "فاتورة الشراء" : "الفاتورة"} ${number || ""}.${
          p.paymentMethod === "CASH" && p.drawer.some(d => d.shift.status === "CLOSED") ? " ورديتها مغلقة، فيُعكس المبلغ في درج ورديتك الحالية." : ""
        }`}
        confirmText="حذف الدفعة"
        isLoading={remove.isPending}
      />
    </Layout>
  );
};

export default PaymentDetails;
