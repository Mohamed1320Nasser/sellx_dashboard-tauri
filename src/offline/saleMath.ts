/**
 * The server's sale arithmetic, copied so an offline receipt shows the same figures the server will
 * record (backend: common/helpers/money.helper.ts calculateSaleTotals, salesCycle.helper.ts
 * buildCheckoutParts, scaleBarcode.helper.ts). The server recomputes everything when it receives the
 * sale; these copies only decide what is printed now. Keep them in step with the backend.
 */
export const roundMoney = (v: number) => (typeof v !== "number" || Number.isNaN(v) ? 0 : Math.round(v * 100) / 100);
export const toMoney = (v: unknown) => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : roundMoney(n);
};
export const roundQty = (v: number) => Math.round(v * 1000) / 1000;

export interface SaleLine {
  quantity: number;
  unitPrice: number;
}

export function saleTotals(p: { items: SaleLine[]; discountAmount?: number | null; discountPercent?: number | null; taxRate?: number | null; additionalFee?: number | null }) {
  const subtotal = roundMoney(p.items.reduce((s, i) => s + (i.quantity < 0 ? 0 : roundMoney(i.quantity * toMoney(i.unitPrice))), 0));
  let discount = 0;
  if (p.discountAmount && p.discountAmount > 0) discount = roundMoney(Math.min(toMoney(p.discountAmount), subtotal));
  else if (p.discountPercent && p.discountPercent > 0) discount = roundMoney(subtotal * (Math.min(toMoney(p.discountPercent), 100) / 100));
  const taxable = roundMoney(subtotal - discount);
  const rate = toMoney(p.taxRate);
  const tax = taxable > 0 && rate > 0 ? roundMoney(taxable * (Math.min(rate, 100) / 100)) : 0;
  const fee = toMoney(p.additionalFee);
  const grandTotal = roundMoney(Math.max(0, subtotal - discount + tax + fee));
  return { subtotal, discountAmount: discount, taxAmount: tax, taxRate: rate || null, additionalFee: fee, grandTotal };
}

export const SPLIT_METHOD = "SPLIT";
const CASH_DRAWER_METHODS = ["CASH", "CREDIT"];

/** what was paid at the till, per method (credit down payments are cash) */
export function checkoutParts(parts: { method: string; amount: number }[] | undefined, singleMethod: string | undefined, paidAmount: number) {
  if (parts?.length) {
    const by = new Map<string, number>();
    for (const p of parts) by.set(p.method, roundMoney((by.get(p.method) || 0) + roundMoney(p.amount)));
    return [...by].map(([method, amount]) => ({ method, amount })).filter(p => p.amount > 0);
  }
  if (paidAmount <= 0) return [];
  const method = singleMethod || "CASH";
  return [{ method: CASH_DRAWER_METHODS.includes(method) ? "CASH" : method, amount: paidAmount }];
}

export function paymentOf(body: { payments?: { method: string; amount: number }[]; paidAmount?: number; paymentMethod?: string }, grandTotal: number) {
  const split = body.payments?.length ? checkoutParts(body.payments, undefined, 0) : null;
  const paidAmount = split ? roundMoney(split.reduce((s, p) => s + p.amount, 0)) : roundMoney(body.paidAmount ?? grandTotal);
  const unpaid = roundMoney(grandTotal - paidAmount);
  const paymentMethod = split
    ? split.length === 1 && unpaid <= 0.01
      ? split[0].method
      : SPLIT_METHOD
    : body.paymentMethod || (unpaid > 0.01 ? "CREDIT" : "CASH");
  const parts = split ?? checkoutParts(undefined, body.paymentMethod, paidAmount);
  const paymentStatus = paidAmount >= grandTotal - 0.01 ? "PAID" : paidAmount > 0.01 ? "PARTIAL" : "UNPAID";
  return { paidAmount, unpaid, paymentMethod, parts, paymentStatus, cash: roundMoney(parts.filter(p => p.method === "CASH").reduce((s, p) => s + p.amount, 0)) };
}

// ---------------------------------------------------------------------------- scale labels

export function ean13CheckDigit(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

const normalizePlu = (code: string) => (/^\d{1,6}$/.test(code) ? code.replace(/^0+/, "") || null : null);

export type ScaleRead = { ok: true; plu: string; value: number; mode: "WEIGHT" | "PRICE" } | { ok: false; reason: "NOT_SCALE" | "BAD_CHECK_DIGIT" | "ZERO_VALUE" };

export function readScaleBarcode(code: string, s: { scaleBarcodeEnabled: boolean; scaleBarcodePrefixes: string; scaleBarcodePluLength: number; scaleBarcodeMode: string }): ScaleRead {
  const digits = code.trim();
  const prefixes = String(s.scaleBarcodePrefixes || "").split(/[,\s]+/).filter(p => /^2\d$/.test(p));
  const mode = s.scaleBarcodeMode === "PRICE" ? "PRICE" : "WEIGHT";
  if (!s.scaleBarcodeEnabled || !/^\d{13}$/.test(digits) || !prefixes.includes(digits.slice(0, 2))) return { ok: false, reason: "NOT_SCALE" };
  if (ean13CheckDigit(digits.slice(0, 12)) !== Number(digits[12])) return { ok: false, reason: "BAD_CHECK_DIGIT" };
  const end = 2 + s.scaleBarcodePluLength;
  const plu = normalizePlu(digits.slice(2, end));
  const raw = Number(digits.slice(end, 12));
  if (!plu) return { ok: false, reason: "NOT_SCALE" };
  if (!raw) return { ok: false, reason: "ZERO_VALUE" };
  return { ok: true, plu, mode, value: mode === "WEIGHT" ? raw / 1000 : raw / 100 };
}
