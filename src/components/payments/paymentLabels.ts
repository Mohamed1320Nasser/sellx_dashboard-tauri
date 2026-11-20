import { Banknote, Building2, CreditCard, Smartphone, type LucideIcon } from "lucide-react";
import type { PaymentMethodCode } from "../../services/paymentService";

/** One place for how payment methods read and look */
export const METHOD: Record<PaymentMethodCode, { label: string; icon: LucideIcon; cls: string }> = {
  CASH: { label: "نقدي", icon: Banknote, cls: "bg-emerald-50 text-emerald-700" },
  CARD: { label: "بطاقة", icon: CreditCard, cls: "bg-sky-50 text-sky-700" },
  MOBILE_WALLET: { label: "محفظة إلكترونية", icon: Smartphone, cls: "bg-violet-50 text-violet-700" },
  BANK_TRANSFER: { label: "تحويل بنكي", icon: Building2, cls: "bg-amber-50 text-amber-700" },
};

export const methodOf = (code?: string) => METHOD[(code as PaymentMethodCode) || "CASH"] || { label: code || "—", icon: CreditCard, cls: "bg-gray-100 text-gray-700" };

export const METHOD_OPTIONS = (Object.keys(METHOD) as PaymentMethodCode[]).map(value => ({ value, label: METHOD[value].label }));

/** The server's message for a failed request */
export const apiError = (e: any, fallback: string) => e?.response?.data?.msg || e?.response?.data?.message || e?.message || fallback;
