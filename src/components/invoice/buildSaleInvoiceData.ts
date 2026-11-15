import QRCode from "qrcode";
import type { InvoiceKind, InvoiceStatus, SaleInvoiceData, SaleInvoiceLineItem } from "./saleInvoiceTypes";
import { amountInWords } from "../../utils/amountInWords";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدًا",
  CARD: "بطاقة",
  MOBILE_WALLET: "محفظة إلكترونية",
  BANK_TRANSFER: "تحويل بنكي",
  CREDIT: "آجل",
};

const PAYMENT_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PAID: "مدفوعة بالكامل",
  PARTIAL: "مدفوعة جزئيًا",
  UNPAID: "غير مدفوعة",
};

const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Maps a sale or a purchase (as the API returns it, or as built right after saving) into the
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
}): Promise<SaleInvoiceData> {
  const { sale, company, cashier, kind = "sale", showQrCode = false, footerText } = params;
  const isPurchase = kind === "purchase";

  const when = new Date((isPurchase ? sale.purchaseDate : sale.saleDate) || sale.createdAt || Date.now());
  const dateLabel = when.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "2-digit" });
  const timeLabel = new Date(sale.createdAt || when).toLocaleTimeString("ar-EG-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const items: SaleInvoiceLineItem[] = (sale.items || []).map((item: any, i: number) => {
    const quantity = num(item.quantity);
    const unitPrice = num(item.unitPrice ?? item.price ?? item.unitCost);
    return {
      index: i + 1,
      productName: item.product?.name || item.productName || "منتج",
      sku: item.product?.sku || item.sku || undefined,
      categoryName: item.product?.category?.name || undefined,
      quantity,
      unitPrice,
      total: num(item.totalPrice ?? item.total, quantity * unitPrice),
    };
  });

  const totalAmount = num(sale.totalAmount ?? sale.total);
  const paidAmount = num(sale.paidAmount ?? sale.paid, isPurchase ? 0 : totalAmount);
  const taxAmount = num(sale.taxAmount ?? sale.tax);
  const discountAmount = num(sale.discountAmount ?? sale.discount);
  const additionalFee = num(isPurchase ? sale.shippingCost : sale.additionalFee);
  const itemsTotal = items.reduce((s, it) => s + it.total, 0);
  const subtotal = num(sale.subtotal, itemsTotal);
  // The API's remaining amount already counts returns; otherwise total - paid
  const remainingAmount = Math.max(
    0,
    Math.round(num(sale.remainingAmount, totalAmount - paidAmount) * 100) / 100
  );
  const paymentStatus: InvoiceStatus =
    (sale.paymentStatus as InvoiceStatus) ||
    (remainingAmount <= 0.009 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID");

  const party = isPurchase ? sale.supplier : sale.client;
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

  const method = String(sale.paymentMethod || (isPurchase && paidAmount <= 0 ? "CREDIT" : "CASH")).toUpperCase();

  return {
    kind,
    title: isPurchase ? "فاتورة شراء" : "فاتورة بيع",
    receiptNumber: (isPurchase ? sale.invoiceNumber : sale.receiptNumber) || `${isPurchase ? "PUR" : "SALE"}-${sale.id ?? ""}`,
    dateLabel,
    timeLabel,

    companyName,
    companyAddress: company?.address || company?.company?.address,
    companyPhone: company?.phone || company?.company?.phone,
    companyEmail: company?.email || company?.company?.email,
    companyTaxNumber,
    companyLogoUrl: company?.logoUrl || company?.company?.logoUrl,

    partyLabel: isPurchase ? "المورد" : "العميل",
    clientName: party?.name || sale.clientName || sale.supplierName || (isPurchase ? "—" : "عميل نقدي"),
    clientPhone: party?.phone || undefined,
    clientEmail: party?.email || undefined,

    cashierName: sale.user?.fullname || cashier?.fullname || cashier?.name || cashier?.username,
    notes: sale.notes || undefined,

    items,

    subtotal,
    discountAmount,
    taxAmount,
    taxRate: sale.taxRate != null && num(sale.taxRate) > 0 ? num(sale.taxRate) : undefined,
    additionalFee,
    additionalFeeLabel: isPurchase ? "شحن وتحميل" : sale.additionalFeeLabel || undefined,
    totalAmount,
    totalInWords: amountInWords(totalAmount),

    paymentMethodLabel: PAYMENT_METHOD_LABELS[method] || "نقدًا",
    paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[paymentStatus] || PAYMENT_STATUS_LABELS.PAID,
    paidAmount,
    remainingAmount,

    footerText: footerText?.trim() || undefined,
    qrValue,
    qrImageDataUrl,
  };
}
