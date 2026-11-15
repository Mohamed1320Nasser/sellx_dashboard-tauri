import { create } from 'zustand';
import { apiClient } from '../services/apiClient';

// ═══════════════════════════════════════════════════════════════════════
// PRINTER TYPES (Like Sultana's printer roles)
// ═══════════════════════════════════════════════════════════════════════

export type PrinterType =
  | 'receipt'    // Sales receipts (main POS receipts)
  | 'purchase'   // Purchase receipts (supplier invoices)
  | 'barcode'    // Barcode labels (product labels)
  | 'quote'      // Quote/estimate receipts
  | 'payment';   // Payment receipts (customer payments)

// ═══════════════════════════════════════════════════════════════════════
// PRINTER ASSIGNMENTS (Multi-printer support)
// ═══════════════════════════════════════════════════════════════════════

export type PrinterAssignments = Record<PrinterType, string>;

interface PrinterConfig {
  // ── NEW: Multi-printer assignments (like Sultana) ──
  printerAssignments: PrinterAssignments;

  // ── DEPRECATED: Single printer (kept for backward compatibility) ──
  printerName: string;  // ⚠️ Deprecated - use printerAssignments instead

  // Connection
  connectionType: 'usb' | 'lan';  // Standardized to lowercase
  ipAddress: string;
  port: number;

  // Paper
  paperWidth: '58mm' | '80mm';
  marginTop: number;
  marginBottom: number;

  // Label Settings
  labelWidth: number;   // 35, 40, 50
  labelHeight: number;  // 25, 30, 30
  labelFontSize: number; // 8-20
  barcodeFormat: 'CODE128' | 'EAN13' | 'EAN8' | 'CODE39';
  barcodeHeight: number; // 40-100px - controls scan range
  barcodeWidth: number;  // 1-3 - controls bar thickness
  showBarcodeText: boolean; // Show HRI (Human Readable Interpretation)

  // Content (standardized names to match Sultana)
  showCompanyLogo: boolean;  // Renamed from showLogo
  showOrderId: boolean;
  showTaxBreakdown: boolean;
  showQrCode: boolean;  // Renamed from showQRCode (lowercase 'r')

  // Text
  headerText: string;
  footerText: string;
  /** A4 invoice: terms and conditions, and the commercial register number */
  invoiceTerms: string;
  commercialRegister: string;

  // Automation
  autoPrintOnPayment: boolean;
  autoCut: boolean;  // Renamed from cutPaper
  printCopies: number; // SELLX-SPECIFIC: number of copies to print (1-5)

  // ── NEW: Native USB Printing (for barcode printers) ──
  useNativeUsb: boolean;     // Enable direct USB communication (TSPL)
  usbVendorId: string;       // USB Vendor ID (e.g., "0x1FC9")
  usbProductId: string;      // USB Product ID (e.g., "0x2016")
}

interface PrinterConfigStore extends PrinterConfig {
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConfig: (companyId: number) => Promise<void>;
  saveConfig: (companyId: number) => Promise<void>;
  updateConfig: (partial: Partial<PrinterConfig>) => void;
  resetToDefaults: () => void;

  // ── NEW: Multi-printer actions (like Sultana) ──
  setPrinterAssignments: (assignments: PrinterAssignments) => void;
  getPrinterForType: (type: PrinterType) => string;
  updatePrinterAssignment: (type: PrinterType, printer: string) => void;
}

const DEFAULT_CONFIG: PrinterConfig = {
  // ── Multi-printer assignments (empty by default) ──
  printerAssignments: {
    receipt: '',
    purchase: '',
    barcode: '',
    quote: '',
    payment: '',
  },

  // ── Deprecated single printer (kept for backward compatibility) ──
  printerName: '',

  // Connection
  connectionType: 'lan',  // lowercase
  ipAddress: '192.168.1.50',
  port: 9100,

  // Paper
  paperWidth: '80mm',
  marginTop: 5,
  marginBottom: 5,

  // Label - Optimized defaults for best scanning
  labelWidth: 40,        // 40mm - standard label width
  labelHeight: 30,       // 30mm - standard label height
  labelFontSize: 12,     // 12px - readable size
  barcodeFormat: 'CODE128', // CODE128 - most versatile format
  barcodeHeight: 60,     // 60px - optimal scan range (12 inch distance)
  barcodeWidth: 2,       // 2 - standard bar width (recommended)
  showBarcodeText: true, // Show numbers below barcode for manual entry

  // Content (standardized names)
  showCompanyLogo: true,
  showOrderId: true,
  showTaxBreakdown: true,
  showQrCode: false,

  // Text
  headerText: '',
  footerText: 'شكراً لزيارتكم',
  invoiceTerms: '',
  commercialRegister: '',

  // Automation
  autoPrintOnPayment: false,
  autoCut: true,
  printCopies: 1, // Default: print 1 copy

  // Native USB Printing (disabled by default)
  useNativeUsb: false,
  usbVendorId: '',
  usbProductId: '',
};

export const usePrinterConfigStore = create<PrinterConfigStore>((set, get) => ({
  ...DEFAULT_CONFIG,
  isLoading: false,
  error: null,

  loadConfig: async (companyId: number) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get(`/printer-config?companyId=${companyId}`);

      if (response.data.success && response.data.data) {
        const config = response.data.data;

        // ── MIGRATION LOGIC: Load from database fields ──
        let printerAssignments: PrinterAssignments = {
          receipt: config.receiptPrinter || '',
          purchase: config.purchasePrinter || '',
          barcode: config.barcodePrinter || '',
          quote: config.quotePrinter || '',
          payment: config.paymentPrinter || '',
        };

        // Fallback: If no DB assignments but old printerName exists, migrate
        const hasAnyAssignment =
          config.receiptPrinter || config.purchasePrinter || config.barcodePrinter ||
          config.quotePrinter || config.paymentPrinter;

        if (!hasAnyAssignment && config.printerName) {
          console.log('[Migration] Converting single printer to multi-printer assignments');
          const oldPrinter = config.printerName;
          printerAssignments = {
            receipt: oldPrinter,
            purchase: oldPrinter,
            barcode: oldPrinter,
            quote: oldPrinter,
            payment: oldPrinter,
          };
        }

        set({
          // NEW: Multi-printer assignments
          printerAssignments,

          // Keep old field for backward compatibility
          printerName: config.printerName || '',

          // Handle both old (USB/LAN) and new (usb/lan) formats
          connectionType: (config.connectionType || 'LAN').toLowerCase() as 'usb' | 'lan',
          ipAddress: config.ipAddress || '192.168.1.50',
          port: config.port || 9100,
          paperWidth: config.paperWidth === 'MM_58' ? '58mm' : '80mm',
          marginTop: config.marginTop || 5,
          marginBottom: config.marginBottom || 5,
          labelWidth: config.labelWidth || 40,
          labelHeight: config.labelHeight || 30,
          labelFontSize: config.labelFontSize || 12,
          barcodeFormat: config.barcodeFormat || 'CODE128',
          barcodeHeight: config.barcodeHeight || 60,
          barcodeWidth: config.barcodeWidth || 2,
          showBarcodeText: config.showBarcodeText ?? true,
          // Handle both old and new field names
          showCompanyLogo: config.showCompanyLogo ?? config.showLogo ?? true,
          showOrderId: config.showOrderId ?? true,
          showTaxBreakdown: config.showTaxBreakdown ?? true,
          showQrCode: config.showQrCode ?? config.showQRCode ?? false,
          headerText: config.headerText || '',
          footerText: config.footerText || 'شكراً لزيارتكم',
          invoiceTerms: config.invoiceTerms || '',
          commercialRegister: config.commercialRegister || '',
          autoPrintOnPayment: config.autoPrintOnPayment ?? false,
          autoCut: config.autoCut ?? config.cutPaper ?? true,
          printCopies: config.printCopies || 1,
          // Native USB printing
          useNativeUsb: config.useNativeUsb ?? false,
          usbVendorId: config.usbVendorId || '',
          usbProductId: config.usbProductId || '',
          isLoading: false,
        });
      } else {
        // No config found, use defaults
        set({ ...DEFAULT_CONFIG, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load printer config:', error);
      set({ isLoading: false, error: 'فشل تحميل الإعدادات' });
      // Use defaults on error
      set({ ...DEFAULT_CONFIG });
    }
  },

  saveConfig: async (companyId: number) => {
    set({ isLoading: true, error: null });
    try {
      const state = get();

      const payload = {
        companyId,

        // NEW: Multi-printer assignments (send as individual fields to match DB schema)
        receiptPrinter: state.printerAssignments.receipt,
        purchasePrinter: state.printerAssignments.purchase,
        barcodePrinter: state.printerAssignments.barcode,
        quotePrinter: state.printerAssignments.quote,
        paymentPrinter: state.printerAssignments.payment,

        // Keep old field for backward compatibility
        printerName: state.printerName,

        connectionType: state.connectionType.toUpperCase() as 'USB' | 'LAN',  // Convert to uppercase for backend
        ipAddress: state.ipAddress,
        port: state.port,
        paperWidth: state.paperWidth === '58mm' ? 'MM_58' : 'MM_80',
        marginTop: state.marginTop,
        marginBottom: state.marginBottom,
        labelWidth: state.labelWidth,
        labelHeight: state.labelHeight,
        labelFontSize: state.labelFontSize,
        barcodeFormat: state.barcodeFormat,
        barcodeHeight: state.barcodeHeight,
        barcodeWidth: state.barcodeWidth,
        showBarcodeText: state.showBarcodeText,
        // Map to old database field names for backward compatibility
        showLogo: state.showCompanyLogo,
        showOrderId: state.showOrderId,
        showTaxBreakdown: state.showTaxBreakdown,
        showQRCode: state.showQrCode,
        headerText: state.headerText,
        footerText: state.footerText,
        invoiceTerms: state.invoiceTerms,
        commercialRegister: state.commercialRegister,
        autoPrintOnPayment: state.autoPrintOnPayment,
        cutPaper: state.autoCut,
        printCopies: state.printCopies,
        // Native USB printing
        useNativeUsb: state.useNativeUsb,
        usbVendorId: state.usbVendorId,
        usbProductId: state.usbProductId,
      };

      const response = await apiClient.post('/printer-config', payload);

      if (!response.data.success) {
        throw new Error(response.data.message || 'فشل حفظ الإعدادات');
      }
      set({ isLoading: false });
    } catch (error: any) {
      console.error('Failed to save printer config:', error);
      set({
        isLoading: false,
        error: error.response?.data?.message || 'فشل حفظ الإعدادات'
      });
      throw error;
    }
  },

  updateConfig: (partial) => {
    set((state) => ({ ...state, ...partial }));
  },

  resetToDefaults: () => {
    set({ ...DEFAULT_CONFIG });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NEW: Multi-printer actions (like Sultana's printer assignment service)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set all printer assignments at once
   * Used by settings UI when saving
   */
  setPrinterAssignments: (assignments: PrinterAssignments) => {
    set({ printerAssignments: assignments });
  },

  /**
   * Get the assigned printer for a specific type
   * Returns empty string if not configured (fail silently)
   * Like Sultana's getPrinterAssignment(role)
   */
  getPrinterForType: (type: PrinterType): string => {
    const state = get();

    // Check new multi-printer structure first
    if (state.printerAssignments && state.printerAssignments[type]) {
      return state.printerAssignments[type];
    }

    // Fallback to old single printer for backward compatibility
    if (state.printerName) {
      return state.printerName;
    }

    return '';
  },

  /**
   * Update a single printer assignment
   * Convenience method for quick updates
   */
  updatePrinterAssignment: (type: PrinterType, printer: string) => {
    const state = get();
    const updated = {
      ...state.printerAssignments,
      [type]: printer,
    };
    set({ printerAssignments: updated });
  },
}));
