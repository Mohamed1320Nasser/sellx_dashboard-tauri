/**
 * Printers that switch between receipt mode and barcode-label mode with a button or switch.
 *
 * The printer can't tell the app which mode it is in, so the app remembers the last mode it
 * printed in. When the next job needs the other mode, it asks the cashier to switch first.
 * Kept on this computer only (it is about the printer plugged into it).
 */
import { create } from 'zustand';
import { usePrinterConfigStore } from '../stores/printerConfigStore';

export type PrintMode = 'receipt' | 'label';

interface ModeSettings {
  /** true / false when the user chose; null = decide automatically (same printer for both) */
  shared: boolean | null;
  lastMode: PrintMode | null;
}

const KEY = 'sellx.printerMode';

function read(): ModeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { shared: typeof v.shared === 'boolean' ? v.shared : null, lastMode: v.lastMode ?? null };
    }
  } catch {
    /* storage blocked: behave as a fresh install */
  }
  return { shared: null, lastMode: null };
}

function write(next: Partial<ModeSettings>) {
  const value = { ...read(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  usePrinterModeStore.setState({ settings: value });
}

/** Receipts and labels assigned to the same printer name */
export function sameAssignedPrinter(): boolean {
  const cfg = usePrinterConfigStore.getState();
  const receipt = cfg.getPrinterForType('receipt');
  const barcode = cfg.getPrinterForType('barcode');
  return !!receipt && receipt === barcode;
}

export function isSharedPrinter(): boolean {
  const { shared } = read();
  return shared ?? sameAssignedPrinter();
}

export function setSharedPrinter(shared: boolean | null) {
  write({ shared });
}

export function setLastPrintMode(lastMode: PrintMode | null) {
  write({ lastMode });
}

export class PrintCancelledError extends Error {
  constructor() {
    super('تم إلغاء الطباعة');
    this.name = 'PrintCancelledError';
  }
}

interface PendingSwitch {
  mode: PrintMode;
  resolve: (choice: 'switched' | 'never' | 'cancel') => void;
}

/** Drives the "switch the printer mode" dialog (PrinterModePrompt) */
export const usePrinterModeStore = create<{ settings: ModeSettings; pending: PendingSwitch | null }>(() => ({
  settings: read(),
  pending: null,
}));

/**
 * Call before sending a job. Returns at once when the printer is not shared or already in this
 * mode; otherwise waits for the user to switch it. Throws PrintCancelledError on cancel.
 */
export async function ensurePrinterMode(mode: PrintMode, printerName?: string): Promise<void> {
  if (!isSharedPrinter()) return;
  // A receipt-type job going to a printer other than the label printer needs no switch
  const labelPrinter = usePrinterConfigStore.getState().getPrinterForType('barcode');
  if (mode === 'receipt' && printerName && labelPrinter && printerName !== labelPrinter) return;
  if (read().lastMode === mode) return;

  const choice = await new Promise<'switched' | 'never' | 'cancel'>((resolve) => {
    // a dialog already open for another job: answer it as cancelled, the newest job asks
    usePrinterModeStore.getState().pending?.resolve('cancel');
    usePrinterModeStore.setState({ pending: { mode, resolve } });
  });
  usePrinterModeStore.setState({ pending: null });

  if (choice === 'cancel') throw new PrintCancelledError();
  if (choice === 'never') {
    write({ shared: false, lastMode: mode });
    return;
  }
  write({ lastMode: mode });
}
