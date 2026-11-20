import { packView } from '../utils/quantity';
import { salePaymentLabel } from '../utils/paymentMethods';
/**
 * Maps a sale, a purchase or a price quote into the data the thermal receipt (SellxReceipt) shows.
 * The A4 invoice uses components/invoice/buildSaleInvoiceData instead.
 */
const SALE_PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقداً',
  CARD: 'بطاقة',
  MOBILE_WALLET: 'محفظة إلكترونية',
  BANK_TRANSFER: 'تحويل بنكي',
  CREDIT: 'آجل',
  SPLIT: 'مقسّم',
};

export function saleToReceiptData(params: {
  sale: any;
  company: any;
  cashier: any;
  paperWidth?: '58mm' | '80mm';
  showLogo?: boolean;
  showOrderId?: boolean;
  showTaxBreakdown?: boolean;
  showQRCode?: boolean;
  headerText?: string;
  footerText?: string;
}): any {
  const { sale, company, cashier, ...settings } = params;

  // NEW: Return SellxReceiptData format (for React component)
  return {
    // Receipt identification
    receiptNumber: sale.receiptNumber || `SALE-${sale.id}`,
    date: new Date(sale.saleDate || sale.createdAt).toLocaleDateString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }),
    time: new Date(sale.saleDate || sale.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }),
    cashier: sale.user?.fullname || cashier?.fullname || cashier?.name || cashier?.username || 'الكاشير',

    // Company information
    companyName: company?.name || company?.company?.name || 'نظام نقاط البيع',
    companyAddress: company?.address || company?.company?.address,
    companyPhone: company?.phone || company?.company?.phone,
    companyTaxId: company?.taxNumber || company?.taxId || company?.company?.taxNumber,
    companyLogo: company?.logoUrl || company?.company?.logoUrl,

    // Items (properly map from API structure)
    items: (sale.items || []).map((item: any) => {
      // a pack line prints as packs ("juice - كرتونة 12", 2 x 100)
      const pack = item.packName ? packView(item) : null;
      return {
        productName: pack ? pack.name : item.product?.name || item.productName || 'منتج',
        variantName: item.variantName,
        sku: item.product?.sku || item.sku,
        quantity: pack ? pack.quantity : Number(item.quantity) || 1,
        unit: pack ? pack.unit : item.product?.unit || item.unit || null,
        unitPrice: pack ? pack.unitPrice : parseFloat(item.unitPrice || item.price || 0),
        total: parseFloat(item.totalPrice || item.total || (item.quantity * (item.unitPrice || item.price)) || 0),
      };
    }),

    // Financial totals (API structure: subtotal, discountAmount, taxAmount, totalAmount)
    subtotal: parseFloat(sale.subtotal || 0),
    discount: parseFloat(sale.discountAmount || sale.discount || 0),
    discountPercentage: parseFloat(sale.discountPercent || sale.discountPercentage || 0),
    tax: parseFloat(sale.taxAmount || sale.tax || 0),
    taxRate: parseFloat(sale.taxRate || 0),
    total: parseFloat(sale.totalAmount || sale.total || 0),

    // Payment details. paidAmount can be 0 (unpaid credit sale), so don't fall back on "falsy".
    ...(() => {
      const total = parseFloat(sale.totalAmount || sale.total || 0);
      const rawPaid = sale.paidAmount ?? sale.paid;
      const paid = rawPaid !== undefined && rawPaid !== null && rawPaid !== '' ? parseFloat(rawPaid) : total;
      return {
        paid,
        // what the customer still owes on this invoice (credit sales)
        // (the saved sale's remainingAmount already accounts for returns)
        remaining: Math.max(0, Math.round((sale.remainingAmount !== undefined && sale.remainingAmount !== null
          ? parseFloat(sale.remainingAmount)
          : total - paid) * 100) / 100),
        // change handed back at the till (only the POS knows the cash received)
        change: Math.max(0, parseFloat(sale.change || 0)),
        received: sale.received !== undefined && sale.received !== null ? parseFloat(sale.received) : undefined,
      };
    })(),
    // split payment: "نقداً 200 + بطاقة 300"
    paymentMethod: salePaymentLabel(sale, SALE_PAYMENT_LABELS, 'نقداً'),
    clientName: sale.client?.name || sale.clientName,
    clientPhone: sale.client?.phone || undefined,

    // SELLX-SPECIFIC
    isPurchase: false,
    additionalFee: parseFloat(sale.additionalFee || 0),
    additionalFeeLabel: sale.additionalFee && sale.additionalFee > 0 ? 'رسوم إضافية' : undefined,

    // Display options
    showOrderId: settings.showOrderId !== undefined ? settings.showOrderId : true,
    showTaxBreakdown: settings.showTaxBreakdown !== undefined ? settings.showTaxBreakdown : true,
    showQrCode: settings.showQRCode !== undefined ? settings.showQRCode : false,
    qrCodeData: undefined, // TODO: Generate QR code

    // Custom text
    headerText: settings.headerText,
    footerText: settings.footerText || 'شكراً لزيارتكم',
  };
}

const PURCHASE_PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقداً',
  CARD: 'بطاقة',
  MOBILE_WALLET: 'محفظة إلكترونية',
  BANK_TRANSFER: 'تحويل بنكي',
};

/**
 * Same receipt layout as sales, filled from a purchase: supplier's invoice number,
 * purchase date, the supplier, and what is still owed. Accepts the purchase from
 * the API (totalAmount/paidAmount/taxAmount) or the object built after saving (total/paid/tax).
 */
export function purchaseToReceiptData(params: Parameters<typeof saleToReceiptData>[0]): any {
  const { sale: purchase } = params;
  const base = saleToReceiptData(params);
  const when = new Date(purchase.purchaseDate || purchase.createdAt || Date.now());
  const total = parseFloat(purchase.totalAmount ?? purchase.total ?? 0);
  const paid = parseFloat(purchase.paidAmount ?? purchase.paid ?? 0);
  const remaining = purchase.remainingAmount !== undefined ? parseFloat(purchase.remainingAmount) : total - paid;
  return {
    ...base,
    receiptNumber: purchase.invoiceNumber || `PURCHASE-${purchase.id}`,
    date: when.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    // The purchase date is a calendar day only; the time comes from when it was entered
    time: new Date(purchase.createdAt || Date.now()).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true }),
    subtotal: parseFloat(
      purchase.subtotal ??
        total -
          parseFloat(purchase.taxAmount ?? purchase.tax ?? 0) -
          parseFloat(purchase.shippingCost ?? 0) +
          parseFloat(purchase.discountAmount ?? 0)
    ),
    discount: parseFloat(purchase.discountAmount ?? 0),
    tax: parseFloat(purchase.taxAmount ?? purchase.tax ?? 0),
    taxRate: parseFloat(purchase.taxRate ?? 0),
    total,
    paid,
    change: 0,
    remaining: Math.max(0, Math.round(remaining * 100) / 100),
    paymentMethod: paid > 0 ? PURCHASE_PAYMENT_LABELS[purchase.paymentMethod] || 'نقداً' : 'آجل',
    supplierName: purchase.supplier?.name,
    isPurchase: true,
    additionalFee: parseFloat(purchase.shippingCost ?? 0),
    additionalFeeLabel: parseFloat(purchase.shippingCost ?? 0) > 0 ? 'شحن وتحميل' : undefined,
    footerText: params.footerText || ' ',
  };
}

/**
 * A price quote on the thermal printer: "عرض سعر", the customer, items, totals and how long it is valid.
 * No payment block, since nothing has been paid.
 */
export function quoteToReceiptData(params: Parameters<typeof saleToReceiptData>[0]): any {
  const { sale: quote } = params;
  const base = saleToReceiptData({
    ...params,
    sale: {
      ...quote,
      receiptNumber: quote.quoteNumber,
      saleDate: quote.quoteDate || quote.createdAt,
      totalAmount: quote.total ?? quote.totalAmount,
      discountAmount: quote.totalDiscount ?? quote.discountAmount,
      taxRate: quote.taxPercent ?? quote.taxRate,
      items: (quote.items || []).map((it: any) => ({ ...it, totalPrice: it.lineTotal ?? it.totalPrice })),
    },
  });
  const { paid: _p, remaining: _r, change: _c, received: _rc, paymentMethod: _pm, ...rest } = base;
  return {
    ...rest,
    isQuote: true,
    clientName: quote.customerName || quote.client?.name || undefined,
    clientPhone: quote.customerContact || quote.client?.phone || undefined,
    validUntil: quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : undefined,
    additionalFeeLabel: quote.additionalFeeLabel || base.additionalFeeLabel,
    terms: Array.isArray(quote.terms) ? quote.terms.filter((t: any) => t?.label && t?.value) : undefined,
  };
}
