import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Link2, PackagePlus, Search, X } from "lucide-react";
import { Modal } from "../ui";
import { useClients } from "../../hooks/api/useClients";
import { useCategories } from "../../hooks/api/useCategories";
import { useProducts } from "../../hooks/api/useProducts";
import { formatCurrency } from "../../utils/currencyUtils";
import { formatQty } from "../../utils/quantity";
import { calcQuote } from "../../utils/quoteCalc";
import type { CustomLineResolution, Quote } from "../../types";

type Action = "CREATE" | "LINK" | "SKIP";
interface Decision {
  action: Action | "";
  categoryId: string;
  product: { id: string; name: string } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  companyId: number;
  converting: boolean;
  onConvert: (options: { clientId?: number; customLines: CustomLineResolution[] }) => void;
}

/** Pick an existing product for a custom line */
const ProductPicker: React.FC<{ companyId: number; onPick: (p: { id: string; name: string }) => void }> = ({ companyId, onPick }) => {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data } = useProducts({ companyId, page: 1, limit: 6, search: q || undefined });
  const list: any[] = q ? (data as any)?.data?.list || [] : [];
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
          placeholder="ابحث عن المنتج"
          aria-label="بحث عن منتج للربط"
          className="w-full rounded-lg border border-gray-300 py-1.5 pl-2 pr-8 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
        />
      </div>
      {list.length > 0 && (
        <div className="mt-1 max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {list.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick({ id: String(p.id), name: p.name })}
              className="flex w-full justify-between px-3 py-1.5 text-right text-sm hover:bg-gray-50"
            >
              <span>{p.name}</span>
              <span className="text-xs text-gray-500">{formatQty(Number(p.currentStock ?? p.stockQuantity ?? 0))} متاح</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Convert to an unpaid invoice: the customer whose account carries it, and for each item that
 * is not in the system: create it as a product, link it to one, or leave it out.
 */
const ConvertQuoteModal: React.FC<Props> = ({ isOpen, onClose, quote, companyId, converting, onConvert }) => {
  const customItems = useMemo(() => (quote.items || []).filter(i => !i.productId), [quote.items]);
  const [clientId, setClientId] = useState<string>("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [tried, setTried] = useState(false);
  const { data: clientsData } = useClients({ companyId, page: 1, limit: 200 });
  const clients: any[] = (clientsData as any)?.data?.list || [];
  const { data: catData } = useCategories({ companyId, page: 1, limit: 100 });
  const categories: any[] = (catData as any)?.data?.list || [];

  useEffect(() => {
    if (!isOpen) return;
    setTried(false);
    setClientId(quote.clientId ? String(quote.clientId) : "");
    setDecisions(Object.fromEntries(customItems.map(i => [i.id, { action: "", categoryId: "", product: null }])));
  }, [isOpen, quote.clientId, customItems]);

  const setDecision = (id: string, patch: Partial<Decision>) => setDecisions(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  // the invoice total, as the server works it out from the lines that stay
  const preview = useMemo(() => {
    const kept = (quote.items || []).filter(i => i.productId || decisions[i.id]?.action !== "SKIP");
    return calcQuote(
      kept.map(i => ({ qty: 1, price: Number(i.lineTotal), discountPercent: 0, cost: 0 })),
      {
        discountType: quote.orderDiscountType ?? null,
        discountValue: Number(quote.orderDiscountValue) || 0,
        taxPercent: Number(quote.taxPercent) || 0,
        additionalFee: Number(quote.additionalFee) || 0,
      }
    );
  }, [quote, decisions]);

  const problems = customItems
    .map(i => {
      const d = decisions[i.id];
      if (!d?.action) return `اختر ماذا يحدث لـ "${i.productName}"`;
      if (d.action === "CREATE" && !d.categoryId) return `اختر فئة "${i.productName}"`;
      if (d.action === "LINK" && !d.product) return `اختر المنتج المرتبط بـ "${i.productName}"`;
      return null;
    })
    .filter(Boolean) as string[];
  const allSkipped = (quote.items || []).every(i => !i.productId && decisions[i.id]?.action === "SKIP");

  const submit = () => {
    setTried(true);
    if (problems.length || allSkipped) return;
    onConvert({
      clientId: clientId ? Number(clientId) : undefined,
      customLines: customItems.map(i => {
        const d = decisions[i.id];
        return {
          itemId: i.id,
          action: d.action as Action,
          ...(d.action === "CREATE" && { categoryId: d.categoryId }),
          ...(d.action === "LINK" && { productId: d.product!.id }),
        };
      }),
    });
  };

  const actions: { v: Action; label: string; icon: React.ElementType }[] = [
    { v: "CREATE", label: "إنشاء كمنتج", icon: PackagePlus },
    { v: "LINK", label: "ربط بمنتج", icon: Link2 },
    { v: "SKIP", label: "استبعاد", icon: X },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="تحويل العرض إلى فاتورة" size={customItems.length ? "lg" : "md"}>
      <div className="space-y-5">
        <p className="text-sm text-gray-600">
          تُنشأ فاتورة غير مدفوعة بأسعار العرض، وتُخصم الكميات من المخزون. تُسجَّل الدفعات بعد ذلك من صفحة الفاتورة.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">على حساب العميل</span>
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
          >
            <option value="">بدون عميل مسجل ({quote.customerName || "عميل نقدي"})</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` - ${c.phone}` : ""}
              </option>
            ))}
          </select>
          {!clientId && <p className="mt-1 text-xs text-amber-700">بدون عميل مسجل لن تظهر الفاتورة في كشف حساب أحد.</p>}
        </label>

        {customItems.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              بنود غير مسجلة في النظام ({customItems.length})
              <span className="mr-1 font-normal text-gray-500">— الفاتورة تحتاج منتجاً لكل سطر</span>
            </p>
            <div className="space-y-3">
              {customItems.map(i => {
                const d = decisions[i.id] || { action: "", categoryId: "", product: null };
                const bad = tried && problems.some(p => p.includes(`"${i.productName}"`));
                return (
                  <div key={i.id} className={`rounded-xl border p-3 ${bad ? "border-red-300 bg-red-50/40" : "border-gray-200"}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{i.productName}</p>
                        <p className="text-xs text-gray-500">
                          {formatQty(Number(i.quantity), i.unit || "")} × {formatCurrency(Number(i.unitPrice))} = {formatCurrency(Number(i.lineTotal))}
                        </p>
                      </div>
                      <div role="radiogroup" aria-label={`ماذا يحدث لـ ${i.productName}`} className="flex overflow-hidden rounded-lg border border-gray-300 text-xs">
                        {actions.map((a, k) => {
                          const Icon = a.icon;
                          return (
                            <button
                              key={a.v}
                              type="button"
                              role="radio"
                              aria-checked={d.action === a.v}
                              onClick={() => setDecision(i.id, { action: a.v })}
                              className={`flex items-center gap-1 px-2.5 py-1.5 font-medium ${k > 0 ? "border-r border-gray-300" : ""} ${
                                d.action === a.v ? (a.v === "SKIP" ? "bg-gray-700 text-white" : "bg-primary-600 text-white") : "bg-white text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {d.action === "CREATE" && (
                      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
                        <select
                          value={d.categoryId}
                          onChange={e => setDecision(i.id, { categoryId: e.target.value })}
                          aria-label="فئة المنتج الجديد"
                          className={`rounded-lg border px-2 py-1.5 text-sm ${tried && !d.categoryId ? "border-red-400" : "border-gray-300"}`}
                        >
                          <option value="">اختر الفئة</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          يُضاف للمنتجات بسعر {formatCurrency(Number(i.unitPrice))} وتكلفة {formatCurrency(Number(i.costPrice) || 0)}، وتُسجَّل الكمية واردة ثم مباعة.
                        </p>
                      </div>
                    )}
                    {d.action === "LINK" &&
                      (d.product ? (
                        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                          <span>
                            يُباع كـ <b>{d.product.name}</b> بسعر العرض
                          </span>
                          <button type="button" onClick={() => setDecision(i.id, { product: null })} className="text-xs text-primary-600 hover:underline">
                            تغيير
                          </button>
                        </div>
                      ) : (
                        <ProductPicker companyId={companyId} onPick={p => setDecision(i.id, { product: p })} />
                      ))}
                    {d.action === "SKIP" && <p className="text-xs text-gray-500">لن يظهر في الفاتورة، ويُعاد حساب الإجمالي بدونه.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">إجمالي الفاتورة</span>
          <span className="text-lg font-bold text-gray-900">{formatCurrency(preview.total)}</span>
        </div>
        {Math.abs(preview.total - Number(quote.total)) > 0.005 && (
          <p className="-mt-3 flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            يختلف عن إجمالي العرض ({formatCurrency(Number(quote.total))}) بسبب البنود المستبعدة.
          </p>
        )}

        {tried && (problems[0] || allSkipped) && (
          <p className="text-sm text-red-600">{allSkipped ? "لا توجد بنود في الفاتورة" : problems[0]}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={converting}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {converting ? "جاري التحويل..." : "تحويل إلى فاتورة"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConvertQuoteModal;
