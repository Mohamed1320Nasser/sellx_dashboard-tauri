import type { EndOfDayReport } from '../../services/reportService';
import { methodOf } from '../payments/paymentLabels';
import { dayLabel, shiftSpan } from './reportDates';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const amount = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
const money = (n: number) => `<span class="num">${n < 0 ? '-' : ''}${amount(n)}</span>`;
const qty = (n: number) => `<span class="num">${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n)}</span>`;

export interface EndOfDayPrintInfo {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  printedBy?: string;
}

/** The end-of-day report as an A4 page, in the same style as the statements and invoices */
export function endOfDayA4Html(r: EndOfDayReport, info: EndOfDayPrintInfo, columns: (keyof EndOfDayReport['money'][number])[], fontCss = ''): string {
  const s = r.sales;
  const label: Record<string, string> = {
    atSale: 'تحصيل المبيعات',
    onDebts: 'تحصيل ديون',
    fromSuppliers: 'مسترد من موردين',
    toSuppliers: 'مدفوع لموردين',
    expenses: 'مصروفات',
    refunds: 'مردود لعملاء',
  };
  const boxes: [string, string][] = [
    ['المبيعات', `${money(s.totalRevenue)}<div class="sub">${s.invoices} فاتورة</div>`],
    ['المرتجعات', `${money(s.returns)}<div class="sub">${s.returnOrders} مرتجع</div>`],
    ['صافي المبيعات', `${money(s.netRevenue)}<div class="sub">بدون الضريبة</div>`],
    ...(s.grossProfit != null ? ([['مجمل الربح', `${money(s.grossProfit)}<div class="sub">هامش <span class="num">${(s.grossProfitMargin || 0).toFixed(1)}%</span></div>`]] as [string, string][]) : []),
    ['صافي حركة الأموال', `${money(r.moneyTotals.net)}<div class="sub">كل الطرق</div>`],
  ];
  const now = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date());

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير نهاية اليوم ${esc(r.date)}</title>
<style>
${fontCss}
@page { size: A4; margin: 12mm 12mm 16mm; @bottom-left { content: "صفحة " counter(page) " من " counter(pages); font-size: 9px; color: #94a3b8; } }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', Arial, sans-serif; color: #0f172a; font-size: 11.5px; direction: rtl; }
.num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px solid #059669; }
.brand { display: flex; gap: 12px; align-items: flex-start; }
.logo { width: 54px; height: 54px; border-radius: 10px; object-fit: contain; }
.logo-fallback { width: 54px; height: 54px; border-radius: 10px; background: #059669; color: #fff; font-weight: 700; font-size: 22px; display: flex; align-items: center; justify-content: center; }
.company { font-size: 18px; font-weight: 700; margin-bottom: 3px; }
.line { color: #475569; font-size: 10.5px; line-height: 1.7; }
.doc { text-align: left; }
.doc-title { display: inline-block; background: #0f172a; color: #fff; font-weight: 700; font-size: 14px; padding: 5px 14px; border-radius: 6px; margin-bottom: 6px; }
.boxes { display: grid; grid-template-columns: repeat(${boxes.length}, 1fr); gap: 8px; margin-top: 12px; }
.box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-weight: 700; }
.box .label { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 3px; }
.sub { font-size: 10px; color: #64748b; font-weight: 400; margin-top: 2px; }
h2 { font-size: 12.5px; margin: 16px 0 6px; }
table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: #f1f5f9; color: #475569; font-size: 10px; font-weight: 700; text-align: right; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
td.n, th.n { text-align: left; }
tfoot td { font-weight: 700; background: #f8fafc; border-top: 1px solid #cbd5e1; }
.neg { color: #dc2626; } .pos { color: #059669; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.foot { margin-top: 18px; color: #94a3b8; font-size: 9.5px; display: flex; justify-content: space-between; }
.signs { display: flex; gap: 40px; margin-top: 30px; page-break-inside: avoid; }
.signs > div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 10.5px; color: #64748b; }
</style></head><body>
<div class="head">
  <div class="brand">
    ${info.companyLogoUrl ? `<img class="logo" src="${esc(info.companyLogoUrl)}" alt="">` : `<div class="logo-fallback">${esc(info.companyName?.trim()?.[0] || '؟')}</div>`}
    <div><div class="company">${esc(info.companyName)}</div>
      ${info.companyAddress ? `<div class="line">${esc(info.companyAddress)}</div>` : ''}
      ${info.companyPhone ? `<div class="line">هاتف: <span class="num">${esc(info.companyPhone)}</span></div>` : ''}</div>
  </div>
  <div class="doc"><div class="doc-title">تقرير نهاية اليوم</div><div class="line">${esc(dayLabel(r.date))}</div></div>
</div>
<div class="boxes">${boxes.map(([l, v]) => `<div class="box"><div class="label">${l}</div>${v}</div>`).join('')}</div>

<h2>حركة الأموال حسب طريقة الدفع</h2>
<table><thead><tr><th>الطريقة</th>${columns.map(c => `<th class="n">${label[c as string]}</th>`).join('')}<th class="n">الصافي</th></tr></thead>
<tbody>${r.money.map(m => `<tr><td>${esc(methodOf(m.method).label)}</td>${columns.map(c => `<td class="n">${money(Number(m[c]))}</td>`).join('')}<td class="n"><b class="${m.net < 0 ? 'neg' : ''}">${money(m.net)}</b></td></tr>`).join('') || `<tr><td colspan="${columns.length + 2}">لا توجد حركة</td></tr>`}</tbody>
<tfoot><tr><td>الإجمالي</td>${columns.map(c => `<td class="n">${money(Number(r.moneyTotals[c as keyof typeof r.moneyTotals]))}</td>`).join('')}<td class="n">${money(r.moneyTotals.net)}</td></tr></tfoot></table>

<h2>الأدراج (الورديات)</h2>
<table><thead><tr><th>الخزنة · الكاشير</th><th>الوقت</th><th class="n">افتتاحي</th><th class="n">مبيعات نقدية</th><th class="n">داخل / خارج</th><th class="n">المتوقع</th><th class="n">الفعلي</th><th class="n">الفرق</th></tr></thead>
<tbody>${r.shifts.map(sh => `<tr><td>${esc(sh.register)} · ${esc(sh.cashier)}</td><td>${esc(shiftSpan(sh.startTime, sh.endTime, r.date))}</td><td class="n">${money(sh.openingBalance)}</td><td class="n">${money(sh.cashSales)}</td><td class="n">${money(sh.cashIn)} / ${money(sh.cashOut)}</td><td class="n">${money(sh.expectedCash)}</td><td class="n">${sh.actualCash == null ? 'مفتوحة' : money(sh.actualCash)}</td><td class="n ${(sh.variance ?? 0) < 0 ? 'neg' : sh.variance ? 'pos' : ''}">${sh.status === 'OPEN' ? '—' : money(sh.variance ?? 0)}</td></tr>`).join('') || '<tr><td colspan="8">لم تُفتح أي وردية</td></tr>'}</tbody></table>

<div class="two">
<div><h2>المبيعات حسب الكاشير</h2>
<table><thead><tr><th>الكاشير</th><th class="n">الفواتير</th><th class="n">المبيعات</th></tr></thead>
<tbody>${r.cashiers.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${c.invoices}</td><td class="n">${money(c.total)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</tbody></table></div>
<div><h2>ملخص</h2>
<table><tbody>
<tr><td>الخصومات</td><td class="n">${money(s.discounts)}</td></tr>
<tr><td>الضريبة المحصلة</td><td class="n">${money(s.tax)}</td></tr>
<tr><td>متوسط الفاتورة</td><td class="n">${money(s.averageOrderValue)}</td></tr>
<tr><td>آجل على فواتير اليوم</td><td class="n">${money(s.unpaid)}</td></tr>
${s.costOfGoodsSold != null ? `<tr><td>تكلفة البضاعة المباعة</td><td class="n">${money(s.costOfGoodsSold)}</td></tr>` : ''}
</tbody></table></div>
</div>

<h2>الأصناف المباعة (${r.items.length})</h2>
<table><thead><tr><th>#</th><th>الصنف</th><th class="n">الكمية</th><th class="n">القيمة</th></tr></thead>
<tbody>${r.items.map((it, i) => `<tr><td class="num">${i + 1}</td><td>${esc(it.name)}</td><td class="n">${qty(it.quantity)}${it.unit ? ` ${esc(it.unit)}` : ''}</td><td class="n">${money(it.total)}</td></tr>`).join('') || '<tr><td colspan="4">لم يُبع شيء</td></tr>'}</tbody></table>

<div class="signs"><div>المسؤول عن الخزنة</div><div>المدير</div></div>
<div class="foot"><span>المبالغ بالجنيه المصري · الأيام بتوقيت القاهرة</span><span>طُبع <span class="num">${esc(now)}</span>${info.printedBy ? ` · ${esc(info.printedBy)}` : ''}</span></div>
</body></html>`;
}
