/** How returns read across the screens and print: item condition, refund method, status */
export type ItemCondition = "NEW" | "USED" | "DAMAGED" | "DEFECTIVE";

export const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: "NEW", label: "سليم" },
  { value: "USED", label: "مستعمل" },
  { value: "DAMAGED", label: "تالف" },
  { value: "DEFECTIVE", label: "معيب" },
];

export const conditionLabel = (c?: string | null) => CONDITIONS.find((x) => x.value === String(c || "").toUpperCase())?.label || "سليم";

/** Damaged or defective goods don't go back into stock: they are written off */
export const isUnsellable = (c?: string | null) => ["DAMAGED", "DEFECTIVE"].includes(String(c || "").toUpperCase());

/** The refund goes back the way the invoice was paid; cash for cash, split and credit invoices */
export function defaultRefundMethod(sale?: { paymentMethod?: string | null } | null) {
  const m = String(sale?.paymentMethod || "CASH").toUpperCase();
  return ["CARD", "MOBILE_WALLET", "BANK_TRANSFER"].includes(m) ? m : "CASH";
}

export const RETURN_STATUS: Record<string, { label: string; variant: "warning" | "success" | "error" }> = {
  PENDING: { label: "في الانتظار", variant: "warning" },
  COMPLETED: { label: "مكتمل", variant: "success" },
  REJECTED: { label: "مرفوض", variant: "error" },
};
