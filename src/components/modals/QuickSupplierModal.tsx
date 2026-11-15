import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal } from "../ui";
import { supplierService } from "../../services/supplierService";
import { handleApiError } from "../../utils/errorHandler";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  initialName?: string;
  onCreated: (supplier: { id: number; name: string }) => void;
}

/** Add a supplier without leaving the purchase screen */
const QuickSupplierModal: React.FC<Props> = ({ isOpen, onClose, companyId, initialName, onCreated }) => {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName || "");
    setPhone("");
    setAddress("");
    setError("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError("اسم المورد مطلوب");
      return;
    }
    setSaving(true);
    try {
      const res: any = await supplierService.create({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        companyId,
      });
      const created = [res?.data?.data, res?.data, res].find((x: any) => x && x.id);
      if (!created) throw new Error("no supplier returned");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`تم إضافة المورد ${created.name}`);
      onCreated({ id: Number(created.id), name: created.name });
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="مورد جديد" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input ref={nameRef} label="اسم المورد *" value={name} onChange={e => setName(e.target.value)} error={error} />
        <Input label="الهاتف" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" />
        <Input label="العنوان" value={address} onChange={e => setAddress(e.target.value)} />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ واختيار"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default QuickSupplierModal;
