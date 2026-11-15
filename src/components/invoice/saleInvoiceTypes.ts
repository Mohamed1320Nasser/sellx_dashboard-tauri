export interface SaleInvoiceLineItem {
  index: number;
  productName: string;
  sku?: string;
  categoryName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type InvoiceKind = "sale" | "purchase" | "quote";
export type PillTone = "green" | "amber" | "red";
export type InvoiceStatus = "PAID" | "PARTIAL" | "UNPAID";

/** Everything the A4 invoice shows, already formatted for display (PDF and print use the same data) */
export interface SaleInvoiceData {
  kind: InvoiceKind;
  /** "فاتورة بيع" / "فاتورة شراء" */
  title: string;
  receiptNumber: string;
  dateLabel: string;
  timeLabel: string;

  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyTaxNumber?: string;
  companyLogoUrl?: string;

  /** "العميل" for a sale, "المورد" for a purchase */
  partyLabel: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;

  cashierName?: string;
  /** "الكاشير" / "المستخدم" / "أعدّه" */
  staffLabel: string;
  notes?: string;

  /** Middle info cell: payment method for sales/purchases, validity for quotes */
  middleLabel: string;
  middleValue: string;
  pillLabel: string;
  pillTone: PillTone;
  /** Left signature line: "توقيع المستلم" / "توقيع المورد" / "توقيع العميل بالموافقة" */
  signatureLabel: string;

  items: SaleInvoiceLineItem[];

  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate?: number;
  additionalFee: number;
  additionalFeeLabel?: string;
  totalAmount: number;
  /** "فقط ... لا غير" */
  totalInWords: string;

  paymentMethodLabel: string;
  paymentStatus: InvoiceStatus;
  paymentStatusLabel: string;
  paidAmount: number;
  remainingAmount: number;

  footerText?: string;
  /** Empty when the QR code is turned off in the print settings */
  qrValue: string;
  qrImageDataUrl: string;
}
