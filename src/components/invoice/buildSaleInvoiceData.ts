import QRCode from "qrcode";
import type { SaleInvoiceData, SaleInvoiceLineItem } from "./saleInvoiceTypes";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدًا",
  CARD: "بطاقة",
  CREDIT: "آجل",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PAID: "مدفوعة بالكامل",
  PARTIAL: "مدفوعة جزئيًا",
  UNPAID: "غير مدفوعة",
};

// Maps the API's sale/company/cashier shapes into the flat, presentation-ready
// shape the invoice PDF renders. Field fallbacks mirror saleToReceiptData()
// in receiptHtmlTemplate.ts so the PDF and the thermal receipt agree on the
// same sale when both are generated from the same record.
export async function buildSaleInvoiceData(params: {
  sale: any;
  company: any;
  cashier?: any;
}): Promise<SaleInvoiceData> {
  const { sale, company, cashier } = params;

  const saleDate = new Date(sale.saleDate || sale.createdAt);
  const dateLabel = saleDate.toLocaleDateString("ar-EG-u-nu-latn", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const timeLabel = saleDate.toLocaleTimeString("ar-EG-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const items: SaleInvoiceLineItem[] = (sale.items || []).map(
    (item: any, i: number) => ({
      index: i + 1,
      productName: item.product?.name || item.productName || "منتج",
      sku: item.product?.sku || item.sku || undefined,
      categoryName: item.product?.category?.name || undefined,
      quantity: item.quantity || 0,
      unitPrice: parseFloat(item.unitPrice || item.price || 0),
      total: parseFloat(
        item.totalPrice ||
          item.total ||
          (item.quantity || 0) * parseFloat(item.unitPrice || item.price || 0)
      ),
    })
  );

  const totalAmount = parseFloat(sale.totalAmount || sale.total || 0);
  const paidAmount = parseFloat(
    sale.paidAmount ?? sale._sum?.payments?.amount ?? totalAmount
  );
  const taxAmount = parseFloat(sale.taxAmount || 0);

  const client = sale.client;
  const clientName = client?.name || "عميل نقدي";

  const companyName = company?.name || company?.company?.name || "";
  const companyTaxNumber =
    company?.taxNumber || company?.taxId || company?.company?.taxNumber;

  // Same field order as the existing thermal-receipt QR (receiptHtmlTemplate.ts)
  // so both documents encode the sale identically.
  const qrValue = [
    companyName,
    companyTaxNumber || "",
    saleDate.toISOString(),
    totalAmount.toFixed(2),
    taxAmount.toFixed(2),
  ].join("|");

  const qrImageDataUrl = await QRCode.toDataURL(qrValue, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return {
    receiptNumber: sale.receiptNumber || `SALE-${sale.id}`,
    dateLabel,
    timeLabel,

    companyName,
    companyAddress: company?.address || company?.company?.address,
    companyPhone: company?.phone || company?.company?.phone,
    companyEmail: company?.email || company?.company?.email,
    companyTaxNumber,
    companyLogoUrl: company?.logoUrl || company?.company?.logoUrl,

    clientName,
    clientPhone: client?.phone,
    clientEmail: client?.email,

    cashierName:
      sale.user?.fullname || cashier?.fullname || cashier?.name || cashier?.username,

    items,

    subtotal: parseFloat(sale.subtotal || 0),
    discountAmount: parseFloat(sale.discountAmount || 0),
    taxAmount,
    taxRate: sale.taxRate != null ? parseFloat(sale.taxRate) : undefined,
    additionalFee: parseFloat(sale.additionalFee || 0),
    additionalFeeLabel: sale.additionalFeeLabel,
    totalAmount,

    paymentMethodLabel:
      PAYMENT_METHOD_LABELS[sale.paymentMethod as string] || "نقدًا",
    paymentStatusLabel:
      PAYMENT_STATUS_LABELS[sale.paymentStatus as string] || "مدفوعة بالكامل",
    paidAmount,
    remainingAmount: Math.max(0, totalAmount - paidAmount),

    qrValue,
    qrImageDataUrl,
  };
}
