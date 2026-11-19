import React from "react";
import { Package, Plus, Trash2 } from "lucide-react";

export interface PackRow {
  id?: string;
  name: string;
  factor: string;
  sellingPrice: string;
  barcode: string;
}

interface Props {
  packs: PackRow[];
  onChange: (packs: PackRow[]) => void;
  /** Price of one piece, to suggest a pack price and show the saving */
  piecePrice: number;
  unit?: string;
  allowDecimalQty?: boolean;
  disabled?: boolean;
  /** Mark incomplete rows in red (after a save was tried) */
  showErrors?: boolean;
}

const MAX_PACKS = 5;
const SUGGESTED = ["كرتونة", "علبة", "دستة", "شوال", "باكو"];
const toEn = (v: string) => v.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, ".");

export const emptyPack = (taken: string[] = []): PackRow => ({
  // the usual first pack is a carton: only the count and price are left to type
  name: SUGGESTED.find(n => !taken.includes(n)) || "",
  factor: "",
  sellingPrice: "",
  barcode: "",
});

/** What is wrong with a row, field by field (empty = fine). Blank rows are ignored. */
export function packRowErrors(r: PackRow, allowDecimalQty?: boolean): Partial<Record<keyof PackRow, string>> {
  if (!r.name.trim() && !r.factor.trim() && !r.sellingPrice.trim() && !r.barcode.trim()) return {};
  const e: Partial<Record<keyof PackRow, string>> = {};
  const factor = Number(toEn(r.factor));
  const price = Number(toEn(r.sellingPrice));
  if (!r.name.trim()) e.name = "اكتب الاسم";
  if (!r.factor.trim()) e.factor = "كم قطعة فيها؟";
  else if (!(factor > 0) || factor === 1) e.factor = "أكبر من 1";
  else if (!allowDecimalQty && !Number.isInteger(factor)) e.factor = "رقم صحيح";
  if (!r.sellingPrice.trim()) e.sellingPrice = "اكتب السعر";
  else if (!(price > 0)) e.sellingPrice = "سعر غير صحيح";
  return e;
}

/** First problem in the packs, to stop the save with a clear message (null = all good) */
export function packsProblem(rows: PackRow[], allowDecimalQty?: boolean): string | null {
  for (const [i, r] of rows.entries()) {
    const e = packRowErrors(r, allowDecimalQty);
    const first = e.name || e.factor || e.sellingPrice;
    if (first) return `العبوة ${r.name.trim() || i + 1}: ${first}`;
  }
  const names = rows.map(r => r.name.trim()).filter(Boolean);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return `اسم العبوة "${dup}" مكرر`;
  return null;
}

/** Packs from the API -> form rows */
export const packsToRows = (packs: any[] | undefined): PackRow[] =>
  (packs || []).map(p => ({
    id: p.id,
    name: p.name || "",
    factor: String(p.factor ?? ""),
    sellingPrice: String(p.sellingPrice ?? ""),
    barcode: p.barcode || "",
  }));

/** Form rows -> API (empty rows are dropped) */
export const rowsToPacks = (rows: PackRow[]) =>
  rows
    .filter(r => r.name.trim() || r.factor.trim() || r.sellingPrice.trim())
    .map(r => ({
      ...(r.id && { id: r.id }),
      name: r.name.trim(),
      factor: Number(toEn(r.factor)),
      sellingPrice: Number(toEn(r.sellingPrice)),
      barcode: r.barcode.trim() || null,
    }));

/** "Sold in packs too": carton of 12 with its own price and barcode. Stock stays in pieces. */
const ProductPacksEditor: React.FC<Props> = ({ packs, onChange, piecePrice, unit, allowDecimalQty, disabled, showErrors }) => {
  const set = (i: number, patch: Partial<PackRow>) => onChange(packs.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const pieceWord = allowDecimalQty ? unit || "وحدة" : "قطعة";

  return (
    <div className="col-span-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-start gap-2">
        <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
        <div>
          <p className="text-sm font-medium text-gray-800">البيع بالعبوة (اختياري)</p>
          <p className="text-xs text-gray-500">
            مثل كرتونة فيها 12 {pieceWord} بسعرها وباركودها. المخزون يبقى بالـ{pieceWord}، وبيع كرتونة يخصم 12.
          </p>
        </div>
      </div>

      {packs.map((p, i) => {
        const factor = Number(toEn(p.factor));
        const price = Number(toEn(p.sellingPrice));
        const full = factor > 0 && piecePrice > 0 ? Math.round(factor * piecePrice * 100) / 100 : 0;
        const saving = full && price > 0 ? Math.round((full - price) * 100) / 100 : 0;
        const errors = showErrors ? packRowErrors(p, allowDecimalQty) : {};
        const field = (bad?: string) =>
          `w-full rounded-md border px-2 py-1.5 text-sm focus:ring-1 ${
            bad ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-primary-500 focus:ring-primary-500"
          }`;
        return (
          <div key={p.id || i} className="rounded-md border border-gray-200 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                {p.name.trim() || `عبوة ${i + 1}`}
                {factor > 1 && <span className="font-normal text-gray-500"> · {factor} {pieceWord}</span>}
              </span>
              <button
                type="button"
                aria-label={`حذف العبوة ${p.name.trim() || i + 1}`}
                title="حذف العبوة"
                disabled={disabled}
                onClick={() => onChange(packs.filter((_, k) => k !== i))}
                className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-xs text-gray-600" htmlFor={`pack-name-${i}`}>اسم العبوة</label>
                <input
                  id={`pack-name-${i}`}
                  list="pack-name-presets"
                  value={p.name}
                  maxLength={30}
                  disabled={disabled}
                  onChange={e => set(i, { name: e.target.value })}
                  placeholder="كرتونة"
                  className={field(errors.name)}
                />
                {errors.name && <p className="mt-0.5 text-xs text-red-600">{errors.name}</p>}
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600" htmlFor={`pack-factor-${i}`}>فيها كم {pieceWord}</label>
                <input
                  id={`pack-factor-${i}`}
                  value={p.factor}
                  inputMode={allowDecimalQty ? "decimal" : "numeric"}
                  disabled={disabled}
                  onChange={e => {
                    const next = toEn(e.target.value);
                    const n = Number(next);
                    // suggest the full price while the price hasn't been typed by hand
                    const auto = !p.sellingPrice || p.sellingPrice === String(Math.round(Number(toEn(p.factor)) * piecePrice * 100) / 100);
                    const suggest = auto && n > 1 && piecePrice > 0 ? String(Math.round(n * piecePrice * 100) / 100) : p.sellingPrice;
                    set(i, { factor: next, sellingPrice: suggest });
                  }}
                  placeholder="12"
                  dir="ltr"
                  className={`${field(errors.factor)} text-right`}
                />
                {errors.factor && <p className="mt-0.5 text-xs text-red-600">{errors.factor}</p>}
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600" htmlFor={`pack-price-${i}`}>سعر العبوة</label>
                <input
                  id={`pack-price-${i}`}
                  value={p.sellingPrice}
                  inputMode="decimal"
                  disabled={disabled}
                  onChange={e => set(i, { sellingPrice: toEn(e.target.value) })}
                  placeholder="0.00"
                  dir="ltr"
                  className={`${field(errors.sellingPrice)} text-right`}
                />
                {errors.sellingPrice && <p className="mt-0.5 text-xs text-red-600">{errors.sellingPrice}</p>}
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600" htmlFor={`pack-barcode-${i}`}>باركود العبوة <span className="text-gray-400">(اختياري)</span></label>
                <input
                  id={`pack-barcode-${i}`}
                  value={p.barcode}
                  maxLength={64}
                  disabled={disabled}
                  onChange={e => set(i, { barcode: e.target.value })}
                  onKeyDown={e => {
                    // a scanner ends with Enter: keep it from submitting the product form
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  placeholder="امسحه بالقارئ"
                  dir="ltr"
                  className={`${field()} text-right`}
                />
              </div>
            </div>
            {saving > 0 && (
              <p className="mt-2 text-xs text-green-700">
                أوفر للعميل بـ {saving} من شراء {factor} {pieceWord} منفصلة ({full})
              </p>
            )}
            {saving < 0 && (
              <p className="mt-2 text-xs text-amber-700">
                أغلى بـ {-saving} من شراء {factor} {pieceWord} منفصلة ({full})
              </p>
            )}
          </div>
        );
      })}

      <datalist id="pack-name-presets">
        {SUGGESTED.map(n => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {packs.length < MAX_PACKS && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...packs, emptyPack(packs.map(p => p.name.trim()))])}
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Plus className="h-4 w-4" />
          إضافة عبوة
        </button>
      )}
    </div>
  );
};

export default ProductPacksEditor;
