import React from "react";
import { pdf } from "@react-pdf/renderer";
import { SaleInvoicePdf } from "./SaleInvoicePdf";
import { buildSaleInvoiceData } from "./buildSaleInvoiceData";

// Builds the unified sale invoice PDF and triggers a browser download.
// Used by both the Sales list "تحميل PDF" action and the Sale Details page.
export async function generateSaleInvoicePdf(params: {
  sale: any;
  company: any;
  cashier?: any;
}): Promise<void> {
  const data = await buildSaleInvoiceData(params);
  const blob = await pdf(
    React.createElement(SaleInvoicePdf, { data })
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `فاتورة-${data.receiptNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
