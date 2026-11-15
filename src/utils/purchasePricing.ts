/**
 * Same rules the server uses when a purchase updates a selling price
 * (sellx_backend: pricing.helper applyPriceRounding, purchase.service profitMargin).
 */

/** Margin used when a product has no usable price history (about 30% markup) */
export const DEFAULT_MARGIN = 0.23;

export function applyPriceRounding(price: number, rule: string): number {
  if (rule === "NONE") return parseFloat(price.toFixed(2));
  const integerPart = Math.floor(price);
  const decimalPart = price - integerPart;
  switch (rule) {
    case "0.00":
      return Math.round(price);
    case "0.50":
      if (decimalPart < 0.25) return integerPart;
      if (decimalPart < 0.75) return integerPart + 0.5;
      return integerPart + 1;
    case "0.95":
      return decimalPart <= 0.95 ? integerPart + 0.95 : integerPart + 1.95;
    case "0.99":
      return decimalPart <= 0.99 ? integerPart + 0.99 : integerPart + 1.99;
    default:
      return parseFloat(price.toFixed(2));
  }
}

/** Margin = (selling - cost) / selling; the default when the old prices give no sensible margin */
export function profitMargin(cost: number, selling: number): number {
  if (cost <= 0 || selling <= 0) return DEFAULT_MARGIN;
  const margin = (selling - cost) / selling;
  return margin > 0 && margin < 0.9 ? margin : DEFAULT_MARGIN;
}

/** Selling price that keeps the product's margin on the new cost */
export function suggestedSellingPrice(newCost: number, oldCost: number, oldSelling: number, rule: string): number {
  if (!(newCost > 0)) return oldSelling;
  const margin = profitMargin(oldCost, oldSelling);
  return Math.round(applyPriceRounding(newCost / (1 - margin), rule) * 100) / 100;
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
