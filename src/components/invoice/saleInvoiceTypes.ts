export interface SaleInvoiceLineItem {
  index: number;
  productName: string;
  sku?: string;
  categoryName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SaleInvoiceData {
  receiptNumber: string;
  dateLabel: string;
  timeLabel: string;

  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyTaxNumber?: string;
  companyLogoUrl?: string;

  clientName: string;
  clientPhone?: string;
  clientEmail?: string;

  cashierName?: string;

  items: SaleInvoiceLineItem[];

  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate?: number;
  additionalFee: number;
  additionalFeeLabel?: string;
  totalAmount: number;

  paymentMethodLabel: string;
  paymentStatusLabel: string;
  paidAmount: number;
  remainingAmount: number;

  qrValue: string;
  qrImageDataUrl: string;
}
