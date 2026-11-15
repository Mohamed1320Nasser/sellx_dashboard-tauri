/**
 * Smart Print Service — Barcode routing
 *
 * Barcode printing uses the **native TSPL path** (direct USB on macOS/Linux
 * via libusb, raw winspool on Windows). Labels on sticky 35×25mm rolls.
 *
 * Arabic text (company + product names) is pre-rendered in the app as 1-bit
 * bitmaps (HTML5 canvas with full shaping) and sent to the printer via the
 * TSPL BITMAP command. Latin/ASCII text can keep using the native TSPL TEXT
 * command for speed. This sidesteps the fact that TSPL printer firmware has
 * no Arabic fonts and no shaping engine.
 *
 * Layout on the 35×25mm label (280×200 dots at 203 DPI):
 *   [company name]     Y≈5,  small font  — brand identity
 *   [product name]     Y≈30, larger font — the actual product
 *   [barcode]          Y≈70, CODE128     — centered horizontally
 *   [SKU digits]       under barcode     — auto (readable=1)
 *
 * Prerequisites the user must satisfy:
 *   1. Printer firmware set to TSPL mode (not ESC/POS)
 *   2. Sticky label roll loaded (35×25mm)
 *   3. Settings → Printers → USB → "Detect USB Devices" picked the printer
 *
 * Receipt printing is NOT handled here — receipts go through printService.ts.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauriBridge';
import { usePrinterConfigStore } from '../stores/printerConfigStore';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { ensurePrinterMode } from './printerModeService';

export interface BarcodeData {
  barcode: string;
  productName?: string;
  price?: number;
  quantity?: number;
}

// ─── Tunable layout constants (all in printer dots at 203 DPI) ───────────────
const LABEL_WIDTH_DOTS = 280; // 35mm × 8 dots/mm
const COMPANY_MAX_WIDTH_DOTS = 260;
const COMPANY_MAX_HEIGHT_DOTS = 24;
const NAME_MAX_WIDTH_DOTS = 260;
const NAME_MAX_HEIGHT_DOTS = 36;
const COMPANY_FONT_PX_START = 16;
const COMPANY_FONT_PX_MIN = 11;
const NAME_FONT_PX_START = 24;
const NAME_FONT_PX_MIN = 14;
const FONT_FAMILY =
  "'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Arial Unicode MS', Arial, sans-serif";

/**
 * Print a barcode label via the native TSPL pipeline.
 * Fails loudly if the USB is not configured.
 */
export async function printBarcode(data: BarcodeData, quantity: number = 1): Promise<void> {
  if (!isTauri) {
    throw new Error('طباعة الباركود متاحة فقط في تطبيق سطح المكتب');
  }

  const printerConfig = usePrinterConfigStore.getState();
  const vidHex = printerConfig.usbVendorId;
  const pidHex = printerConfig.usbProductId;
  const assignedBarcodePrinter = printerConfig.getPrinterForType('barcode');

  // Windows prints via the OS spooler (winspool RAW) by printer name — VID/PID
  // is a macOS/Linux-only concept (direct libusb). See print_barcode_native's
  // #[cfg(target_os = "windows")] branch in src-tauri/src/lib.rs.
  const isWindows = typeof window !== 'undefined' && navigator.userAgent.includes('Windows');

  if (isWindows) {
    if (!assignedBarcodePrinter) {
      throw new Error(
        'لم يتم إعداد طابعة الباركود.\n' +
        'افتح الإعدادات → الطابعات → اختر طابعة الباركود من قائمة الطابعات.\n' +
        'تأكد أن الطابعة في وضع TSPL وأن ورق اللاصق محمّل.'
      );
    }
  } else if (!printerConfig.useNativeUsb || !vidHex || !pidHex) {
    throw new Error(
      'لم يتم إعداد طابعة الباركود عبر USB.\n' +
      'افتح الإعدادات → الطابعات → USB → اضغط "كشف أجهزة USB" ثم اختر طابعة الباركود.\n' +
      'تأكد أن الطابعة في وضع TSPL وأن ورق اللاصق محمّل.'
    );
  }

  // A printer shared with receipts may need switching to label mode first
  await ensurePrinterMode('label');

  const vendorId = vidHex ? parseInt(vidHex, 16) : 0;
  const productId = pidHex ? parseInt(pidHex, 16) : 0;
  if (!isWindows && (Number.isNaN(vendorId) || Number.isNaN(productId))) {
    throw new Error('معرّف USB غير صالح. أعد كشف أجهزة USB من الإعدادات.');
  }

  // Auto-pull company name from the session store — no UI config needed.
  const sessionCompany = useSessionAuthStore.getState().company;
  const companyName =
    (sessionCompany?.name as string | undefined) ||
    (sessionCompany?.company?.name as string | undefined) ||
    '';

  // If company or product name is Arabic, pre-render to bitmap. Latin-only
  // strings can keep using TSPL TEXT on the printer (faster, less data).
  const rawName = (data.productName || '').trim();
  const trimmedCompany = companyName.trim();

  const companyBitmap =
    trimmedCompany && containsArabic(trimmedCompany)
      ? renderTextBitmap(
          trimmedCompany,
          COMPANY_MAX_WIDTH_DOTS,
          COMPANY_MAX_HEIGHT_DOTS,
          COMPANY_FONT_PX_START,
          COMPANY_FONT_PX_MIN,
        )
      : null;

  const nameBitmap =
    rawName && containsArabic(rawName)
      ? renderTextBitmap(
          rawName,
          NAME_MAX_WIDTH_DOTS,
          NAME_MAX_HEIGHT_DOTS,
          NAME_FONT_PX_START,
          NAME_FONT_PX_MIN,
        )
      : null;

  for (let i = 0; i < quantity; i++) {
    await printBarcodeViaUSB(
      data,
      vendorId,
      productId,
      assignedBarcodePrinter || null,
      trimmedCompany || null,
      companyBitmap,
      nameBitmap,
    );
  }
}

async function printBarcodeViaUSB(
  data: BarcodeData,
  vendorId: number,
  productId: number,
  printerName: string | null,
  companyName: string | null,
  companyBitmap: RenderedBitmap | null,
  nameBitmap: RenderedBitmap | null,
): Promise<void> {
  try {
    console.log('========================================');
    console.log('[SmartPrint] 🖨️ TSPL Barcode Print');
    console.log('[SmartPrint] Platform:', navigator.userAgent.includes('Windows') ? 'Windows' : 'macOS/Linux');
    console.log('[SmartPrint] VID/PID:', vendorId.toString(16), '/', productId.toString(16));
    console.log('[SmartPrint] Printer Name:', printerName || '(none — macOS/Linux uses VID/PID)');
    console.log('[SmartPrint] Company:', companyName || '(none)');
    console.log('[SmartPrint] Barcode:', data.barcode);
    console.log('[SmartPrint] Product:', data.productName || '(none)');
    if (companyBitmap) {
      console.log('[SmartPrint] Company bitmap:', `${companyBitmap.widthPx}×${companyBitmap.heightPx}px`);
    }
    if (nameBitmap) {
      console.log('[SmartPrint] Name bitmap:', `${nameBitmap.widthPx}×${nameBitmap.heightPx}px`);
    }
    console.log('========================================');

    const result = await invoke<string>('print_barcode_native', {
      barcodeValue: data.barcode,
      productName: data.productName || null,
      companyName,
      printerName,
      vendorId,
      productId,
      // Product-name bitmap (optional, Arabic only)
      nameBitmapB64: nameBitmap ? nameBitmap.b64 : null,
      nameBitmapWidthBytes: nameBitmap ? nameBitmap.widthBytes : null,
      nameBitmapHeightDots: nameBitmap ? nameBitmap.heightPx : null,
      // Company-name bitmap (optional, Arabic only)
      companyBitmapB64: companyBitmap ? companyBitmap.b64 : null,
      companyBitmapWidthBytes: companyBitmap ? companyBitmap.widthBytes : null,
      companyBitmapHeightDots: companyBitmap ? companyBitmap.heightPx : null,
    });

    console.log('[SmartPrint] ✅ SUCCESS:', result);
  } catch (error: any) {
    console.error('[SmartPrint] ❌ Barcode print failed:', error);
    throw new Error(`فشل طباعة الباركود: ${error}`);
  }
}

// ─── Arabic / RTL text → 1-bit bitmap ────────────────────────────────────────

interface RenderedBitmap {
  b64: string;         // base64 of raw 1-bit MSB-first pixel bytes
  widthPx: number;     // actual rendered width in pixels
  widthBytes: number;  // ceil(widthPx / 8) — what TSPL BITMAP expects
  heightPx: number;
}

function containsArabic(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
}

/**
 * Render any string (Arabic, mixed, or Latin) into a printer-ready 1-bit
 * bitmap. Auto-scales the font size down until the text fits; truncates with
 * "…" if still too wide at the minimum size. The canvas handles Arabic
 * shaping natively via the browser's text rendering.
 */
function renderTextBitmap(
  text: string,
  maxWidthDots: number,
  maxHeightDots: number,
  fontPxStart: number,
  fontPxMin: number,
): RenderedBitmap {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable — cannot render barcode label text.');
  }

  let fontPx = fontPxStart;
  let displayText = text;

  // Auto-shrink font until it fits.
  while (fontPx >= fontPxMin) {
    ctx.font = `bold ${fontPx}px ${FONT_FAMILY}`;
    if (ctx.measureText(displayText).width <= maxWidthDots - 4) break;
    fontPx -= 2;
  }

  // If still too wide at min size, truncate with ellipsis.
  ctx.font = `bold ${fontPx}px ${FONT_FAMILY}`;
  if (ctx.measureText(displayText).width > maxWidthDots - 4) {
    while (displayText.length > 1) {
      const truncated = displayText.slice(0, -1) + '…';
      if (ctx.measureText(truncated).width <= maxWidthDots - 4) {
        displayText = truncated;
        break;
      }
      displayText = displayText.slice(0, -1);
    }
  }

  const metrics = ctx.measureText(displayText);
  const widthPx = Math.min(maxWidthDots, Math.ceil(metrics.width + 4));
  const heightPx = Math.min(
    maxHeightDots,
    Math.ceil(
      (metrics.actualBoundingBoxAscent || fontPx * 0.8) +
        (metrics.actualBoundingBoxDescent || fontPx * 0.25) +
        4,
    ),
  );

  canvas.width = widthPx;
  canvas.height = heightPx;

  // Resizing canvas resets context state — re-apply.
  ctx.font = `bold ${fontPx}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = '#000000';
  ctx.fillText(displayText, widthPx / 2, heightPx / 2);

  // RGBA → 1-bit MSB-first bytes (1 = black, matches TSPL BITMAP mode 0).
  const imgData = ctx.getImageData(0, 0, widthPx, heightPx);
  const widthBytes = Math.ceil(widthPx / 8);
  const bytes = new Uint8Array(widthBytes * heightPx);

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const i = (y * widthPx + x) * 4;
      const r = imgData.data[i];
      const g = imgData.data[i + 1];
      const b = imgData.data[i + 2];
      const a = imgData.data[i + 3];
      const luma = (r + g + b) / 3;
      if (a > 128 && luma < 128) {
        const byteIdx = y * widthBytes + (x >> 3);
        bytes[byteIdx] |= 1 << (7 - (x & 7));
      }
    }
  }

  return {
    b64: uint8ToBase64(bytes),
    widthPx,
    widthBytes,
    heightPx,
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}
