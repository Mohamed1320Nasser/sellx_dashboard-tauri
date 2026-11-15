export interface SaleInvoiceLineItem {
  index: number;
  productName: string;
  sku?: string;
  categoryName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type InvoiceKind = "sale" | "purchase";
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
  notes?: string;

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
