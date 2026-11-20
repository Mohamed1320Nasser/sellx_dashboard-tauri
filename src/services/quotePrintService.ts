/**
 * Every way to print a price quote, from the quotes list and the quote page alike:
 * - A4 print and PDF: the same invoice layout as sales ("عرض سعر")
 * - Thermal: the same receipt as sales, on the printer assigned to quotes
 */
import { companyService } from './companyService';
import { quoteService } from './quoteService';
import { printReceipt } from './printService';
import { quoteToReceiptData } from './receiptHtmlTemplate';
import { usePrinterConfigStore } from '../stores/printerConfigStore';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { buildSaleInvoicePdf, generateSaleInvoicePdf, printSaleInvoiceA4 } from '../components/invoice/generateSaleInvoicePdf';

/** Full company profile (logo, address, tax number); falls back to what the session has */
async function loadCompany(): Promise<any> {
  const session = useSessionAuthStore.getState().company as any;
  const companyId = session?.companyId || session?.company?.id;
  try {
    if (companyId) return await companyService.getProfile(companyId);
  } catch {
    /* offline or no access: use the session copy */
  }
  return session?.company || session || {};
}

/** The list may not carry the items: load the full quote when they are missing */
async function withItems(quote: any): Promise<any> {
  if (quote?.items?.length) return quote;
  const session = useSessionAuthStore.getState().company as any;
  const res: any = await quoteService.getById(quote.id, session?.companyId || session?.company?.id);
  const full = res?.data || res;
  if (!full?.items?.length) throw new Error('لا يمكن طباعة عرض سعر بدون أصناف');
  return full;
}

function currentUser(): any {
  return (useSessionAuthStore.getState() as any).user;
}

export async function printQuoteA4(quote: any): Promise<void> {
  await printSaleInvoiceA4({ sale: await withItems(quote), company: await loadCompany(), cashier: currentUser(), kind: 'quote' });
}

export async function downloadQuotePdf(quote: any): Promise<void> {
  await generateSaleInvoicePdf({ sale: await withItems(quote), company: await loadCompany(), cashier: currentUser(), kind: 'quote' });
}

/** The quote's PDF as a file (sent with the customer link, or shared) */
export async function quotePdfFile(quote: any): Promise<File> {
  return buildSaleInvoicePdf({ sale: await withItems(quote), company: await loadCompany(), cashier: currentUser(), kind: 'quote' });
}

export async function printQuoteThermal(quote: any): Promise<void> {
  const config = usePrinterConfigStore.getState();
  await printReceipt(
    quoteToReceiptData({
      sale: await withItems(quote),
      company: await loadCompany(),
      cashier: currentUser(),
      showLogo: config.showCompanyLogo,
      showOrderId: config.showOrderId,
      showTaxBreakdown: config.showTaxBreakdown,
      footerText: config.footerText,
    })
  );
}
