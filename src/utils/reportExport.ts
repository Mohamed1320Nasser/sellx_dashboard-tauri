/**
 * Shared, reusable report export engine (PDF + Excel).
 *
 * One generic tabular exporter consumed by every report page
 * (Category Report, Customer Statement, Financial/Period reports).
 *
 * PDF: jsPDF's bundled fonts cannot shape Arabic glyphs, so we render the
 * report as off-screen RTL **HTML** (the browser shapes Arabic perfectly,
 * like the receipt HTML print path) and snapshot it to PDF via
 * html2canvas + jsPDF — both lazy-imported so they only load on export.
 *
 * Excel: ExcelJS (lazy-imported) for fully styled, banded, RTL worksheets
 * with a branded title band, header fills, borders, number formats and a
 * summary block. (The SheetJS community build cannot write cell styles.)
 */

export type ColumnAlign = "left" | "center" | "right";
export type ColumnFormat = "text" | "number" | "currency";

export interface ReportColumn<T> {
  /** Header label (shown in PDF head + Excel header row). */
  header: string;
  /** Cell accessor — returns the raw value for the row. */
  accessor: (row: T) => string | number | null | undefined;
  /** Optional alignment (defaults: numeric/currency → start side, else per-RTL). */
  align?: ColumnAlign;
  /** Value formatting for display + Excel number format. Default "text". */
  format?: ColumnFormat;
  /** Optional fixed width hint (Excel column width in chars). */
  width?: number;
}

export interface ReportSummaryRow {
  label: string;
  value: string | number;
  /** Render this summary line as emphasised (e.g. grand total). */
  emphasis?: boolean;
}

export interface ReportMeta {
  /** Document title (e.g. "تقرير الفئات"). */
  title: string;
  /** Company name — shown prominently in the header band. */
  companyName?: string;
  /** Optional subtitle (e.g. date range, extra context). */
  subtitle?: string;
  /** Optional key/value info block rendered above the table. */
  info?: ReportSummaryRow[];
  /** Optional summary block rendered below the table. */
  summary?: ReportSummaryRow[];
  /** Base filename (without extension). Defaults to the title. */
  fileName?: string;
  /** RTL layout (default true — the app is Arabic-first). */
  rtl?: boolean;
  /** Currency suffix used when formatting currency cells. Default "ج.م". */
  currencySymbol?: string;
}

// ── Brand palette (matches the dashboard primary colours) ──
const BRAND = {
  primary: "#2563eb",
  primaryDark: "#1e40af",
  headerText: "#ffffff",
  bandRow: "#eef2ff",
  zebra: "#f8fafc",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  summaryBg: "#f1f5f9",
};

function resolveFileName(meta: ReportMeta, ext: string): string {
  const base = (meta.fileName || meta.title || "report").trim();
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = base.replace(/[\\/:*?"<>|]+/g, "-");
  return `${safe}-${stamp}.${ext}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format a numeric value with thousands separators and 2 decimals. */
function formatNumberValue(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Display string for a cell, honouring its column format. */
function formatCell(
  value: string | number | null | undefined,
  format: ColumnFormat,
  currencySymbol: string
): string {
  if (value === null || value === undefined || value === "") return "";
  if (format === "currency") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(n)) return String(value);
    return `${formatNumberValue(n, 2)} ${currencySymbol}`;
  }
  if (format === "number") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(n)) return String(value);
    return formatNumberValue(n, Number.isInteger(n) ? 0 : 2);
  }
  return typeof value === "number" ? String(value) : value;
}

function resolveAlign<T>(col: ReportColumn<T>, rtl: boolean): ColumnAlign {
  if (col.align) return col.align;
  // Numbers/currency read best aligned to the "start" of an RTL row visually,
  // which is the right edge in RTL; default text follows reading direction.
  if (col.format === "currency" || col.format === "number") {
    return rtl ? "left" : "right";
  }
  return rtl ? "right" : "left";
}

/* ════════════════════════════════════════════════════════════════════════
 *  PDF  (off-screen RTL HTML → html2canvas → jsPDF)
 * ════════════════════════════════════════════════════════════════════════ */

function buildReportHtml<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  meta: ReportMeta
): HTMLElement {
  const rtl = meta.rtl !== false;
  const currency = meta.currencySymbol || "ج.م";

  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "top:-10000px",
    "left:-10000px",
    "width:1123px", // ~A4 landscape-ish working width for crisp tables
    "background:#ffffff",
    "box-sizing:border-box",
    `direction:${rtl ? "rtl" : "ltr"}`,
    "font-family:'IBM Plex Sans Arabic','Cairo','Tajawal','Arial Unicode MS',Arial,sans-serif",
    `color:${BRAND.text}`,
  ].join(";");

  // ── Branded header band ──
  const generatedAt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const headerBand = `
    <div style="background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});
                color:#fff;padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        ${
          meta.companyName
            ? `<div style="font-size:20px;font-weight:800;line-height:1.2;margin-bottom:4px">${escapeHtml(
                meta.companyName
              )}</div>`
            : ""
        }
        <h1 style="margin:0;font-size:${meta.companyName ? "18" : "26"}px;font-weight:${
    meta.companyName ? "600" : "800"
  };line-height:1.3;opacity:${meta.companyName ? ".95" : "1"}">${escapeHtml(meta.title)}</h1>
        ${
          meta.subtitle
            ? `<div style="margin-top:8px;font-size:14px;opacity:.92">${escapeHtml(meta.subtitle)}</div>`
            : ""
        }
      </div>
      <div style="text-align:${rtl ? "left" : "right"};font-size:12px;opacity:.85;line-height:1.7">
        <div style="font-size:13px;font-weight:700;letter-spacing:.5px;margin-bottom:8px;opacity:.9">SellX</div>
        <div>تاريخ الإصدار</div>
        <div style="font-weight:700">${escapeHtml(generatedAt)}</div>
      </div>
    </div>`;

  // ── Info chips ──
  const infoHtml =
    meta.info && meta.info.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:10px;padding:18px 36px 4px">${meta.info
          .map(
            (i) =>
              `<div style="background:${BRAND.bandRow};border:1px solid ${BRAND.border};
                          border-radius:10px;padding:8px 14px;font-size:12.5px">
                 <span style="color:${BRAND.muted}">${escapeHtml(i.label)}:</span>
                 <strong style="margin-${rtl ? "right" : "left"}:6px">${escapeHtml(
                String(i.value)
              )}</strong>
               </div>`
          )
          .join("")}</div>`
      : "";

  // ── Table ──
  const headHtml = columns
    .map(
      (c) =>
        `<th style="background:${BRAND.primary};color:${BRAND.headerText};font-weight:700;
                    padding:12px 14px;text-align:${resolveAlign(c, rtl)};font-size:13px;
                    border-${rtl ? "left" : "right"}:1px solid ${BRAND.primaryDark};
                    white-space:nowrap">${escapeHtml(c.header)}</th>`
    )
    .join("");

  const bodyHtml = rows
    .map(
      (row, idx) =>
        `<tr style="background:${idx % 2 ? BRAND.zebra : "#ffffff"}">${columns
          .map((c) => {
            const display = formatCell(c.accessor(row), c.format || "text", currency);
            const isMoney = c.format === "currency";
            return `<td style="padding:10px 14px;text-align:${resolveAlign(c, rtl)};
                        font-size:12.5px;border-bottom:1px solid ${BRAND.border};
                        color:${BRAND.text};${isMoney ? "font-variant-numeric:tabular-nums;font-weight:600" : ""}">${escapeHtml(
              display
            )}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  const tableHtml = `
    <div style="padding:14px 36px 0">
      <table style="width:100%;border-collapse:collapse;border:1px solid ${BRAND.border};
                    border-radius:12px;overflow:hidden">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>`;

  // ── Summary card ──
  const summaryHtml =
    meta.summary && meta.summary.length > 0
      ? `<div style="padding:22px 36px 8px;display:flex;justify-content:${
          rtl ? "flex-start" : "flex-end"
        }">
           <div style="min-width:320px;background:${BRAND.summaryBg};border:1px solid ${BRAND.border};
                       border-radius:12px;padding:16px 20px">
             ${meta.summary
               .map(
                 (s) =>
                   `<div style="display:flex;justify-content:space-between;gap:24px;
                               padding:7px 0;${
                                 s.emphasis
                                   ? `border-top:2px solid ${BRAND.primary};margin-top:6px;padding-top:12px`
                                   : ""
                               }">
                      <span style="color:${BRAND.muted};font-size:${s.emphasis ? "14" : "13"}px;${
                     s.emphasis ? "font-weight:700;color:" + BRAND.text : ""
                   }">${escapeHtml(s.label)}</span>
                      <strong style="font-size:${s.emphasis ? "16" : "14"}px;color:${
                     s.emphasis ? BRAND.primary : BRAND.text
                   };font-variant-numeric:tabular-nums">${escapeHtml(String(s.value))}</strong>
                    </div>`
               )
               .join("")}
           </div>
         </div>`
      : "";

  // ── Footer ──
  const footerHtml = `
    <div style="padding:18px 36px 28px;margin-top:8px;border-top:1px solid ${BRAND.border};
                display:flex;justify-content:space-between;font-size:11px;color:${BRAND.muted}">
      <span>تم الإنشاء بواسطة نظام SellX لإدارة نقاط البيع</span>
      <span>${escapeHtml(meta.title)}</span>
    </div>`;

  container.innerHTML = headerBand + infoHtml + tableHtml + summaryHtml + footerHtml;
  return container;
}

/**
 * Export a tabular report to a polished, branded A4 PDF (downloads the file).
 */
export async function exportReportToPdf<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  meta: ReportMeta
): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const node = buildReportHtml(rows, columns, meta);
  document.body.appendChild(node);

  try {
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    // Choose orientation by aspect ratio so wide tables get landscape.
    const landscape = columns.length > 6;
    const pdf = new jsPDF(landscape ? "l" : "p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    pdf.save(resolveFileName(meta, "pdf"));
  } finally {
    document.body.removeChild(node);
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  EXCEL  (ExcelJS — fully styled, RTL, banded)
 * ════════════════════════════════════════════════════════════════════════ */

const ARGB = {
  primary: "FF2563EB",
  primaryDark: "FF1E40AF",
  headerText: "FFFFFFFF",
  zebra: "FFF8FAFC",
  band: "FFEEF2FF",
  summaryBg: "FFF1F5F9",
  border: "FFE5E7EB",
  text: "FF111827",
  muted: "FF6B7280",
};

export async function exportReportToExcel<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  meta: ReportMeta
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const rtl = meta.rtl !== false;
  const currency = meta.currencySymbol || "ج.م";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SellX";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Report", {
    views: [{ rightToLeft: rtl, showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });

  const colCount = columns.length;
  const lastColLetter = (n: number) => {
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const lastCol = lastColLetter(colCount);

  let r = 1;

  // ── Company name band ──
  if (meta.companyName) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const companyCell = ws.getCell(`A${r}`);
    companyCell.value = meta.companyName;
    companyCell.font = { name: "Arial", size: 16, bold: true, color: { argb: ARGB.headerText } };
    companyCell.alignment = { vertical: "middle", horizontal: rtl ? "right" : "left", indent: 1 };
    companyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.primary } };
    ws.getRow(r).height = 30;
    r++;
  }

  // ── Title band ──
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = meta.title;
  titleCell.font = {
    name: "Arial",
    size: meta.companyName ? 13 : 18,
    bold: true,
    color: { argb: ARGB.headerText },
  };
  titleCell.alignment = { vertical: "middle", horizontal: rtl ? "right" : "left", indent: 1 };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: meta.companyName ? ARGB.primaryDark : ARGB.primary },
  };
  ws.getRow(r).height = meta.companyName ? 26 : 34;
  r++;

  // ── Subtitle band ──
  if (meta.subtitle) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const sub = ws.getCell(`A${r}`);
    sub.value = meta.subtitle;
    sub.font = { name: "Arial", size: 11, color: { argb: ARGB.headerText } };
    sub.alignment = { vertical: "middle", horizontal: rtl ? "right" : "left", indent: 1 };
    sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.primaryDark } };
    ws.getRow(r).height = 22;
    r++;
  }

  // Generated-at line
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const gen = ws.getCell(`A${r}`);
  gen.value = `تاريخ الإصدار: ${new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date())}`;
  gen.font = { name: "Arial", size: 9, italic: true, color: { argb: ARGB.muted } };
  gen.alignment = { horizontal: rtl ? "right" : "left", indent: 1 };
  r++;

  // ── Info rows ──
  if (meta.info && meta.info.length > 0) {
    r++; // spacer
    for (const item of meta.info) {
      const labelCell = ws.getCell(`A${r}`);
      labelCell.value = item.label;
      labelCell.font = { name: "Arial", size: 10, bold: true, color: { argb: ARGB.muted } };
      labelCell.alignment = { horizontal: rtl ? "right" : "left", indent: 1 };
      const valCell = ws.getCell(`B${r}`);
      valCell.value = item.value;
      valCell.font = { name: "Arial", size: 10, color: { argb: ARGB.text } };
      valCell.alignment = { horizontal: rtl ? "right" : "left" };
      r++;
    }
  }

  r++; // spacer before table

  // ── Header row ──
  const headerRowIdx = r;
  const headerRow = ws.getRow(r);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: ARGB.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.primary } };
    cell.alignment = {
      vertical: "middle",
      horizontal: resolveAlign(c, rtl) === "right" ? "right" : resolveAlign(c, rtl) === "center" ? "center" : "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: ARGB.primaryDark } },
      bottom: { style: "thin", color: { argb: ARGB.primaryDark } },
      left: { style: "thin", color: { argb: ARGB.primaryDark } },
      right: { style: "thin", color: { argb: ARGB.primaryDark } },
    };
  });
  headerRow.height = 26;
  r++;

  // ── Data rows ──
  for (let i = 0; i < rows.length; i++) {
    const row = ws.getRow(r);
    const zebra = i % 2 === 1;
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const raw = c.accessor(rows[i]);
      const fmt = c.format || "text";

      if (fmt === "currency" || fmt === "number") {
        const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
        cell.value = isNaN(n) ? (raw ?? "") : n;
        cell.numFmt = fmt === "currency" ? `#,##0.00 "${currency}"` : "#,##0.##";
      } else {
        cell.value = raw === null || raw === undefined ? "" : raw;
      }

      cell.font = { name: "Arial", size: 10, color: { argb: ARGB.text } };
      cell.alignment = {
        horizontal:
          resolveAlign(c, rtl) === "right" ? "right" : resolveAlign(c, rtl) === "center" ? "center" : "left",
        vertical: "middle",
      };
      if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.zebra } };
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: ARGB.border } },
      };
    });
    row.height = 20;
    r++;
  }

  // ── Column widths ──
  columns.forEach((c, i) => {
    const headerLen = c.header.length;
    const sampleLen = Math.max(
      ...rows.slice(0, 50).map((row) => String(c.accessor(row) ?? "").length),
      0
    );
    ws.getColumn(i + 1).width = c.width ?? Math.min(40, Math.max(12, Math.max(headerLen, sampleLen) + 4));
  });

  // ── Summary block ──
  if (meta.summary && meta.summary.length > 0) {
    r++; // spacer
    for (const item of meta.summary) {
      const labelCell = ws.getCell(`A${r}`);
      labelCell.value = item.label;
      labelCell.font = {
        name: "Arial",
        size: item.emphasis ? 12 : 10,
        bold: true,
        color: { argb: item.emphasis ? ARGB.text : ARGB.muted },
      };
      labelCell.alignment = { horizontal: rtl ? "right" : "left", indent: 1 };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.summaryBg } };

      const valCell = ws.getCell(`B${r}`);
      valCell.value = item.value;
      valCell.font = {
        name: "Arial",
        size: item.emphasis ? 12 : 10,
        bold: true,
        color: { argb: item.emphasis ? ARGB.primary : ARGB.text },
      };
      valCell.alignment = { horizontal: rtl ? "right" : "left" };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.summaryBg } };
      r++;
    }
  }

  // Freeze the header row so it stays visible while scrolling
  ws.views = [{ rightToLeft: rtl, showGridLines: false, state: "frozen", ySplit: headerRowIdx }];

  // ── Download ──
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = resolveFileName(meta, "xlsx");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
