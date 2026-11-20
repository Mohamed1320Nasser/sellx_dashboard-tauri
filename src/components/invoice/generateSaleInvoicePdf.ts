import React from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { SaleInvoicePdf } from "./SaleInvoicePdf";
import { buildSaleInvoiceData } from "./buildSaleInvoiceData";
import { invoiceA4Html } from "./invoiceA4Html";
import { printA4Document } from "../../services/printService";
import { usePrinterConfigStore } from "../../stores/printerConfigStore";
import type { InvoiceKind } from "./saleInvoiceTypes";

/** The unified sale invoice / quote PDF as a file (to download, upload or share) */
export async function buildSaleInvoicePdf(params: {
  sale: any;
  company: any;
  cashier?: any;
  kind?: InvoiceKind;
}): Promise<File> {
  const config = usePrinterConfigStore.getState();
  const data = await buildSaleInvoiceData({
    ...params,
    showQrCode: config.showQrCode,
    footerText: config.footerText,
    terms: config.invoiceTerms,
    commercialRegister: config.commercialRegister,
  });
  // SaleInvoicePdf renders a <Document>; pdf() only accepts that element type
  const blob = await pdf(
    React.createElement(SaleInvoicePdf, { data }) as unknown as React.ReactElement<DocumentProps>
  ).toBlob();
  return new File([blob], `${data.kind === "quote" ? "عرض-سعر" : "فاتورة"}-${data.receiptNumber}.pdf`, { type: "application/pdf" });
}

/** Save a file with the browser's download */
export function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Builds the unified sale invoice PDF and triggers a browser download.
// Used by both the Sales list "تحميل PDF" action and the Sale Details page.
export async function generateSaleInvoicePdf(params: {
  sale: any;
  company: any;
  cashier?: any;
  kind?: InvoiceKind;
}): Promise<void> {
  saveFile(await buildSaleInvoicePdf(params));
}

/** Print the same A4 invoice as the PDF, with the system print dialog (A4 / office printers) */
export async function printSaleInvoiceA4(params: {
  sale: any;
  company: any;
  cashier?: any;
  kind?: InvoiceKind;
}): Promise<void> {
  const config = usePrinterConfigStore.getState();
  const data = await buildSaleInvoiceData({
    ...params,
    showQrCode: config.showQrCode,
    footerText: config.footerText,
    terms: config.invoiceTerms,
    commercialRegister: config.commercialRegister,
  });
  await printA4Document((fontCss) => invoiceA4Html(data, fontCss));
}
