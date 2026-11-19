import toast from "react-hot-toast";
import type { QueryClient } from "@tanstack/react-query";
import type { Quote } from "../../types";
import { quoteService } from "../../services/quoteService";
import { downloadQuotePdf } from "../../services/quotePrintService";
import { formatCurrency } from "../../utils/currencyUtils";
import { formatTableDate } from "../../utils/dateUtils";
import { openExternal, whatsappLink, whatsappNumber } from "../../utils/whatsapp";

/** The message the customer gets with the quote */
export function quoteWhatsappText(quote: Quote, companyName = ""): string {
  const name = quote.customerName || quote.client?.name || "";
  return [
    name ? `مرحباً ${name}،` : "مرحباً،",
    `نرسل لكم عرض السعر رقم ${quote.quoteNumber}${quote.subject ? ` بخصوص: ${quote.subject}` : ""}.`,
    `الإجمالي: ${formatCurrency(Number(quote.total))}`,
    quote.validUntil ? `العرض ساري حتى ${formatTableDate(quote.validUntil)}.` : "",
    "التفاصيل في ملف PDF المرفق.",
    companyName,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Send a quote on WhatsApp: open the chat with a ready message (call it straight from the click,
 * or the browser blocks the tab), then download the PDF to attach. A draft / printed quote becomes "sent".
 */
export async function sendQuoteWhatsApp(quote: Quote, opts: { companyId: number; companyName?: string; queryClient: QueryClient }) {
  const phone = quote.customerContact || quote.client?.phone || "";
  const opened = await openExternal(whatsappLink(phone, quoteWhatsappText(quote, opts.companyName)));
  if (!opened) {
    toast.error("تعذر فتح واتساب. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة", { id: "quote-wa" });
    return;
  }
  toast.loading("جاري تحميل ملف PDF لإرفاقه...", { id: "quote-wa" });
  try {
    await downloadQuotePdf(quote);
    toast.success(
      whatsappNumber(phone) ? "تم تحميل PDF. أرفقه في محادثة العميل على واتساب" : "تم تحميل PDF. اختر العميل في واتساب وأرفق الملف",
      { id: "quote-wa", duration: 8000 }
    );
  } catch (e: any) {
    toast.error(e?.message || "تعذر تحميل ملف PDF", { id: "quote-wa" });
  }
  if (!quote.convertedToSaleId && (quote.status === "DRAFT" || quote.status === "PRINTED")) {
    quoteService
      .update(quote.id, { companyId: opts.companyId, status: "SENT" })
      .then(() => opts.queryClient.invalidateQueries({ queryKey: ["quotes"] }))
      .catch(() => {
        /* a cashier can't change the status: the message still went out */
      });
  }
}
