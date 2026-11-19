import React from "react";
import { Loader2, Save } from "lucide-react";

interface Props {
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
  /** Short line on the side, e.g. what is not saved yet */
  hint?: React.ReactNode;
  /** id of the form to submit when the bar sits outside it */
  formId?: string;
}

/** Save / cancel bar that stays at the bottom of a long form */
const FormSaveBar: React.FC<Props> = ({ onCancel, saving, saveLabel, hint, formId }) => (
  <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
    <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
      <p className="hidden text-sm text-gray-500 sm:block">{hint}</p>
      <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          إلغاء
        </button>
        <button
          type="submit"
          form={formId}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "جاري الحفظ..." : saveLabel}
        </button>
      </div>
    </div>
  </div>
);

export default FormSaveBar;
