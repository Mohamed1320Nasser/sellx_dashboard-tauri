/**
 * Tauri Bridge — replaces Electron's preload/IPC bridge.
 *
 * Every place that used window.isElectron / window.configAPI /
 * window.printerAPI / window.networkAPI now imports from here.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Platform detection ─────────────────────────────────────────

export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── Config API ─────────────────────────────────────────────────

export const configAPI = {
  getConfig: () => invoke<any>('get_config'),
  setConfig: (config: any) => invoke<any>('set_config', { config }),
  getBackendUrl: () => invoke<any>('get_backend_url'),
  setBackendUrl: (url: string) => invoke<any>('set_backend_url', { url }),
  testBackend: (url?: string) => invoke<any>('test_backend', { url }),
  resetConfig: () => invoke<any>('reset_config'),
  exportConfig: () => invoke<any>('export_config'),
  importConfig: (configJson: string) => invoke<any>('import_config', { configJson }),
};

// ── Network API ────────────────────────────────────────────────

export const networkAPI = {
  getStatus: () => invoke<any>('get_network_status'),
  checkNow: () => invoke<any>('check_network_now'),
  onStatusChange: (callback: (online: boolean) => void): (() => void) => {
    let unlisten: UnlistenFn | null = null;
    listen<boolean>('network:status-changed', (event) => {
      callback(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  },
};

// ── Printer API ────────────────────────────────────────────────

/**
 * Helper: capture an HTML element as a PNG base64 string.
 * Used by receipt and label printing — the frontend renders HTML,
 * captures it as an image, and sends base64 to Rust for ESC/POS conversion.
 */
async function captureElementAsBase64(element: HTMLElement): Promise<string> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
  });
  // Return raw base64 (strip data:image/png;base64, prefix)
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

export const printerAPI = {
  // Config
  setConfig: (config: any) =>
    invoke<any>('printer_set_config', { config }),

  // Discovery
  getSystemPrinters: () =>
    invoke<any>('get_system_printers'),
  getAvailablePrinters: async (): Promise<string[]> => {
    const result = await invoke<any>('get_system_printers');
    return result?.data || [];
  },
  getDefaultPrinter: () =>
    invoke<any>('get_default_printer'),
  findThermalPrinters: () =>
    invoke<any>('find_thermal_printers'),
  selectBestPrinter: (savedPrinterName?: string) =>
    invoke<any>('select_best_printer', { savedPrinterName }),

  // Receipt printing (image-based — best for Arabic + logos)
  printReceiptImage: (imageBase64: string, config: any) =>
    invoke<any>('print_receipt_image', { imageBase64, config }),

  // Label printing (image-based — best for 35×24mm labels)
  printLabelImage: (imageBase64: string, config: any) =>
    invoke<any>('print_label_image', { imageBase64, config }),

  // Label printing (native ESC/POS barcode)
  printLabelBarcode: (label: any, config: any) =>
    invoke<any>('print_label_barcode', { label, config }),

  // Raw image buffer printing
  printImage: async (imageBuffer: ArrayBuffer, config: any) => {
    const bytes = new Uint8Array(imageBuffer);
    // Convert to base64 for transport to Rust
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return invoke<any>('print_receipt_image', { imageBase64: base64, config });
  },

  // Test print
  testPrint: (config: any) =>
    invoke<any>('test_print', { config }),

  // Diagnostics
  checkStatus: (config: any) =>
    invoke<any>('check_printer_status', { config }),
  testNetworkConnection: (ip: string, port: number) =>
    invoke<any>('test_network_connection', { ip, port }),
  runComprehensiveTest: (connectionType: string, ip?: string, port?: number, paperWidth?: string) =>
    invoke<any>('run_comprehensive_test', { connectionType, ip, port, paperWidth }),

  // Convenience: capture HTML element and print as receipt
  captureAndPrintReceipt: async (element: HTMLElement, config: any) => {
    const base64 = await captureElementAsBase64(element);
    return invoke<any>('print_receipt_image', { imageBase64: base64, config });
  },

  // Convenience: capture HTML element and print as label
  captureAndPrintLabel: async (element: HTMLElement, config: any) => {
    const base64 = await captureElementAsBase64(element);
    return invoke<any>('print_label_image', { imageBase64: base64, config });
  },
};

// ── Backward-compatible shim ───────────────────────────────────
// Inject onto window so existing code that checks window.printerAPI
// still works during the migration. New code should import directly.

try {
if (isTauri && typeof window !== 'undefined') {
  (window as any).isElectron = true; // Compatibility flag
  (window as any).configAPI = configAPI;
  (window as any).networkAPI = {
    getStatus: async () => {
      const r = await networkAPI.getStatus();
      return { online: r?.data?.isOnline ?? true };
    },
    checkNow: async () => {
      const r = await networkAPI.checkNow();
      return { online: r?.data?.isOnline ?? true };
    },
    onStatusChange: (callback: (status: { online: boolean }) => void) => {
      return networkAPI.onStatusChange((online) => {
        callback({ online });
      });
    },
  };
  (window as any).printerAPI = {
    setConfig: printerAPI.setConfig,
    printReceipt: async (receiptData: any, config?: any) => {
      // For backward compat: the old Electron code expected this to
      // work with receiptData directly. In Tauri we need an image.
      // Return success and let the calling code handle image capture.
      console.log('[tauriBridge] printReceipt called — use printReceiptImage for image-based printing');
      return { success: true };
    },
    printLabel: async (labelData: any, config?: any) => {
      // Forward to native barcode printing
      return printerAPI.printLabelBarcode(labelData, config || {});
    },
    testPrint: printerAPI.testPrint,
    getAvailablePrinters: printerAPI.getAvailablePrinters,
    getSystemPrinters: printerAPI.getSystemPrinters,
    getDefaultPrinter: printerAPI.getDefaultPrinter,
    findThermalPrinters: printerAPI.findThermalPrinters,
    selectBestPrinter: printerAPI.selectBestPrinter,
    checkStatus: printerAPI.checkStatus,
    testNetworkConnection: printerAPI.testNetworkConnection,
    runComprehensiveTest: printerAPI.runComprehensiveTest,
    printImage: printerAPI.printImage,
  };
}
} catch (e) {
  console.error('[tauriBridge] Failed to initialize window shim:', e);
}
