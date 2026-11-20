import { apiClient } from "../services/apiClient";
/**
 * Send to a customer on WhatsApp: opens the chat with a ready message (the person sends it).
 */
import { isTauri } from "../services/tauriBridge";
import { normalizeDigits } from "./quantity";

/**
 * A phone number as WhatsApp wants it: digits with the country code, no "+" or leading zeros.
 * Egyptian numbers typed locally ("01012345678") get 20 in front. "" when it is not a phone number.
 */
export function whatsappNumber(raw?: string | null): string {
  let d = normalizeDigits(String(raw ?? "")).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^01[0125]\d{8}$/.test(d)) d = `2${d}`; // 010xxxxxxxx -> 2010xxxxxxxx
  else if (/^1[0125]\d{8}$/.test(d)) d = `20${d}`; // 10xxxxxxxx -> 2010xxxxxxxx
  return d.length >= 10 && d.length <= 15 ? d : "";
}

/** wa.me link: to that number, or (no number) WhatsApp asks whom to send it to */
export function whatsappLink(phone: string, text: string): string {
  const to = whatsappNumber(phone);
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/**
 * Open a link outside the app: the desktop app hands it to the system, the browser opens a tab.
 * Call it straight from the click (before any await) or the browser may block the tab.
 * false when it could not be opened.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (isTauri) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return true;
    } catch {
      return false;
    }
  }
  // "noopener" in the features makes window.open return null, so it can't tell a blocked tab apart
  const w = window.open(url, "_blank");
  if (!w) return false;
  w.opener = null;
  return true;
}

/** The page the customer opens for a quote (served by the API) */
export function quoteShareLink(token: string): string {
  const base = String(apiClient.defaults.baseURL || "").replace(/\/+$/, "");
  return `${base}/q/${token}`;
}

/** Copy text; falls back to a hidden textarea where the clipboard API is missing */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
