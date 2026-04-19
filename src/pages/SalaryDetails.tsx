import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Wallet, Calendar, Edit } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Card } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useSalary } from '../hooks/api/useSalaries';
import { SalaryStatusBadge } from '../components/salary/SalaryStatusBadge';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const SalaryDetails: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { company } = useSessionAuthStore();
  const { hasPermission } = usePermissionStore();
  const companyId = company?.companyId || company?.company?.id;

  // Fetch salary data
  const { data: salaryData, isLoading } = useSalary(id!, companyId!);

  if (isLoading) {
    return (
      <Layout>
        <div className="w-full max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-600">جاري التحميل...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!salaryData) {
    return (
      <Layout>
        <div className="w-full max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-red-600">قالب الراتب غير موجود</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/salaries')}
              className="text-gray-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">تفاصيل قالب الراتب</h1>
                <SalaryStatusBadge status={salaryData.status} />
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {salaryData.user?.fullname}
              </p>
            </div>
          </div>
          {hasPermission('canManageExpenses') && salaryData.status === 'ACTIVE' && (
            <Button
              onClick={() => navigate(`/salaries/${id}/edit`)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Edit className="w-4 h-4 ml-2" />
              تعديل
            </Button>
          )}
        </div>

        {/* Employee Info */}
        <Card padding="lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">معلومات الموظف</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">الاسم</p>
              <p className="font-semibold text-gray-900">{salaryData.user?.fullname}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">البريد الإلكتروني</p>
              <p className="font-semibold text-gray-900">{salaryData.user?.email}</p>
            </div>
          </div>
        </Card>

        {/* Salary Details */}
        <Card padding="lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">تفاصيل الراتب</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-600 mb-1">الراتب الأساسي</p>
              <p className="text-2xl font-bold text-blue-600">
                {salaryData.baseSalary.toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-gray-600 mb-1">البدلات</p>
              <p className="text-xl font-bold text-green-600">
                +{salaryData.allowances.toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-gray-600 mb-1">الخصومات</p>
              <p className="text-xl font-bold text-red-600">
                -{salaryData.deductions.toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-sm text-gray-600 mb-1">الإضافي</p>
              <p className="text-xl font-bold text-purple-600">
                +{salaryData.overtime.toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm text-gray-600 mb-1">المكافآت</p>
              <p className="text-xl font-bold text-orange-600">
                +{salaryData.bonuses.toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
              <p className="text-sm text-white mb-1">صافي الراتب (القالب)</p>
              <p className="text-2xl font-bold text-white">
                {(
                  salaryData.baseSalary +
                  salaryData.allowances +
                  salaryData.overtime +
                  salaryData.bonuses -
                  salaryData.deductions
                ).toFixed(2)}{' '}
                ج.م
              </p>
            </div>
          </div>
        </Card>

        {/* Payment History */}
        <Card padding="lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">سجل الدفعات</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">آخر دفع</p>
              <p className="font-semibold text-gray-900">
                {salaryData.lastPaidMonth && salaryData.lastPaidYear
                  ? `${salaryData.lastPaidMonth}/${salaryData.lastPaidYear}`
                  : 'لم يتم الدفع بعد'}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">مبلغ آخر دفع</p>
              <p className="font-semibold text-gray-900">
                {salaryData.lastPaidAmount
                  ? `${salaryData.lastPaidAmount.toFixed(2)} ج.م`
                  : '-'}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">تاريخ آخر دفع</p>
              <p className="font-semibold text-gray-900">
                {salaryData.lastPaymentDate
                  ? format(new Date(salaryData.lastPaymentDate), 'd MMMM yyyy', {
                      locale: ar,
                    })
                  : '-'}
              </p>
            </div>
          </div>
        </Card>

        {/* Notes */}
        {salaryData.notes && (
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">ملاحظات</h3>
            <p className="text-gray-600 whitespace-pre-wrap">{salaryData.notes}</p>
          </Card>
        )}

        {/* Metadata */}
        <Card padding="md">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">تاريخ الإنشاء: </span>
              <span className="font-medium text-gray-900">
                {format(new Date(salaryData.createdAt), 'd MMMM yyyy - h:mm a', {
                  locale: ar,
                })}
              </span>
            </div>
            <div>
              <span className="text-gray-600">آخر تحديث: </span>
              <span className="font-medium text-gray-900">
                {format(new Date(salaryData.updatedAt), 'd MMMM yyyy - h:mm a', {
                  locale: ar,
                })}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default SalaryDetails;
