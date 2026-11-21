/** Arabic labels for the activity log (سجل العمليات) */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  SALE_DELETE: "إلغاء فاتورة بيع",
  SALE_EDIT: "تعديل فاتورة بيع",
  SALE_DISCOUNT: "بيع بخصم",
  SALE_PRICE_OVERRIDE: "بيع بسعر مختلف عن القائمة",
  HELD_SALE_DELETE: "حذف فاتورة معلقة لكاشير آخر",
  PAYMENT_CREATE: "تسجيل دفعة",
  PAYMENT_EDIT: "تعديل دفعة",
  PAYMENT_DELETE: "حذف دفعة",
  RETURN_CREATE: "إنشاء مرتجع",
  RETURN_COMPLETE: "اعتماد مرتجع",
  RETURN_EDIT: "رفض / تعديل مرتجع",
  RETURN_DELETE: "حذف مرتجع",
  PRODUCT_PRICE_CHANGE: "تغيير سعر منتج",
  PRODUCT_STOCK_ADJUST: "تعديل كمية المخزون",
  PRODUCT_DELETE: "حذف منتج",
  PRODUCT_BULK_DELETE: "حذف منتجات (جماعي)",
  PRICE_LIST_EDIT: "تعديل قائمة أسعار",
  PRICE_LIST_DELETE: "حذف قائمة أسعار",
  PRICE_LIST_PRICES: "تعديل أسعار قائمة",
  PRICE_LIST_ADJUST: "تعديل أسعار جماعي بنسبة",
  PURCHASE_EDIT: "تعديل فاتورة شراء",
  PURCHASE_DELETE: "حذف فاتورة شراء",
  PURCHASE_REVERT_PRICES: "تراجع عن أسعار فاتورة شراء",
  SUPPLIER_RETURN_CREATE: "مرتجع للمورد",
  SUPPLIER_RETURN_DELETE: "حذف مرتجع للمورد",
  SHIFT_CLOSE: "إغلاق وردية",
  CASH_IN: "إيداع نقدي في الدرج",
  CASH_OUT: "سحب نقدي من الدرج",
  STOCKTAKE_COMPLETE: "اعتماد جرد",
  STOCKTAKE_CANCEL: "إلغاء جرد",
  USER_INVITE: "إضافة مستخدم",
  USER_ROLE_CHANGE: "تغيير صلاحية مستخدم",
  USER_EDIT: "تعديل بيانات مستخدم",
  USER_ACTIVATE: "تفعيل مستخدم",
  USER_DEACTIVATE: "إيقاف مستخدم",
  USER_REMOVE: "إزالة مستخدم",
  LOGIN: "تسجيل دخول",
  LOGIN_FAILED: "محاولة دخول بكلمة مرور خاطئة",
  TAX_CREATE: "إضافة ضريبة",
  TAX_EDIT: "تعديل ضريبة",
  TAX_DELETE: "حذف ضريبة",
  COMPANY_PROFILE_EDIT: "تعديل بيانات الشركة",
  EXPENSE_CREATE: "تسجيل مصروف",
  EXPENSE_EDIT: "تعديل مصروف",
  EXPENSE_DELETE: "حذف مصروف",
  SALARY_PAY: "صرف راتب",
  SALARY_DELETE: "حذف راتب",
  OFFLINE_SETTING: "تغيير البيع بدون إنترنت",
  DEVICE_ADD: "تسجيل جهاز للبيع بدون إنترنت",
  DEVICE_REMOVE: "إلغاء تسجيل جهاز",
};

export const AUDIT_GROUP_OPTIONS = [
  { value: "SALES", label: "المبيعات" },
  { value: "PAYMENTS", label: "الدفعات" },
  { value: "RETURNS", label: "المرتجعات" },
  { value: "PRODUCTS", label: "المنتجات والأسعار والجرد" },
  { value: "PURCHASES", label: "المشتريات" },
  { value: "CASH", label: "الدرج والورديات والمصروفات" },
  { value: "STAFF", label: "المستخدمون والدخول" },
  { value: "SETTINGS", label: "الإعدادات" },
];

/** Colour of the action badge: red = deletes and failed sign-ins, amber = money / price changes */
export function actionTone(action: string): "error" | "warning" | "info" | "success" | "default" {
  if (/DELETE|REMOVE|LOGIN_FAILED|DEACTIVATE|CANCEL/.test(action)) return "error";
  if (/PRICE|DISCOUNT|STOCK_ADJUST|CASH_OUT|EDIT|ROLE|REVERT/.test(action)) return "warning";
  if (action === "LOGIN" || action === "USER_ACTIVATE") return "info";
  return "success";
}

export const ROLE_LABELS: Record<string, string> = { ADMIN: "مالك", MANAGER: "مدير", CASHIER: "كاشير" };
export const SOURCE_LABELS: Record<string, string> = { WEB: "المتصفح", DESKTOP: "برنامج الكمبيوتر", API: "النظام" };

/** Names of the fields shown in "before → after" */
export const FIELD_LABELS: Record<string, string> = {
  sellingPrice: "سعر البيع",
  purchasePrice: "سعر الشراء",
  stock: "المخزون",
  amount: "المبلغ",
  method: "طريقة الدفع",
  client: "العميل",
  role: "الصلاحية",
  status: "الحالة",
  refundAmount: "المسترد",
  name: "الاسم",
  fullname: "الاسم",
  email: "البريد",
  phone: "الهاتف",
  rate: "النسبة",
  isActive: "مفعّل",
  isDefault: "افتراضي",
  appliesTo: "تطبق على",
  active: "مفعّلة",
  formulaBase: "أساس المعادلة",
  formulaPercent: "نسبة المعادلة",
  title: "البيان",
  paymentMethod: "طريقة الدفع",
  categoryId: "التصنيف",
  expenseDate: "التاريخ",
  invoiceNumber: "رقم الفاتورة",
  supplierId: "المورد",
  notes: "ملاحظات",
  dueDate: "تاريخ الاستحقاق",
  purchaseDate: "تاريخ الشراء",
  invoiceFile: "ملف الفاتورة",
  logo: "الشعار",
  address: "العنوان",
  taxNumber: "الرقم الضريبي",
  password: "كلمة المرور",
  offlineEnabled: "البيع بدون إنترنت",
};

/** Page for the item a row is about, when there is one */
export function entityLink(entityType: string, entityId: string | null, details?: Record<string, any> | null): string | null {
  if (!entityId && entityType !== "STOCKTAKE") return null;
  switch (entityType) {
    case "SALE": return `/sales/${entityId}`;
    case "PURCHASE": return `/purchases/${entityId}`;
    case "PRODUCT": return `/products/${entityId}`;
    case "RETURN": return `/returns/${entityId}`;
    case "STOCKTAKE": return entityId ? `/stocktakes/${entityId}` : "/stocktakes";
    case "EXPENSE": return `/expenses/${entityId}`;
    case "SALARY": return `/salaries/${entityId}`;
    case "PRICE_LIST": return "/price-lists";
    case "TAX": return "/settings/tax";
    case "USER": return "/users";
    case "COMPANY": return "/settings/company";
    case "SHIFT": return "/shifts";
    case "SUPPLIER_RETURN": return details?.purchaseId ? `/purchases/${details.purchaseId}` : null;
    default: return null;
  }
}
