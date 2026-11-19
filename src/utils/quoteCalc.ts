import { qtyTimes } from "./quantity";

/**
 * Quote totals, the same steps as the server (be: src/api/quote/quote.calc.ts) so the screen
 * shows exactly what is saved. Keep the two in step.
 *
 *   line:   gross = qty x price, discount = gross x line % -> net
 *   quote:  subtotal = sum of nets, then the invoice discount, tax on what is left, then the fee
 */
export type QuoteDiscountType = "PERCENT" | "AMOUNT";

const money = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

export interface CalcLineIn {
  qty: number;
  price: number;
  discountPercent: number;
  cost: number;
}

export function calcLine(line: CalcLineIn) {
  const gross = qtyTimes(line.qty, line.price);
  const discount = money((gross * (line.discountPercent || 0)) / 100);
  const net = money(gross - discount);
  return { gross, discount, net, profit: money(net - line.cost) };
}

export function calcQuote(
  lines: CalcLineIn[],
  totals: { discountType?: QuoteDiscountType | null; discountValue?: number; taxPercent?: number; additionalFee?: number }
) {
  const out = lines.map(calcLine);
  const subtotal = money(out.reduce((s, l) => s + l.net, 0));
  const lineDiscounts = money(out.reduce((s, l) => s + l.discount, 0));
  const value = Math.max(0, Number(totals.discountValue) || 0);
  const orderDiscount =
    totals.discountType === "PERCENT"
      ? money((subtotal * Math.min(value, 100)) / 100)
      : totals.discountType === "AMOUNT"
        ? money(Math.min(value, subtotal))
        : 0;
  const taxable = money(subtotal - orderDiscount);
  const taxPercent = Math.max(0, Number(totals.taxPercent) || 0);
  const taxAmount = money((taxable * taxPercent) / 100);
  const additionalFee = money(Math.max(0, Number(totals.additionalFee) || 0));
  const total = money(taxable + taxAmount + additionalFee);
  const totalCost = money(lines.reduce((s, l) => s + l.cost, 0));
  return {
    lines: out,
    subtotal,
    lineDiscounts,
    orderDiscount,
    taxPercent,
    taxAmount,
    additionalFee,
    total,
    totalCost,
    totalProfit: money(taxable - totalCost),
  };
}
