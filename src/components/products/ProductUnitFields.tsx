import React, { useEffect, useState } from "react";
import { Droplet, Package, Ruler, Scale } from "lucide-react";

type SaleKind = "piece" | "weight" | "length" | "volume";

const KINDS: { kind: SaleKind; label: string; hint: string; icon: React.ElementType; units: string[]; decimal: boolean }[] = [
  { kind: "piece", label: "بالقطعة", hint: "أعداد صحيحة", icon: Package, units: ["قطعة", "علبة", "زجاجة", "كيس", "عبوة"], decimal: false },
  { kind: "weight", label: "بالوزن", hint: "مثل 1.250 كجم", icon: Scale, units: ["كجم", "جرام"], decimal: true },
  { kind: "length", label: "بالطول", hint: "مثل 2.5 متر", icon: Ruler, units: ["متر", "سم"], decimal: true },
  { kind: "volume", label: "بالحجم", hint: "مثل 0.5 لتر", icon: Droplet, units: ["لتر", "مل"], decimal: true },
];

/** Which card a saved product belongs to (an unknown unit sold by weight / length stays as "other" under weight) */
function kindOf(allowDecimalQty: boolean, unit: string): SaleKind {
  if (!allowDecimalQty) return "piece";
  const u = unit.trim();
  return KINDS.find(k => k.decimal && k.units.includes(u))?.kind ?? "weight";
}

interface Props {
  allowDecimalQty: boolean;
  unit: string;
  onChange: (next: { allowDecimalQty: boolean; unit: string }) => void;
  disabled?: boolean;
  /** Item code programmed on the shop scale (shown for goods sold by weight when a handler is given) */
  scaleCode?: string;
  onScaleCodeChange?: (code: string) => void;
}

/** "How is it sold?" cards and the unit, shared by the product forms. */
const ProductUnitFields: React.FC<Props> = ({ allowDecimalQty, unit, onChange, disabled, scaleCode, onScaleCodeChange }) => {
  const [kind, setKind] = useState<SaleKind>(() => kindOf(allowDecimalQty, unit));
  // a product loaded after the first render (edit page) picks its card
  useEffect(() => {
    setKind(kindOf(allowDecimalQty, unit));
    // only when the saved values arrive / change from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowDecimalQty]);

  const current = KINDS.find(k => k.kind === kind)!;
  const isPreset = current.units.includes(unit.trim()) || (kind === "piece" && !unit.trim());
  const [custom, setCustom] = useState(!isPreset);
  useEffect(() => {
    if (!isPreset) setCustom(true);
  }, [isPreset]);

  const pickKind = (k: (typeof KINDS)[number]) => {
    setKind(k.kind);
    setCustom(false);
    // piece goods keep an empty unit (shown as "قطعة"); the others start on their first unit
    onChange({ allowDecimalQty: k.decimal, unit: k.decimal ? k.units[0] : "" });
  };

  const selectedUnit = unit.trim() || (kind === "piece" ? "قطعة" : "");

  return (
    <div className="col-span-2 space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">كيف يُباع؟</p>
        <div role="radiogroup" aria-label="طريقة البيع" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map(k => {
            const Icon = k.icon;
            const selected = k.kind === kind;
            return (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => pickKind(k)}
                className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-right transition-colors ${
                  selected ? "border-primary-500 bg-primary-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${selected ? "text-primary-600" : "text-gray-400"}`} />
                <span>
                  <span className={`block text-sm font-semibold ${selected ? "text-primary-700" : "text-gray-800"}`}>{k.label}</span>
                  <span className="block text-xs text-gray-500">{k.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">الوحدة</p>
        <div role="radiogroup" aria-label="الوحدة" className="flex flex-wrap gap-2">
          {current.units.map(u => {
            const selected = !custom && selectedUnit === u;
            return (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => {
                  setCustom(false);
                  // "قطعة" is the default for piece goods: saved as no unit
                  onChange({ allowDecimalQty: current.decimal, unit: kind === "piece" && u === "قطعة" ? "" : u });
                }}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  selected ? "border-primary-500 bg-primary-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {u}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            disabled={disabled}
            onClick={() => {
              setCustom(true);
              onChange({ allowDecimalQty: current.decimal, unit: "" });
            }}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              custom ? "border-primary-500 bg-primary-600 text-white" : "border-dashed border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            أخرى
          </button>
        </div>
        {custom && (
          <input
            id="product-unit"
            autoFocus
            value={unit}
            maxLength={20}
            disabled={disabled}
            onChange={e => onChange({ allowDecimalQty: current.decimal, unit: e.target.value })}
            placeholder="اكتب الوحدة، مثل: طقم، رول، جالون"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500 sm:w-64"
          />
        )}
        <p className="mt-1.5 text-xs text-gray-500">
          {current.decimal
            ? "الكمية تقبل كسوراً حتى 3 أرقام عشرية. السعر والتكلفة لكل وحدة."
            : "الكميات أرقام صحيحة."}{" "}
          تظهر الوحدة بجانب الكمية في الفاتورة والإيصال والتقارير.
        </p>
      </div>

      {current.decimal && onScaleCodeChange && (
        <div>
          <label htmlFor="product-scale-code" className="mb-1 block text-sm font-medium text-gray-700">
            كود الميزان <span className="font-normal text-gray-400">(اختياري)</span>
          </label>
          <input
            id="product-scale-code"
            value={scaleCode ?? ""}
            inputMode="numeric"
            maxLength={6}
            disabled={disabled}
            onChange={e => onScaleCodeChange(e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, ""))}
            placeholder="مثل 123"
            dir="ltr"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500 sm:w-40"
          />
          <p className="mt-1 text-xs text-gray-500">رقم الصنف المبرمج على ميزان المحل: عند مسح ملصق الميزان يُضاف المنتج بالوزن المطبوع عليه.</p>
        </div>
      )}
    </div>
  );
};

export default ProductUnitFields;
