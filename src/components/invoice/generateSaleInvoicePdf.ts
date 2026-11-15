import React from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { SaleInvoicePdf } from "./SaleInvoicePdf";
import { buildSaleInvoiceData } from "./buildSaleInvoiceData";
import { invoiceA4Html } from "./invoiceA4Html";
import { printA4Document } from "../../services/printService";
import { usePrinterConfigStore } from "../../stores/printerConfigStore";
import type { InvoiceKind } from "./saleInvoiceTypes";

// Builds the unified sale invoice PDF and triggers a browser download.
// Used by both the Sales list "تحميل PDF" action and the Sale Details page.
export async function generateSaleInvoicePdf(params: {
  sale: any;
  company: any;
  cashier?: any;
  kind?: InvoiceKind;
}): Promise<void> {
  const config = usePrinterConfigStore.getState();
  const data = await buildSaleInvoiceData({ ...params, showQrCode: config.showQrCode, footerText: config.footerText });
  // SaleInvoicePdf renders a <Document>; pdf() only accepts that element type
  const blob = await pdf(
    React.createElement(SaleInvoicePdf, { data }) as unknown as React.ReactElement<DocumentProps>
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.kind === "quote" ? "عرض-سعر" : "فاتورة"}-${data.receiptNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Print the same A4 invoice as the PDF, with the system print dialog (A4 / office printers) */
export async function printSaleInvoiceA4(params: {
  sale: any;
  company: any;
  cashier?: any;
  kind?: InvoiceKind;
}): Promise<void> {
  const config = usePrinterConfigStore.getState();
  const data = await buildSaleInvoiceData({ ...params, showQrCode: config.showQrCode, footerText: config.footerText });
  await printA4Document((fontCss) => invoiceA4Html(data, fontCss));
}
