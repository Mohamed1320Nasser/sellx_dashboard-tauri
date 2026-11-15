import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, ChevronLeft } from "lucide-react";
import { Card } from "../ui";
import { purchaseService, type DuePurchases } from "../../services/purchaseService";
import { usePermissionStore } from "../../stores/permissionStore";
import { formatCurrency } from "../../utils/currencyUtils";

/** Supplier invoices to pay this week, overdue ones first. Shown to managers only. */
const PurchaseDueCard: React.FC<{ companyId: number }> = ({ companyId }) => {
  const navigate = useNavigate();
  const canView = usePermissionStore(state => state.permissions?.canViewPurchases);
  const { data } = useQuery<DuePurchases>({
    queryKey: ["purchases", "due", companyId],
    queryFn: async () => {
      const res: any = await purchaseService.getDue(companyId, 7);
      return res?.data ?? res;
    },
    enabled: !!companyId && !!canView,
    staleTime: 5 * 60_000,
  });

  if (!canView || !data?.list?.length) return null;

  const dayLabel = (days: number | null) => {
    if (days === null) return "تذكير";
    if (days < 0) return `متأخرة ${-days} يوم`;
    if (days === 0) return "اليوم";
    if (days === 1) return "غداً";
    return `بعد ${days} يوم`;
  };

  return (
    <Card padding="lg" className={data.overdueCount ? "border-danger-200" : "border-amber-200"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          {data.overdueCount ? <AlertTriangle className="h-5 w-5 text-danger-600" /> : <Bell className="h-5 w-5 text-amber-500" />}
          مستحقات الموردين هذا الأسبوع
        </h3>
        <div className="text-sm text-gray-600">
          {data.list.length} فاتورة · <b className="text-danger-600">{formatCurrency(data.totalRemaining)}</b>
          {data.overdueCount > 0 && <span className="mr-2 text-danger-600">({data.overdueCount} متأخرة)</span>}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {data.list.slice(0, 6).map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(`/purchases/${p.id}`)}
            className="flex w-full items-center justify-between gap-2 py-2 text-right text-sm hover:bg-gray-50"
          >
            <span>
              <span className="font-medium text-gray-900">{p.supplier?.name}</span>
              <span className="mr-2 text-xs text-gray-500">فاتورة {p.invoiceNumber}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-xs ${p.overdue ? "bg-danger-100 text-danger-700" : "bg-amber-100 text-amber-800"}`}>
                {dayLabel(p.daysLeft)}
              </span>
              <span className="font-bold text-gray-900">{formatCurrency(p.remaining)}</span>
              <ChevronLeft className="h-4 w-4 text-gray-400" />
            </span>
          </button>
        ))}
      </div>
      {data.list.length > 6 && (
        <button type="button" onClick={() => navigate("/purchases")} className="mt-2 text-sm font-medium text-primary-700 hover:underline">
          عرض كل المشتريات
        </button>
      )}
    </Card>
  );
};

export default PurchaseDueCard;
