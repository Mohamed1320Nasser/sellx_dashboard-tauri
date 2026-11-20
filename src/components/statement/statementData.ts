/**
 * Customer and supplier statements, shaped once for the page, the PDF and the A4 print.
 * Customer: debit (مدين) raises what the customer owes, credit (دائن) lowers it.
 * Supplier: credit (له) raises what the shop owes the supplier, debit (عليه) lowers it.
 */
import { formatTableDate } from "../../utils/dateUtils";

export type StatementKind = "client" | "supplier";

export interface StatementLink {
  kind: "sale" | "payment" | "return" | "purchase";
  id: number | string;
}

export interface StatementRow {
  date: string;
  type: string;
  reference: string;
  note?: string;
  debit: number;
  credit: number;
  balance: number;
  link?: StatementLink;
}

export interface StatementParty {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface StatementSummaryItem {
  label: string;
  value: number;
  tone?: "plain" | "in" | "out" | "due";
}

export interface StatementDocData {
  kind: StatementKind;
  title: string;
  fileName: string;

  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyTaxNumber?: string;
  companyLogoUrl?: string;
  commercialRegister?: string;

  partyLabel: string;
  party: StatementParty;
  /** who printed it */
  staffName?: string;
  staffPhone?: string;
  periodLabel: string;

  debitLabel: string;
  creditLabel: string;
  rows: (StatementRow & { dateLabel: string; typeLabel: string })[];
  totalDebit: number;
  totalCredit: number;

  summary: StatementSummaryItem[];
  /** the balance at the end of the period */
  closingLabel: string;
  closing: number;
  /** explains a negative closing balance (we owe the customer / the supplier owes us) */
  closingNote?: string;

  footerText?: string;
  printedAtLabel: string;
}

export const TYPE_LABEL: Record<StatementKind, Record<string, string>> = {
  client: {
    OPENING: "رصيد افتتاحي",
    SALE: "فاتورة بيع",
    PAYMENT: "دفعة",
    RETURN: "مرتجع",
    REFUND: "استرداد نقدي",
  },
  supplier: {
    OPENING: "رصيد افتتاحي",
    PURCHASE: "فاتورة شراء",
    PAYMENT: "دفعة للمورد",
    RETURN: "مرتجع للمورد",
    REFUND: "استرداد من المورد",
  },
};

/** Where a row opens in the app */
export function statementLinkPath(link?: StatementLink): string | null {
  if (!link) return null;
  switch (link.kind) {
    case "sale":
      return `/sales/${link.id}`;
    case "payment":
      return `/payments/${link.id}`;
    case "return":
      return `/returns/${link.id}`;
    case "purchase":
      return `/purchases/${link.id}`;
    default:
      return null;
  }
}

const dayLabel = (d: string) => {
  const [y, m, day] = d.split("-");
  // the same order as the ledger dates (day/month/year)
  return y && m && day ? `${day}/${m}/${y}` : d;
};

export function periodLabelOf(startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `من ${dayLabel(startDate)} حتى ${dayLabel(endDate)}`;
  if (startDate) return `من ${dayLabel(startDate)} حتى اليوم`;
  if (endDate) return `حتى ${dayLabel(endDate)}`;
  return "كل الفترات";
}

const round = (n: number) => Math.round(n * 100) / 100;
/** the locale formatter adds invisible direction marks that scramble dates in print */
const clean = (s: string) => s.replace(/[\u200e\u200f\u061c]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
/** "20/11/2026 02:40 م" */
function printedAt(now = new Date()): string {
  const h = now.getHours();
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(h % 12 || 12)}:${pad(now.getMinutes())} ${h < 12 ? "ص" : "م"}`;
}

export function buildStatementData(params: {
  kind: StatementKind;
  statement: any;
  company: any;
  startDate?: string;
  endDate?: string;
  footerText?: string;
  commercialRegister?: string;
  staff?: { fullname?: string; name?: string; username?: string; phone?: string | null } | null;
}): StatementDocData {
  const { kind, statement, company, startDate, endDate } = params;
  const isClient = kind === "client";
  const partyRaw = (isClient ? statement?.client : statement?.supplier) || {};
  const s = statement?.summary || {};
  const labels = TYPE_LABEL[kind];
  const rows = ((statement?.transactions || []) as StatementRow[]).map(t => ({
    ...t,
    dateLabel: clean(formatTableDate(t.date)),
    typeLabel: t.type === "OPENING" && startDate ? "رصيد سابق" : labels[t.type] || t.type,
  }));
  // totals of the period, without the carried opening balance
  const inPeriod = rows.filter(r => r.type !== "OPENING");
  const totalDebit = round(inPeriod.reduce((sum, r) => sum + r.debit, 0));
  const totalCredit = round(inPeriod.reduce((sum, r) => sum + r.credit, 0));

  const closing = isClient ? Number(s.outstandingBalance || 0) : Number(s.closingBalance || 0);
  const summary: StatementSummaryItem[] = isClient
    ? [
        { label: startDate ? "رصيد سابق" : "رصيد افتتاحي", value: Number(s.openingBalance || 0) },
        { label: "المبيعات", value: Number(s.totalSales || 0), tone: "out" },
        { label: "المدفوعات", value: Number(s.totalPayments || 0), tone: "in" },
        { label: "المرتجعات", value: Number(s.totalReturns || 0), tone: "in" },
        ...(s.totalRefunds ? [{ label: "مبالغ رُدّت نقداً", value: Number(s.totalRefunds), tone: "out" as const }] : []),
      ]
    : [
        { label: startDate ? "رصيد سابق" : "رصيد افتتاحي", value: Number(s.openingBalance || 0) },
        { label: "المشتريات", value: Number(s.totalPurchases || 0), tone: "out" },
        { label: "المدفوع للمورد", value: Number(s.totalPayments || 0), tone: "in" },
        { label: "المرتجعات", value: Number(s.totalReturns || 0), tone: "in" },
        ...(s.totalRefunds ? [{ label: "ردّه المورد نقداً", value: Number(s.totalRefunds), tone: "out" as const }] : []),
      ];

  const companyName = company?.name || company?.company?.name || "";
  const party: StatementParty = {
    name: partyRaw.name || "—",
    phone: partyRaw.phone || null,
    email: partyRaw.email || null,
    address: partyRaw.address || null,
  };

  return {
    kind,
    title: isClient ? "كشف حساب عميل" : "كشف حساب مورد",
    fileName: `كشف-حساب-${party.name}`.replace(/[\\/:*?"<>|]+/g, "-"),

    companyName,
    companyAddress: company?.address || company?.company?.address,
    companyPhone: company?.phone || company?.company?.phone,
    companyEmail: company?.email || company?.company?.email,
    companyTaxNumber: company?.taxNumber || company?.taxId || company?.company?.taxNumber,
    companyLogoUrl: company?.logoUrl || company?.company?.logoUrl,
    commercialRegister: params.commercialRegister?.trim() || undefined,

    partyLabel: isClient ? "العميل" : "المورد",
    party,
    staffName: params.staff?.fullname || params.staff?.name || params.staff?.username || undefined,
    staffPhone: params.staff?.phone || undefined,
    periodLabel: periodLabelOf(startDate, endDate),

    debitLabel: isClient ? "مدين" : "مدين (عليه)",
    creditLabel: isClient ? "دائن" : "دائن (له)",
    rows,
    totalDebit,
    totalCredit,

    summary,
    closingLabel: isClient
      ? closing < 0
        ? "رصيد دائن للعميل"
        : "المستحق على العميل"
      : closing < 0
        ? "رصيد لنا عند المورد"
        : "المستحق للمورد",
    closing,
    closingNote: endDate ? `حتى ${dayLabel(endDate)}` : undefined,

    footerText: params.footerText?.trim() || undefined,
    printedAtLabel: printedAt(),
  };
}

/** Split a mixed reference ("دفعة - INV-2026-0012") into Arabic words and Latin codes, for layouts that can't run bidi */
export function bidiParts(text: string): string[] {
  return String(text || "")
    .split(/([A-Za-z0-9][A-Za-z0-9\-/.,:_#]*)/)
    .map(p => p.replace(/^[\s\-–·]+|[\s\-–·]+$/g, ""))
    .filter(Boolean);
}
