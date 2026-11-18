/**
 * Sale payment methods and split payment (one invoice paid with several methods).
 * The server stores the money taken at the till per method as `checkoutParts`.
 */
export type SplitPartMethod = "CASH" | "CARD" | "MOBILE_WALLET" | "BANK_TRANSFER";
export type CheckoutPart = { method: string; amount: number };

/** Methods one part of a split can use (any unpaid rest is the customer's debt) */
export const SPLIT_PART_METHODS: { value: SplitPartMethod; label: string }[] = [
  { value: "CASH", label: "نقدي" },
  { value: "CARD", label: "بطاقة" },
  { value: "MOBILE_WALLET", label: "محفظة" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
];
export const MAX_SPLIT_PARTS = 6;

export const SALE_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  MOBILE_WALLET: "محفظة",
  BANK_TRANSFER: "تحويل بنكي",
  CREDIT: "آجل",
  SPLIT: "مقسّم",
};

const amountText = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "نقدي 200 + بطاقة 300" */
export function partsLabel(parts: CheckoutPart[], labels: Record<string, string> = SALE_METHOD_LABELS) {
  return parts.map((p) => `${labels[p.method] || p.method} ${amountText(Number(p.amount) || 0)}`).join(" + ");
}

/**
 * How a sale was paid, as one line: the method name, or the parts of a split payment.
 * `labels` lets a print template use its own wording ("نقداً").
 */
export function salePaymentLabel(
  sale: { paymentMethod?: string | null; checkoutParts?: CheckoutPart[] | null },
  labels: Record<string, string> = SALE_METHOD_LABELS,
  fallback = "نقدي"
) {
  const method = String(sale.paymentMethod || "CASH").toUpperCase();
  const parts = sale.checkoutParts || [];
  if (method === "SPLIT" && parts.length) return partsLabel(parts, labels);
  return labels[method] || SALE_METHOD_LABELS[method] || fallback;
}
