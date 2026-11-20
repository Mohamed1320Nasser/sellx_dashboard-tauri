/**
 * Unified Print Service - Migrated from Sultana
 * Supports all Sellx receipt types: Sales, Purchases, Quotes, Payments, Barcodes
 *
 * Architecture: React Component → HTML → ESC/POS → Thermal Printer
 * Platform: Tauri (macOS/Windows/Linux)
 *
 * UPDATED: Now uses React components like Sultana (not template strings)
 * UPDATED: Now uses printer assignments by type (like Sultana's printer roles)
 */

// Import Arabic font for proper rendering on receipts
import '@fontsource/ibm-plex-sans-arabic';

import { createElement } from 'react';
import ReactDOMServer from 'react-dom/server';
import { invoke } from '@tauri-apps/api/core';
import { usePrinterConfigStore } from '../stores/printerConfigStore';
import { SellxReceipt } from '../components/receipts/SellxReceipt';
import { BarcodeLabel as BarcodeLabelComponent } from '../components/receipts/BarcodeLabel';
import { getPrinterForType, getMissingPrinterError, type PrinterType } from './printerAssignmentService';
import JsBarcode from 'jsbarcode';
import { ensurePrinterMode } from './printerModeService';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface SellxReceiptData {
  // Receipt identification
  receiptNumber: string;
  date: string;
  time: string;
  cashier: string;

  // Company information
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxId?: string;
  companyLogo?: string; // Base64 or URL

  // Items
  items: ReceiptItem[];

  // Financial totals
  subtotal: number;
  discount?: number;
  discountPercentage?: number;
  tax?: number;
  taxRate?: number;
  total: number;

  // Payment details
  paid?: number;
  change?: number;
  received?: number; // cash handed over by the customer (sale receipts)
  paymentMethod?: string;

  // ── SELLX-SPECIFIC FIELDS ──
  isPurchase?: boolean; // true = purchase receipt, false/undefined = sale receipt
  isQuote?: boolean; // price quote: "عرض سعر", no payment block, printed on the quote printer
  validUntil?: string; // quotes: last day the prices hold
  terms?: { label: string; value: string }[]; // quotes: delivery, warranty, payment...
  /** Narrow paper (58mm): items as name line + "qty × price = total" line, set by printReceipt */
  compact?: boolean;
  supplierName?: string; // Purchase receipts: who the goods came from
  clientName?: string; // Sale receipts: the customer whose account carries the invoice
  clientPhone?: string;
  remaining?: number; // Purchase receipts: amount still owed on the invoice
  additionalFee?: number; // Delivery fees, service charges, etc.
  additionalFeeLabel?: string; // Custom label (e.g., "رسوم التوصيل")

  // Display options
  showOrderId?: boolean;
  showTaxBreakdown?: boolean;
  showQrCode?: boolean;
  qrCodeData?: string;

  // Custom text
  headerText?: string;
  footerText?: string;
}

export interface ReceiptItem {
  productName: string;
  quantity: number;
  /** Unit label for weighed / measured goods ("كجم"); empty = piece */
  unit?: string | null;
  unitPrice: number;
  total?: number;
  variantName?: string;
  sku?: string;
}

export interface BarcodeLabel {
  productName: string;
  barcode: string;
  price?: number;
  format?: 'CODE128' | 'EAN13' | 'EAN8' | 'CODE39' | 'UPCA';
}

// ═══════════════════════════════════════════════════════════════════════
// CSS & FONT EMBEDDING
// ═══════════════════════════════════════════════════════════════════════

function getReceiptCss(): string {
  const rules: string[] = [];

  function collectFrom(ruleList: CSSRuleList) {
    for (const rule of ruleList) {
      const text = rule.cssText;
      if (text.startsWith('@font-face') || text.includes('.receipt')) {
        rules.push(text);
      } else if ('cssRules' in rule) {
        // Recurse into @layer, @media, @supports, etc.
        collectFrom((rule as CSSGroupingRule).cssRules);
      }
    }
  }

  try {
    for (const sheet of document.styleSheets) {
      try {
        collectFrom(sheet.cssRules);
      } catch {
        // Cross-origin sheet — skip
      }
    }
  } catch {
    // No stylesheets
  }

  return rules.join('\n');
}

/** Convert font url() refs in CSS to inline base64 data URIs (cached) */
let _fontCssCache: string | null = null;

async function getPageCssWithFonts(): Promise<string> {
  if (_fontCssCache) return _fontCssCache;

  const css = getReceiptCss();

  // Find all font url() references
  const urlPattern = /url\(["']?([^"')]+\.(?:ttf|woff2?|otf|eot))["']?\)/g;
  const fontUrls = new Set<string>();
  let m;
  while ((m = urlPattern.exec(css)) !== null) {
    fontUrls.add(m[1]);
  }

  if (fontUrls.size === 0) {
    _fontCssCache = css;
    return css;
  }

  // Fetch each font and convert to data URI
  const uriMap = new Map<string, string>();
  for (const url of fontUrls) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      uriMap.set(url, dataUri);
    } catch (e) {
      console.warn(`[Print] Failed to embed font: ${url}`, e);
    }
  }

  let result = css;
  for (const [url, dataUri] of uriMap) {
    result = result.replaceAll(url, dataUri);
  }

  _fontCssCache = result;
  return result;
}

async function wrapHtml(body: string, paperWidth: '58mm' | '80mm'): Promise<string> {
  const css = await getPageCssWithFonts();
  // Match the renderer viewport width (272px for 80mm, 203px for 58mm)
  const widthPx = paperWidth === '58mm' ? '203px' : '272px';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="sellx-paper" content="${paperWidth}">
<style>
@page {
  size: ${paperWidth} auto;
  margin: 0;
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
html, body {
  font-family: 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif;
  direction: rtl;
  background: #fff;
  width: ${widthPx};
  max-width: ${widthPx};
  color: #000;
  overflow-x: hidden;
  margin: 0;
  padding: 0;
}
${css}
</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Wrap barcode label HTML with proper structure and CSS
 * Similar to wrapHtml but for custom label sizes
 */
async function wrapHtmlForBarcode(body: string, widthMm: number, heightMm: number): Promise<string> {
  const css = await getPageCssWithFonts();

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
@page {
  size: ${widthMm}mm ${heightMm}mm;
  margin: 0;
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
html, body {
  font-family: 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif;
  direction: rtl;
  background: #fff;
  color: #000;
  margin: 0;
  padding: 0;
}
${css}
</style>
</head>
<body>${body}</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// RECEIPT HTML GENERATOR (React Component Approach - Like Sultana)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate receipt HTML using React components (Sultana's approach)
 * This is cleaner and more maintainable than template strings
 */
function generateReceiptHtml(data: SellxReceiptData): string {
  // Merge config settings into data
  const config = usePrinterConfigStore.getState();
  const enrichedData: SellxReceiptData = {
    ...data,
    showQrCode: config.showQrCode && data.showQrCode,
    showOrderId: config.showOrderId,
    compact: config.paperWidth === '58mm',
  };

  // ── DEBUG: Verify items count before rendering ──
  console.log('📄 GENERATING HTML:', {
    itemsCount: enrichedData.items?.length,
    items: enrichedData.items,
  });

  // Render React component to static HTML (exactly like Sultana)
  const markup = ReactDOMServer.renderToStaticMarkup(
    createElement(SellxReceipt, { data: enrichedData })
  );

  // ── DEBUG: Check generated HTML length ──
  console.log('✅ HTML GENERATED:', {
    htmlLength: markup.length,
    itemsInHtml: (markup.match(/<tr/g) || []).length - 1, // -1 for header row
  });

  return markup;
}

// ═══════════════════════════════════════════════════════════════════════
// PRINTER QUEUE & DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════

const printerLocks = new Map<string, Promise<void>>();

async function sendToPrinter(printerName: string, html: string): Promise<void> {
  if (!printerName) {
    throw new Error('لم يتم تحديد طابعة. الرجاء تكوين الطابعة في الإعدادات');
  }

  console.log('📤 SEND TO PRINTER:', {
    printer: printerName,
    htmlLength: html.length,
    htmlPreview: html.substring(0, 200) + '...'
  });

  // Queue prints per printer — wait for any in-flight job to finish first
  const prev = printerLocks.get(printerName) ?? Promise.resolve();
  const job = prev
    .then(() => {
      console.log('🔧 INVOKING Tauri print_receipt command...');
      return invoke<string>('print_receipt', { printerName, html });
    })
    .then((result) => {
      console.log('✅ TAURI RESPONSE:', result);
    })
    .catch((error) => {
      console.error('❌ TAURI ERROR:', error);
      throw error;
    });

  printerLocks.set(printerName, job.catch(() => {}));
  await job;
  console.log('✅ SEND TO PRINTER COMPLETE');
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API - PRINTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Print a receipt (sales, purchase, quote, or payment)
 * Uses printer assignment based on receipt type (like Sultana's printer roles)
 *
 * @param data Receipt data with items, totals, and payment info
 * @throws Error if printer not configured or print fails
 */
export async function printReceipt(data: SellxReceiptData): Promise<void> {
  // ── DEBUG: Log receipt data ──
  console.log('🖨️ PRINT RECEIPT DATA:', {
    receiptNumber: data.receiptNumber,
    date: data.date,
    time: data.time,
    cashier: data.cashier,
    companyName: data.companyName,
    itemsCount: data.items?.length,
    allItems: data.items?.map((item, i) => ({
      index: i + 1,
      name: item.productName,
      qty: item.quantity,
      price: item.unitPrice,
    })),
    subtotal: data.subtotal,
    total: data.total,
  });

  // ── VALIDATE DATA ──
  if (!data) {
    throw new Error('بيانات الفاتورة مفقودة');
  }

  if (!data.items || !Array.isArray(data.items)) {
    throw new Error('قائمة الأصناف مفقودة أو غير صحيحة');
  }

  if (data.items.length === 0) {
    throw new Error('لا يمكن طباعة فاتورة بدون أصناف');
  }

  const config = usePrinterConfigStore.getState();

  // ── DETERMINE PRINTER TYPE (like Sultana's role detection) ──
  let printerType: PrinterType = 'receipt'; // Default: sales receipt

  if (data.isPurchase) {
    printerType = 'purchase';
  } else if (data.isQuote) {
    printerType = 'quote';
  }
  // Future: Add more detection logic
  // else if (data.isQuote) printerType = 'quote';
  // else if (data.isPayment) printerType = 'payment';

  // ── GET ASSIGNED PRINTER FOR THIS TYPE (like Sultana's getPrinterAssignment) ──
  const printer = getPrinterForType(printerType);

  if (!printer) {
    throw new Error(getMissingPrinterError(printerType));
  }

  // A printer shared with barcode labels may need switching back to receipt mode
  await ensurePrinterMode('receipt', printer);

  // Generate HTML
  const body = generateReceiptHtml(data);
  const html = await wrapHtml(body, config.paperWidth || '80mm');

  // Print copies (SELLX-SPECIFIC FEATURE)
  const copies = config.printCopies || 1;
  for (let i = 0; i < copies; i++) {
    await sendToPrinter(printer, html);
  }
}

/**
 * Print barcode labels
 * Uses dedicated barcode printer assignment (like Sultana's printer roles)
 *
 * @param label Barcode label data
 * @param quantity Number of labels to print (default: 1)
 * @throws Error if printer not configured or print fails
 */
export async function printBarcode(label: BarcodeLabel, quantity: number = 1): Promise<void> {
  // ── DEBUG: Log barcode data ──
  console.log('🏷️ PRINT BARCODE:', {
    barcode: label.barcode,
    productName: label.productName,
    price: label.price,
    quantity: quantity,
  });

  const config = usePrinterConfigStore.getState();

  // ── GET BARCODE PRINTER (dedicated barcode printer) ──
  const printer = getPrinterForType('barcode');

  console.log('🖨️ BARCODE PRINTER:', printer);

  if (!printer) {
    throw new Error(getMissingPrinterError('barcode'));
  }

  // Generate barcode SVG server-side (not using client-side JavaScript)
  const widthMm = config.labelWidth || 50;
  const heightMm = config.labelHeight || 30;
  const fontSize = config.labelFontSize || 12;
  const barcodeFormat = label.format || config.barcodeFormat || 'CODE128';
  const barcodeHeight = config.barcodeHeight || 50;
  const barcodeWidth = config.barcodeWidth || 2;
  const showText = config.showBarcodeText !== false;

  // Create a fake SVG element to generate barcode
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  try {
    JsBarcode(svgElement, label.barcode, {
      format: barcodeFormat,
      width: barcodeWidth,
      height: barcodeHeight,
      displayValue: showText,
      margin: 0,
      fontSize: fontSize - 2,
    });
  } catch (error) {
    console.error('❌ Barcode generation failed:', error);
    throw new Error('فشل إنشاء الباركود - تحقق من رمز SKU');
  }

  // Get the generated SVG as string
  const barcodeSvg = svgElement.outerHTML;

  // Build barcode label body using receipt.css classes
  let body = `<div class="barcode-label" style="width: ${widthMm}mm; height: ${heightMm}mm;">`;
  body += `<div class="barcode-label__name">${label.productName}</div>`;
  body += `<div class="barcode-label__barcode-container">${barcodeSvg}</div>`;

  if (showText) {
    body += `<div class="barcode-label__code">${label.barcode}</div>`;
  }

  if (label.price !== undefined) {
    body += `<div class="barcode-label__price">${label.price.toFixed(2)} ج.م</div>`;
  }

  body += `</div>`;

  // Wrap with proper HTML structure (same as receipts)
  // Use a custom paper size for labels
  const html = await wrapHtmlForBarcode(body, widthMm, heightMm);

  // ── DEBUG: Log HTML generation ──
  console.log('📄 BARCODE HTML GENERATED:', {
    htmlLength: html.length,
    svgLength: barcodeSvg.length,
    widthMm: widthMm,
    heightMm: heightMm,
    barcodeFormat: barcodeFormat,
    svgPreview: barcodeSvg.substring(0, 150) + '...',
  });

  await ensurePrinterMode('label');

  // Print quantity copies (using barcode printer)
  console.log(`🖨️ SENDING ${quantity} BARCODE LABEL(S) TO PRINTER:`, printer);
  for (let i = 0; i < quantity; i++) {
    console.log(`   Printing label ${i + 1}/${quantity}...`);
    await sendToPrinter(printer, html);
  }
  console.log('✅ BARCODE PRINTING COMPLETE');
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API - PRINTER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * List all available system printers
 * @returns Array of printer names
 */
export async function listSystemPrinters(): Promise<string[]> {
  try {
    return await invoke<string[]>('list_printers');
  } catch (error) {
    console.error('Failed to list printers:', error);
    return [];
  }
}

/**
 * Get the default/recommended printer
 * Tries to find a thermal printer, otherwise returns first available
 * @returns Printer name or null if none found
 */
export async function getDefaultPrinter(): Promise<string | null> {
  const printers = await listSystemPrinters();

  if (printers.length === 0) {
    return null;
  }

  // Try to find thermal printer by common keywords
  const thermalKeywords = [
    'xprinter',
    'xp-',
    'pos-58',
    'pos-80',
    'thermal',
    'receipt',
    'tm-t',
    'tm-m',
    'q361',
    'rp-',
    'zj-',
  ];

  const thermalPrinter = printers.find((p) =>
    thermalKeywords.some((kw) => p.toLowerCase().includes(kw))
  );

  return thermalPrinter || printers[0];
}

/**
 * Guess the paper width from the printer's name ("POS-58", "XP-80C"...). null when the name doesn't say.
 */
export function guessPaperWidth(printerName?: string): '58mm' | '80mm' | null {
  const name = (printerName || '').toLowerCase();
  if (/(^|[^0-9])58([^0-9]|$)/.test(name)) return '58mm';
  if (/(^|[^0-9])80([^0-9]|$)/.test(name)) return '80mm';
  return null;
}

/** A frame with both edges marked and a 1-10 scale: if a side is missing on paper, the width is wrong */
function paperWidthTestBody(width: string): string {
  const cells = Array.from({ length: 10 }, (_, i) => `<span>${i + 1}</span>`).join('');
  return `<div class="receipt">
  <div class="receipt__type-header">اختبار عرض الورق: ${width}</div>
  <div class="receipt__width-test"><span>◀ الحافة اليمنى</span><span>اليسرى ▶</span></div>
  <div class="receipt__width-scale">${cells}</div>
  <div class="receipt__subheader">يجب أن يظهر الإطار كاملًا والأرقام من 1 إلى 10.</div>
  <div class="receipt__subheader">إذا انقطع أي جانب فاختر عرض الورق الآخر من الإعدادات.</div>
</div>`;
}

/**
 * Test print: the paper-width check followed by a sample receipt, on the receipt printer
 */
export async function testPrint(): Promise<void> {
  const config = usePrinterConfigStore.getState();
  const printer = getPrinterForType('receipt');
  if (!printer) {
    throw new Error(getMissingPrinterError('receipt'));
  }
  await ensurePrinterMode('receipt', printer);

  const now = new Date();
  const sample = generateReceiptHtml({
    receiptNumber: 'TEST-001',
    date: now.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true }),
    cashier: 'اختبار الطابعة',
    companyName: 'اختبار الطابعة',
    items: [
      { productName: 'منتج تجريبي باسم طويل للتأكد من التفاف السطر', quantity: 2, unitPrice: 50, total: 100 },
      { productName: 'منتج تجريبي 2', quantity: 1, unitPrice: 75, total: 75 },
    ],
    subtotal: 175,
    total: 175,
    paid: 200,
    received: 200,
    change: 25,
    paymentMethod: 'نقداً',
    footerText: 'إيصال تجريبي - اختبار الطابعة',
  });
  const width = config.paperWidth || '80mm';
  const html = await wrapHtml(paperWidthTestBody(width) + sample, width);
  await sendToPrinter(printer, html);
}

// ═══════════════════════════════════════════════════════════════════════
// END-OF-SHIFT REPORT (Z-report)
// ═══════════════════════════════════════════════════════════════════════

export interface ShiftReportData {
  companyName: string;
  registerName: string;
  cashier: string;
  openedAt: string;
  closedAt: string;
  openingBalance: number;
  salesByMethod: { label: string; count: number; total: number }[];
  totalSales: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  notes?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

function shiftReportBody(d: ShiftReportData): string {
  const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  const row = (label: string, value: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;${bold ? 'font-weight:700;' : ''}"><span>${escapeHtml(label)}</span><span dir="ltr">${value}</span></div>`;
  const hr = '<hr style="border:none;border-top:1px dashed #000;margin:6px 0">';
  return `
<div style="font-family:inherit;font-size:12px;padding:8px">
  <div style="text-align:center;font-weight:700;font-size:15px">${escapeHtml(d.companyName)}</div>
  <div style="text-align:center;font-weight:700;margin:4px 0">تقرير إغلاق الوردية</div>
  ${hr}
  ${row('الصندوق', escapeHtml(d.registerName))}
  ${row('الكاشير', escapeHtml(d.cashier))}
  ${row('الفتح', escapeHtml(d.openedAt))}
  ${row('الإغلاق', escapeHtml(d.closedAt))}
  ${hr}
  <div style="font-weight:700;margin-bottom:2px">المبيعات حسب طريقة الدفع</div>
  ${d.salesByMethod.map(m => row(`${m.label} (${m.count})`, money(m.total))).join('')}
  ${row('إجمالي المبيعات', money(d.totalSales), true)}
  ${hr}
  ${row('الرصيد الافتتاحي', money(d.openingBalance))}
  ${row('نقدية المبيعات', '+' + money(d.cashSales))}
  ${row('إيداعات', '+' + money(d.cashIn))}
  ${row('مصروفات / سحب', '-' + money(d.cashOut))}
  ${row('النقد المتوقع', money(d.expectedCash), true)}
  ${d.actualCash !== undefined ? row('النقد الفعلي', money(d.actualCash), true) : ''}
  ${d.variance !== undefined ? row('الفرق', (d.variance > 0 ? '+' : '') + money(d.variance), true) : ''}
  ${d.notes ? `${hr}<div>${escapeHtml(d.notes)}</div>` : ''}
  ${hr}
  <div style="text-align:center;margin-top:8px">توقيع الكاشير: ____________</div>
</div>`;
}

/** Print the end-of-shift report on the receipt printer, or with the browser dialog when none is set up. */
export async function printShiftReport(data: ShiftReportData): Promise<void> {
  const config = usePrinterConfigStore.getState();
  const html = await wrapHtml(shiftReportBody(data), config.paperWidth || '80mm');
  let printer = '';
  try {
    printer = getPrinterForType('receipt');
  } catch {
    printer = '';
  }
  if (printer) {
    await ensurePrinterMode('receipt', printer);
    await sendToPrinter(printer, html);
    return;
  }
  // No receipt printer configured (e.g. the web version): print through a hidden frame
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise(resolve => setTimeout(resolve, 300));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}

/**
 * Print a full page (the A4 invoice) with the system print dialog, through a hidden frame.
 * The page gets the app's fonts embedded so Arabic prints the same as on screen.
 */
export async function printA4Document(buildHtml: (fontCss: string) => string): Promise<void> {
  const fontCss = await getPageCssWithFonts();
  const html = buildHtml(fontCss);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  // wait for fonts and the logo before printing
  try {
    await (doc as any).fonts?.ready;
  } catch {
    /* older engines: fall through */
  }
  await new Promise(resolve => setTimeout(resolve, 400));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 2000);
}
