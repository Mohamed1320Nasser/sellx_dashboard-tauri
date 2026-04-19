import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Select } from "../ui";
import { useUsernameCheck } from "../../hooks/useUsernameCheck";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const companyUserSchema = z.object({
  fullname: z.string().min(1, "الاسم الكامل مطلوب"),
  username: z.string().min(3, "اسم المستخدم يجب أن يكون على الأقل 3 أحرف"),
  email: z.string().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")),
  password: z.string().min(6, "كلمة المرور يجب أن تكون على الأقل 6 أحرف").optional(),
  phone: z.string().min(1, "رقم الهاتف مطلوب"),
  role: z.enum(["CASHIER", "MANAGER", "ADMIN"]),
});

type CompanyUserFormData = z.infer<typeof companyUserSchema>;

interface CompanyUserFormProps {
  companyId: number;
  onSubmit: (data: CompanyUserFormData & { companyId: number }) => void;
  loading?: boolean;
  onCancel?: () => void;
  initialData?: Partial<CompanyUserFormData>;
  isEdit?: boolean;
}

const CompanyUserForm: React.FC<CompanyUserFormProps> = ({
  companyId,
  onSubmit,
  loading = false,
  onCancel,
  initialData,
  isEdit = false,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CompanyUserFormData>({
    resolver: zodResolver(companyUserSchema),
    defaultValues: {
      role: "CASHIER",
      ...initialData,
    },
  });

  const username = watch("username");
  const { isChecking, isAvailable, error: usernameError } = useUsernameCheck(username || "");

  const handleFormSubmit = (data: CompanyUserFormData) => {
    console.log('Form submit attempt:', { data, isChecking, isAvailable, isEdit });

    // Validate password is required when creating new user
    if (!isEdit && (!data.password || data.password.trim() === "")) {
      return; // Form validation will handle the error
    }

    // Don't submit if username is still being checked
    if (!isEdit && isChecking) {
      console.log('Blocked: Still checking username');
      return;
    }

    // Validate username is available (for new users only)
    if (!isEdit && isAvailable !== true) {
      console.log('Blocked: Username not available', { isAvailable });
      return; // Username is not confirmed available
    }

    // Remove password from data if it's empty (for edit mode)
    const submitData = { ...data };
    if (isEdit && (!submitData.password || submitData.password.trim() === "")) {
      delete submitData.password;
    }

    // Remove email from data if it's empty
    if (!submitData.email || submitData.email.trim() === "") {
      delete submitData.email;
    }

    console.log('Submitting:', submitData);
    onSubmit({ ...submitData, companyId });
  };

  const roleOptions = [
    { value: "CASHIER", label: "كاشير" },
    { value: "MANAGER", label: "مدير" },
    { value: "ADMIN", label: "مدير شركة" },
  ];

  // Get username validation message
  const getUsernameValidation = () => {
    console.log('getUsernameValidation called:', { username, isChecking, isAvailable, usernameError });

    if (!username || username.length < 3) return null;

    if (isChecking) {
      return (
        <span className="flex items-center gap-1 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          جاري التحقق...
        </span>
      );
    }
    if (usernameError) {
      return (
        <span className="flex items-center gap-1 text-sm text-red-600">
          <XCircle className="w-4 h-4" />
          {usernameError}
        </span>
      );
    }
    if (isAvailable === true) {
      return (
        <span className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          اسم المستخدم متاح
        </span>
      );
    }
    if (isAvailable === false) {
      return (
        <span className="flex items-center gap-1 text-sm text-red-600">
          <XCircle className="w-4 h-4" />
          اسم المستخدم محجوز بالفعل
        </span>
      );
    }
    return null;
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <Input
        label="الاسم الكامل"
        placeholder="أدخل الاسم الكامل"
        {...register("fullname")}
        error={errors.fullname?.message}
        disabled={loading}
      />

      <div className="space-y-1">
        <Input
          label="اسم المستخدم"
          placeholder="أدخل اسم المستخدم (3 أحرف على الأقل)"
          {...register("username")}
          error={errors.username?.message}
          disabled={loading || isEdit}
          onChange={(e) => {
            const lowercase = e.target.value.toLowerCase();
            setValue("username", lowercase);
          }}
        />
        {!isEdit && getUsernameValidation()}
      </div>

      <Input
        label="رقم الهاتف"
        placeholder="أدخل رقم الهاتف"
        {...register("phone")}
        error={errors.phone?.message}
        disabled={loading}
      />

      <Input
        label="البريد الإلكتروني (اختياري)"
        type="email"
        placeholder="أدخل البريد الإلكتروني"
        {...register("email")}
        error={errors.email?.message}
        disabled={loading}
      />

      {!isEdit && (
        <Input
          label="كلمة المرور"
          type="password"
          placeholder="أدخل كلمة المرور"
          {...register("password", {
            required: !isEdit ? "كلمة المرور مطلوبة" : false,
            minLength: {
              value: 6,
              message: "كلمة المرور يجب أن تكون على الأقل 6 أحرف"
            }
          })}
          error={errors.password?.message}
          disabled={loading}
        />
      )}

      <Select
        label="الدور في الشركة"
        options={roleOptions}
        value={watch("role")}
        onChange={(value) => setValue("role", value as "CASHIER" | "MANAGER" | "ADMIN")}
        error={errors.role?.message}
        disabled={loading}
      />

      <div className="flex justify-end space-x-4 space-x-reverse">
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
        <Button type="submit" loading={loading}>
          {isEdit ? "تحديث المستخدم" : "إنشاء مستخدم"}
        </Button>
      </div>
    </form>
  );
};

export default CompanyUserForm;
