import type { SaleInvoiceData } from "./saleInvoiceTypes";

/**
 * The A4 invoice as a printable HTML page. Same layout as SaleInvoicePdf (the PDF download):
 * header, customer / payment / cashier strip, items table, totals, amount in words, signatures.
 */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const amount = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const money = (n: number, negative = false) => `${negative ? "-" : ""}${amount(n)} ج.م`;

const STATUS_COLORS: Record<string, [string, string]> = {
  PAID: ["#dcfce7", "#15803d"],
  PARTIAL: ["#fef3c7", "#b45309"],
  UNPAID: ["#fee2e2", "#b91c1c"],
};

export function invoiceA4Html(d: SaleInvoiceData, fontCss = ""): string {
  const [pillBg, pillInk] = STATUS_COLORS[d.paymentStatus] || STATUS_COLORS.PAID;
  const initial = esc(d.companyName?.trim()?.[0] || "؟");
  const row = (label: string, value: string, cls = "") =>
    `<div class="t-row ${cls}"><span>${label}</span><span class="num">${value}</span></div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(d.title)} ${esc(d.receiptNumber)}</title>
<style>
${fontCss}
@page { size: A4; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', Arial, sans-serif; color: #0f172a; font-size: 12px; direction: rtl; background: #fff; }
.num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #059669; }
.brand { display: flex; gap: 12px; align-items: flex-start; }
.logo { width: 56px; height: 56px; border-radius: 10px; object-fit: contain; }
.logo-fallback { width: 56px; height: 56px; border-radius: 10px; background: #059669; color: #fff; font-weight: 700; font-size: 22px; display: flex; align-items: center; justify-content: center; }
.company { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
.brand-line { color: #475569; font-size: 11px; line-height: 1.7; }
.doc { text-align: left; }
.doc-title { display: inline-block; background: #0f172a; color: #fff; font-weight: 700; font-size: 15px; padding: 5px 14px; border-radius: 6px; margin-bottom: 8px; }
.doc-line { font-size: 11px; color: #475569; line-height: 1.8; }
.doc-line b { color: #0f172a; }
.strip { display: grid; grid-template-columns: 1.4fr 1fr 1fr; margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.cell { padding: 10px 14px; border-left: 1px solid #e2e8f0; background: #f8fafc; }
.cell:last-child { border-left: 0; }
.label { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 3px; }
.value { font-size: 13px; font-weight: 700; }
.sub { font-size: 11px; color: #475569; margin-top: 2px; }
.pill { display: inline-block; margin-top: 4px; padding: 2px 10px; border-radius: 10px; font-size: 10px; font-weight: 700; background: ${pillBg}; color: ${pillInk}; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
thead th { background: #1e293b; color: #fff; font-size: 11px; font-weight: 700; padding: 8px; }
thead th:first-child { border-top-right-radius: 6px; }
thead th:last-child { border-top-left-radius: 6px; }
tbody td { padding: 8px; border-bottom: 1px solid #edf1f5; font-size: 12px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
tbody tr { page-break-inside: avoid; }
.c-idx { width: 32px; text-align: center; color: #94a3b8; }
.c-name { text-align: right; }
.c-num { width: 90px; text-align: center; font-weight: 700; }
.c-total { width: 110px; text-align: center; font-weight: 700; }
.sku { font-size: 10px; color: #94a3b8; margin-top: 2px; }
.bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-top: 16px; page-break-inside: avoid; }
.left-col { flex: 1; }
.words { border: 1px dashed #94a3b8; border-radius: 6px; padding: 9px 12px; font-size: 12px; font-weight: 700; background: #f8fafc; }
.notes { margin-top: 10px; font-size: 11px; color: #475569; line-height: 1.7; }
.qr { margin-top: 10px; text-align: center; width: 110px; }
.qr img { width: 96px; height: 96px; }
.totals { width: 290px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.t-row { display: flex; justify-content: space-between; padding: 7px 12px; border-bottom: 1px solid #edf1f5; font-size: 12px; }
.t-row span:last-child { font-weight: 700; }
.t-red { color: #dc2626; }
.t-amber { color: #b45309; }
.t-grand { background: #0f172a; color: #fff; font-size: 14px; font-weight: 700; padding: 10px 12px; border-bottom: 0; }
.t-due { background: #fee2e2; color: #b91c1c; font-weight: 700; }
.signs { display: flex; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
.signs div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
.foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      ${d.companyLogoUrl ? `<img class="logo" src="${esc(d.companyLogoUrl)}" alt="">` : `<div class="logo-fallback">${initial}</div>`}
      <div>
        <div class="company">${esc(d.companyName)}</div>
        ${d.companyAddress ? `<div class="brand-line">${esc(d.companyAddress)}</div>` : ""}
        ${d.companyPhone ? `<div class="brand-line">هاتف: <span class="num">${esc(d.companyPhone)}</span></div>` : ""}
        ${d.companyEmail ? `<div class="brand-line">${esc(d.companyEmail)}</div>` : ""}
        ${d.companyTaxNumber ? `<div class="brand-line">الرقم الضريبي: <span class="num">${esc(d.companyTaxNumber)}</span></div>` : ""}
      </div>
    </div>
    <div class="doc">
      <div class="doc-title">${esc(d.title)}</div>
      <div class="doc-line">رقم: <b class="num">${esc(d.receiptNumber)}</b></div>
      <div class="doc-line">التاريخ: <b>${esc(d.dateLabel)}</b></div>
      <div class="doc-line">الوقت: <b>${esc(d.timeLabel)}</b></div>
    </div>
  </div>

  <div class="strip">
    <div class="cell">
      <div class="label">${esc(d.partyLabel)}</div>
      <div class="value">${esc(d.clientName)}</div>
      ${d.clientPhone || d.clientEmail ? `<div class="sub"><span class="num">${esc([d.clientPhone, d.clientEmail].filter(Boolean).join(" · "))}</span></div>` : ""}
    </div>
    <div class="cell">
      <div class="label">طريقة الدفع</div>
      <div class="value">${esc(d.paymentMethodLabel)}</div>
      <span class="pill">${esc(d.paymentStatusLabel)}</span>
    </div>
    <div class="cell">
      <div class="label">${d.kind === "purchase" ? "المستخدم" : "الكاشير"}</div>
      <div class="value">${esc(d.cashierName || "—")}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c-idx">#</th>
        <th class="c-name">المنتج</th>
        <th class="c-num">الكمية</th>
        <th class="c-num">سعر الوحدة</th>
        <th class="c-total">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${d.items
        .map(
          (it) => `<tr>
        <td class="c-idx">${it.index}</td>
        <td class="c-name"><div style="font-weight:700">${esc(it.productName)}</div>${
            it.sku ? `<div class="sku"><span class="num">${esc(it.sku)}</span>${it.categoryName ? ` · ${esc(it.categoryName)}` : ""}</div>` : ""
          }</td>
        <td class="c-num num">${it.quantity}</td>
        <td class="c-num num">${amount(it.unitPrice)}</td>
        <td class="c-total num">${amount(it.total)}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>

  <div class="bottom">
    <div class="left-col">
      <div class="words">${esc(d.totalInWords)}</div>
      ${d.notes ? `<div class="notes"><b>ملاحظات:</b> ${esc(d.notes)}</div>` : ""}
      ${d.qrImageDataUrl ? `<div class="qr"><img src="${d.qrImageDataUrl}" alt=""></div>` : ""}
    </div>
    <div class="totals">
      ${row("المجموع الفرعي", money(d.subtotal))}
      ${d.discountAmount > 0 ? row("الخصم", money(d.discountAmount, true), "t-red") : ""}
      ${d.taxAmount > 0 ? row(`الضريبة${d.taxRate ? ` (${d.taxRate}%)` : ""}`, money(d.taxAmount), "t-amber") : ""}
      ${d.additionalFee > 0 ? row(esc(d.additionalFeeLabel || "رسوم إضافية"), money(d.additionalFee)) : ""}
      ${row("الإجمالي", money(d.totalAmount), "t-grand")}
      ${d.remainingAmount > 0 ? row("المدفوع", money(d.paidAmount)) + row("المتبقي", money(d.remainingAmount), "t-due") : ""}
    </div>
  </div>

  <div class="signs">
    <div>${d.kind === "purchase" ? "توقيع المورد" : "توقيع المستلم"}</div>
    <div>ختم الشركة / التوقيع</div>
  </div>

  <div class="foot">
    <span>${esc(d.footerText || `شكرًا لتعاملكم مع ${d.companyName}`)}</span>
    <span>Powered by SellX</span>
  </div>
</body>
</html>`;
}
