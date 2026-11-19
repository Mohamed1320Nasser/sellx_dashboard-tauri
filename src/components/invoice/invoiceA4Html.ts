import type { SaleInvoiceData } from "./saleInvoiceTypes";

/**
 * The A4 invoice as a printable HTML page. Same content as SaleInvoicePdf (the PDF download):
 * header, customer / payment / staff strip, items, totals, amount in words, customer balance,
 * later payments, terms, signatures. Page numbers and the table header repeat on every page.
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
const qty = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);

const PILL_COLORS: Record<string, [string, string]> = {
  green: ["#dcfce7", "#15803d"],
  amber: ["#fef3c7", "#b45309"],
  red: ["#fee2e2", "#b91c1c"],
};

export function invoiceA4Html(d: SaleInvoiceData, fontCss = ""): string {
  const [pillBg, pillInk] = PILL_COLORS[d.pillTone] || PILL_COLORS.green;
  const initial = esc(d.companyName?.trim()?.[0] || "؟");
  const isQuote = d.kind === "quote";
  const row = (label: string, value: string, cls = "") =>
    `<div class="t-row ${cls}"><span>${label}</span><span class="num">${value}</span></div>`;
  const brandLine = (label: string, value?: string) =>
    value ? `<div class="brand-line">${label ? `${label}: ` : ""}<span class="num">${esc(value)}</span></div>` : "";
  const cols = d.showLineDiscount ? 6 : 5;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(d.title)} ${esc(d.receiptNumber)}</title>
<style>
${fontCss}
@page {
  size: A4;
  margin: 12mm 12mm 16mm;
  @bottom-left { content: "صفحة " counter(page) " من " counter(pages); font-size: 9px; color: #94a3b8; }
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', Arial, sans-serif; color: #0f172a; font-size: 12px; direction: rtl; background: #fff; }
.num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #059669; }
.brand { display: flex; gap: 12px; align-items: flex-start; }
.logo { width: 60px; height: 60px; border-radius: 10px; object-fit: contain; }
.logo-fallback { width: 60px; height: 60px; border-radius: 10px; background: #059669; color: #fff; font-weight: 700; font-size: 24px; display: flex; align-items: center; justify-content: center; }
.company { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
.brand-line { color: #475569; font-size: 11px; line-height: 1.7; }
.doc { text-align: left; min-width: 190px; }
.doc-title { display: inline-block; background: #0f172a; color: #fff; font-weight: 700; font-size: 15px; padding: 5px 14px; border-radius: 6px; margin-bottom: 8px; }
.doc-grid { display: grid; grid-template-columns: auto auto; gap: 2px 10px; font-size: 11px; color: #475569; justify-content: end; }
.doc-grid b { color: #0f172a; }
.strip { display: grid; grid-template-columns: 1.5fr 1fr 1fr; margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.cell { padding: 10px 14px; border-left: 1px solid #e2e8f0; background: #f8fafc; }
.cell:last-child { border-left: 0; }
.label { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 3px; }
.value { font-size: 13px; font-weight: 700; }
.sub { font-size: 11px; color: #475569; margin-top: 2px; line-height: 1.6; }
.pill { display: inline-block; margin-top: 4px; padding: 2px 10px; border-radius: 10px; font-size: 10px; font-weight: 700; background: ${pillBg}; color: ${pillInk}; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
thead { display: table-header-group; }
thead th { background: #1e293b; color: #fff; font-size: 11px; font-weight: 700; padding: 8px; }
thead th:first-child { border-top-right-radius: 6px; }
thead th:last-child { border-top-left-radius: 6px; }
tbody td { padding: 8px; border-bottom: 1px solid #edf1f5; font-size: 12px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
tr { page-break-inside: avoid; }
tfoot td { padding: 7px 8px; font-size: 11px; color: #475569; border-top: 2px solid #1e293b; }
.c-idx { width: 32px; text-align: center; color: #94a3b8; }
.c-name { text-align: right; }
.c-num { width: 86px; text-align: center; font-weight: 700; }
.c-total { width: 110px; text-align: center; font-weight: 700; }
.subject { margin: 10px 0 12px; font-size: 13px; color: #0f172a; }
.subject b { color: #475569; font-weight: 700; }
.sku { font-size: 10px; color: #94a3b8; margin-top: 2px; }
.desc { font-size: 10.5px; color: #475569; margin-top: 3px; line-height: 1.6; white-space: pre-line; font-weight: 400; }
.bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-top: 16px; page-break-inside: avoid; }
.left-col { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.words { border: 1px dashed #94a3b8; border-radius: 6px; padding: 9px 12px; font-size: 12px; font-weight: 700; background: #f8fafc; }
.box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 11px; }
.box-title { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 4px; }
.balance { display: flex; justify-content: space-between; align-items: center; background: #fff7ed; border-color: #fed7aa; }
.balance b { font-size: 13px; color: #9a3412; }
.pay-row { display: flex; justify-content: space-between; padding: 2px 0; color: #334155; }
.notes { font-size: 11px; color: #475569; line-height: 1.7; }
.qr img { width: 96px; height: 96px; }
.totals { width: 300px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.t-row { display: flex; justify-content: space-between; padding: 7px 12px; border-bottom: 1px solid #edf1f5; font-size: 12px; }
.t-row span:last-child { font-weight: 700; }
.t-red { color: #dc2626; }
.t-amber { color: #b45309; }
.t-grand { background: #0f172a; color: #fff; font-size: 14px; font-weight: 700; padding: 10px 12px; border-bottom: 0; }
.t-due { background: #fee2e2; color: #b91c1c; font-weight: 700; border-bottom: 0; }
.t-clear { background: #dcfce7; color: #15803d; font-weight: 700; border-bottom: 0; }
.terms { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 10px; page-break-inside: avoid; }
.terms-title { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
.terms-body { font-size: 10.5px; color: #475569; line-height: 1.8; white-space: pre-line; }
.signs { display: flex; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
.signs div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
.foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: #64748b; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      ${d.companyLogoUrl ? `<img class="logo" src="${esc(d.companyLogoUrl)}" alt="">` : `<div class="logo-fallback">${initial}</div>`}
      <div>
        <div class="company">${esc(d.companyName)}</div>
        ${d.companyAddress ? `<div class="brand-line">${esc(d.companyAddress)}</div>` : ""}
        ${brandLine("هاتف", d.companyPhone)}
        ${brandLine("", d.companyEmail)}
        ${brandLine("الرقم الضريبي", d.companyTaxNumber)}
        ${brandLine("السجل التجاري", d.commercialRegister)}
      </div>
    </div>
    <div class="doc">
      <div class="doc-title">${esc(d.title)}</div>
      <div class="doc-grid">
        <span>${isQuote ? "رقم العرض" : "رقم الفاتورة"}</span><b class="num">${esc(d.receiptNumber)}</b>
        <span>التاريخ</span><b>${esc(d.dateLabel)}</b>
        <span>الوقت</span><b>${esc(d.timeLabel)}</b>
      </div>
    </div>
  </div>

  <div class="strip">
    <div class="cell">
      <div class="label">${esc(d.partyLabel)}</div>
      <div class="value">${esc(d.clientName)}</div>
      ${d.clientPhone || d.clientEmail ? `<div class="sub"><span class="num">${esc([d.clientPhone, d.clientEmail].filter(Boolean).join(" · "))}</span></div>` : ""}
      ${d.clientAddress ? `<div class="sub">${esc(d.clientAddress)}</div>` : ""}
    </div>
    <div class="cell">
      <div class="label">${esc(d.middleLabel)}</div>
      <div class="value">${esc(d.middleValue)}</div>
      <span class="pill">${esc(d.pillLabel)}</span>
    </div>
    <div class="cell">
      <div class="label">${esc(d.staffLabel)}</div>
      <div class="value">${esc(d.cashierName || "—")}</div>
    </div>
  </div>
  ${d.subject ? `<div class="subject"><b>الموضوع:</b> ${esc(d.subject)}</div>` : ""}

  <table>
    <thead>
      <tr>
        <th class="c-idx">#</th>
        <th class="c-name">${d.kind === "purchase" ? "الصنف" : "المنتج"}</th>
        <th class="c-num">الكمية</th>
        <th class="c-num">سعر الوحدة</th>
        ${d.showLineDiscount ? `<th class="c-num">الخصم</th>` : ""}
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
          }${it.description ? `<div class="desc">${esc(it.description)}</div>` : ""}</td>
        <td class="c-num num">${qty(it.quantity)}${it.unit ? `<div class="sku">${esc(it.unit)}</div>` : ""}</td>
        <td class="c-num num">${amount(it.unitPrice)}</td>
        ${d.showLineDiscount ? `<td class="c-num num t-red">${it.discount > 0 ? amount(it.discount) : "—"}</td>` : ""}
        <td class="c-total num">${amount(it.total)}</td>
      </tr>`
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr><td colspan="${cols}">عدد الأصناف: <b class="num">${d.itemsCount}</b>${
        d.totalQuantity === null ? "" : ` &nbsp;·&nbsp; إجمالي الكميات: <b class="num">${qty(d.totalQuantity)}</b>`
      }</td></tr>
    </tfoot>
  </table>

  <div class="bottom">
    <div class="left-col">
      <div class="words">${esc(d.totalInWords)}</div>
      ${
        d.clientBalance !== null && Math.abs(d.clientBalance) >= 0.01
          ? `<div class="box balance"><span>${d.clientBalance > 0 ? "إجمالي المستحق على العميل" : "رصيد دائن للعميل"} حتى ${esc(d.printedAtLabel)}</span><b class="num">${money(Math.abs(d.clientBalance))}</b></div>`
          : ""
      }
      ${
        d.payments.length
          ? `<div class="box"><div class="box-title">دفعات لاحقة على الفاتورة</div>${d.payments
              .map((p) => `<div class="pay-row"><span>${esc(p.dateLabel)} · ${esc(p.methodLabel)}</span><span class="num">${money(p.amount)}</span></div>`)
              .join("")}</div>`
          : ""
      }
      ${d.notes ? `<div class="notes"><b>ملاحظات:</b> ${esc(d.notes)}</div>` : ""}
      ${d.qrImageDataUrl ? `<div class="qr"><img src="${d.qrImageDataUrl}" alt=""></div>` : ""}
    </div>
    <div class="totals">
      ${row("المجموع الفرعي", money(d.subtotal))}
      ${d.discountAmount > 0 ? row(esc(d.discountLabel || "الخصم").replace(/(\d+(?:\.\d+)?%)/, '<bdi dir="ltr">$1</bdi>'), money(d.discountAmount, true), "t-red") : ""}
      ${d.taxAmount > 0 ? row(`ضريبة القيمة المضافة${d.taxRate ? ` (${d.taxRate}%)` : ""}`, money(d.taxAmount), "t-amber") : ""}
      ${d.additionalFee > 0 ? row(esc(d.additionalFeeLabel || "رسوم إضافية"), money(d.additionalFee)) : ""}
      ${row(isQuote ? "إجمالي العرض" : "الإجمالي", money(d.totalAmount), "t-grand")}
      ${
        isQuote
          ? ""
          : row("المدفوع", money(d.paidAmount)) +
            (d.returnsAmount > 0 ? row("مرتجعات", money(d.returnsAmount, true), "t-red") : "") +
            (d.remainingAmount > 0
              ? row("المتبقي", money(d.remainingAmount), "t-due")
              : row("المتبقي", money(0), "t-clear"))
      }
    </div>
  </div>

  ${d.terms ? `<div class="terms"><div class="terms-title">الشروط والأحكام</div><div class="terms-body">${esc(d.terms)}</div></div>` : ""}

  <div class="signs">
    <div>${esc(d.signatureLabel)}</div>
    <div>ختم الشركة / التوقيع</div>
  </div>

  <div class="foot">
    <span>${esc(d.footerText || `شكرًا لتعاملكم مع ${d.companyName}`)}</span>
    <span>طُبعت في <span class="num">${esc(d.printedAtLabel)}</span></span>
    <span>Powered by SellX</span>
  </div>
</body>
</html>`;
}
