import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info, Save } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, DatePicker, Input, Select, Textarea } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useSuppliers } from "../hooks/api/useSuppliers";
import { useEditPurchase } from "../hooks/api/usePurchases";
import { purchaseService } from "../services/purchaseService";

/**
 * Correct a purchase's header (supplier, invoice number, dates, notes, attached invoice).
 * Received items and amounts cannot change here: payments, returns to the supplier,
 * or deleting and entering the purchase again handle those.
 */
const PurchaseEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  const { data: purchase, isLoading } = useQuery({
    queryKey: ["purchase", id, companyId],
    queryFn: () => purchaseService.getById(parseInt(id!), companyId!),
    enabled: !!id && !!companyId,
    select: (data: any) => data?.data || data,
  });
  const { data: suppliersData } = useSuppliers({ companyId: companyId || 0, limit: 100 });
  const editPurchase = useEditPurchase();

  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<Date | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  useEffect(() => {
    if (!purchase) return;
    setSupplierId(String(purchase.supplierId));
    setInvoiceNumber(purchase.invoiceNumber || "");
    setPurchaseDate(purchase.purchaseDate ? new Date(purchase.purchaseDate) : null);
    setDueDate(purchase.dueDate ? new Date(purchase.dueDate) : null);
    setNotes(purchase.notes || "");
  }, [purchase]);

  const supplierOptions = ((suppliersData as any)?.data?.list || []).map((s: any) => ({
    value: String(s.id),
    label: s.name,
  }));

  // Dates are sent as the local calendar day, not converted to UTC
  const day = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleSave = async () => {
    const form = new FormData();
    form.append("companyId", String(companyId));
    form.append("supplierId", supplierId);
    form.append("invoiceNumber", invoiceNumber.trim());
    if (purchaseDate) form.append("purchaseDate", day(purchaseDate));
    form.append("dueDate", dueDate ? day(dueDate) : "");
    form.append("notes", notes);
    if (invoiceFile) form.append("invoice", invoiceFile);
    try {
      await editPurchase.mutateAsync({ id: parseInt(id!), data: form });
      navigate(`/purchases/${id}`);
    } catch {
      // the hook shows the server's message
    }
  };

  return (
    <Layout>
      <div className="w-full max-w-3xl mx-auto space-y-6" dir="rtl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/purchases/${id}`)}>
            <ArrowLeft className="w-4 h-4 ml-1" />
            العودة
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">تعديل بيانات فاتورة الشراء</h1>
        </div>

        <div className="flex gap-3 p-4 rounded-lg bg-blue-50 text-blue-800 text-sm">
          <Info className="w-5 h-5 flex-shrink-0" />
          <div>
            يمكن تعديل بيانات الفاتورة فقط. لتغيير المنتجات أو الكميات أو المبالغ:
            للدفع استخدم <b>إضافة دفعة</b>، ولإرجاع بضاعة استخدم <b>مرتجع للمورد</b>،
            أو احذف الفاتورة وأدخلها من جديد إذا لم يُبع منها شيء.
          </div>
        </div>

        <Card padding="lg">
          {isLoading || !purchase ? (
            <div className="py-8 text-center text-gray-500">جاري التحميل...</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Select label="المورد" value={supplierId} onChange={setSupplierId} options={supplierOptions} />
                <Input
                  label="رقم فاتورة المورد"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
                <DatePicker
                  label="تاريخ الشراء"
                  value={purchaseDate}
                  onChange={date => setPurchaseDate(date)}
                  placeholder="اختر التاريخ"
                />
                <DatePicker
                  label="تاريخ الاستحقاق"
                  value={dueDate}
                  onChange={date => setDueDate(date)}
                  placeholder="بدون"
                />
              </div>
              <Textarea label="ملاحظات" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  استبدال صورة/ملف الفاتورة {purchase.invoiceUrl ? "(يوجد ملف حالياً)" : ""}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={editPurchase.isPending || !supplierId || !invoiceNumber.trim()}>
                  <Save className="w-4 h-4 ml-1" />
                  {editPurchase.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default PurchaseEdit;
