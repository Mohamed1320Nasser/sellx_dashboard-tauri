import { useSessionAuthStore } from '../../stores/sessionAuthStore';
import { loadCompanyProfile } from '../../services/companyProfile';

/** Shared pieces of the A4 report prints: same look as the end-of-day report and the statements */

export const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const amount = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
export const money = (n: number) => `<span class="num">${n < 0 ? '-' : ''}${amount(n)}</span>`;
export const qty = (n: number) => `<span class="num">${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n)}</span>`;
export const pctText = (n: number | null | undefined) => (n == null ? '—' : `<span class="num">${n.toFixed(1)}%</span>`);

export interface A4Info {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  printedBy?: string;
}

/** The shop's name, address, logo and who is printing, for the page header and footer */
export async function loadA4Info(fallbackName?: string): Promise<A4Info> {
  const profile: any = await loadCompanyProfile();
  const user: any = (useSessionAuthStore.getState() as any).user;
  return {
    companyName: profile?.name || fallbackName || '',
    companyAddress: profile?.address,
    companyPhone: profile?.phone,
    companyLogoUrl: profile?.logoUrl,
    printedBy: user?.fullname,
  };
}

/** Summary boxes under the header: [label, value html] */
export const boxes = (items: [string, string][]) =>
  `<div class="boxes" style="grid-template-columns: repeat(${items.length}, 1fr)">${items.map(([l, v]) => `<div class="box"><div class="lbl">${esc(l)}</div>${v}</div>`).join('')}</div>`;

/** The whole page: header with logo and document title, the body, then the footer */
export function a4Page(o: { title: string; docTitle: string; lines: string[]; body: string; info: A4Info; fontCss?: string; css?: string }): string {
  const now = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date());
  const { info } = o;
  const logo = info.companyLogoUrl
    ? `<img class="logo" src="${esc(info.companyLogoUrl)}" alt="">`
    : `<div class="logo-fallback">${esc((info.companyName || 'S').trim().charAt(0))}</div>`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${esc(o.title)}</title>
<style>
${o.fontCss || ''}
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
.boxes { display: grid; gap: 8px; margin-top: 12px; }
.box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-weight: 700; }
.box .lbl { color: #64748b; font-size: 10px; font-weight: 600; margin-bottom: 2px; }
.box .sub { color: #64748b; font-size: 9.5px; font-weight: 500; margin-top: 2px; }
h2 { font-size: 12.5px; margin: 16px 0 6px; }
table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: #f1f5f9; color: #475569; font-size: 10px; font-weight: 700; text-align: right; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
td.n, th.n { text-align: left; }
tfoot td { font-weight: 700; background: #f8fafc; border-top: 1px solid #cbd5e1; }
.sku, .muted { color: #94a3b8; font-size: 9.5px; }
.sub { color: #64748b; font-size: 9.5px; }
.neg { color: #b91c1c; }
.pos { color: #047857; }
.warn { color: #b45309; }
.tag { display: inline-block; font-size: 9px; font-weight: 700; padding: 0 5px; border-radius: 4px; background: #fef3c7; color: #92400e; }
.tag.out { background: #fee2e2; color: #b91c1c; }
.tag.grey { background: #f1f5f9; color: #475569; }
.note { margin-top: 8px; color: #64748b; font-size: 9.5px; }
.alert { margin-top: 10px; padding: 7px 10px; border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px; color: #92400e; font-size: 10.5px; }
.box-cell { width: 26px; }
.tick { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #94a3b8; border-radius: 3px; }
.foot { margin-top: 18px; color: #94a3b8; font-size: 9.5px; display: flex; justify-content: space-between; }
${o.css || ''}
</style></head><body>
<div class="head">
  <div class="brand">${logo}<div><div class="company">${esc(info.companyName)}</div>
  ${info.companyAddress ? `<div class="line">${esc(info.companyAddress)}</div>` : ''}${info.companyPhone ? `<div class="line num">${esc(info.companyPhone)}</div>` : ''}</div></div>
  <div class="doc"><div class="doc-title">${esc(o.docTitle)}</div>${o.lines.map(l => `<div class="line">${l}</div>`).join('')}</div>
</div>
${o.body}
<div class="foot"><span>${info.printedBy ? `طبعه ${esc(info.printedBy)} · ` : ''}<span class="num">${esc(now)}</span></span><span>SellX</span></div>
</body></html>`;
}
