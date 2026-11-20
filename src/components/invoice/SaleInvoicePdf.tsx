import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { registerSaleInvoiceFonts } from "./saleInvoiceFonts";
import type { SaleInvoiceData } from "./saleInvoiceTypes";
import { formatQty } from '../../utils/quantity';
import { LabelValue, WordsText } from "../pdf/PdfText";
import { PdfSignatures } from "../pdf/PdfSignatures";

registerSaleInvoiceFonts();

const COLOR = {
  ink: "#0f172a",
  inkSoft: "#475569",
  inkFaint: "#94a3b8",
  line: "#e2e8f0",
  lineSoft: "#edf1f5",
  emerald: "#059669",
  emeraldDark: "#047857",
  emeraldTint: "#ecfdf5",
  amber: "#d97706",
  red: "#dc2626",
  rowAlt: "#f8fafc",
  header: "#1e293b",
  badgePaidBg: "#dcfce7",
  badgePaidInk: "#15803d",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Sans Arabic",
    fontSize: 9.5,
    color: COLOR.ink,
    direction: "rtl",
    paddingBottom: 36,
  },

  head: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 32,
    paddingTop: 30,
    paddingBottom: 20,
    borderBottomWidth: 2.5,
    borderBottomColor: COLOR.emerald,
  },
  brand: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 8,
    marginLeft: 12,
  },
  logoFallback: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: COLOR.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  logoFallbackText: {
    color: "#ffffff",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: "bold",
    fontSize: 14,
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 7,
    textAlign: "right",
  },
  brandLine: {
    fontSize: 9,
    color: COLOR.inkSoft,
    marginBottom: 3.5,
    textAlign: "right",
  },
  brandLineRow: {
    flexDirection: "row-reverse",
    alignSelf: "flex-end",
    gap: 3,
    marginBottom: 3.5,
  },
  brandLineRowText: {
    fontSize: 9,
    color: COLOR.inkSoft,
  },
  taxLineRowText: {
    fontSize: 8.5,
    color: COLOR.inkFaint,
  },
  taxLine: {
    fontSize: 8.5,
    color: COLOR.inkFaint,
    marginTop: 5,
    textAlign: "right",
  },
  docMeta: {
    alignItems: "flex-start",
  },
  docTitle: {
    backgroundColor: COLOR.ink,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 5,
    marginBottom: 6,
  },
  docNum: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 3,
  },
  docDate: {
    fontSize: 9,
    color: COLOR.inkSoft,
    marginBottom: 2,
  },

  infoStrip: {
    flexDirection: "row-reverse",
    backgroundColor: COLOR.rowAlt,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.line,
  },
  infoCell: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 13,
    borderLeftWidth: 1,
    borderLeftColor: COLOR.line,
  },
  infoCellLast: {
    borderLeftWidth: 0,
  },
  infoLabel: {
    fontSize: 7.5,
    color: COLOR.inkFaint,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "right",
  },
  infoValue: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "right",
  },
  infoSub: {
    fontSize: 8.5,
    color: COLOR.inkSoft,
    marginTop: 2,
    textAlign: "right",
  },
  payPill: {
    alignSelf: "flex-end",
    fontSize: 8,
    fontWeight: "bold",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 5,
  },

  items: {
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  tableHeadRow: {
    flexDirection: "row-reverse",
    backgroundColor: COLOR.header,
    borderRadius: 4,
  },
  th: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    paddingVertical: 7,
    paddingHorizontal: 8,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: COLOR.lineSoft,
  },
  tableRowAlt: {
    backgroundColor: COLOR.rowAlt,
  },
  td: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  colIdx: { width: 26, textAlign: "center" },
  colName: { flex: 1 },
  // Numbers and their headings are centered in the same column (they used to sit apart)
  colQty: { width: 56, textAlign: "center" },
  colPrice: { width: 76, textAlign: "center" },
  colTotal: { width: 86, textAlign: "center" },
  itemName: {
    fontWeight: "bold",
    fontSize: 9.5,
    textAlign: "right",
  },
  itemDesc: {
    fontSize: 8,
    color: COLOR.inkSoft,
    marginTop: 2,
    lineHeight: 1.5,
    textAlign: "right",
  },
  itemSku: {
    fontSize: 7.5,
    color: COLOR.inkFaint,
    marginTop: 2,
    textAlign: "right",
  },
  idxText: { fontSize: 8.5, color: COLOR.inkFaint, textAlign: "center" },
  numText: { fontSize: 9, fontWeight: "bold", textAlign: "center" },

  totalsWrap: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 32,
    paddingTop: 16,
  },
  qrSlot: {
    alignItems: "center",
    width: 90,
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  totals: {
    width: 230,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  tRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.lineSoft,
  },
  tRowLabel: { fontSize: 9 },
  tRowValue: { fontSize: 9, fontWeight: "bold" },
  discountValue: { color: COLOR.red },
  taxValue: { color: COLOR.amber },
  grandRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    backgroundColor: COLOR.ink,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  grandLabel: { color: "#ffffff", fontSize: 10.5, fontWeight: "bold" },
  grandValue: { color: "#ffffff", fontSize: 12, fontWeight: "bold" },
  dueRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dueText: { color: COLOR.red, fontSize: 9.5, fontWeight: "bold" },
  leftCol: { flex: 1, marginLeft: 16 },
  words: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLOR.inkFaint,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 9.5,
    fontWeight: "bold",
    textAlign: "right",
    backgroundColor: COLOR.rowAlt,
  },
  colDisc: { width: 60, textAlign: "center" },
  discText: { fontSize: 9, fontWeight: "bold", textAlign: "center", color: COLOR.red },
  itemsFoot: {
    flexDirection: "row-reverse",
    gap: 14,
    borderTopWidth: 1.5,
    borderTopColor: COLOR.header,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  itemsFootText: { fontSize: 8.5, color: COLOR.inkSoft },
  box: {
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  boxTitle: { fontSize: 7.5, color: COLOR.inkFaint, fontWeight: "bold", marginBottom: 3, textAlign: "right" },
  balanceBox: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  balanceLabel: { fontSize: 8.5, color: COLOR.ink },
  balanceValue: { fontSize: 10, fontWeight: "bold", color: "#9a3412" },
  payRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 1.5 },
  payText: { fontSize: 8.5, color: COLOR.inkSoft },
  clearRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    backgroundColor: COLOR.badgePaidBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearText: { color: COLOR.badgePaidInk, fontSize: 9.5, fontWeight: "bold" },
  terms: {
    marginHorizontal: 32,
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
  },
  termsTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 3, textAlign: "right" },
  termsBody: { fontSize: 8.5, color: COLOR.inkSoft, lineHeight: 1.6, textAlign: "right" },
  subject: { fontSize: 10, marginBottom: 8, textAlign: "right", fontWeight: "bold" },
  notes: { fontSize: 8.5, color: COLOR.inkSoft, marginTop: 8, textAlign: "right", lineHeight: 1.5 },


  foot: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 18,
    paddingHorizontal: 32,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
  },
  footNote: {
    fontSize: 8.5,
    color: COLOR.inkSoft,
    maxWidth: 300,
    textAlign: "right",
    lineHeight: 1.5,
  },
  footNoteBold: { fontWeight: "bold", color: COLOR.ink },
  footRight: { alignItems: "flex-start" },
  footPage: { fontSize: 7.5, color: COLOR.inkFaint, marginBottom: 3 },
  footBrand: { fontSize: 7, color: COLOR.inkFaint, opacity: 0.75 },
});

function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function money(n: number, negative = false): string {
  return `${negative ? "-" : ""}${formatAmount(n)} ج.م`;
}

export const SaleInvoicePdf: React.FC<{ data: SaleInvoiceData }> = ({ data }) => {
  const logoInitial = data.companyName?.trim()?.[0] || "؟";
  const hasDiscount = data.discountAmount > 0;
  const hasTax = data.taxAmount > 0;
  const hasFee = data.additionalFee > 0;
  const isPartial = data.remainingAmount > 0;
  const pill =
    data.pillTone === "red"
      ? { backgroundColor: "#fee2e2", color: "#b91c1c" }
      : data.pillTone === "amber"
        ? { backgroundColor: "#fef3c7", color: "#b45309" }
        : { backgroundColor: COLOR.badgePaidBg, color: COLOR.badgePaidInk };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.head}>
          <View style={styles.brand}>
            {data.companyLogoUrl ? (
              <Image src={data.companyLogoUrl} style={styles.logoImage} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoFallbackText}>{logoInitial}</Text>
              </View>
            )}
            <View>
              <Text style={styles.companyName}>{data.companyName}</Text>
              {data.companyAddress ? (
                <View style={{ marginBottom: 3.5 }}>
                  <WordsText text={data.companyAddress} style={styles.brandLineRowText} />
                </View>
              ) : null}
              {data.companyPhone ? (
                <View style={{ marginBottom: 3.5 }}>
                  <LabelValue label="هاتف" value={data.companyPhone} style={styles.brandLineRowText} />
                </View>
              ) : null}
              {data.companyTaxNumber ? (
                <View style={{ marginTop: 5 }}>
                  <LabelValue label="الرقم الضريبي" value={data.companyTaxNumber} style={styles.taxLineRowText} />
                </View>
              ) : null}
              {data.commercialRegister ? (
                <View style={{ marginTop: 3 }}>
                  <LabelValue label="السجل التجاري" value={data.commercialRegister} style={styles.taxLineRowText} />
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>{data.title}</Text>
            <Text style={styles.docNum}>{data.receiptNumber}</Text>
            <WordsText text={data.dateLabel} style={styles.docDate} align="flex-start" nowrap />
            <WordsText text={data.timeLabel} style={styles.docDate} align="flex-start" nowrap />
          </View>
        </View>

        {/* Info strip */}
        <View style={styles.infoStrip}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>{data.partyLabel}</Text>
            <WordsText text={data.clientName} style={styles.infoValue} />
            {data.clientPhone ? (
              <View style={{ marginTop: 2 }}>
                <LabelValue label="هاتف" value={data.clientPhone} style={[styles.infoSub, { marginTop: 0 }]} />
              </View>
            ) : (
              <Text style={styles.infoSub}> </Text>
            )}
            {data.clientAddress ? (
              <View style={{ marginTop: 2 }}>
                <WordsText text={data.clientAddress} style={[styles.infoSub, { marginTop: 0 }]} />
              </View>
            ) : null}
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>{data.middleLabel}</Text>
            <Text style={styles.infoValue}>{data.middleValue}</Text>
            <Text style={[styles.payPill, pill]}>{data.pillLabel}</Text>
          </View>
          <View style={[styles.infoCell, styles.infoCellLast]}>
            <Text style={styles.infoLabel}>{data.staffLabel}</Text>
            <WordsText text={data.cashierName || "—"} style={styles.infoValue} />
            {data.staffPhone ? (
              <View style={{ marginTop: 2 }}>
                <LabelValue label="هاتف" value={data.staffPhone} style={[styles.infoSub, { marginTop: 0 }]} />
              </View>
            ) : null}
          </View>
        </View>

        {data.subject ? <Text style={styles.subject}>الموضوع: {data.subject}</Text> : null}

        {/* Items table */}
        <View style={styles.items}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.th, styles.colIdx]}>#</Text>
            <Text style={[styles.th, styles.colName]}>المنتج</Text>
            <Text style={[styles.th, styles.colQty]}>الكمية</Text>
            <Text style={[styles.th, styles.colPrice]}>سعر الوحدة</Text>
            {data.showLineDiscount ? <Text style={[styles.th, styles.colDisc]}>الخصم</Text> : null}
            <Text style={[styles.th, styles.colTotal]}>الإجمالي</Text>
          </View>
          {data.items.map((item, i) => (
            <View
              key={i}
              style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]}
              wrap={false}
            >
              <View style={[styles.td, styles.colIdx]}>
                <Text style={styles.idxText}>{item.index}</Text>
              </View>
              <View style={[styles.td, styles.colName]}>
                <Text style={styles.itemName}>{item.productName}</Text>
                {item.sku ? (
                  <Text style={styles.itemSku}>
                    SKU {item.sku}
                    {item.categoryName ? ` · ${item.categoryName}` : ""}
                  </Text>
                ) : null}
                {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
              </View>
              <View style={[styles.td, styles.colQty]}>
                <Text style={styles.numText}>{formatQty(item.quantity)}</Text>
                {item.unit ? <Text style={styles.itemSku}>{item.unit}</Text> : null}
              </View>
              <View style={[styles.td, styles.colPrice]}>
                <Text style={styles.numText}>{formatAmount(item.unitPrice)}</Text>
              </View>
              {data.showLineDiscount ? (
                <View style={[styles.td, styles.colDisc]}>
                  <Text style={styles.discText}>{item.discount > 0 ? formatAmount(item.discount) : "—"}</Text>
                </View>
              ) : null}
              <View style={[styles.td, styles.colTotal]}>
                <Text style={styles.numText}>{formatAmount(item.total)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.itemsFoot} wrap={false}>
            <Text style={styles.itemsFootText}>عدد الأصناف: {data.itemsCount}</Text>
            {data.totalQuantity === null ? null : (
              <Text style={styles.itemsFootText}>إجمالي الكميات: {formatQty(data.totalQuantity)}</Text>
            )}
          </View>
        </View>

        {/* Totals + QR */}
        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.leftCol}>
            <Text style={styles.words}>{data.totalInWords}</Text>
            {data.clientBalance !== null && Math.abs(data.clientBalance) >= 0.01 ? (
              <View style={[styles.box, styles.balanceBox]}>
                <Text style={styles.balanceLabel}>
                  {data.clientBalance > 0 ? "إجمالي المستحق على العميل" : "رصيد دائن للعميل"} حتى {data.printedAtLabel}
                </Text>
                <Text style={styles.balanceValue}>{money(Math.abs(data.clientBalance))}</Text>
              </View>
            ) : null}
            {data.payments.length ? (
              <View style={styles.box}>
                <Text style={styles.boxTitle}>دفعات لاحقة على الفاتورة</Text>
                {data.payments.map((p, i) => (
                  <View key={i} style={styles.payRow}>
                    {/* date and method as separate pieces: mixed in one line the PDF breaks the date apart */}
                    <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                      <Text style={styles.payText}>{p.methodLabel}</Text>
                      <Text style={styles.payText}>{p.dateLabel}</Text>
                    </View>
                    <Text style={styles.payText}>{money(p.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {data.notes ? <Text style={styles.notes}>ملاحظات: {data.notes}</Text> : null}
            {data.qrImageDataUrl ? (
              <View style={[styles.qrSlot, { marginTop: 8 }]}>
                <Image src={data.qrImageDataUrl} style={styles.qrImage} />
              </View>
            ) : null}
          </View>
          <View style={styles.totals}>
            <View style={styles.tRow}>
              <Text style={styles.tRowLabel}>المجموع الفرعي</Text>
              <Text style={styles.tRowValue}>{money(data.subtotal)}</Text>
            </View>
            {hasDiscount ? (
              <View style={styles.tRow}>
                <Text style={[styles.tRowLabel, styles.discountValue]}>{data.discountLabel || "الخصم"}</Text>
                <Text style={[styles.tRowValue, styles.discountValue]}>
                  {money(data.discountAmount, true)}
                </Text>
              </View>
            ) : null}
            {hasTax ? (
              <View style={styles.tRow}>
                <Text style={[styles.tRowLabel, styles.taxValue]}>
                  ضريبة القيمة المضافة{data.taxRate ? ` (${data.taxRate}%)` : ""}
                </Text>
                <Text style={[styles.tRowValue, styles.taxValue]}>{money(data.taxAmount)}</Text>
              </View>
            ) : null}
            {hasFee ? (
              <View style={styles.tRow}>
                <Text style={styles.tRowLabel}>{data.additionalFeeLabel || "رسوم إضافية"}</Text>
                <Text style={styles.tRowValue}>{money(data.additionalFee)}</Text>
              </View>
            ) : null}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>{data.kind === "quote" ? "إجمالي العرض" : "الإجمالي"}</Text>
              <Text style={styles.grandValue}>{money(data.totalAmount)}</Text>
            </View>
            {data.kind !== "quote" ? (
              <>
                <View style={styles.tRow}>
                  <Text style={styles.tRowLabel}>المدفوع</Text>
                  <Text style={styles.tRowValue}>{money(data.paidAmount)}</Text>
                </View>
                {data.returnsAmount > 0 ? (
                  <View style={styles.tRow}>
                    <Text style={[styles.tRowLabel, styles.discountValue]}>مرتجعات</Text>
                    <Text style={[styles.tRowValue, styles.discountValue]}>{money(data.returnsAmount, true)}</Text>
                  </View>
                ) : null}
                {isPartial ? (
                  <View style={styles.dueRow}>
                    <Text style={styles.dueText}>المتبقي</Text>
                    <Text style={styles.dueText}>{money(data.remainingAmount)}</Text>
                  </View>
                ) : (
                  <View style={styles.clearRow}>
                    <Text style={styles.clearText}>المتبقي</Text>
                    <Text style={styles.clearText}>{money(0)}</Text>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </View>

        {data.terms ? (
          <View style={styles.terms} wrap={false}>
            <Text style={styles.termsTitle}>الشروط والأحكام</Text>
            {data.terms.split("\n").map((line, i) => {
              // a leading "-" or "•" would end up at the wrong end of the line: draw the bullet apart
              const bullet = /^\s*[-•*]\s*/.test(line);
              const text = line.replace(/^\s*[-•*]\s*/, "");
              return (
                <View key={i} style={{ flexDirection: "row-reverse", gap: 4 }}>
                  {bullet ? <Text style={styles.termsBody}>•</Text> : null}
                  <Text style={[styles.termsBody, { flex: 1 }]}>{text || " "}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Signatures */}
        <PdfSignatures
          style={{ paddingHorizontal: 32, paddingTop: 26 }}
          party={{ label: data.signatureLabel, name: data.signName, phone: data.clientPhone }}
          company={{ label: "ختم الشركة / التوقيع", name: data.companyName, address: data.companyAddress, phone: data.companyPhone }}
        />

        {/* Footer */}
        <View style={styles.foot} fixed>
          <Text style={styles.footNote}>
            <Text style={styles.footNoteBold}>{data.footerText || `شكرًا لتعاملكم مع ${data.companyName}.`}</Text>
          </Text>
          <View style={styles.footRight}>
            <Text
              style={styles.footPage}
              render={({ pageNumber, totalPages }) => `صفحة ${pageNumber} من ${totalPages}`}
            />
            <Text style={styles.footBrand}>طُبعت في {data.printedAtLabel} · Powered by SellX</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
