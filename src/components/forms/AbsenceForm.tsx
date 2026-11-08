import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Select, Modal, DatePicker } from "../ui";
import { Calendar, User, FileText, AlertCircle, Shield, Clock, Wallet } from "lucide-react";
import type { Absence, AbsenceType, LeaveCategory, CreateAbsenceRequest, UpdateAbsenceRequest } from "../../types";
import { useSessionAuthStore } from "../../stores/sessionAuthStore";
import { toLocalDay } from '../../utils/dateUtils';

const absenceSchema = z.object({
  userId: z.string().min(1, "يجب اختيار الموظف"),
  type: z.enum([
    "SICK_LEAVE",
    "VACATION",
    "PERSONAL_LEAVE",
    "MATERNITY_LEAVE",
    "PATERNITY_LEAVE",
    "BEREAVEMENT",
    "OTHER"
  ], { message: "يجب اختيار نوع الغياب" }),
  leaveCategory: z.enum(["PAID_LEAVE", "UNPAID_LEAVE"], { message: "يجب اختيار التأثير على الراتب" }),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  reason: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.endDate) >= new Date(data.startDate);
  }
  return true;
}, {
  message: "تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية",
  path: ["endDate"],
});

type AbsenceFormData = z.infer<typeof absenceSchema>;

interface AbsenceFormProps {
  companyId: number;
  users: Array<{ id: number; fullname: string; email: string }>;
  absence?: Absence;
  onSubmit: (data: CreateAbsenceRequest | UpdateAbsenceRequest) => void;
  loading?: boolean;
  onCancel?: () => void;
}

const AbsenceForm: React.FC<AbsenceFormProps> = ({
  companyId,
  users,
  absence,
  onSubmit,
  loading = false,
  onCancel,
}) => {
  const { getCurrentUser } = useSessionAuthStore();
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<AbsenceFormData>({
    resolver: zodResolver(absenceSchema),
    defaultValues: {
      userId: absence?.userId?.toString() || "",
      type: absence?.type || "VACATION",
      leaveCategory: absence?.leaveCategory || "UNPAID_LEAVE",
      startDate: absence?.startDate ? absence.startDate.split('T')[0] : "",
      endDate: absence?.endDate ? absence.endDate.split('T')[0] : "",
      reason: absence?.reason || "",
      notes: absence?.notes || "",
    },
  });

  // Date states for DatePicker
  const [startDateValue, setStartDateValue] = useState<Date | null>(
    absence?.startDate ? new Date(absence.startDate) : null
  );
  const [endDateValue, setEndDateValue] = useState<Date | null>(
    absence?.endDate ? new Date(absence.endDate) : null
  );

  const watchedStartDate = watch("startDate");
  const watchedEndDate = watch("endDate");

  // Calculate total days (including all days - weekends, holidays, everything)
  const calculateTotalDays = (start: string, end: string) => {
    if (!start || !end) return 0;

    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // +1 to include both start and end dates
  };

  const totalDays = calculateTotalDays(watchedStartDate, watchedEndDate);

  const absenceTypeOptions = [
    { value: "SICK_LEAVE", label: "إجازة مرضية" },
    { value: "VACATION", label: "إجازة سنوية" },
    { value: "PERSONAL_LEAVE", label: "إجازة شخصية" },
    { value: "MATERNITY_LEAVE", label: "إجازة أمومة" },
    { value: "PATERNITY_LEAVE", label: "إجازة أبوة" },
    { value: "BEREAVEMENT", label: "إجازة وفاة" },
    { value: "OTHER", label: "أخرى" },
  ];

  const leaveCategoryOptions = [
    { value: "PAID_LEAVE", label: "إجازة مدفوعة" },
    { value: "UNPAID_LEAVE", label: "غياب غير مدفوع" },
  ];

  const userOptions = users.map(user => ({
    value: user.id.toString(),
    label: `${user.fullname} (${user.email})`
  }));

  return (
    <div className="space-y-6">
      {/* Role-based Header */}
      <div className="flex items-center space-x-2 space-x-reverse">
        {isAdmin ? (
          <>
            <Shield className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-green-800">
              إضافة غياب مباشر
            </h3>
            <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded-full">
              موافق تلقائياً
            </span>
          </>
        ) : (
          <>
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-blue-800">
              طلب إجازة
            </h3>
            <span className="text-sm text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
              يحتاج موافقة
            </span>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit((data) => {
        const formData = {
          ...data,
          companyId,
        } as CreateAbsenceRequest | UpdateAbsenceRequest;
        onSubmit(formData);
      })} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* User Selection */}
        <div className="flex flex-col">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <User className="inline w-4 h-4 ml-1" />
            الموظف
          </label>
          <Select
            placeholder="اختر الموظف"
            options={userOptions}
            value={watch("userId")}
            onChange={(value) => setValue("userId", value)}
            error={errors.userId?.message}
          />
        </div>

        {/* Absence Type */}
        <div className="flex flex-col">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <FileText className="inline w-4 h-4 ml-1" />
            نوع الغياب
          </label>
          <Select
            placeholder="اختر نوع الغياب"
            options={absenceTypeOptions}
            value={watch("type")}
            onChange={(value) => setValue("type", value as AbsenceType)}
            error={errors.type?.message}
          />
        </div>
      </div>

      {/* Leave Category - Salary Impact */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                التأثير على الراتب
              </label>
              <p className="text-xs text-gray-600">
                {watch("leaveCategory") === "PAID_LEAVE"
                  ? "إجازة مدفوعة - لن يتم خصم من الراتب"
                  : "غياب غير مدفوع - سيتم الخصم من الراتب"}
              </p>
            </div>
          </div>
          <div className="w-48">
            <Select
              options={leaveCategoryOptions}
              value={watch("leaveCategory")}
              onChange={(value) => setValue("leaveCategory", value as LeaveCategory)}
              error={errors.leaveCategory?.message}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Start Date */}
        <div className="flex flex-col">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline w-4 h-4 ml-1" />
            تاريخ البداية
          </label>
          <DatePicker
            label=""
            value={startDateValue}
            onChange={(date) => {
              setStartDateValue(date);
              setValue("startDate", date ? toLocalDay(date) : "");
            }}
            error={errors.startDate?.message}
          />
        </div>

        {/* End Date */}
        <div className="flex flex-col">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline w-4 h-4 ml-1" />
            تاريخ النهاية
          </label>
          <DatePicker
            label=""
            value={endDateValue}
            onChange={(date) => {
              setEndDateValue(date);
              setValue("endDate", date ? toLocalDay(date) : "");
            }}
            error={errors.endDate?.message}
            minDate={startDateValue}
          />
        </div>
      </div>

      {/* Total Days Display */}
      {totalDays > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-blue-600 ml-2" />
            <span className="text-blue-800 font-medium">
              عدد الأيام: {totalDays} يوم
            </span>
          </div>
        </div>
      )}

      {/* Reason */}
      <div className="flex flex-col">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <FileText className="inline w-4 h-4 ml-1" />
          السبب (اختياري)
        </label>
        <Input
          placeholder="أدخل سبب الغياب..."
          {...register("reason")}
          error={errors.reason?.message}
        />
      </div>

      {/* Notes */}
      <div className="flex flex-col">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <FileText className="inline w-4 h-4 ml-1" />
          ملاحظات إضافية (اختياري)
        </label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
          placeholder="أدخل أي ملاحظات إضافية..."
          {...register("notes")}
        />
        {errors.notes && (
          <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 space-x-reverse">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            إلغاء
          </Button>
        )}
        <Button
          type="submit"
          loading={loading}
          disabled={loading}
        >
          {absence 
            ? "تحديث طلب الغياب" 
            : isAdmin 
              ? "إضافة الغياب مباشرة" 
              : "إرسال طلب الإجازة"
          }
        </Button>
      </div>
      </form>
    </div>
  );
};

export default AbsenceForm;
