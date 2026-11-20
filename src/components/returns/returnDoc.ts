import React from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { SaleInvoicePdf } from "../invoice/SaleInvoicePdf";
import { buildSaleInvoiceData } from "../invoice/buildSaleInvoiceData";
import { invoiceA4Html } from "../invoice/invoiceA4Html";
import { saveFile } from "../invoice/generateSaleInvoicePdf";
import type { SaleInvoiceData } from "../invoice/saleInvoiceTypes";
import { printA4Document } from "../../services/printService";
import { loadCompanyProfile } from "../../services/companyProfile";
import { usePrinterConfigStore } from "../../stores/printerConfigStore";
import { useSessionAuthStore } from "../../stores/sessionAuthStore";
import { methodOf } from "../payments/paymentLabels";
import { RETURN_STATUS, conditionLabel, isUnsellable } from "./returnLabels";

const num = (v: unknown) => Number(v) || 0;

/**
 * A customer return as an A4 document in the invoice template: the items taken back, then what
 * came off the customer's debt and what was paid back (and how)
 */
export async function buildReturnDocData(ret: any): Promise<SaleInvoiceData> {
  const config = usePrinterConfigStore.getState();
  const total = num(ret.totalAmount);
  const refund = num(ret.refundAmount);
  const lines = (ret.items || []).map((item: any) => {
    const notes = [isUnsellable(item.condition) ? `${conditionLabel(item.condition)} - لا يعود للمخزون` : "", item.reason || ""]
      .filter(Boolean)
      .join(" · ");
    return { ...item, description: notes };
  });

  const base = await buildSaleInvoiceData({
    sale: {
      id: ret.id,
      receiptNumber: ret.returnNumber,
      saleDate: ret.returnDate,
      createdAt: ret.createdAt,
      client: ret.client,
      user: ret.user,
      items: lines,
      subtotal: total,
      totalAmount: total,
      paidAmount: total,
      notes: [ret.reason ? `سبب الإرجاع: ${ret.reason}` : "", ret.notes || ""].filter(Boolean).join(" — ") || undefined,
    },
    company: await loadCompanyProfile(),
    cashier: (useSessionAuthStore.getState() as any).user,
    showQrCode: false,
    footerText: config.footerText,
    commercialRegister: config.commercialRegister,
  });
  const status = RETURN_STATUS[ret.status] || RETURN_STATUS.PENDING;
  const pending = ret.status !== "COMPLETED";

  return {
    ...base,
    kind: "return",
    title: "مرتجع مبيعات",
    staffLabel: "المستخدم",
    middleLabel: "الفاتورة الأصلية",
    middleValue: ret.originalSale?.receiptNumber || "—",
    pillLabel: status.label,
    pillTone: ret.status === "COMPLETED" ? "green" : ret.status === "REJECTED" ? "red" : "amber",
    signatureLabel: "توقيع العميل بالاستلام",
    clientBalance: null,
    payments: [],
    terms: undefined,
    returnRows: [
      { label: pending ? "يُخصم من مديونية العميل" : "خُصم من مديونية العميل", value: Math.max(0, total - refund) },
      {
        label: `${pending ? "يُرد للعميل" : "المردود للعميل"}${refund > 0 ? ` (${methodOf(ret.refundMethod || "CASH").label})` : ""}`,
        value: refund,
        tone: "clear",
      },
    ],
  };
}

export async function downloadReturnPdf(ret: any): Promise<void> {
  const data = await buildReturnDocData(ret);
  const blob = await pdf(
    React.createElement(SaleInvoicePdf, { data }) as unknown as React.ReactElement<DocumentProps>
  ).toBlob();
  saveFile(new File([blob], `مرتجع-${data.receiptNumber}.pdf`, { type: "application/pdf" }));
}

export async function printReturnA4(ret: any): Promise<void> {
  const data = await buildReturnDocData(ret);
  await printA4Document((fontCss) => invoiceA4Html(data, fontCss));
}
