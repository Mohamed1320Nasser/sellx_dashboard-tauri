/** Beyond this much below or above the original price, a negotiated line shows a warning */
export const NEGOTIATION_WARN_PERCENT = 10;

/** How far `price` is from `original`, in percent (negative = cheaper) */
export const priceGap = (price: number, original: number) => (original > 0 ? ((price - original) / original) * 100 : 0);
