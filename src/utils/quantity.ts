/**
 * Quantities: whole pieces for most products, up to 3 decimals for goods sold by
 * weight / length / volume (product.allowDecimalQty). Never add quantities with raw +.
 */

export const QTY_DECIMALS = 3;
const FACTOR = 10 ** QTY_DECIMALS;

/** Units offered on the product form. Free text is also allowed. */
export const UNIT_PRESETS = ["كجم", "جرام", "متر", "سم", "لتر", "مل", "قطعة", "علبة", "كرتونة"] as const;
/** Default unit suggested when "sold by weight / length" is switched on. */
export const DEFAULT_DECIMAL_UNIT = "كجم";

/** Anything with optional allowDecimalQty / unit (a product, a cart line, ...) */
export type QtyProduct = { allowDecimalQty?: boolean | null; unit?: string | null } | object | null | undefined;
const info = (p: QtyProduct) => (p ?? {}) as { allowDecimalQty?: boolean | null; unit?: string | null };

export const roundQty = (value: number): number =>
  Number.isFinite(value) ? Math.round((value + Math.sign(value) * Number.EPSILON) * FACTOR) / FACTOR : 0;

export const toQty = (value: unknown): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? roundQty(n) : 0;
};

export const addQty = (a: unknown, b: unknown): number => roundQty(toQty(a) + toQty(b));
export const subQty = (a: unknown, b: unknown): number => roundQty(toQty(a) - toQty(b));
export const sumQty = (values: unknown[]): number => roundQty(values.reduce<number>((s, v) => s + toQty(v), 0));
/** quantity × price rounded to money (2 decimals), same as the server. */
export const qtyTimes = (qty: unknown, price: unknown): number =>
  Math.round(toQty(qty) * (Number(price) || 0) * 100) / 100;

export const allowsDecimal = (product: QtyProduct): boolean => !!info(product).allowDecimalQty;
/** Step for +/- buttons and <input step>: 1 for pieces, 0.001 for weighed goods. */
export const qtyInputStep = (product: QtyProduct): number => (allowsDecimal(product) ? 0.001 : 1);
export const minQty = (product: QtyProduct): number => (allowsDecimal(product) ? 0.001 : 1);

/** Arabic-Indic digits and the Arabic decimal comma → "1.25". */
export const normalizeDigits = (text: string): string =>
  text
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,،]/g, ".")
    .replace(/\s/g, "");

/** Parse typed text. Returns null when it is not a usable quantity for this product. */
export const parseQty = (text: string, product: QtyProduct): number | null => {
  const clean = normalizeDigits(text);
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  if (!allowsDecimal(product) && !Number.isInteger(n)) return null;
  if (Math.abs(n * FACTOR - Math.round(n * FACTOR)) > 1e-6) return null; // more than 3 decimals
  return roundQty(n);
};

/** Message for a quantity that parseQty rejected. */
export const qtyError = (product: QtyProduct): string =>
  allowsDecimal(product) ? "الكمية تقبل 3 أرقام عشرية بحد أقصى" : "هذا المنتج يباع بالقطعة فقط (بدون كسور)";

/** Unit label to show, or "" for plain pieces. */
export const unitOf = (product: QtyProduct): string => (info(product).unit || "").trim();

/** 1.250 → "1.25", 3 → "3", with the unit when given: "1.25 كجم". */
export const formatQty = (value: unknown, unit?: string | null): string => {
  const n = toQty(value);
  const text = n.toLocaleString("en-US", { maximumFractionDigits: QTY_DECIMALS, useGrouping: false });
  const u = (unit || "").trim();
  return u ? `${text} ${u}` : text;
};

/** Total of a cart: "3 قطع" when all pieces, else "5 أصناف". */
export const cartCountLabel = (items: { quantity: unknown; allowDecimalQty?: boolean | null }[]): string => {
  if (items.some(i => i.allowDecimalQty)) return `${items.length} صنف`;
  return `${sumQty(items.map(i => i.quantity))} قطعة`;
};
