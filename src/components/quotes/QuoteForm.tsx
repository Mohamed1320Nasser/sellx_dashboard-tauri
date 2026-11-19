import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Info,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useClients } from "../../hooks/api/useClients";
import {
  usePriceListPrices,
  usePriceLists,
} from "../../hooks/api/usePriceLists";
import { useActiveTaxSettings } from "../../hooks/api/useTax";
import { formatCurrency } from "../../utils/currencyUtils";
import { addQty, formatQty } from "../../utils/quantity";
import FormSaveBar from "../products/FormSaveBar";
import QuoteLineRow from "./QuoteLineRow";
import QuoteProductSearch, { type PickedProduct } from "./QuoteProductSearch";
import {
  type FormLine,
  type QuoteFormState,
  customLine,
  isoDateIn,
  lineQty,
  productLine,
  totalsOf,
  validate,
  linePrice,
} from "./quoteFormModel";

const TERM_SUGGESTIONS = [
  "مدة التسليم",
  "مكان التسليم",
  "الضمان",
  "طريقة الدفع",
  "الأسعار",
];

interface Props {
  title: React.ReactNode;
  subtitle?: string;
  companyId: number;
  initial: QuoteFormState;
  /** create: choose the default tax / price list once they load */
  isNew: boolean;
  saving: boolean;
  saveLabel: string;
  onSave: (form: QuoteFormState) => void;
  onCancel: () => void;
}

const card = "rounded-2xl border border-gray-200 bg-white shadow-sm";
const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500";

/** The quote, laid out like the document the customer receives */
const QuoteForm: React.FC<Props> = ({
  title,
  subtitle,
  companyId,
  initial,
  isNew,
  saving,
  saveLabel,
  onSave,
  onCancel,
}) => {
  const [form, setForm] = useState<QuoteFormState>(initial);
  /** a term just added from a chip focuses its text; "شرط آخر" focuses its title */
  const [addedTerm, setAddedTerm] = useState<"label" | "value" | null>(null);
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<QuoteFormState>) =>
    setForm((f) => ({ ...f, ...patch }));
  const setLine = (key: string, patch: Partial<FormLine>) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));

  // ---------------------------------------------------------------- prices
  const { data: priceLists = [] } = usePriceLists(companyId);
  const defaultList = priceLists.find((l) => l.isDefault);
  const list = priceLists.find((l) => l.id === form.priceListId) || defaultList;
  const listIsDefault = !list || list.isDefault;
  const { data: listPrices } = usePriceListPrices(
    companyId,
    listIsDefault ? null : list!.id,
  );
  const priceFor = useCallback(
    (productId: string, base: number) => {
      if (listIsDefault) return Number(base) || 0;
      const p = listPrices?.[String(productId)];
      return p === undefined ? Number(base) || 0 : p;
    },
    [listIsDefault, listPrices],
  );
  useEffect(() => {
    if (!form.priceListId && defaultList) set({ priceListId: defaultList.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultList?.id]);
  // edit: a saved price equal to today's list price follows the list again
  useEffect(() => {
    if (!listIsDefault && !listPrices) return;
    setForm((f) =>
      f.lines.some((l) => l.checkTouched)
        ? {
            ...f,
            lines: f.lines.map((l) => {
              if (!l.checkTouched) return l;
              const listP = linePrice({ ...l, priceTouched: false }, priceFor);
              return {
                ...l,
                checkTouched: false,
                priceTouched: Math.abs(Number(l.price) - listP) > 0.005,
              };
            }),
          }
        : f,
    );
  }, [priceFor, listIsDefault, listPrices]);

  // ---------------------------------------------------------------- tax
  const { data: taxData } = useActiveTaxSettings(companyId);
  const taxes: any[] = useMemo(
    () => (Array.isArray(taxData) ? taxData : (taxData as any)?.data || []),
    [taxData],
  );
  useEffect(() => {
    if (isNew && !form.taxSettingId) {
      const def = taxes.find((t) => t.isDefault);
      if (def) set({ taxSettingId: def.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxes]);
  const tax = taxes.find((t) => t.id === form.taxSettingId);
  const taxPercent = Number(tax?.rate) || 0;

  // ---------------------------------------------------------------- customer
  const [clientSearch, setClientSearch] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setClientQuery(clientSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [clientSearch]);
  const { data: clientsData } = useClients({
    companyId,
    page: 1,
    limit: 8,
    search: clientQuery || undefined,
  });
  const clients: any[] = (clientsData as any)?.data?.list || [];
  const pickClient = (c: any) => {
    const fromClient = priceLists.find((l) => l.id === c.priceListId);
    set({
      customerMode: "client",
      clientId: c.id,
      clientLabel: c.name,
      customerName: c.name || "",
      customerContact: c.phone || "",
      customerEmail: c.email || "",
      ...(fromClient && { priceListId: fromClient.id }),
    });
    setClientSearch("");
    if (fromClient && !fromClient.isDefault)
      toast(`أسعار العميل: ${fromClient.name}`, { id: "quote-list" });
  };

  // ---------------------------------------------------------------- lines
  const addPicked = ({ product, pack, quantity }: PickedProduct) => {
    const packId = pack?.id || "";
    setForm((f) => {
      const same = f.lines.find(
        (l) =>
          !l.custom &&
          l.productId === String(product.id) &&
          l.packId === packId,
      );
      if (same && !quantity && !same.allowDecimalQty) {
        return {
          ...f,
          lines: f.lines.map((l) =>
            l === same ? { ...l, qty: String(addQty(lineQty(l) ?? 0, 1)) } : l,
          ),
        };
      }
      return {
        ...f,
        lines: [
          ...f.lines,
          productLine(product, {
            pack: pack
              ? {
                  ...pack,
                  factor: Number(pack.factor),
                  sellingPrice: Number(pack.sellingPrice),
                }
              : null,
            quantity,
          }),
        ],
      };
    });
  };
  const addCustom = (name = "") =>
    setForm((f) => ({ ...f, lines: [...f.lines, customLine(name)] }));

  // ---------------------------------------------------------------- totals / save
  const totals = useMemo(
    () => totalsOf(form, priceFor, taxPercent),
    [form, priceFor, taxPercent],
  );
  const check = useMemo(() => validate(form, priceFor), [form, priceFor]);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!check.ok) {
      const badLine = form.lines.findIndex((l) => check.lineErrors[l.key]);
      const first =
        check.errors.customer ||
        check.errors.lines ||
        (badLine >= 0 ? `السطر ${badLine + 1}: ${check.lineErrors[form.lines[badLine].key]}` : "") ||
        Object.values(check.errors)[0];
      toast.error(first || "راجع البيانات", { id: "quote-form" });
      return;
    }
    onSave(form);
  };

  const validChips = [
    { days: 7, label: "7 أيام" },
    { days: 14, label: "14 يوم" },
    { days: 30, label: "30 يوم" },
  ];

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="رجوع"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>

      {/* very wide screens: summary on the side; otherwise under the items, so the lines get the full width */}
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Customer */}
        <section className={`${card} min-w-0 p-5 2xl:col-start-1`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <UserRound className="h-5 w-5 text-gray-400" />
              العميل
            </h2>
            <div
              role="radiogroup"
              aria-label="نوع العميل"
              className="flex rounded-lg bg-gray-100 p-1 text-sm"
            >
              {[
                { v: "client", label: "عميل مسجل" },
                { v: "manual", label: "بالاسم" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={form.customerMode === o.v}
                  onClick={() => set({ customerMode: o.v as any })}
                  className={`rounded-md px-3 py-1.5 font-medium ${form.customerMode === o.v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {form.customerMode === "client" ? (
            form.clientId ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">
                    {form.clientLabel}
                  </p>
                  <p className="text-sm text-gray-600">
                    {[form.customerContact, form.customerEmail]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    set({
                      clientId: null,
                      clientLabel: "",
                      customerName: "",
                      customerContact: "",
                      customerEmail: "",
                    })
                  }
                  className="flex items-center gap-1 text-sm text-primary-700 hover:underline"
                >
                  <X className="h-4 w-4" />
                  تغيير
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الهاتف"
                  aria-label="بحث عن عميل"
                  className={`${input} pr-9 ${tried && check.errors.customer ? "border-red-400" : ""}`}
                />
                <div className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickClient(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">
                        {c.name}
                      </span>
                      <span className="text-gray-500" dir="ltr">
                        {c.phone}
                      </span>
                    </button>
                  ))}
                  {clients.length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      لا يوجد عملاء بهذا الاسم
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={form.customerName}
                onChange={(e) => set({ customerName: e.target.value })}
                placeholder="اسم العميل أو الشركة *"
                aria-label="اسم العميل"
                className={`${input} ${tried && check.errors.customer ? "border-red-400" : ""}`}
              />
              <input
                value={form.customerContact}
                onChange={(e) => set({ customerContact: e.target.value })}
                placeholder="الهاتف"
                aria-label="هاتف العميل"
                dir="ltr"
                className={`${input} text-right`}
              />
              <input
                value={form.customerEmail}
                onChange={(e) => set({ customerEmail: e.target.value })}
                placeholder="البريد الإلكتروني"
                aria-label="بريد العميل"
                type="email"
                dir="ltr"
                className={`${input} text-right`}
              />
            </div>
          )}
          {tried && check.errors.customer && (
            <p className="mt-1.5 text-sm text-red-600">
              {check.errors.customer}
            </p>
          )}
        </section>

        {/* Items */}
        <section className={`${card} min-w-0 2xl:col-start-1`}>
          <div className="space-y-3 border-b border-gray-100 p-5 pb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                البنود{" "}
                <span className="text-sm font-normal text-gray-500">
                  ({form.lines.length})
                </span>
              </h2>
              <button
                type="button"
                onClick={() => addCustom()}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-violet-300 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
              >
                <PackagePlus className="h-4 w-4" />
                بند غير مسجل
              </button>
            </div>
            <QuoteProductSearch
              companyId={companyId}
              onPick={addPicked}
              onAddCustom={addCustom}
              priceFor={priceFor}
            />
          </div>

          {form.lines.length > 0 && (
            <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_5.5rem_7rem_4.5rem_7rem_2rem] gap-2 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 md:grid">
              <span>#</span>
              <span>البند</span>
              <span>الوحدة</span>
              <span className="text-center">الكمية</span>
              <span className="text-center">السعر</span>
              <span className="text-center">خصم %</span>
              <span className="text-left">الإجمالي</span>
              <span />
            </div>
          )}
          {form.lines.map((l, k) => (
            <QuoteLineRow
              key={l.key}
              line={l}
              index={k}
              error={check.lineErrors[l.key]}
              showErrors={tried}
              total={totals.lines[k]?.net ?? 0}
              priceFor={priceFor}
              onChange={(patch) => setLine(l.key, patch)}
              onRemove={() =>
                set({ lines: form.lines.filter((x) => x.key !== l.key) })
              }
            />
          ))}
          {form.lines.length === 0 && (
            <div
              className={`px-5 py-10 text-center text-sm ${tried ? "text-red-600" : "text-gray-500"}`}
            >
              ابحث عن منتج بالأعلى أو امسح الباركود، أو أضف بنداً غير مسجل في
              النظام.
            </div>
          )}
        </section>

        {/* Summary */}
        <aside
          className={`${card} p-5 2xl:sticky 2xl:top-24 2xl:col-start-2 2xl:row-span-3 2xl:row-start-1`}
        >
          <h2 className="mb-4 text-base font-semibold text-gray-900">الملخص</h2>
          <div className="grid gap-5 md:grid-cols-2 md:gap-8 2xl:grid-cols-1 2xl:gap-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 2xl:grid-cols-1">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">
                    قائمة الأسعار
                  </span>
                  <select
                    value={list?.id || ""}
                    onChange={(e) => set({ priceListId: e.target.value })}
                    className={input}
                  >
                    {priceLists
                      .filter((l) => l.active || l.id === form.priceListId)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">
                    الضريبة
                  </span>
                  <select
                    value={form.taxSettingId}
                    onChange={(e) => set({ taxSettingId: e.target.value })}
                    className={input}
                  >
                    <option value="">بدون ضريبة</option>
                    {taxes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({`\u2066${Number(t.rate)}%\u2069`})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  صالح حتى
                </span>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => set({ validUntil: e.target.value })}
                  aria-label="صالح حتى"
                  className={input}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {validChips.map((c) => (
                    <button
                      key={c.days}
                      type="button"
                      onClick={() => set({ validUntil: isoDateIn(c.days) })}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        form.validUntil === isoDateIn(c.days)
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => set({ validUntil: "" })}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${!form.validUntil ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                  >
                    بدون مدة
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  خصم على الإجمالي
                </span>
                <div className="flex gap-2">
                  <div
                    role="radiogroup"
                    aria-label="نوع الخصم"
                    className="flex flex-shrink-0 overflow-hidden rounded-lg border border-gray-300 text-sm"
                  >
                    {[
                      { v: "", label: "بدون" },
                      { v: "PERCENT", label: "%" },
                      { v: "AMOUNT", label: "مبلغ" },
                    ].map((o, k) => (
                      <button
                        key={o.v || "none"}
                        type="button"
                        role="radio"
                        aria-checked={form.discountType === o.v}
                        onClick={() =>
                          set({
                            discountType: o.v as any,
                            ...(o.v === "" && { discountValue: "" }),
                          })
                        }
                        className={`px-3 py-2 font-medium ${k > 0 ? "border-r border-gray-300" : ""} ${form.discountType === o.v ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {form.discountType && (
                    <input
                      value={form.discountValue}
                      onChange={(e) => set({ discountValue: e.target.value })}
                      inputMode="decimal"
                      placeholder={
                        form.discountType === "PERCENT" ? "10" : "0.00"
                      }
                      aria-label="قيمة الخصم"
                      dir="ltr"
                      autoFocus
                      className={`${input} text-center ${tried && check.errors.discount ? "border-red-400" : ""}`}
                    />
                  )}
                </div>
                {tried && check.errors.discount && (
                  <p className="mt-1 text-xs text-red-600">
                    {check.errors.discount}
                  </p>
                )}
              </div>

              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  رسوم إضافية (اختياري)
                </span>
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                  <input
                    value={form.additionalFeeLabel}
                    onChange={(e) =>
                      set({ additionalFeeLabel: e.target.value })
                    }
                    placeholder="توصيل، تركيب..."
                    maxLength={60}
                    aria-label="اسم الرسوم"
                    className={input}
                  />
                  <input
                    value={form.additionalFee}
                    onChange={(e) => set({ additionalFee: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="مبلغ الرسوم"
                    dir="ltr"
                    className={`${input} text-center ${tried && check.errors.fee ? "border-red-400" : ""}`}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <dl className="space-y-2 border-t border-gray-100 pt-4 text-sm md:border-t-0 md:pt-0 2xl:border-t 2xl:pt-4">
                <div className="flex justify-between">
                  <dt className="text-gray-600">
                    المجموع
                  </dt>
                  <dd className="font-medium text-gray-900">
                    {formatCurrency(totals.subtotal)}
                  </dd>
                </div>
                {totals.lineDiscounts > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <dt>منها خصومات البنود</dt>
                    <dd>{formatCurrency(totals.lineDiscounts)}</dd>
                  </div>
                )}
                {totals.orderDiscount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <dt>
                      الخصم
                      {form.discountType === "PERCENT"
                        ? ` (\u2066${formatQty(Number(form.discountValue))}%\u2069)`
                        : ""}
                    </dt>
                    <dd>- {formatCurrency(totals.orderDiscount)}</dd>
                  </div>
                )}
                {totals.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">
                      {tax?.name || "الضريبة"} ({`\u2066${taxPercent}%\u2069`})
                    </dt>
                    <dd className="text-gray-900">
                      {formatCurrency(totals.taxAmount)}
                    </dd>
                  </div>
                )}
                {totals.additionalFee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">
                      {form.additionalFeeLabel.trim() || "رسوم إضافية"}
                    </dt>
                    <dd className="text-gray-900">
                      {formatCurrency(totals.additionalFee)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <dt className="text-base font-bold text-gray-900">
                    الإجمالي
                  </dt>
                  <dd className="text-xl font-bold text-primary-700">
                    {formatCurrency(totals.total)}
                  </dd>
                </div>
              </dl>

              {form.lines.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    الربح المتوقع{" "}
                    <b
                      className={
                        totals.totalProfit < 0
                          ? "text-red-600"
                          : "text-gray-900"
                      }
                    >
                      {formatCurrency(totals.totalProfit)}
                    </b>
                    {totals.subtotal > 0 &&
                      ` (\u2066${Math.round((totals.totalProfit / Math.max(totals.subtotal - totals.orderDiscount, 0.01)) * 1000) / 10}%\u2069)`}{" "}
                    — لا يظهر للعميل.
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Notes & terms */}
        <section className={`${card} min-w-0 space-y-4 p-5 2xl:col-start-1`}>
          <div>
            <h2 className="mb-2 text-base font-semibold text-gray-900">
              الشروط
            </h2>
            <p className="mb-3 text-sm text-gray-500">
              تُطبع أسفل العرض. العرض الجديد يبدأ بشروط آخر عرض حفظته على هذا
              الجهاز.
            </p>
            <div className="space-y-2">
              {form.terms.map((t, k) => (
                <div
                  key={k}
                  className="grid grid-cols-[9rem_minmax(0,1fr)_2rem] items-center gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_2rem]"
                >
                  <input
                    value={t.label}
                    onChange={(e) =>
                      set({
                        terms: form.terms.map((x, i) =>
                          i === k ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="العنوان"
                    autoFocus={addedTerm === "label" && k === form.terms.length - 1}
                    maxLength={40}
                    aria-label="عنوان الشرط"
                    className={`${input} font-medium`}
                  />
                  <input
                    value={t.value}
                    onChange={(e) =>
                      set({
                        terms: form.terms.map((x, i) =>
                          i === k ? { ...x, value: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="مثل: 7 أيام عمل"
                    autoFocus={addedTerm === "value" && k === form.terms.length - 1}
                    maxLength={300}
                    aria-label={`نص ${t.label || "الشرط"}`}
                    className={input}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      set({ terms: form.terms.filter((_, i) => i !== k) })
                    }
                    aria-label="حذف الشرط"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {form.terms.length < 15 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {TERM_SUGGESTIONS.filter(
                  (s) => !form.terms.some((t) => t.label === s),
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setAddedTerm("value");
                      set({ terms: [...form.terms, { label: s, value: "" }] });
                    }}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    + {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setAddedTerm("label");
                    set({ terms: [...form.terms, { label: "", value: "" }] });
                  }}
                  className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
                >
                  <Plus className="h-3 w-3" />
                  شرط آخر
                </button>
              </div>
            )}
          </div>
          <div>
            <label
              htmlFor="quote-notes"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              ملاحظات
            </label>
            <textarea
              id="quote-notes"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="تظهر في العرض المطبوع"
              className={input}
            />
          </div>
        </section>
      </div>

      <FormSaveBar
        onCancel={onCancel}
        saving={saving}
        saveLabel={saveLabel}
        maxWidthClass="max-w-7xl"
        hint={
          <span>
            الإجمالي{" "}
            <b className="text-gray-900">{formatCurrency(totals.total)}</b>
          </span>
        }
      />
    </form>
  );
};

export default QuoteForm;
