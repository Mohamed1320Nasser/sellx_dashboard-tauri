import React from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { StatementPdf } from "./StatementPdf";
import { statementA4Html } from "./statementA4Html";
import { buildStatementData, type StatementKind } from "./statementData";
import { saveFile } from "../invoice/generateSaleInvoicePdf";
import { printA4Document } from "../../services/printService";
import { loadCompanyProfile } from "../../services/companyProfile";
import { usePrinterConfigStore } from "../../stores/printerConfigStore";

interface StatementInput {
  kind: StatementKind;
  statement: any;
  startDate?: string;
  endDate?: string;
}

async function dataFor(input: StatementInput) {
  const config = usePrinterConfigStore.getState();
  return buildStatementData({
    ...input,
    company: await loadCompanyProfile(),
    footerText: config.footerText,
    commercialRegister: config.commercialRegister,
  });
}

/** The statement PDF (same template as invoices and quotes) as a file */
export async function buildStatementPdf(input: StatementInput): Promise<File> {
  const data = await dataFor(input);
  const blob = await pdf(
    React.createElement(StatementPdf, { data }) as unknown as React.ReactElement<DocumentProps>
  ).toBlob();
  return new File([blob], `${data.fileName}.pdf`, { type: "application/pdf" });
}

export async function downloadStatementPdf(input: StatementInput): Promise<void> {
  saveFile(await buildStatementPdf(input));
}

export async function printStatementA4(input: StatementInput): Promise<void> {
  const data = await dataFor(input);
  await printA4Document(fontCss => statementA4Html(data, fontCss));
}
