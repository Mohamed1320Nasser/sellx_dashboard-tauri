import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Scale } from "lucide-react";
import toast from "react-hot-toast";
import { Button, Card, Toggle } from "../ui";
import { scaleSettingsService, type ScaleSettings } from "../../services/scaleSettingsService";

const ALL_PREFIXES = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];

/** How a label is read with these settings, shown under the form as an example */
function example(s: ScaleSettings) {
  const prefix = s.prefixes.split(",")[0] || "20";
  const plu = "123".padStart(s.pluLength, "0");
  const valueDigits = 10 - s.pluLength;
  const raw = s.mode === "WEIGHT" ? 1250 : 5000;
  const value = String(raw).padStart(valueDigits, "0");
  return {
    prefix,
    plu,
    value,
    meaning: s.mode === "WEIGHT" ? "1.250 كجم" : "50.00 ج.م",
  };
}

interface Props {
  companyId: number;
  canEdit: boolean;
}

/** Settings for the labels a shop scale prints (2X + item code + weight / price + check digit) */
export const ScaleBarcodeSettings: React.FC<Props> = ({ companyId, canEdit }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["scale-settings", companyId],
    queryFn: () => scaleSettingsService.get(companyId),
    enabled: !!companyId,
  });
  const [form, setForm] = useState<ScaleSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const prefixes = useMemo(() => (form?.prefixes ? form.prefixes.split(",") : []), [form?.prefixes]);
  const dirty = !!form && !!data && JSON.stringify(form) !== JSON.stringify(data);

  const togglePrefix = (p: string) => {
    if (!form) return;
    const next = prefixes.includes(p) ? prefixes.filter(x => x !== p) : [...prefixes, p].sort();
    setForm({ ...form, prefixes: next.join(",") });
  };

  const save = async () => {
    if (!form) return;
    if (!prefixes.length) {
      toast.error("اختر بادئة واحدة على الأقل");
      return;
    }
    setSaving(true);
    try {
      const saved = await scaleSettingsService.update(companyId, form);
      queryClient.setQueryData(["scale-settings", companyId], saved);
      toast.success("تم حفظ إعدادات الميزان");
    } catch (e: any) {
      toast.error(e?.response?.data?.msg || e?.message || "تعذّر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const ex = form ? example(form) : null;
  const off = !canEdit || !form?.enabled;

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
          <Scale className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">باركود الميزان</h3>
          <p className="text-sm text-gray-500">
            اقرأ الملصق الذي يطبعه ميزان المحل (جبن، لحوم، خضار): يُضاف المنتج للفاتورة بالوزن المطبوع عليه.
          </p>
        </div>
      </div>

      {isLoading || !form ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-5">
          <Toggle
            enabled={form.enabled}
            disabled={!canEdit}
            onChange={on => setForm({ ...form, enabled: on })}
            label="قراءة ملصقات الميزان"
            description={form.enabled ? "مفعّل: الأكواد التي تبدأ بالبادئات المختارة تُقرأ كملصقات ميزان." : "متوقف: كل الأكواد تُبحث كباركود عادي."}
          />

          <div className={off ? "pointer-events-none opacity-60" : ""}>
            <p className="mb-2 text-sm font-medium text-gray-700">بادئة الملصق (أول رقمين)</p>
            <div className="flex flex-wrap gap-2" dir="ltr">
              {ALL_PREFIXES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePrefix(p)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    prefixes.includes(p)
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">اترك المختارة كما هي إن لم تكن متأكداً. الأكواد التي تبدأ بها لن تتعارض مع باركود المصانع.</p>
          </div>

          <div className={`grid gap-4 sm:grid-cols-2 ${off ? "pointer-events-none opacity-60" : ""}`}>
            <div>
              <label htmlFor="scale-plu-length" className="mb-1 block text-sm font-medium text-gray-700">
                عدد أرقام كود الصنف
              </label>
              <select
                id="scale-plu-length"
                value={form.pluLength}
                onChange={e => setForm({ ...form, pluLength: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option value={4}>4 أرقام</option>
                <option value={5}>5 أرقام (الأشهر)</option>
                <option value={6}>6 أرقام</option>
              </select>
            </div>
            <div>
              <label htmlFor="scale-mode" className="mb-1 block text-sm font-medium text-gray-700">
                الملصق يحمل
              </label>
              <select
                id="scale-mode"
                value={form.mode}
                onChange={e => setForm({ ...form, mode: e.target.value as ScaleSettings["mode"] })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option value="WEIGHT">الوزن بالجرام (الأشهر)</option>
                <option value="PRICE">السعر بالقرش (تُحسب الكمية من سعر المنتج)</option>
              </select>
            </div>
          </div>

          {ex && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="mb-2 text-gray-600">مثال لملصق بهذه الإعدادات:</p>
              <div className="flex flex-wrap items-center gap-1 font-mono text-base" dir="ltr">
                <span className="rounded bg-blue-100 px-1.5 text-blue-800">{ex.prefix}</span>
                <span className="rounded bg-amber-100 px-1.5 text-amber-800">{ex.plu}</span>
                <span className="rounded bg-green-100 px-1.5 text-green-800">{ex.value}</span>
                <span className="rounded bg-gray-200 px-1.5 text-gray-700">C</span>
              </div>
              <p className="mt-2 text-xs text-gray-600">
                <span className="text-blue-700">البادئة</span> ثم <span className="text-amber-700">كود الصنف {ex.plu}</span> (يُكتب في
                بيانات المنتج: كود الميزان) ثم <span className="text-green-700">{ex.meaning}</span> ثم رقم التحقق.
              </p>
            </div>
          )}

          {canEdit ? (
            <div className="flex justify-end">
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                حفظ إعدادات الميزان
              </Button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">مالك المحل فقط يغيّر هذه الإعدادات.</p>
          )}
        </div>
      )}
    </Card>
  );
};
