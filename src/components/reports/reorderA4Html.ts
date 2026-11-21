import type { Reorder } from '../../services/reportService';
import { dayLabel } from './reportDates';
import { a4Page, esc, money, qty, type A4Info } from './a4Report';

/** The purchase list as A4 pages: one section per supplier, ready to send or take to the market */
export function reorderA4Html(r: Reorder, groups: Reorder['groups'], info: A4Info, fontCss = ''): string {
  const total = groups.reduce((s, g) => s + g.total, 0);
  const section = (g: Reorder['groups'][number]) => `
<section class="group">
  <div class="g-head"><span class="g-name">${esc(g.supplier?.name || 'بدون مورد سابق')}</span>${g.supplier?.phone ? `<span class="g-phone num">${esc(g.supplier.phone)}</span>` : ''}<span class="g-total">التكلفة التقريبية ${money(g.total)}</span></div>
  <table><thead><tr><th>#</th><th>الصنف</th><th class="n">المتاح</th><th class="n">مبيعات 30 يوم</th><th class="n">المطلوب</th><th class="n">آخر سعر</th><th class="n">التكلفة</th><th>✓</th></tr></thead>
  <tbody>${g.items
    .map(
      (it, i) => `<tr><td class="num">${i + 1}</td><td>${esc(it.name)}${it.urgency === 'out' ? ' <span class="tag out">نفد</span>' : it.urgency === 'urgent' ? ' <span class="tag">عاجل</span>' : ''}<div class="sku num">${esc(it.sku || '')}</div></td>
<td class="n">${qty(it.stock)}</td><td class="n">${qty(it.sold30)}</td>
<td class="n"><b>${qty(it.suggested)}</b>${it.unit ? ` ${esc(it.unit)}` : ''}${it.inPacks ? `<div class="sub">= ${qty(it.inPacks.count)} ${esc(it.inPacks.name)}</div>` : ''}</td>
<td class="n">${money(it.lastCost ?? it.cost)}</td><td class="n">${money(it.estimatedCost)}</td><td class="box-cell"><span class="tick"></span></td></tr>`
    )
    .join('')}</tbody></table>
</section>`;

  return a4Page({
    title: `قائمة الشراء ${r.asOf}`,
    docTitle: 'قائمة الشراء',
    lines: [esc(dayLabel(r.asOf)), `تكفي مبيعات ${qty(r.coverDays)} يوم`],
    info,
    fontCss,
    css: `.group { margin-top: 16px; page-break-inside: auto; }
.g-head { display: flex; gap: 12px; align-items: baseline; padding: 7px 10px; background: #ecfdf5; border-radius: 8px 8px 0 0; border: 1px solid #a7f3d0; border-bottom: 0; }
.g-name { font-weight: 700; font-size: 13px; }
.g-phone { color: #475569; }
.g-total { margin-right: auto; font-weight: 700; }
.grand { margin-top: 14px; display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; }`,
    body: `${groups.map(section).join('')}
${groups.length > 1 ? `<div class="grand"><span>الإجمالي التقريبي (${qty(groups.reduce((s, g) => s + g.items.length, 0))} صنف)</span><span>${money(total)}</span></div>` : ''}
<p class="note">الكمية المطلوبة تكفي مبيعات آخر 30 يوم لمدة ${qty(r.coverDays)} يوم، ولا تقل عن حد التنبيه. التكلفة تقريبية بآخر سعر شراء.</p>`,
  });
}
