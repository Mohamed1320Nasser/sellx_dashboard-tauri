import React from "react";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { formatCurrency } from "../../utils/currencyUtils";
import { formatQty } from "../../utils/quantity";
import { type FormLine, linePieces, linePrice, packOf } from "./quoteFormModel";

const CUSTOM_UNITS = ["قطعة", "خدمة", "متر", "كجم", "ساعة", "يوم", "طقم"];

interface Props {
  line: FormLine;
  index: number;
  error?: string;
  showErrors: boolean;
  total: number;
  priceFor: (id: string, base: number) => number;
  onChange: (patch: Partial<FormLine>) => void;
  onRemove: () => void;
}

const cell = "w-full rounded-lg border px-2.5 py-1.5 text-sm focus:ring-2";
const ok = "border-gray-300 focus:border-primary-500 focus:ring-primary-500";
const bad = "border-red-400 focus:ring-red-400";

/** One quote line: a product (piece or pack) or an item that is not in the system */
const QuoteLineRow: React.FC<Props> = ({ line, index, error, showErrors, total, priceFor, onChange, onRemove }) => {
  const pack = packOf(line);
  const listPrice = line.custom ? 0 : pack ? pack.sellingPrice : priceFor(line.productId!, line.basePrice);
  const shownPrice = line.custom || line.priceTouched ? line.price : listPrice > 0 ? String(listPrice) : "";
  const changed = !line.custom && line.priceTouched && Math.abs(Number(line.price) - listPrice) > 0.005;
  const pieces = linePieces(line);
  const unitWord = line.unit || (line.allowDecimalQty ? "وحدة" : "قطعة");
  const short = !line.custom && pieces > line.stock;
  const showErr = showErrors && !!error;

  return (
    <div className={`border-b border-gray-100 px-3 py-3 last:border-b-0 sm:px-4 ${showErr ? "bg-red-50/40" : ""}`}>
      <div className="grid grid-cols-6 gap-2 md:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_5.5rem_7rem_4.5rem_7rem_2rem] md:items-start">
        <span className="hidden pt-2 text-xs text-gray-400 md:block">{index + 1}</span>

        {/* item */}
        <div className="col-span-5 min-w-0 md:col-span-1">
          {line.custom ? (
            <input
              value={line.name}
              onChange={e => onChange({ name: e.target.value })}
              placeholder="اسم البند"
              aria-label="اسم البند"
              maxLength={191}
              className={`${cell} ${showErr && !line.name.trim() ? bad : ok}`}
            />
          ) : (
            <p className="truncate pt-1.5 text-sm font-medium text-gray-900" title={line.name}>
              {line.name}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            {line.custom ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">غير مسجل في النظام</span>
            ) : (
              <span dir="ltr">{line.sku}</span>
            )}
            <button
              type="button"
              onClick={() => onChange({ showDetails: !line.showDetails })}
              className="flex items-center gap-0.5 text-primary-600 hover:underline"
              aria-expanded={line.showDetails}
            >
              {line.custom ? "وصف وتكلفة" : "وصف"}
              <ChevronDown className={`h-3 w-3 transition-transform ${line.showDetails ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`حذف ${line.name || "البند"}`}
          className="col-span-1 justify-self-end rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 md:order-last md:mt-0.5"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        {/* unit / pack */}
        <div className="col-span-6 md:col-span-1">
          <span className="mb-1 block text-xs text-gray-500 md:hidden">الوحدة</span>
          {line.custom ? (
            <>
              <input
                value={line.unit}
                onChange={e => onChange({ unit: e.target.value })}
                list="quote-custom-units"
                placeholder="قطعة"
                maxLength={20}
                aria-label="الوحدة"
                className={`${cell} ${ok}`}
              />
              <datalist id="quote-custom-units">
                {CUSTOM_UNITS.map(u => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </>
          ) : line.packs.length ? (
            <div role="radiogroup" aria-label="بالقطعة أو بالعبوة" className="flex overflow-hidden rounded-lg border border-gray-300 text-xs">
              {[{ id: "", label: unitWord }, ...line.packs.map(p => ({ id: p.id, label: `${p.name} ${formatQty(p.factor)}` }))].map((o, k) => (
                <button
                  key={o.id || "piece"}
                  type="button"
                  role="radio"
                  aria-checked={line.packId === o.id}
                  onClick={() => onChange({ packId: o.id, priceTouched: false, price: "" })}
                  className={`flex-1 whitespace-nowrap px-2 py-1.5 font-medium ${k > 0 ? "border-r border-gray-300" : ""} ${
                    line.packId === o.id ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="pt-1.5 text-sm text-gray-600">{unitWord}</p>
          )}
        </div>

        {/* qty */}
        <div className="col-span-2 md:col-span-1">
          <span className="mb-1 block text-xs text-gray-500 md:hidden">الكمية</span>
          <input
            value={line.qty}
            onChange={e => onChange({ qty: e.target.value })}
            inputMode={line.allowDecimalQty && !line.packId ? "decimal" : "numeric"}
            aria-label="الكمية"
            dir="ltr"
            className={`${cell} text-center ${showErr && error?.includes("كمي") ? bad : ok}`}
          />
          {pack && pieces > 0 && <p className="mt-1 text-center text-xs text-gray-500">= {formatQty(pieces, unitWord)}</p>}
          {short && <p className="mt-1 text-center text-xs text-amber-700">المتاح {formatQty(line.stock)}</p>}
        </div>

        {/* price */}
        <div className="col-span-2 md:col-span-1">
          <span className="mb-1 block text-xs text-gray-500 md:hidden">السعر</span>
          <div className="relative">
            <input
              value={shownPrice}
              onChange={e => onChange({ price: e.target.value, priceTouched: true })}
              inputMode="decimal"
              placeholder={line.custom ? "السعر" : "بدون سعر"}
              aria-label={pack ? `سعر ${pack.name}` : "سعر الوحدة"}
              dir="ltr"
              className={`${cell} text-center ${changed ? "pl-7 font-semibold text-primary-800" : ""} ${
                showErr && error?.includes("سعر") ? bad : changed ? "border-primary-300 bg-primary-50/40 focus:ring-primary-500" : ok
              }`}
            />
            {changed && (
              <button
                type="button"
                title={`رجوع لسعر القائمة (${formatCurrency(listPrice)})`}
                aria-label="رجوع لسعر القائمة"
                onClick={() => onChange({ priceTouched: false, price: "" })}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-primary-600 hover:text-primary-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {changed && <p className="mt-1 text-center text-[11px] text-gray-500">القائمة {formatCurrency(listPrice)}</p>}
        </div>

        {/* discount */}
        <div className="col-span-2 md:col-span-1">
          <span className="mb-1 block text-xs text-gray-500 md:hidden">خصم %</span>
          <input
            value={line.discount}
            onChange={e => onChange({ discount: e.target.value })}
            inputMode="decimal"
            placeholder="0"
            aria-label="خصم السطر بالنسبة"
            dir="ltr"
            className={`${cell} text-center ${showErr && error?.includes("الخصم") ? bad : ok}`}
          />
        </div>

        {/* total */}
        <div className="col-span-6 flex items-center justify-between md:col-span-1 md:block md:pt-1.5 md:text-left">
          <span className="text-xs text-gray-500 md:hidden">الإجمالي</span>
          <span className="whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(total)}</span>
        </div>
      </div>

      {line.showDetails && (
        <div className="mt-2 grid gap-2 md:mr-8 md:grid-cols-[minmax(0,1fr)_10rem]">
          <textarea
            value={line.description}
            onChange={e => onChange({ description: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="وصف يظهر تحت اسم البند في العرض المطبوع (مواصفات، مقاس، لون...)"
            aria-label="وصف البند"
            className={`${cell} ${ok}`}
          />
          {line.custom && (
            <label className="text-xs text-gray-500">
              تكلفة الوحدة (للربح فقط)
              <input
                value={line.cost}
                onChange={e => onChange({ cost: e.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                dir="ltr"
                className={`${cell} mt-1 text-center ${ok}`}
              />
            </label>
          )}
        </div>
      )}

      {showErr && <p className="mt-1.5 text-xs text-red-600 md:mr-8">{error}</p>}
      {!line.custom && !line.priceTouched && !(linePrice(line, priceFor) > 0) && !showErr && (
        <p className="mt-1.5 text-xs text-amber-700 md:mr-8">المنتج بدون سعر بيع: اكتب سعره في العرض.</p>
      )}
    </div>
  );
};

export default QuoteLineRow;
