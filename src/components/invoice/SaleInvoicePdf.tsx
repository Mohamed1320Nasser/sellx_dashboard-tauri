import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { registerSaleInvoiceFonts } from "./saleInvoiceFonts";
import type { SaleInvoiceData } from "./saleInvoiceTypes";

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
  notes: { fontSize: 8.5, color: COLOR.inkSoft, marginTop: 8, textAlign: "right", lineHeight: 1.5 },

  signatures: {
    flexDirection: "row-reverse",
    paddingHorizontal: 32,
    paddingTop: 26,
    gap: 32,
  },
  sigLine: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: COLOR.inkFaint,
    paddingTop: 5,
    fontSize: 8,
    color: COLOR.inkFaint,
    textAlign: "center",
  },

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
    data.paymentStatus === "UNPAID"
      ? { backgroundColor: "#fee2e2", color: "#b91c1c" }
      : data.paymentStatus === "PARTIAL"
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
                <Text style={styles.brandLine}>{data.companyAddress}</Text>
              ) : null}
              {data.companyPhone ? (
                <View style={styles.brandLineRow}>
                  <Text style={styles.brandLineRowText}>هاتف:</Text>
                  <Text style={styles.brandLineRowText}>{data.companyPhone}</Text>
                </View>
              ) : null}
              {data.companyEmail ? (
                <Text style={styles.brandLine}>{data.companyEmail}</Text>
              ) : null}
              {data.companyTaxNumber ? (
                <View style={[styles.brandLineRow, { marginBottom: 0, marginTop: 5 }]}>
                  <Text style={styles.taxLineRowText}>الرقم الضريبي:</Text>
                  <Text style={styles.taxLineRowText}>{data.companyTaxNumber}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>{data.title}</Text>
            <Text style={styles.docNum}>{data.receiptNumber}</Text>
            <Text style={styles.docDate}>{data.dateLabel}</Text>
            <Text style={styles.docDate}>{data.timeLabel}</Text>
          </View>
        </View>

        {/* Info strip */}
        <View style={styles.infoStrip}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>{data.partyLabel}</Text>
            <Text style={styles.infoValue}>{data.clientName}</Text>
            {data.clientPhone || data.clientEmail ? (
              <Text style={styles.infoSub}>
                {[data.clientPhone, data.clientEmail].filter(Boolean).join(" · ")}
              </Text>
            ) : (
              <Text style={styles.infoSub}> </Text>
            )}
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>طريقة الدفع</Text>
            <Text style={styles.infoValue}>{data.paymentMethodLabel}</Text>
            <Text style={[styles.payPill, pill]}>{data.paymentStatusLabel}</Text>
          </View>
          <View style={[styles.infoCell, styles.infoCellLast]}>
            <Text style={styles.infoLabel}>{data.kind === "purchase" ? "المستخدم" : "الكاشير"}</Text>
            <Text style={styles.infoValue}>{data.cashierName || "—"}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.items}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.th, styles.colIdx]}>#</Text>
            <Text style={[styles.th, styles.colName]}>المنتج</Text>
            <Text style={[styles.th, styles.colQty]}>الكمية</Text>
            <Text style={[styles.th, styles.colPrice]}>سعر الوحدة</Text>
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
              </View>
              <View style={[styles.td, styles.colQty]}>
                <Text style={styles.numText}>{item.quantity}</Text>
              </View>
              <View style={[styles.td, styles.colPrice]}>
                <Text style={styles.numText}>{formatAmount(item.unitPrice)}</Text>
              </View>
              <View style={[styles.td, styles.colTotal]}>
                <Text style={styles.numText}>{formatAmount(item.total)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Totals + QR */}
        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.leftCol}>
            <Text style={styles.words}>{data.totalInWords}</Text>
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
                <Text style={[styles.tRowLabel, styles.discountValue]}>الخصم</Text>
                <Text style={[styles.tRowValue, styles.discountValue]}>
                  {money(data.discountAmount, true)}
                </Text>
              </View>
            ) : null}
            {hasTax ? (
              <View style={styles.tRow}>
                <Text style={[styles.tRowLabel, styles.taxValue]}>
                  الضريبة{data.taxRate ? ` (${data.taxRate}%)` : ""}
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
              <Text style={styles.grandLabel}>الإجمالي</Text>
              <Text style={styles.grandValue}>{money(data.totalAmount)}</Text>
            </View>
            {isPartial ? (
              <>
                <View style={styles.tRow}>
                  <Text style={styles.tRowLabel}>المدفوع</Text>
                  <Text style={styles.tRowValue}>{money(data.paidAmount)}</Text>
                </View>
                <View style={styles.dueRow}>
                  <Text style={styles.dueText}>المتبقي</Text>
                  <Text style={styles.dueText}>{money(data.remainingAmount)}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signatures} wrap={false}>
          <Text style={styles.sigLine}>{data.kind === "purchase" ? "توقيع المورد" : "توقيع المستلم"}</Text>
          <Text style={styles.sigLine}>ختم الشركة / التوقيع</Text>
        </View>

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
            <Text style={styles.footBrand}>Powered by SellX</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
