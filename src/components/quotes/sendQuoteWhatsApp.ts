import type { QueryClient } from "@tanstack/react-query";
import type { Quote } from "../../types";
import { quoteService } from "../../services/quoteService";
import { formatCurrency } from "../../utils/currencyUtils";
import { formatTableDate } from "../../utils/dateUtils";

/** The message the customer gets with the quote; the link opens the quote page (with its PDF) */
export function quoteWhatsappText(quote: Quote, companyName = "", link = ""): string {
  const name = quote.customerName || quote.client?.name || "";
  return [
    name ? `مرحباً ${name}،` : "مرحباً،",
    `نرسل لكم عرض السعر رقم ${quote.quoteNumber}${quote.subject ? ` بخصوص: ${quote.subject}` : ""}.`,
    `الإجمالي: ${formatCurrency(Number(quote.total))}`,
    quote.validUntil ? `العرض ساري حتى ${formatTableDate(quote.validUntil)}.` : "",
    link ? `تفاصيل العرض وملف PDF:\n${link}` : "التفاصيل في ملف PDF المرفق.",
    companyName,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A draft / printed quote becomes "sent" once it goes out (a cashier can't change it: ignored) */
export function markQuoteSent(quote: Quote, companyId: number, queryClient: QueryClient) {
  if (quote.convertedToSaleId || (quote.status !== "DRAFT" && quote.status !== "PRINTED")) return;
  quoteService
    .update(quote.id, { companyId, status: "SENT" })
    .then(() => queryClient.invalidateQueries({ queryKey: ["quotes"] }))
    .catch(() => {
      /* the message still went out */
    });
}
