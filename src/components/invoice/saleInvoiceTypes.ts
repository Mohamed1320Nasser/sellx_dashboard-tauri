export interface SaleInvoiceLineItem {
  index: number;
  productName: string;
  sku?: string;
  categoryName?: string;
  quantity: number;
  /** Unit label for weighed / measured goods; empty = piece */
  unit?: string;
  unitPrice: number;
  /** line discount (quotes) */
  discount: number;
  /** quote line description (specs, size, colour...) */
  description?: string;
  total: number;
}

export interface InvoicePaymentLine {
  dateLabel: string;
  methodLabel: string;
  amount: number;
}

export type InvoiceKind = "sale" | "purchase" | "quote" | "return";
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
  /** السجل التجاري, from the print settings */
  commercialRegister?: string;

  /** "العميل" for a sale, "المورد" for a purchase */
  partyLabel: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  /** What the customer owes across all invoices today; null when unknown or no named customer */
  clientBalance: number | null;

  cashierName?: string;
  /** phone of the staff member who made it, so the customer knows whom to call */
  staffPhone?: string;
  /** "الكاشير" / "المستخدم" / "أعدّه" */
  staffLabel: string;
  notes?: string;
  /** quotes: what the quote is for, shown above the items */
  subject?: string;

  /** Middle info cell: payment method for sales/purchases, validity for quotes */
  middleLabel: string;
  middleValue: string;
  pillLabel: string;
  pillTone: PillTone;
  /** Left signature line: "توقيع المستلم" / "توقيع المورد" / "توقيع العميل بالموافقة" */
  signatureLabel: string;
  /** name under the customer / supplier signature; none for a walk-in customer */
  signName?: string;

  items: SaleInvoiceLineItem[];
  itemsCount: number;
  /** Sum of quantities; null when the lines use different units (kg + pieces can't be added) */
  totalQuantity: number | null;
  /** a discount column only when some line has one */
  showLineDiscount: boolean;

  subtotal: number;
  discountAmount: number;
  /** "الخصم (10%)" when the invoice discount was a percent */
  discountLabel?: string;
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
  /** credit from completed returns against this invoice */
  returnsAmount: number;
  remainingAmount: number;
  /** payments made after the invoice (the money at the till is part of paidAmount) */
  payments: InvoicePaymentLine[];
  /** return documents: what the return did instead of paid / remaining ("خُصم من المديونية", "المردود") */
  returnRows?: { label: string; value: number; tone?: "plain" | "clear" }[];

  footerText?: string;
  /** Terms and conditions, from the print settings */
  terms?: string;
  printedAtLabel: string;
  /** Empty when the QR code is turned off in the print settings */
  qrValue: string;
  qrImageDataUrl: string;
}
