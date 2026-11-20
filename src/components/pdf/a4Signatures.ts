import type { SignatureSide } from "./PdfSignatures";

/** The signature areas of A4 prints, the same as PdfSignatures in the PDFs */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const A4_SIGNATURE_CSS = `
.signs { display: flex; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
.signs > div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; line-height: 1.7; }
.signs .sign-name { font-size: 12.5px; font-weight: 700; color: #0f172a; margin-top: 2px; }
.signs .sign-line { color: #475569; }
.signs bdi { unicode-bidi: isolate; }
`;

export function a4Signatures(party: SignatureSide, company: SignatureSide): string {
  const side = (s: SignatureSide) => `<div>
    <div>${esc(s.label)}</div>
    ${s.name ? `<div class="sign-name">${esc(s.name)}</div>` : ""}
    ${s.address ? `<div class="sign-line">${esc(s.address)}</div>` : ""}
    ${s.phone ? `<div class="sign-line">هاتف: <bdi dir="ltr">${esc(s.phone)}</bdi></div>` : ""}
  </div>`;
  return `<div class="signs">${side(party)}${side(company)}</div>`;
}
