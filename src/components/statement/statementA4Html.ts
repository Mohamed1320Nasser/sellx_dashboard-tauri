import type { StatementDocData } from "./statementData";
import { A4_SIGNATURE_CSS, a4Signatures } from "../pdf/a4Signatures";

/** The statement as a printable A4 page: the same layout as StatementPdf, the column titles repeat on every page */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const amount = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const money = (n: number) => `${n < 0 ? "-" : ""}${amount(Math.abs(n))} ج.م`;
/** Latin codes inside Arabic text keep their own direction */
const bidi = (s: string) => esc(s).replace(/([A-Za-z0-9][A-Za-z0-9\-/.,:_#]*)/g, '<bdi dir="ltr">$1</bdi>');

export function statementA4Html(d: StatementDocData, fontCss = ""): string {
  const initial = esc(d.companyName?.trim()?.[0] || "؟");
  const isClient = d.kind === "client";
  const brandLine = (label: string, value?: string) =>
    value ? `<div class="brand-line">${label ? `${label}: ` : ""}<span class="num">${esc(value)}</span></div>` : "";
  const creditBalance = d.closing < 0;
  const debitCls = isClient ? "red" : "green";
  const creditCls = isClient ? "green" : "red";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(d.title)} - ${esc(d.party.name)}</title>
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
.doc-line { font-size: 11px; color: #475569; line-height: 1.7; }
.strip { display: grid; grid-template-columns: 1.4fr 1.2fr 1fr; margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.cell { padding: 10px 14px; border-left: 1px solid #e2e8f0; background: #f8fafc; }
.cell:last-child { border-left: 0; }
.label { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 3px; }
.value { font-size: 13px; font-weight: 700; }
.sub { font-size: 11px; color: #475569; margin-top: 2px; line-height: 1.6; }
.boxes { display: grid; grid-template-columns: repeat(${d.summary.length + 1}, 1fr); gap: 8px; margin-top: 12px; page-break-inside: avoid; }
.box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
.box .label { margin-bottom: 4px; }
.box b { font-size: 13px; }
.box.due { background: #fff7ed; border-color: #fed7aa; }
.box.due b { color: #9a3412; }
.box.credit { background: #dcfce7; border-color: #bbf7d0; }
.box.credit b { color: #15803d; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
thead { display: table-header-group; }
thead th { background: #1e293b; color: #fff; font-size: 11px; font-weight: 700; padding: 8px; text-align: right; }
thead th:first-child { border-top-right-radius: 6px; }
thead th:last-child { border-top-left-radius: 6px; }
tbody td { padding: 7px 8px; border-bottom: 1px solid #edf1f5; font-size: 11.5px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
tbody tr.opening td { background: #f1f5f9; color: #475569; }
tr { page-break-inside: avoid; }
tfoot td { padding: 8px; font-size: 11.5px; font-weight: 700; border-top: 2px solid #1e293b; background: #f8fafc; }
.c-date { width: 86px; white-space: nowrap; }
.c-type { width: 104px; font-weight: 700; }
.c-num { width: 96px; text-align: center !important; white-space: nowrap; }
.c-bal { width: 112px; text-align: center !important; font-weight: 700; white-space: nowrap; }
.note { font-size: 10px; color: #64748b; margin-top: 2px; }
.red { color: #dc2626; font-weight: 700; }
.green { color: #15803d; font-weight: 700; }
.muted { color: #94a3b8; }
.closing { display: flex; justify-content: space-between; align-items: center; width: 320px; margin-top: 14px; margin-right: auto; background: #0f172a; color: #fff; border-radius: 8px; padding: 10px 14px; page-break-inside: avoid; }
.closing b { font-size: 15px; }
.closing small { display: block; font-size: 10px; color: #cbd5e1; }
.signs { display: flex; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
${A4_SIGNATURE_CSS}
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
        ${brandLine("الرقم الضريبي", d.companyTaxNumber)}
        ${brandLine("السجل التجاري", d.commercialRegister)}
      </div>
    </div>
    <div class="doc">
      <div class="doc-title">${esc(d.title)}</div>
      <div class="doc-line">${bidi(d.periodLabel)}</div>
      <div class="doc-line">عدد الحركات: <span class="num">${d.rows.filter(r => r.type !== "OPENING").length}</span></div>
    </div>
  </div>

  <div class="strip">
    <div class="cell">
      <div class="label">${esc(d.partyLabel)}</div>
      <div class="value">${esc(d.party.name)}</div>
      ${d.party.phone ? `<div class="sub">هاتف: <span class="num">${esc(d.party.phone)}</span></div>` : ""}
      ${d.party.address ? `<div class="sub">${esc(d.party.address)}</div>` : ""}
    </div>
    <div class="cell">
      <div class="label">الفترة</div>
      <div class="value">${bidi(d.periodLabel)}</div>
      <div class="sub">طُبع في ${bidi(d.printedAtLabel)}</div>
    </div>
    <div class="cell">
      <div class="label">أعدّه</div>
      <div class="value">${esc(d.staffName || "—")}</div>
      ${d.staffPhone ? `<div class="sub">هاتف: <span class="num">${esc(d.staffPhone)}</span></div>` : ""}
    </div>
  </div>

  <div class="boxes">
    ${d.summary.map(s => `<div class="box"><div class="label">${esc(s.label)}</div><b class="num">${money(s.value)}</b></div>`).join("")}
    <div class="box ${creditBalance ? "credit" : "due"}"><div class="label">${esc(d.closingLabel)}</div><b class="num">${money(Math.abs(d.closing))}</b></div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c-date">التاريخ</th>
        <th class="c-type">النوع</th>
        <th>المرجع</th>
        <th class="c-num">${esc(d.debitLabel)}</th>
        <th class="c-num">${esc(d.creditLabel)}</th>
        <th class="c-bal">الرصيد</th>
      </tr>
    </thead>
    <tbody>
      ${d.rows
        .map(
          r => `<tr class="${r.type === "OPENING" ? "opening" : ""}">
        <td class="c-date num">${esc(r.dateLabel)}</td>
        <td class="c-type">${esc(r.typeLabel)}</td>
        <td>${bidi(r.reference)}${r.note ? `<div class="note">${bidi(r.note)}</div>` : ""}</td>
        <td class="c-num num ${r.debit > 0 ? debitCls : "muted"}">${r.debit > 0 ? amount(r.debit) : "—"}</td>
        <td class="c-num num ${r.credit > 0 ? creditCls : "muted"}">${r.credit > 0 ? amount(r.credit) : "—"}</td>
        <td class="c-bal num">${money(r.balance)}</td>
      </tr>`
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">إجمالي حركات الفترة</td>
        <td class="c-num num">${amount(d.totalDebit)}</td>
        <td class="c-num num">${amount(d.totalCredit)}</td>
        <td class="c-bal num">${money(d.closing)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="closing">
    <span>${esc(d.closingLabel)}${d.closingNote ? `<small>${bidi(d.closingNote)}</small>` : ""}</span>
    <b class="num">${money(Math.abs(d.closing))}</b>
  </div>

  ${a4Signatures(
    { label: isClient ? "توقيع العميل" : "توقيع المورد", name: d.party.name, phone: d.party.phone },
    { label: "ختم الشركة / التوقيع", name: d.companyName, address: d.companyAddress, phone: d.companyPhone }
  )}

  <div class="foot">
    <span>${esc(d.footerText || `شكرًا لتعاملكم مع ${d.companyName}`)}</span>
    <span>طُبعت في ${bidi(d.printedAtLabel)}</span>
    <span>Powered by SellX</span>
  </div>
</body>
</html>`;
}
