import type { SalesByCashier, SlowMoving, StockValuation } from '../../services/reportService';
import { dayLabel } from './reportDates';
import { shopDate } from '../productDetails/historyRange';
import { a4Page, boxes, esc, money, pctText, qty, type A4Info } from './a4Report';

const drawer = (n: number) => (n < 0 ? `<span class="neg">عجز ${money(-n)}</span>` : n > 0 ? `<span class="warn">زيادة ${money(n)}</span>` : '<span class="pos">مطابق</span>');
const period = (from: string, to: string) => (from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`);

/** Sales by cashier for a period, as an A4 page */
export function salesByCashierA4Html(r: SalesByCashier, info: A4Info, fontCss = ''): string {
  const t = r.totals;
  const shifts = r.cashiers.reduce((n, c) => n + c.shifts.count, 0);
  const rows = r.cashiers
    .map(
      c => `<tr><td><b>${esc(c.name)}</b></td><td class="n">${qty(c.invoices)}</td>
<td class="n"><b>${money(c.sales)}</b><div class="sub">${pctText(c.share)}</div></td>
<td class="n">${money(c.collected)}${c.unpaid > 0 ? `<div class="sub warn">آجل ${money(c.unpaid)}</div>` : ''}</td>
<td class="n">${money(c.average)}</td>
<td class="n">${c.discounts > 0 ? money(c.discounts) : '—'}</td>
<td class="n">${c.negotiated.count ? `${money(c.negotiated.amount)}<div class="sub">${qty(c.negotiated.count)} فاتورة</div>` : '—'}</td>
<td class="n">${c.returns.count ? `${money(c.returns.total)}<div class="sub">${qty(c.returns.count)} مرتجع</div>` : '—'}</td>
<td class="n">${c.shifts.count ? `${drawer(c.shifts.net)}<div class="sub">${qty(c.shifts.count)} وردية${c.shifts.short ? ` · ${qty(c.shifts.short)} بعجز` : ''}</div>` : '—'}</td></tr>`
    )
    .join('');
  return a4Page({
    title: `المبيعات حسب الكاشير ${r.startDate}`,
    docTitle: 'المبيعات حسب الكاشير',
    lines: [esc(period(r.startDate, r.endDate))],
    info,
    fontCss,
    body: `${boxes([
      ['المبيعات', `${money(t.sales)}<div class="sub">${qty(t.invoices)} فاتورة</div>`],
      ['الخصومات', `${money(t.discounts)}<div class="sub">${t.negotiated > 0 ? `+ ${money(t.negotiated)} بالتفاوض` : 'على الفواتير'}</div>`],
      ['المرتجعات', `${money(t.returns)}<div class="sub">مرتجعات مكتملة</div>`],
      ['فروق الدرج', `${shifts ? drawer(t.shiftsNet) : '—'}<div class="sub">${shifts ? `${qty(shifts)} وردية مغلقة` : 'لم تُغلق ورديات'}</div>`],
    ])}
<h2>${qty(t.cashiers)} كاشير</h2>
<table><thead><tr><th>الكاشير</th><th class="n">الفواتير</th><th class="n">المبيعات</th><th class="n">المحصل</th><th class="n">متوسط الفاتورة</th><th class="n">الخصومات</th><th class="n">بالتفاوض</th><th class="n">المرتجعات</th><th class="n">فرق الدرج</th></tr></thead>
<tbody>${rows || '<tr><td colspan="9">لا توجد مبيعات في هذه الفترة</td></tr>'}</tbody>
${r.cashiers.length > 1 ? `<tfoot><tr><td>الإجمالي</td><td class="n">${qty(t.invoices)}</td><td class="n">${money(t.sales)}</td><td class="n">${money(r.cashiers.reduce((s, c) => s + c.collected, 0))}</td><td class="n">—</td><td class="n">${money(t.discounts)}</td><td class="n">${money(t.negotiated)}</td><td class="n">${money(t.returns)}</td><td class="n">${shifts ? drawer(t.shiftsNet) : '—'}</td></tr></tfoot>` : ''}</table>
<p class="note">المبيعات تُنسب لمن أنشأ الفاتورة. «بالتفاوض» = الفرق بين سعر القائمة والسعر الذي بيع به. فرق الدرج = الفعلي ناقص المتوقع عند غلق الوردية.</p>`,
  });
}

/** Stock value: totals, by category, then the products shown on screen (all, or the filtered ones) */
export function stockValuationA4Html(r: StockValuation, rows: StockValuation['rows'], filterLabel: string | null, info: A4Info, fontCss = ''): string {
  const t = r.totals;
  const sum = (k: 'costValue' | 'saleValue' | 'profit') => rows.reduce((s, x) => s + x[k], 0);
  return a4Page({
    title: `قيمة المخزون ${r.asOf}`,
    docTitle: 'قيمة المخزون',
    lines: [`حتى ${esc(dayLabel(r.asOf))}`, ...(filterLabel ? [esc(filterLabel)] : [])],
    info,
    fontCss,
    body: `${boxes([
      ['القيمة بسعر التكلفة', money(t.costValue)],
      ['القيمة بسعر البيع', money(t.saleValue)],
      ['الربح المتوقع', `${money(t.profit)}<div class="sub">هامش ${pctText(t.margin)}</div>`],
      ['أصناف في المخزون', `${qty(t.products)}<div class="sub">${qty(t.outOfStock)} صنف نفد</div>`],
    ])}
${t.noCost > 0 ? `<div class="alert">${qty(t.noCost)} صنف بدون سعر تكلفة: قيمتها بالتكلفة صفر والربح المتوقع أعلى من الحقيقي.</div>` : ''}
${r.negative.length ? `<div class="alert">مخزون بالسالب (غير محسوب في القيمة): ${r.negative.map(n => `${esc(n.name)} (${qty(n.stock)})`).join('، ')}</div>` : ''}
${
  filterLabel
    ? ''
    : `<h2>حسب الفئة</h2>
<table><thead><tr><th>الفئة</th><th class="n">الأصناف</th><th class="n">القيمة بالتكلفة</th><th class="n">النسبة</th><th class="n">القيمة بسعر البيع</th><th class="n">الربح المتوقع</th></tr></thead>
<tbody>${r.categories.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${qty(c.products)}</td><td class="n"><b>${money(c.costValue)}</b></td><td class="n">${pctText(c.share)}</td><td class="n">${money(c.saleValue)}</td><td class="n">${money(c.profit)}</td></tr>`).join('')}</tbody></table>`
}
<h2>الأصناف (${qty(rows.length)})</h2>
<table><thead><tr><th>#</th><th>الصنف</th><th>الفئة</th><th class="n">الكمية</th><th class="n">التكلفة</th><th class="n">القيمة بالتكلفة</th><th class="n">سعر البيع</th><th class="n">القيمة بسعر البيع</th><th class="n">الربح المتوقع</th></tr></thead>
<tbody>${rows
      .map(
        (x, i) => `<tr><td class="num">${i + 1}</td><td>${esc(x.name)}<div class="sku num">${esc(x.sku || '')}</div></td><td>${esc(x.category?.name || 'بدون فئة')}</td>
<td class="n">${qty(x.stock)}${x.unit ? ` ${esc(x.unit)}` : ''}</td><td class="n">${x.noCost ? '<span class="tag">بدون تكلفة</span>' : money(x.cost)}</td><td class="n"><b>${money(x.costValue)}</b></td>
<td class="n">${money(x.price)}</td><td class="n">${money(x.saleValue)}</td><td class="n ${x.profit < 0 ? 'neg' : ''}">${money(x.profit)}</td></tr>`
      )
      .join('')}</tbody>
<tfoot><tr><td colspan="5">الإجمالي</td><td class="n">${money(sum('costValue'))}</td><td></td><td class="n">${money(sum('saleValue'))}</td><td class="n">${money(sum('profit'))}</td></tr></tfoot></table>
<p class="note">التكلفة = متوسط سعر الشراء الحالي لكل صنف. سعر البيع = سعر القائمة الأساسية.</p>`,
  });
}

const BUCKET_LABELS: [keyof SlowMoving['buckets'], string][] = [
  ['d30_60', '30 – 60 يوم'],
  ['d60_90', '60 – 90 يوم'],
  ['d90_180', '90 – 180 يوم'],
  ['d180plus', 'أكثر من 180 يوم'],
];

/** Slow-moving stock as a checklist for walking the shelves */
export function slowMovingA4Html(r: SlowMoving, rows: SlowMoving['rows'], filterLabel: string | null, info: A4Info, fontCss = ''): string {
  const t = r.totals;
  const buckets = BUCKET_LABELS.filter(([k]) => r.buckets[k].count > 0);
  return a4Page({
    title: `الأصناف الراكدة ${r.asOf}`,
    docTitle: 'الأصناف الراكدة',
    lines: [`لم تُبع منذ ${qty(r.days)} يوم أو أكثر`, `حتى ${esc(dayLabel(r.asOf))}`, ...(filterLabel ? [esc(filterLabel)] : [])],
    info,
    fontCss,
    body: `${boxes([
      ['القيمة المحبوسة', `${money(t.costValue)}<div class="sub">بسعر التكلفة</div>`],
      ['من قيمة المخزون كله', `${pctText(t.share)}<div class="sub">من ${money(t.stockValue)}</div>`],
      ['أصناف راكدة', qty(t.products)],
      ['لم تُبع أبداً', qty(t.neverSold)],
    ])}
${
  buckets.length
    ? `<h2>حسب المدة</h2><table><thead><tr><th>بلا بيع</th><th class="n">الأصناف</th><th class="n">القيمة بالتكلفة</th></tr></thead>
<tbody>${buckets.map(([k, l]) => `<tr><td>${l}</td><td class="n">${qty(r.buckets[k].count)}</td><td class="n">${money(r.buckets[k].costValue)}</td></tr>`).join('')}</tbody></table>`
    : ''
}
<h2>الأصناف (${qty(rows.length)})</h2>
<table><thead><tr><th>#</th><th>الصنف</th><th>الفئة</th><th class="n">الكمية</th><th class="n">القيمة بالتكلفة</th><th>آخر بيع</th><th class="n">بلا بيع</th><th>آخر شراء</th><th>✓</th></tr></thead>
<tbody>${
      rows
        .map(
          (x, i) => `<tr><td class="num">${i + 1}</td><td>${esc(x.name)}<div class="sku num">${esc(x.sku || '')}</div></td><td>${esc(x.category?.name || 'بدون فئة')}</td>
<td class="n">${qty(x.stock)}${x.unit ? ` ${esc(x.unit)}` : ''}</td><td class="n"><b>${money(x.costValue)}</b></td>
<td>${x.lastSaleAt ? esc(shopDate(x.lastSaleAt)) : '<span class="tag grey">لم يُبع أبداً</span>'}</td>
<td class="n ${x.idleDays >= 90 ? 'neg' : 'warn'}"><b>${qty(x.idleDays)}</b> يوم</td>
<td>${x.lastPurchaseAt ? esc(shopDate(x.lastPurchaseAt)) : '—'}</td><td class="box-cell"><span class="tick"></span></td></tr>`
        )
        .join('') || '<tr><td colspan="9">لا توجد أصناف راكدة</td></tr>'
    }</tbody>
${rows.length ? `<tfoot><tr><td colspan="4">الإجمالي</td><td class="n">${money(rows.reduce((s, x) => s + x.costValue, 0))}</td><td colspan="4"></td></tr></tfoot>` : ''}</table>
<p class="note">الصنف الذي لم يُبع أبداً تُحسب مدته من آخر شراء له، أو من تاريخ إضافته إن لم يُشترَ.</p>`,
  });
}
