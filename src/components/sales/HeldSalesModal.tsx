import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, PlayCircle, Trash2, User } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "../ui";
import { formatCurrency } from "../../utils/currencyUtils";
import { heldSaleError, heldSaleService, type HeldSaleRow } from "../../services/heldSaleService";

export const heldSalesKey = (companyId: number) => ["held-sales", companyId] as const;

/** The shop's held carts; refreshed often because other tills add and take them */
export const useHeldSales = (companyId: number) =>
  useQuery({
    queryKey: heldSalesKey(companyId),
    queryFn: () => heldSaleService.list(companyId),
    enabled: companyId > 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

const age = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.round(hours / 24)} يوم`;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  currentUserId?: number;
  canDeleteAny: boolean;
  /** the till has items in its cart: resuming will hold them first */
  cartHasItems: boolean;
  onResume: (row: HeldSaleRow) => Promise<void>;
}

const HeldSalesModal: React.FC<Props> = ({ isOpen, onClose, companyId, currentUserId, canDeleteAny, cartHasItems, onResume }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useHeldSales(companyId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const rows = data?.list || [];

  const resume = async (row: HeldSaleRow) => {
    setBusyId(row.id);
    try {
      await onResume(row);
    } finally {
      setBusyId(null);
      queryClient.invalidateQueries({ queryKey: heldSalesKey(companyId) });
    }
  };

  const remove = async (row: HeldSaleRow) => {
    setBusyId(row.id);
    try {
      await heldSaleService.remove(row.id, companyId);
      toast.success("تم حذف الفاتورة المعلقة");
    } catch (error) {
      toast.error(heldSaleError(error, "تعذر حذف الفاتورة المعلقة"));
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: heldSalesKey(companyId) });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="الفواتير المعلقة" size="lg">
      <div className="space-y-3">
        {cartHasItems && rows.length > 0 && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            السلة الحالية بها منتجات: عند الاستئناف تُعلّق السلة الحالية أولاً حتى لا تضيع.
          </p>
        )}
        {isLoading ? (
          <p className="py-6 text-center text-sm text-gray-500">جاري التحميل...</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">لا توجد فواتير معلقة</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {rows.map((row) => {
              const canDelete = canDeleteAny || row.user?.id === currentUserId;
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {row.label || row.client?.name || "بدون اسم"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span>{row.itemsCount} صنف</span>
                      <span className="font-medium text-gray-700">{formatCurrency(row.total)}</span>
                      {row.client && row.label && <span>العميل: {row.client.name}</span>}
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{row.user?.fullname}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{age(row.createdAt)}</span>
                    </p>
                  </div>
                  {confirmDelete === row.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-red-700">حذف نهائياً؟</span>
                      <button type="button" disabled={busyId === row.id} onClick={() => remove(row)}
                        className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50">حذف</button>
                      <button type="button" onClick={() => setConfirmDelete(null)}
                        className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200">إلغاء</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => resume(row)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        {busyId === row.id ? "..." : "استئناف"}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label="حذف"
                          title="حذف"
                          disabled={busyId !== null}
                          onClick={() => setConfirmDelete(row.id)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-gray-400">
          تظهر هنا الفواتير المعلقة من كل أجهزة المحل، وتُحذف تلقائياً بعد {data?.maxAgeDays ?? 7} أيام.
        </p>
      </div>
    </Modal>
  );
};

export default HeldSalesModal;
