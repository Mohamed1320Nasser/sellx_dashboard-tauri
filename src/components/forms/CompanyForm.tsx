import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input } from "../ui";
import { useUsernameCheck } from "../../hooks/useUsernameCheck";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const companySchema = z.object({
  name: z.string().min(2, "اسم الشركة يجب أن يكون على الأقل حرفين").max(100, "اسم الشركة يجب أن يكون أقل من 100 حرف"),
  email: z.string().email("البريد الإلكتروني غير صحيح").min(5, "البريد الإلكتروني قصير جداً").max(64, "البريد الإلكتروني طويل جداً"),
  phone: z.string().optional().refine((val) => !val || /^[0-9]*$/.test(val), "رقم الهاتف يجب أن يحتوي على أرقام فقط"),
  address: z.string().optional().refine((val) => !val || val.length >= 5, "العنوان يجب أن يكون على الأقل 5 أحرف"),
  taxNumber: z.string().optional().refine((val) => !val || val.length >= 5, "الرقم الضريبي يجب أن يكون على الأقل 5 أحرف"),
  adminFullname: z.string().min(2, "اسم المدير يجب أن يكون على الأقل حرفين").max(50, "اسم المدير يجب أن يكون أقل من 50 حرف"),
  adminUsername: z.string().min(3, "اسم المستخدم يجب أن يكون على الأقل 3 أحرف"),
  adminEmail: z.string().email("البريد الإلكتروني للمدير غير صحيح").min(5, "البريد الإلكتروني قصير جداً").max(64, "البريد الإلكتروني طويل جداً"),
  adminPassword: z.string()
    .min(8, "كلمة المرور يجب أن تكون على الأقل 8 أحرف")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      "كلمة المرور يجب أن تحتوي على حرف صغير، حرف كبير، رقم، ورمز خاص"),
  adminPhone: z.string().optional().refine((val) => !val || /^[0-9]*$/.test(val), "رقم الهاتف يجب أن يحتوي على أرقام فقط"),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface CompanyFormProps {
  onSubmit: (data: CompanyFormData, profileFile?: File) => void;
  loading?: boolean;
  onCancel?: () => void;
}

const CompanyForm: React.FC<CompanyFormProps> = ({
  onSubmit,
  loading = false,
  onCancel,
}) => {
  const [profileFile, setProfileFile] = React.useState<File | undefined>();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
  });

  const adminUsername = watch("adminUsername");
  const { isChecking, isAvailable, error: usernameError } = useUsernameCheck(adminUsername || "");

  const handleFormSubmit = (data: CompanyFormData) => {
    console.log('Company form submit attempt:', { data, isChecking, isAvailable });

    // Don't submit if username is still being checked
    if (isChecking) {
      console.log('Blocked: Still checking username');
      return;
    }

    // Validate username is available
    if (isAvailable !== true) {
      console.log('Blocked: Username not available', { isAvailable });
      return; // Username is not confirmed available
    }

    console.log('Submitting company form:', data);
    onSubmit(data, profileFile);
  };

  // Get username validation message
  const getUsernameValidation = () => {
    if (!adminUsername || adminUsername.length < 3) return null;
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
      {/* Company Information */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">معلومات الشركة</h3>
        <div className="space-y-4">
          <Input
            label="اسم الشركة"
            placeholder="أدخل اسم الشركة"
            {...register("name")}
            error={errors.name?.message}
            disabled={loading}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="البريد الإلكتروني"
              type="email"
              placeholder="أدخل البريد الإلكتروني"
              {...register("email")}
              error={errors.email?.message}
              disabled={loading}
            />

            <Input
              label="رقم الهاتف"
              placeholder="أدخل رقم الهاتف"
              {...register("phone")}
              error={errors.phone?.message}
              disabled={loading}
            />
          </div>

          <Input
            label="العنوان"
            placeholder="أدخل عنوان الشركة"
            {...register("address")}
            error={errors.address?.message}
            disabled={loading}
          />

          <Input
            label="الرقم الضريبي"
            placeholder="أدخل الرقم الضريبي (اختياري)"
            {...register("taxNumber")}
            error={errors.taxNumber?.message}
            disabled={loading}
          />
        </div>
      </div>

      {/* Admin Information */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">معلومات مدير الشركة</h3>
        <div className="space-y-4">
          <Input
            label="اسم المدير"
            placeholder="أدخل اسم مدير الشركة"
            {...register("adminFullname")}
            error={errors.adminFullname?.message}
            disabled={loading}
          />

          <div className="space-y-1">
            <Input
              label="اسم المستخدم"
              placeholder="أدخل اسم المستخدم (3 أحرف على الأقل)"
              {...register("adminUsername")}
              error={errors.adminUsername?.message}
              disabled={loading}
              onChange={(e) => {
                const lowercase = e.target.value.toLowerCase();
                setValue("adminUsername", lowercase);
              }}
            />
            {getUsernameValidation()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="البريد الإلكتروني للمدير"
              type="email"
              placeholder="أدخل البريد الإلكتروني"
              {...register("adminEmail")}
              error={errors.adminEmail?.message}
              disabled={loading}
            />

            <Input
              label="رقم هاتف المدير"
              placeholder="أدخل رقم الهاتف"
              {...register("adminPhone")}
              error={errors.adminPhone?.message}
              disabled={loading}
            />
          </div>

          <Input
            label="كلمة مرور المدير"
            type="password"
            placeholder="أدخل كلمة المرور"
            {...register("adminPassword")}
            error={errors.adminPassword?.message}
            disabled={loading}
          />
        </div>
      </div>

      {/* Profile Image */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          شعار الشركة (اختياري)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setProfileFile(e.target.files?.[0])}
          className="input-field"
          disabled={loading}
        />
      </div>

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
          تسجيل الشركة
        </Button>
      </div>
    </form>
  );
};

export default CompanyForm;
