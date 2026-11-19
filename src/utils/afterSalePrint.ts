/**
 * What this device does after a sale is saved. Kept per device (browser / desktop app):
 * the till with a receipt printer prints directly, a laptop without one doesn't print.
 */
export type AfterSaleMode = "preview" | "print" | "none";

const KEY = "sellx.afterSalePrint";

export const AFTER_SALE_OPTIONS: { value: AfterSaleMode; label: string; short: string; description: string }[] = [
  { value: "preview", label: "عرض نافذة الطباعة", short: "معاينة", description: "تظهر الفاتورة لتختار: طباعة حرارية، A4 أو صورة." },
  { value: "print", label: "طباعة مباشرة", short: "طباعة مباشرة", description: "تُطبع على طابعة الإيصالات فوراً، ثم تبدأ فاتورة جديدة." },
  { value: "none", label: "بدون طباعة", short: "بدون طباعة", description: "رسالة تم البيع مع زر طباعة لثوانٍ إن طلب العميل إيصالاً." },
];

/** The device's choice; first time: what the shop's old auto-print switch said */
export function getAfterSaleMode(shopAutoPrint?: boolean): AfterSaleMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "preview" || v === "print" || v === "none") return v;
  } catch {
    // storage blocked: fall back to the shop setting
  }
  return shopAutoPrint ? "print" : "preview";
}

export function setAfterSaleMode(mode: AfterSaleMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
}
