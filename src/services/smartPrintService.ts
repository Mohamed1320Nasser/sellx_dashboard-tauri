/**
 * Smart Print Service — Barcode routing
 *
 * Barcode printing uses the **native TSPL path** (direct USB on macOS/Linux
 * via libusb, raw winspool on Windows). This produces crisp labels on
 * sticky-backed label rolls (35×25mm) when the printer is in TSPL mode.
 *
 * Prerequisites the user must satisfy (otherwise a clear Arabic error is shown):
 *   1. Printer firmware set to TSPL mode (not ESC/POS)
 *   2. Sticky label roll loaded
 *   3. Settings → Printers → USB tab → "Detect USB Devices" picked the printer
 *      (this populates useNativeUsb + usbVendorId + usbProductId in the config)
 *
 * Receipt printing is NOT handled here — receipts use the ESC/POS raster
 * pipeline via printService.ts and work with the printer in ESC/POS mode.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauriBridge';
import { usePrinterConfigStore } from '../stores/printerConfigStore';

export interface BarcodeData {
  barcode: string;
  productName?: string;
  price?: number;
  quantity?: number;
}

/**
 * Print a barcode label via the native TSPL pipeline.
 * Fails loudly if the USB is not configured (no silent ESC/POS fallback —
 * a silent fallback would print garbage on label paper and look like success).
 */
export async function printBarcode(data: BarcodeData, quantity: number = 1): Promise<void> {
  if (!isTauri) {
    throw new Error('طباعة الباركود متاحة فقط في تطبيق سطح المكتب');
  }

  const printerConfig = usePrinterConfigStore.getState();
  const vidHex = printerConfig.usbVendorId;
  const pidHex = printerConfig.usbProductId;
  const assignedBarcodePrinter = printerConfig.getPrinterForType('barcode');

  if (!printerConfig.useNativeUsb || !vidHex || !pidHex) {
    throw new Error(
      'لم يتم إعداد طابعة الباركود عبر USB.\n' +
      'افتح الإعدادات → الطابعات → USB → اضغط "كشف أجهزة USB" ثم اختر طابعة الباركود.\n' +
      'تأكد أن الطابعة في وضع TSPL وأن ورق اللاصق محمّل.'
    );
  }

  const vendorId = parseInt(vidHex, 16);
  const productId = parseInt(pidHex, 16);
  if (Number.isNaN(vendorId) || Number.isNaN(productId)) {
    throw new Error('معرّف USB غير صالح. أعد كشف أجهزة USB من الإعدادات.');
  }

  for (let i = 0; i < quantity; i++) {
    await printBarcodeViaUSB(data, vendorId, productId, assignedBarcodePrinter || null);
  }
}

async function printBarcodeViaUSB(
  data: BarcodeData,
  vendorId: number,
  productId: number,
  printerName: string | null
): Promise<void> {
  try {
    console.log('========================================');
    console.log('[SmartPrint] 🖨️ TSPL Barcode Print');
    console.log('[SmartPrint] Platform:', navigator.userAgent.includes('Windows') ? 'Windows' : 'macOS/Linux');
    console.log('[SmartPrint] VID/PID:', vendorId.toString(16), '/', productId.toString(16));
    console.log('[SmartPrint] Printer Name:', printerName || '(none — macOS/Linux uses VID/PID)');
    console.log('[SmartPrint] Barcode:', data.barcode);
    console.log('[SmartPrint] Product:', data.productName || '(none)');
    console.log('========================================');

    const result = await invoke<string>('print_barcode_native', {
      barcodeValue: data.barcode,
      productName: data.productName || null,
      printerName,
      vendorId,
      productId,
    });

    console.log('[SmartPrint] ✅ SUCCESS:', result);
  } catch (error: any) {
    console.error('[SmartPrint] ❌ Barcode print failed:', error);
    throw new Error(`فشل طباعة الباركود: ${error}`);
  }
}
