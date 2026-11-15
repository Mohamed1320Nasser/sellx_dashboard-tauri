import React, { useEffect } from 'react';
import { Receipt, Tag } from 'lucide-react';
import { Modal, Button } from '../ui';
import { usePrinterModeStore } from '../../services/printerModeService';

/** Asks the cashier to switch a dual-mode printer before a receipt or a label job (mounted once in App) */
export const PrinterModePrompt: React.FC = () => {
  const pending = usePrinterModeStore((s) => s.pending);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        pending.resolve('switched');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!pending) return null;
  const toLabel = pending.mode === 'label';
  const Icon = toLabel ? Tag : Receipt;

  return (
    <Modal isOpen onClose={() => pending.resolve('cancel')} title="تحويل وضع الطابعة" size="sm">
      <div className="space-y-4" dir="rtl">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${toLabel ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-gray-900">
              {toLabel ? 'الطباعة التالية: ملصقات باركود' : 'الطباعة التالية: إيصال'}
            </p>
            <p className="text-sm text-gray-600 mt-1 leading-6">
              {toLabel
                ? 'حوّل الطابعة إلى وضع الملصقات وركّب رول الملصقات، ثم اضغط "اطبع".'
                : 'حوّل الطابعة إلى وضع الإيصالات وركّب رول الإيصالات، ثم اضغط "اطبع".'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => pending.resolve('switched')}>
            تم التحويل - اطبع
          </Button>
          <Button variant="outline" onClick={() => pending.resolve('cancel')}>
            إلغاء
          </Button>
        </div>

        <button
          type="button"
          className="w-full text-xs text-gray-500 hover:text-gray-700 underline"
          onClick={() => pending.resolve('never')}
        >
          طابعتي لا تحتاج تحويل - لا تسألني مرة أخرى
        </button>
      </div>
    </Modal>
  );
};
