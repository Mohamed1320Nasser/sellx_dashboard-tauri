import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { registerSaleInvoiceFonts } from "../invoice/saleInvoiceFonts";
import { bidiParts, type StatementDocData } from "./statementData";

registerSaleInvoiceFonts();

/** Same palette and header as the sale invoice PDF */
const COLOR = {
  ink: "#0f172a",
  inkSoft: "#475569",
  inkFaint: "#94a3b8",
  line: "#e2e8f0",
  lineSoft: "#edf1f5",
  emerald: "#059669",
  rowAlt: "#f8fafc",
  header: "#1e293b",
  red: "#dc2626",
  green: "#15803d",
};

const PAGE_TOP = 56;

const styles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Sans Arabic",
    fontSize: 9,
    color: COLOR.ink,
    direction: "rtl",
    paddingTop: PAGE_TOP,
    paddingBottom: 58,
    paddingHorizontal: 32,
  },
  head: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    borderBottomWidth: 2.5,
    borderBottomColor: COLOR.emerald,
  },
  brand: { flexDirection: "row-reverse", alignItems: "flex-start" },
  logo: { width: 46, height: 46, borderRadius: 8, marginLeft: 12 },
  logoFallback: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: COLOR.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  logoFallbackText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  company: { fontSize: 17, fontWeight: "bold", marginBottom: 6, textAlign: "right" },
  brandLine: { fontSize: 8.5, color: COLOR.inkSoft, marginBottom: 3, textAlign: "right" },
  brandRow: { flexDirection: "row-reverse", alignSelf: "flex-end", gap: 3, marginBottom: 3 },
  brandRowText: { fontSize: 8.5, color: COLOR.inkSoft },
  docMeta: { alignItems: "flex-start" },
  docTitle: {
    backgroundColor: COLOR.ink,
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 5,
    marginBottom: 6,
  },
  docLine: { fontSize: 8.5, color: COLOR.inkSoft, marginBottom: 2 },

  strip: {
    flexDirection: "row-reverse",
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: 6,
    backgroundColor: COLOR.rowAlt,
  },
  cell: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderLeftWidth: 1, borderLeftColor: COLOR.line },
  cellLast: { borderLeftWidth: 0 },
  label: { fontSize: 7.5, color: COLOR.inkFaint, fontWeight: "bold", marginBottom: 3, textAlign: "right" },
  value: { fontSize: 10.5, fontWeight: "bold", textAlign: "right" },
  sub: { fontSize: 8.5, color: COLOR.inkSoft, marginTop: 2, textAlign: "right" },

  boxes: { flexDirection: "row-reverse", gap: 6, marginTop: 10 },
  box: { flex: 1, borderWidth: 1, borderColor: COLOR.line, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 7 },
  boxLabel: { fontSize: 7.5, color: COLOR.inkFaint, fontWeight: "bold", textAlign: "right", marginBottom: 3 },
  boxValue: { fontSize: 10, fontWeight: "bold", textAlign: "right" },
  dueBox: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  dueValue: { color: "#9a3412", fontSize: 11 },
  creditBox: { backgroundColor: "#dcfce7", borderColor: "#bbf7d0" },
  creditValue: { color: COLOR.green, fontSize: 11 },

  table: { marginTop: 14 },
  thRow: { flexDirection: "row-reverse", backgroundColor: COLOR.header, borderRadius: 4 },
  th: { color: "#fff", fontSize: 8, fontWeight: "bold", paddingVertical: 7, paddingHorizontal: 6, textAlign: "right" },
  tr: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: COLOR.lineSoft },
  trAlt: { backgroundColor: COLOR.rowAlt },
  trOpening: { backgroundColor: "#f1f5f9" },
  td: { paddingVertical: 6, paddingHorizontal: 6, justifyContent: "center" },
  cDate: { width: 62 },
  cType: { width: 74 },
  cRef: { flex: 1 },
  cNum: { width: 72, textAlign: "center" },
  cBal: { width: 80, textAlign: "center" },
  text: { fontSize: 8.5, textAlign: "right" },
  textSoft: { fontSize: 7.5, color: COLOR.inkSoft, textAlign: "right" },
  dateRow: { flexDirection: "row", alignSelf: "flex-end" },
  num: { fontSize: 8.5, fontWeight: "bold", textAlign: "center" },
  mixed: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 3 },
  tfoot: { flexDirection: "row-reverse", borderTopWidth: 1.5, borderTopColor: COLOR.header, backgroundColor: COLOR.rowAlt },

  closing: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    alignSelf: "flex-start",
    width: 250,
    backgroundColor: COLOR.ink,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  closingText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  closingValue: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  closingNote: { color: "#cbd5e1", fontSize: 7.5, marginTop: 2, textAlign: "right" },

  signatures: { flexDirection: "row-reverse", gap: 32, paddingTop: 30 },
  sigLine: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: COLOR.inkFaint,
    paddingTop: 5,
    fontSize: 8,
    color: COLOR.inkFaint,
    textAlign: "center",
  },

  /* table header again at the top of every page after the first */
  repeatHead: { position: "absolute", top: 14, left: 32, right: 32 },
  repeatTitle: { fontSize: 7.5, color: COLOR.inkFaint, textAlign: "right" },

  foot: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
  },
  footNote: { fontSize: 8, color: COLOR.inkSoft, maxWidth: 300, textAlign: "right" },
  footRight: { alignItems: "flex-start" },
  footPage: { fontSize: 7.5, color: COLOR.inkFaint, marginBottom: 2 },
  footBrand: { fontSize: 7, color: COLOR.inkFaint, opacity: 0.75 },
});

const amount = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const money = (n: number) => `${n < 0 ? "-" : ""}${amount(Math.abs(n))} ج.م`;

/** Arabic words and Latin codes side by side (react-pdf has no bidi for mixed lines) */
const Mixed: React.FC<{ text: string; style: any; sep?: string }> = ({ text, style }) => {
  const parts = bidiParts(text);
  if (parts.length <= 1) return <Text style={style}>{parts[0] || text}</Text>;
  return (
    <View style={styles.mixed}>
      {parts.map((p, i) => (
        <Text key={i} style={style}>
          {p}
        </Text>
      ))}
    </View>
  );
};

/** "2026/11/19" laid out left to right piece by piece: the PDF engine flips slashes between numbers in RTL */
const DateText: React.FC<{ label: string }> = ({ label }) => {
  const parts = label.split(/(\/)/).filter(Boolean);
  return (
    <View style={styles.dateRow}>
      {parts.map((p, i) => (
        <Text key={i} style={styles.text}>
          {p}
        </Text>
      ))}
    </View>
  );
};

/**
 * Arabic words with dates and Latin names inside ("من 2026/11/01 إلى 2026/11/20", "Mohamed Nasser"):
 * consecutive words of the same script stay one piece, dates are laid out left to right
 */
const WordsText: React.FC<{ text: string; style: any; align?: "flex-start" | "flex-end" }> = ({ text, style, align = "flex-end" }) => {
  const groups: { kind: "date" | "latin" | "ar"; text: string }[] = [];
  for (const w of text.split(" ").filter(Boolean)) {
    const kind = /^\d+\/\d+\/\d+$/.test(w) ? "date" : /^[A-Za-z0-9]/.test(w) ? "latin" : "ar";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && kind !== "date") last.text += ` ${w}`;
    else groups.push({ kind, text: w });
  }
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 3, alignSelf: align }}>
      {groups.map((g, i) =>
        g.kind === "date" ? (
          <View key={i} style={styles.dateRow}>
            {g.text.split(/(\/)/).filter(Boolean).map((p, j) => (
              <Text key={j} style={style}>
                {p}
              </Text>
            ))}
          </View>
        ) : (
          <Text key={i} style={style}>
            {g.text}
          </Text>
        )
      )}
    </View>
  );
};

const TableHead: React.FC<{ d: StatementDocData }> = ({ d }) => (
  <View style={styles.thRow}>
    <Text style={[styles.th, styles.cDate]}>التاريخ</Text>
    <Text style={[styles.th, styles.cType]}>النوع</Text>
    <Text style={[styles.th, styles.cRef]}>المرجع</Text>
    <Text style={[styles.th, styles.cNum, { textAlign: "center" }]}>{d.debitLabel}</Text>
    <Text style={[styles.th, styles.cNum, { textAlign: "center" }]}>{d.creditLabel}</Text>
    <Text style={[styles.th, styles.cBal, { textAlign: "center" }]}>الرصيد</Text>
  </View>
);

export const StatementPdf: React.FC<{ data: StatementDocData }> = ({ data: d }) => {
  const initial = d.companyName?.trim()?.[0] || "؟";
  const creditBalance = d.closing < 0;
  return (
    <Document title={`${d.title} - ${d.party.name}`}>
      <Page size="A4" style={styles.page}>
        {/* column titles again on every following page */}
        <View
          style={styles.repeatHead}
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View>
                <View style={{ flexDirection: "row-reverse", gap: 6, marginBottom: 3 }}>
                  <Text style={styles.repeatTitle}>{d.title}</Text>
                  <Text style={styles.repeatTitle}>·</Text>
                  <WordsText text={d.party.name} style={styles.repeatTitle} />
                  <Text style={styles.repeatTitle}>·</Text>
                  <WordsText text={d.periodLabel} style={styles.repeatTitle} />
                </View>
                <TableHead d={d} />
              </View>
            ) : null
          }
        />

        {/* Header: the same as the invoice */}
        <View style={styles.head}>
          <View style={styles.brand}>
            {d.companyLogoUrl ? (
              <Image src={d.companyLogoUrl} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoFallbackText}>{initial}</Text>
              </View>
            )}
            <View>
              <Text style={styles.company}>{d.companyName}</Text>
              {d.companyAddress ? <Text style={styles.brandLine}>{d.companyAddress}</Text> : null}
              {d.companyPhone ? (
                <View style={styles.brandRow}>
                  <Text style={styles.brandRowText}>هاتف:</Text>
                  <Text style={styles.brandRowText}>{d.companyPhone}</Text>
                </View>
              ) : null}
              {d.companyEmail ? <Text style={styles.brandLine}>{d.companyEmail}</Text> : null}
              {d.companyTaxNumber ? (
                <View style={[styles.brandRow, { marginTop: 3 }]}>
                  <Text style={[styles.brandRowText, { color: COLOR.inkFaint }]}>الرقم الضريبي:</Text>
                  <Text style={[styles.brandRowText, { color: COLOR.inkFaint }]}>{d.companyTaxNumber}</Text>
                </View>
              ) : null}
              {d.commercialRegister ? (
                <View style={styles.brandRow}>
                  <Text style={[styles.brandRowText, { color: COLOR.inkFaint }]}>السجل التجاري:</Text>
                  <Text style={[styles.brandRowText, { color: COLOR.inkFaint }]}>{d.commercialRegister}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>{d.title}</Text>
            <WordsText text={d.periodLabel} style={styles.docLine} align="flex-start" />
            <Text style={styles.docLine}>عدد الحركات: {d.rows.filter(r => r.type !== "OPENING").length}</Text>
          </View>
        </View>

        {/* Party */}
        <View style={styles.strip}>
          <View style={styles.cell}>
            <Text style={styles.label}>{d.partyLabel}</Text>
            <Text style={styles.value}>{d.party.name}</Text>
            {d.party.phone || d.party.email ? (
              <Text style={styles.sub}>{[d.party.phone, d.party.email].filter(Boolean).join(" · ")}</Text>
            ) : null}
            {d.party.address ? <Text style={styles.sub}>{d.party.address}</Text> : null}
          </View>
          <View style={[styles.cell, styles.cellLast]}>
            <Text style={styles.label}>الفترة</Text>
            <WordsText text={d.periodLabel} style={styles.value} />
            <View style={{ flexDirection: "row-reverse", gap: 3, alignSelf: "flex-end", marginTop: 2 }}>
              <Text style={[styles.sub, { marginTop: 0 }]}>طُبع في</Text>
              <WordsText text={d.printedAtLabel} style={[styles.sub, { marginTop: 0 }]} />
            </View>
          </View>
        </View>

        {/* Totals of the period */}
        <View style={styles.boxes} wrap={false}>
          {d.summary.map(item => (
            <View key={item.label} style={styles.box}>
              <Text style={styles.boxLabel}>{item.label}</Text>
              <Text style={styles.boxValue}>{money(item.value)}</Text>
            </View>
          ))}
          <View style={[styles.box, creditBalance ? styles.creditBox : styles.dueBox]}>
            <Text style={styles.boxLabel}>{d.closingLabel}</Text>
            <Text style={[styles.boxValue, creditBalance ? styles.creditValue : styles.dueValue]}>
              {money(Math.abs(d.closing))}
            </Text>
          </View>
        </View>

        {/* Ledger */}
        <View style={styles.table}>
          <TableHead d={d} />
          {d.rows.map((r, i) => (
            <View
              key={i}
              wrap={false}
              style={[styles.tr, r.type === "OPENING" ? styles.trOpening : i % 2 === 0 ? styles.trAlt : {}]}
            >
              <View style={[styles.td, styles.cDate]}>
                <DateText label={r.dateLabel} />
              </View>
              <View style={[styles.td, styles.cType]}>
                <Text style={[styles.text, { fontWeight: "bold" }]}>{r.typeLabel}</Text>
              </View>
              <View style={[styles.td, styles.cRef]}>
                <Mixed text={r.reference} style={styles.text} />
                {r.note ? <Mixed text={r.note} style={styles.textSoft} /> : null}
              </View>
              <View style={[styles.td, styles.cNum]}>
                <Text style={[styles.num, r.debit > 0 ? { color: d.kind === "client" ? COLOR.red : COLOR.green } : { color: COLOR.inkFaint }]}>
                  {r.debit > 0 ? amount(r.debit) : "—"}
                </Text>
              </View>
              <View style={[styles.td, styles.cNum]}>
                <Text style={[styles.num, r.credit > 0 ? { color: d.kind === "client" ? COLOR.green : COLOR.red } : { color: COLOR.inkFaint }]}>
                  {r.credit > 0 ? amount(r.credit) : "—"}
                </Text>
              </View>
              <View style={[styles.td, styles.cBal]}>
                <Text style={styles.num}>{money(r.balance)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.tfoot} wrap={false}>
            <View style={[styles.td, { flex: 1 }]}>
              <Text style={[styles.text, { fontWeight: "bold" }]}>إجمالي حركات الفترة</Text>
            </View>
            <View style={[styles.td, styles.cNum]}>
              <Text style={styles.num}>{amount(d.totalDebit)}</Text>
            </View>
            <View style={[styles.td, styles.cNum]}>
              <Text style={styles.num}>{amount(d.totalCredit)}</Text>
            </View>
            <View style={[styles.td, styles.cBal]}>
              <Text style={styles.num}>{money(d.closing)}</Text>
            </View>
          </View>
        </View>

        <View wrap={false}>
          <View style={styles.closing}>
            <View>
              <Text style={styles.closingText}>{d.closingLabel}</Text>
              {d.closingNote ? <WordsText text={d.closingNote} style={styles.closingNote} /> : null}
            </View>
            <Text style={styles.closingValue}>{money(Math.abs(d.closing))}</Text>
          </View>
          <View style={styles.signatures}>
            <Text style={styles.sigLine}>{d.kind === "client" ? "توقيع العميل" : "توقيع المورد"}</Text>
            <Text style={styles.sigLine}>ختم الشركة / التوقيع</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.foot} fixed>
          <Text style={styles.footNote}>{d.footerText || `شكرًا لتعاملكم مع ${d.companyName}.`}</Text>
          <View style={styles.footRight}>
            <Text style={styles.footPage} render={({ pageNumber, totalPages }) => `صفحة ${pageNumber} من ${totalPages}`} />
            <View style={{ flexDirection: "row-reverse", gap: 3 }}>
              <Text style={styles.footBrand}>طُبعت في</Text>
              <WordsText text={d.printedAtLabel} style={styles.footBrand} />
              <Text style={styles.footBrand}>·</Text>
              <Text style={styles.footBrand}>Powered by SellX</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
