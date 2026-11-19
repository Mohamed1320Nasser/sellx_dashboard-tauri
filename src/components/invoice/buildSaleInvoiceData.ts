import QRCode from "qrcode";
import type { InvoiceKind, InvoiceStatus, PillTone, SaleInvoiceData, SaleInvoiceLineItem } from "./saleInvoiceTypes";
import { amountInWords } from "../../utils/amountInWords";
import { packView, qtyTimes, sumQty } from '../../utils/quantity';
import { salePaymentLabel } from '../../utils/paymentMethods';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدًا",
  CARD: "بطاقة",
  MOBILE_WALLET: "محفظة إلكترونية",
  BANK_TRANSFER: "تحويل بنكي",
  CREDIT: "آجل",
  SPLIT: "مقسّم",
};

const PAYMENT_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PAID: "مدفوعة بالكامل",
  PARTIAL: "مدفوعة جزئيًا",
  UNPAID: "غير مدفوعة",
};

const STATUS_TONES: Record<InvoiceStatus, PillTone> = { PAID: "green", PARTIAL: "amber", UNPAID: "red" };

/** yyyy/mm/dd without the invisible direction marks the Arabic formatter adds (the PDF scrambles them) */
const plainDate = (d: Date) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Maps a sale, a purchase or a price quote (as the API returns it, or as built right after saving) into the
 * flat data the A4 invoice shows. The PDF download and the A4 print both use this, so they match.
 */
export async function buildSaleInvoiceData(params: {
  sale: any;
  company: any;
  cashier?: any;
  kind?: InvoiceKind;
  /** from the print settings */
  showQrCode?: boolean;
  footerText?: string;
  terms?: string;
  commercialRegister?: string;
}): Promise<SaleInvoiceData> {
  const { sale, company, cashier, kind = "sale", showQrCode = false, footerText, terms, commercialRegister } = params;
  const isPurchase = kind === "purchase";
  const isQuote = kind === "quote";

  const when = new Date(
    (isPurchase ? sale.purchaseDate : isQuote ? sale.quoteDate : sale.saleDate) || sale.createdAt || Date.now()
  );
  const dateLabel = when.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "2-digit" });
  const timeLabel = new Date(sale.createdAt || when).toLocaleTimeString("ar-EG-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const items: SaleInvoiceLineItem[] = (sale.items || []).map((item: any, i: number) => {
    // a pack line shows as packs ("2 كرتونة x 100"), not as pieces
    const view = item.packName ? packView(item) : null;
    const quantity = view ? view.quantity : num(item.quantity);
    const unitPrice = view ? view.unitPrice : num(item.unitPrice ?? item.price ?? item.unitCost);
    return {
      discount: num(item.lineDiscount),
      index: i + 1,
      productName: view ? view.name : item.product?.name || item.productName || "منتج",
      sku: item.product?.sku || item.sku || undefined,
      categoryName: item.product?.category?.name || undefined,
      quantity,
      unit: view ? view.unit || undefined : (item.product?.unit || item.unit || "").trim() || undefined,
      unitPrice,
      total: num(item.totalPrice ?? item.lineTotal ?? item.total, qtyTimes(quantity, unitPrice)),
    };
  });

  const totalAmount = num(sale.totalAmount ?? sale.total);
  // a quote has nothing paid and nothing owed
  const paidAmount = isQuote ? 0 : num(sale.paidAmount ?? sale.paid, isPurchase ? 0 : totalAmount);
  const taxAmount = num(sale.taxAmount ?? sale.tax);
  const discountAmount = num(sale.discountAmount ?? sale.totalDiscount ?? sale.discount);
  const additionalFee = num(isPurchase ? sale.shippingCost : sale.additionalFee);
  const itemsTotal = items.reduce((s, it) => s + it.total, 0);
  const subtotal = num(sale.subtotal, itemsTotal);
  // The API's remaining amount already counts returns; otherwise total - paid
  const returnsAmount = isQuote ? 0 : Math.max(0, num(sale.returnCredit));
  const remainingAmount = isQuote
    ? 0
    : Math.max(0, Math.round(num(sale.remainingAmount, totalAmount - paidAmount) * 100) / 100);
  const paymentStatus: InvoiceStatus =
    (sale.paymentStatus as InvoiceStatus) ||
    (remainingAmount <= 0.009 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID");

  const party = isPurchase
    ? sale.supplier
    : isQuote
      ? {
          name: sale.customerName || sale.client?.name,
          phone: sale.customerContact || sale.client?.phone,
          email: sale.customerEmail || sale.client?.email,
        }
      : sale.client;
  const companyName = company?.name || company?.company?.name || "";
  const companyTaxNumber = company?.taxNumber || company?.taxId || company?.company?.taxNumber;

  const qrValue = showQrCode
    ? [companyName, companyTaxNumber || "", when.toISOString(), totalAmount.toFixed(2), taxAmount.toFixed(2)].join("|")
    : "";
  const qrImageDataUrl = qrValue
    ? await QRCode.toDataURL(qrValue, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0f172a", light: "#ffffff" },
      })
    : "";

  const validUntil = isQuote && sale.validUntil ? new Date(sale.validUntil) : null;
  const expired = !!validUntil && validUntil.getTime() < new Date().setHours(0, 0, 0, 0);
  const method = String(sale.paymentMethod || (isPurchase && paidAmount <= 0 ? "CREDIT" : "CASH")).toUpperCase();

  return {
    kind,
    // VAT on the invoice and a registered company: it is a tax invoice
    title: isPurchase
      ? "فاتورة شراء"
      : isQuote
        ? "عرض سعر"
        : taxAmount > 0 && companyTaxNumber
          ? "فاتورة ضريبية"
          : "فاتورة بيع",
    receiptNumber:
      (isPurchase ? sale.invoiceNumber : isQuote ? sale.quoteNumber : sale.receiptNumber) ||
      `${isPurchase ? "PUR" : isQuote ? "QT" : "SALE"}-${sale.id ?? ""}`,
    dateLabel,
    timeLabel,

    companyName,
    companyAddress: company?.address || company?.company?.address,
    companyPhone: company?.phone || company?.company?.phone,
    companyEmail: company?.email || company?.company?.email,
    companyTaxNumber,
    companyLogoUrl: company?.logoUrl || company?.company?.logoUrl,
    commercialRegister: commercialRegister?.trim() || undefined,

    partyLabel: isPurchase ? "المورد" : "العميل",
    clientName: party?.name || sale.clientName || sale.supplierName || (isPurchase || isQuote ? "—" : "عميل نقدي"),
    clientPhone: party?.phone || undefined,
    clientEmail: party?.email || undefined,
    clientAddress: party?.address || undefined,
    clientBalance: !isPurchase && !isQuote && sale.clientBalance != null ? num(sale.clientBalance) : null,

    cashierName: sale.user?.fullname || cashier?.fullname || cashier?.name || cashier?.username,
    staffLabel: isPurchase ? "المستخدم" : isQuote ? "أعدّه" : "الكاشير",
    notes: sale.notes || undefined,

    middleLabel: isQuote ? "صالح حتى" : "طريقة الدفع",
    middleValue: isQuote
      ? validUntil
        ? validUntil.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "2-digit" })
        : "غير محدد"
      : PAYMENT_METHOD_LABELS[method] || "نقدًا",
    pillLabel: isQuote ? (expired ? "منتهي الصلاحية" : "ساري") : PAYMENT_STATUS_LABELS[paymentStatus] || PAYMENT_STATUS_LABELS.PAID,
    pillTone: isQuote ? (expired ? "red" : "green") : STATUS_TONES[paymentStatus] || "green",
    signatureLabel: isPurchase ? "توقيع المورد" : isQuote ? "توقيع العميل بالموافقة" : "توقيع المستلم",

    items,
    itemsCount: items.length,
    totalQuantity: new Set(items.map((it) => it.unit || "")).size > 1 || items.some((it) => it.unit)
      ? null
      : sumQty(items.map((it) => it.quantity)),
    showLineDiscount: items.some((it) => it.discount > 0),

    subtotal,
    discountAmount,
    taxAmount,
    taxRate: num(sale.taxRate ?? sale.taxPercent) > 0 ? num(sale.taxRate ?? sale.taxPercent) : undefined,
    additionalFee,
    additionalFeeLabel: isPurchase ? "شحن وتحميل" : sale.additionalFeeLabel || undefined,
    totalAmount,
    totalInWords: amountInWords(totalAmount),

    // split payment: "نقدًا 200 + بطاقة 300"
    paymentMethodLabel: isPurchase
      ? PAYMENT_METHOD_LABELS[method] || "نقدًا"
      : salePaymentLabel({ paymentMethod: method, checkoutParts: sale.checkoutParts }, PAYMENT_METHOD_LABELS, "نقدًا"),
    paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[paymentStatus] || PAYMENT_STATUS_LABELS.PAID,
    paidAmount,
    returnsAmount,
    remainingAmount,
    payments: isQuote
      ? []
      : (sale.payments || []).map((p: any) => ({
          dateLabel: plainDate(new Date(p.paymentDate || p.createdAt)),
          methodLabel: PAYMENT_METHOD_LABELS[String(p.paymentMethod || "CASH").toUpperCase()] || "نقدًا",
          amount: num(p.amount),
        })),

    footerText: footerText?.trim() || undefined,
    terms: terms?.trim() || undefined,
    printedAtLabel: new Date().toLocaleString("ar-EG-u-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    qrValue,
    qrImageDataUrl,
  };
}
