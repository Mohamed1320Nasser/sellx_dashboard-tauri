/**
 * Printer Assignment Service - Like Sultana's printer role system
 *
 * This service provides centralized printer assignment logic.
 * It maps printer types (receipt, barcode, purchase) to physical printers.
 *
 * Architecture: Inspired by Sultana's printerService.ts
 * - Sultana uses: cashier, barista, shisha roles
 * - Sellx uses: receipt, barcode, purchase, quote, payment types
 */

import { usePrinterConfigStore, type PrinterType, type PrinterAssignments } from '../stores/printerConfigStore';

// Re-export types for convenience
export type { PrinterType, PrinterAssignments };

// ═══════════════════════════════════════════════════════════════════════
// PRINTER ASSIGNMENT QUERIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the assigned printer for a specific type
 * Returns empty string if not configured (fail silently, like Sultana)
 * Auto-fallback: If no specific printer assigned, uses receipt printer
 *
 * @param type - Printer type (receipt, barcode, purchase, quote, payment)
 * @returns Printer name or empty string
 *
 * @example
 * const printer = getPrinterForType('receipt');
 * if (printer) {
 *   await sendToPrinter(printer, html);
 * }
 */
export function getPrinterForType(type: PrinterType): string {
  const printer = usePrinterConfigStore.getState().getPrinterForType(type);

  // Auto-fallback: If no specific printer assigned, use receipt printer
  if (!printer && type !== 'receipt') {
    console.warn(`⚠️ No ${type} printer assigned, falling back to receipt printer`);
    return usePrinterConfigStore.getState().getPrinterForType('receipt');
  }

  return printer;
}

/**
 * Get all printer assignments
 * @returns Record of all printer type assignments
 */
export function getAllPrinterAssignments(): PrinterAssignments {
  return usePrinterConfigStore.getState().printerAssignments;
}

/**
 * Check if a printer is assigned to a specific type
 * @param type - Printer type to check
 * @returns true if printer is configured for this type
 */
export function isPrinterAssigned(type: PrinterType): boolean {
  const printer = getPrinterForType(type);
  return printer !== '';
}

// ═══════════════════════════════════════════════════════════════════════
// PRINTER ASSIGNMENT MUTATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Save all printer assignments at once
 * Used by settings UI
 * Like Sultana's savePrinterAssignments()
 *
 * @param assignments - Record of printer type → printer name mappings
 *
 * @example
 * savePrinterAssignments({
 *   receipt: 'XPrinter XP-80C',
 *   barcode: 'HPRT Label Printer',
 *   purchase: 'XPrinter XP-80C',
 *   quote: 'XPrinter XP-80C',
 *   payment: 'XPrinter XP-80C',
 * });
 */
export function savePrinterAssignments(assignments: PrinterAssignments): void {
  usePrinterConfigStore.getState().setPrinterAssignments(assignments);
}

/**
 * Update a single printer assignment
 * Convenience method for quick updates
 *
 * @param type - Printer type to update
 * @param printer - Printer name to assign
 *
 * @example
 * updatePrinterAssignment('barcode', 'HPRT Label Printer');
 */
export function updatePrinterAssignment(type: PrinterType, printer: string): void {
  usePrinterConfigStore.getState().updatePrinterAssignment(type, printer);
}

/**
 * Assign the same printer to all types
 * Useful for simple setups with only one printer
 *
 * @param printer - Printer name to assign to all types
 *
 * @example
 * assignPrinterToAllTypes('XPrinter XP-80C');
 */
export function assignPrinterToAllTypes(printer: string): void {
  savePrinterAssignments({
    receipt: printer,
    purchase: printer,
    barcode: printer,
    quote: printer,
    payment: printer,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION & HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate that all required printer types have assignments
 * @param requiredTypes - Array of printer types that must be configured
 * @returns Array of missing printer types (empty if all configured)
 *
 * @example
 * const missing = validatePrinterAssignments(['receipt', 'barcode']);
 * if (missing.length > 0) {
 *   throw new Error(`Missing printers: ${missing.join(', ')}`);
 * }
 */
export function validatePrinterAssignments(requiredTypes: PrinterType[]): PrinterType[] {
  const missing: PrinterType[] = [];

  for (const type of requiredTypes) {
    if (!isPrinterAssigned(type)) {
      missing.push(type);
    }
  }

  return missing;
}

/**
 * Get user-friendly Arabic name for printer type
 * Used in UI and error messages
 *
 * @param type - Printer type
 * @returns Arabic display name
 */
export function getPrinterTypeDisplayName(type: PrinterType): string {
  const names: Record<PrinterType, string> = {
    receipt: 'طابعة الفواتير',
    purchase: 'طابعة المشتريات',
    barcode: 'طابعة الباركود',
    quote: 'طابعة عروض الأسعار',
    payment: 'طابعة الدفعات',
  };

  return names[type] || type;
}

/**
 * Generate error message for missing printer assignment
 * @param type - Printer type that is not configured
 * @returns Arabic error message
 */
export function getMissingPrinterError(type: PrinterType): string {
  const displayName = getPrinterTypeDisplayName(type);
  return `لم يتم تحديد ${displayName}. الرجاء تكوين الطابعة في الإعدادات`;
}
