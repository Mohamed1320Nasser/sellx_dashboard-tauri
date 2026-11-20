import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Copy, Download, ExternalLink, Loader2, MessageCircle, RefreshCw, Share2, X } from "lucide-react";
import type { Quote } from "../../types";
import { quoteService } from "../../services/quoteService";
import { quotePdfFile } from "../../services/quotePrintService";
import { saveFile } from "../invoice/generateSaleInvoicePdf";
import { copyText, openExternal, quoteShareLink, whatsappLink, whatsappNumber } from "../../utils/whatsapp";
import { markQuoteSent, quoteWhatsappText } from "./sendQuoteWhatsApp";

interface Props {
  quote: Quote | null;
  onClose: () => void;
  companyId: number;
  companyName?: string;
}

type Phase = "preparing" | "ready" | "error";

/** The device can hand the PDF itself to WhatsApp (phones, most desktop browsers) */
function canShareFile(file: File | null) {
  try {
    return !!file && typeof navigator.share === "function" && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Send a quote: prepares the PDF and the customer link, then each way to send runs from its own
 * tap (browsers block share sheets and new tabs that come after a slow step).
 */
const SendQuoteModal: React.FC<Props> = ({ quote, onClose, companyId, companyName = "" }) => {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("preparing");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const edited = useRef(false);
  const run = useRef(0);

  const prepare = useCallback(async () => {
    if (!quote) return;
    const mine = ++run.current;
    setPhase("preparing");
    setError("");
    let pdf: File | null = null;
    try {
      pdf = await quotePdfFile(quote);
    } catch {
      // the link still works without it: the page offers printing
    }
    try {
      const res: any = await quoteService.share(quote.id, companyId, pdf || undefined);
      const shared: Quote = res?.data ?? res;
      if (mine !== run.current) return;
      const url = shared?.shareToken ? quoteShareLink(shared.shareToken) : "";
      setFile(pdf);
      setLink(url);
      if (!edited.current) setMessage(quoteWhatsappText(quote, companyName, url));
      setPhase("ready");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    } catch (e: any) {
      if (mine !== run.current) return;
      setFile(pdf);
      setError(e?.response?.data?.msg || e?.message || "تعذر تجهيز رابط العرض");
      if (!edited.current) setMessage(quoteWhatsappText(quote, companyName));
      setPhase("error");
    }
  }, [quote, companyId, companyName, queryClient]);

  useEffect(() => {
    if (!quote) return;
    edited.current = false;
    setPhone(quote.customerContact || quote.client?.phone || "");
    setMessage(quoteWhatsappText(quote, companyName));
    setFile(null);
    setLink("");
    prepare();
    return () => {
      run.current++;
    };
    // a new quote (or reopening) prepares again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id]);

  useEffect(() => {
    if (!quote) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quote, onClose]);

  if (!quote) return null;

  const number = whatsappNumber(phone);
  const busy = phase === "preparing";
  const shareable = canShareFile(file);

  const sent = (text: string) => {
    markQuoteSent(quote, companyId, queryClient);
    toast.success(text, { id: "quote-send", duration: 5000 });
    onClose();
  };

  const openWhatsApp = async () => {
    const ok = await openExternal(whatsappLink(phone, message));
    if (!ok) {
      toast.error("تعذر فتح واتساب. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة", { id: "quote-send" });
      return;
    }
    sent(number ? "تم فتح محادثة العميل على واتساب" : "تم فتح واتساب. اختر محادثة العميل");
  };

  const shareFile = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: message });
      sent("تمت مشاركة العرض");
    } catch (e: any) {
      if (e?.name === "AbortError") return; // closed the share sheet
      toast.error("تعذرت مشاركة الملف من هذا الجهاز. استخدم واتساب بالرابط", { id: "quote-send" });
    }
  };

  const copyLink = async () => {
    if (!link) return;
    if (await copyText(link)) toast.success("تم نسخ الرابط", { id: "quote-send" });
    else toast.error("تعذر النسخ. انسخ الرابط يدوياً", { id: "quote-send" });
  };

  const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="send-quote-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h3 id="send-quote-title" className="text-lg font-bold text-gray-900">
              إرسال عرض السعر
            </h3>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              <bdi dir="ltr">{quote.quoteNumber}</bdi> · <bdi>{quote.customerName || quote.client?.name || "بدون اسم"}</bdi>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* link */}
          <div className={`rounded-xl border px-3 py-2.5 ${phase === "error" ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
            {busy && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري تجهيز ملف PDF ورابط العرض...
              </p>
            )}
            {phase === "error" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
                <button type="button" onClick={prepare} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة المحاولة
                </button>
              </div>
            )}
            {phase === "ready" && link && (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700" dir="ltr" title={link}>
                  {link}
                </span>
                <button type="button" onClick={copyLink} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white" aria-label="نسخ الرابط">
                  <Copy className="h-3.5 w-3.5" />
                  نسخ
                </button>
                <button
                  type="button"
                  onClick={() => openExternal(`${link}?preview=1`)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white"
                  aria-label="معاينة صفحة العميل"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  معاينة
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="send-quote-phone" className="mb-1 block text-sm font-medium text-gray-700">
              رقم واتساب العميل
            </label>
            <input
              id="send-quote-phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            <p className={`mt-1 text-xs ${phone && !number ? "text-amber-700" : "text-gray-500"}`}>
              {phone && !number ? "الرقم غير مكتمل. سيُفتح واتساب لتختار المحادثة بنفسك" : number ? "ستُفتح محادثة هذا الرقم مباشرة" : "بدون رقم: ستختار المحادثة داخل واتساب"}
            </p>
          </div>

          <div>
            <label htmlFor="send-quote-msg" className="mb-1 block text-sm font-medium text-gray-700">
              الرسالة
            </label>
            <textarea
              id="send-quote-msg"
              rows={7}
              value={message}
              onChange={e => {
                edited.current = true;
                setMessage(e.target.value);
              }}
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <p className="text-xs leading-5 text-gray-500">
            الرابط يفتح صفحة العرض مع ملف PDF، بدون التكلفة أو الربح. ستعرف من صفحة العرض متى فتحه العميل، ويمكنك إيقاف الرابط في أي وقت.
          </p>
        </div>

        <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <div className={`grid gap-2 ${shareable ? "sm:grid-cols-2" : ""}`}>
            <button type="button" onClick={openWhatsApp} disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <MessageCircle className="h-4 w-4" />
              {busy ? "انتظر لحظة..." : "إرسال على واتساب"}
            </button>
            {shareable && (
              <button type="button" onClick={shareFile} disabled={busy} className={`${btn} border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50`}>
                <Share2 className="h-4 w-4" />
                مشاركة ملف PDF
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            <button type="button" onClick={copyLink} disabled={!link} className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40">
              <Copy className="h-4 w-4" />
              نسخ الرابط
            </button>
            <button
              type="button"
              onClick={() => file && saveFile(file)}
              disabled={!file}
              className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              تحميل PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SendQuoteModal;
