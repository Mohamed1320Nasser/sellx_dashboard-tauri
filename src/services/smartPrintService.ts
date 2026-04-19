/**
 * Smart Print Service
 *
 * Automatically routes print jobs to the correct printer using the appropriate method:
 * - Native USB (TSPL) for barcode printers with useNativeUsb enabled
 * - Traditional ESC/POS (HTML → Image) for receipt printers
 *
 * This service works with the printer assignment system to ensure
 * documents are printed on the correct printer with the optimal method.
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

export interface ReceiptData {
  html: string;
}

/**
 * Print a barcode label
 * Automatically uses the assigned barcode printer and optimal print method
 */
export async function printBarcode(data: BarcodeData, quantity: number = 1): Promise<void> {
  if (!isTauri) {
    throw new Error('طباعة الباركود متاحة فقط في تطبيق سطح المكتب');
  }

  // Get printer configuration
  const printerConfig = usePrinterConfigStore.getState();

  // Get assigned barcode printer from settings
  const barcodePrinter = printerConfig.getPrinterForType('barcode');

  // Check if this printer should use native USB printing
  if (printerConfig.useNativeUsb && printerConfig.usbVendorId && printerConfig.usbProductId) {
    // Print multiple copies if needed
    for (let i = 0; i < quantity; i++) {
      await printBarcodeViaUSB(data, printerConfig);
    }
  } else if (barcodePrinter) {
    // Print multiple copies using ESC/POS
    for (let i = 0; i < quantity; i++) {
      await printBarcodeViaESCPOS(data, barcodePrinter);
    }
  } else {
    throw new Error('لم يتم تعيين طابعة الباركود. الرجاء تكوين الطابعة في الإعدادات');
  }
}

/**
 * Print barcode using native USB (TSPL commands)
 * This is the preferred method for barcode label printers
 */
async function printBarcodeViaUSB(
  data: BarcodeData,
  config: { usbVendorId: string; usbProductId: string }
): Promise<void> {
  try {
    // Convert hex string to number (e.g., "0x1FC9" → 8137)
    const vendorId = parseInt(config.usbVendorId, 16);
    const productId = parseInt(config.usbProductId, 16);

    // Get assigned barcode printer name (needed for Windows Raw Printing API)
    const printerConfig = usePrinterConfigStore.getState();
    const barcodePrinterName = printerConfig.getPrinterForType('barcode');

    console.log('========================================');
    console.log('[SmartPrint] 🖨️ Native USB Barcode Print Request');
    console.log('[SmartPrint] Platform:', navigator.userAgent.includes('Windows') ? 'Windows' : 'macOS/Linux');
    console.log('[SmartPrint] VID:', config.usbVendorId, '→', vendorId);
    console.log('[SmartPrint] PID:', config.usbProductId, '→', productId);
    console.log('[SmartPrint] Printer Name:', barcodePrinterName || '⚠️ NULL (will use default)');
    console.log('[SmartPrint] Barcode:', data.barcode);
    console.log('[SmartPrint] Product:', data.productName || '(none)');
    console.log('========================================');

    const result = await invoke<string>('print_barcode_native', {
      barcodeValue: data.barcode,
      productName: data.productName || null,
      printerName: barcodePrinterName || null,  // Windows: printer name; macOS/Linux: ignored
      vendorId: vendorId,
      productId: productId,
    });

    console.log('[SmartPrint] ✅ SUCCESS:', result);
    console.log('[SmartPrint] Print job completed successfully');
  } catch (error: any) {
    console.error('========================================');
    console.error('[SmartPrint] ❌ PRINT FAILED');
    console.error('[SmartPrint] Error:', error);
    console.error('[SmartPrint] Error type:', typeof error);
    console.error('[SmartPrint] Error string:', String(error));
    console.error('========================================');
    throw new Error(`فشل الطباعة عبر USB: ${error}`);
  }
}

/**
 * Print barcode using traditional ESC/POS method (HTML → Image → Raster)
 * Fallback method for printers without native USB support
 */
async function printBarcodeViaESCPOS(
  data: BarcodeData,
  printerName: string
): Promise<void> {
  try {
    console.log('[SmartPrint] Using ESC/POS printing (HTML method)');
    console.log('[SmartPrint] Printer:', printerName);
    console.log('[SmartPrint] Barcode:', data.barcode);

    // Generate HTML for barcode label
    const html = generateBarcodeHTML(data);

    // Use existing print_receipt command (works for both receipts and barcodes)
    const result = await invoke<string>('print_receipt', {
      printerName: printerName,
      html: html,
    });

    console.log('[SmartPrint] ✅', result);
  } catch (error: any) {
    console.error('[SmartPrint] ❌ ESC/POS print failed:', error);
    throw new Error(`فشل الطباعة: ${error}`);
  }
}

/**
 * Generate HTML for barcode label (used by ESC/POS method)
 */
function generateBarcodeHTML(data: BarcodeData): string {
  // Import barcode CSS
  const barcodeCSS = `
    <style>
      @page {
        size: 40mm 30mm;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        width: 40mm;
        height: 30mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: Arial, sans-serif;
      }
      .product-name {
        font-size: 8pt;
        font-weight: bold;
        text-align: center;
        margin-bottom: 2mm;
      }
      .barcode-container {
        display: flex;
        justify-content: center;
        align-items: center;
      }
    </style>
  `;

  // Generate barcode SVG using JsBarcode library (would need to be server-side rendered)
  // For now, this is a placeholder - you'd need to integrate with your existing barcode generation
  const barcodeHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      ${barcodeCSS}
    </head>
    <body>
      ${data.productName ? `<div class="product-name">${data.productName}</div>` : ''}
      <div class="barcode-container">
        <svg id="barcode"></svg>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <script>
        JsBarcode("#barcode", "${data.barcode}", {
          format: "CODE128",
          width: 2,
          height: 40,
          displayValue: true,
          fontSize: 12,
          margin: 5
        });
      </script>
    </body>
    </html>
  `;

  return barcodeHTML;
}

/**
 * Print a receipt
 * Uses the assigned receipt printer with ESC/POS method
 */
export async function printReceipt(html: string): Promise<void> {
  if (!isTauri) {
    throw new Error('الطباعة متاحة فقط في تطبيق سطح المكتب');
  }

  // Get printer configuration
  const printerConfig = usePrinterConfigStore.getState();

  // Get assigned receipt printer from settings
  const receiptPrinter = printerConfig.getPrinterForType('receipt');
  if (!receiptPrinter) {
    throw new Error('لم يتم تعيين طابعة الفواتير. الرجاء تكوين الطابعة في الإعدادات');
  }

  try {
    console.log('[SmartPrint] Printing receipt');
    console.log('[SmartPrint] Printer:', receiptPrinter);

    const result = await invoke<string>('print_receipt', {
      printerName: receiptPrinter,
      html: html,
    });

    console.log('[SmartPrint] ✅', result);
  } catch (error: any) {
    console.error('[SmartPrint] ❌ Receipt print failed:', error);
    throw new Error(`فشل طباعة الفاتورة: ${error}`);
  }
}
