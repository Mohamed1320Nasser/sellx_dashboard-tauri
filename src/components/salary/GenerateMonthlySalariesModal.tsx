import React, { useState } from 'react';
import { X, Zap, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button, Select, Card } from '../ui';
import { useGenerateMonthlySalaries } from '../../hooks/api/useSalaries';

interface GenerateMonthlySalariesModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
}

export const GenerateMonthlySalariesModal: React.FC<GenerateMonthlySalariesModalProps> = ({
  isOpen,
  onClose,
  companyId,
}) => {
  const currentDate = new Date();
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1));
  const [year, setYear] = useState(String(currentDate.getFullYear()));
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);

  const generateMutation = useGenerateMonthlySalaries();

  // Month options
  const monthOptions = [
    { value: '1', label: 'يناير' },
    { value: '2', label: 'فبراير' },
    { value: '3', label: 'مارس' },
    { value: '4', label: 'أبريل' },
    { value: '5', label: 'مايو' },
    { value: '6', label: 'يونيو' },
    { value: '7', label: 'يوليو' },
    { value: '8', label: 'أغسطس' },
    { value: '9', label: 'سبتمبر' },
    { value: '10', label: 'أكتوبر' },
    { value: '11', label: 'نوفمبر' },
    { value: '12', label: 'ديسمبر' },
  ];

  // Year options
  const currentYear = currentDate.getFullYear();
  const yearOptions = Array.from({ length: 4 }, (_, i) => {
    const y = currentYear - 2 + i;
    return { value: String(y), label: String(y) };
  });

  const handleGenerate = async () => {
    try {
      const response = await generateMutation.mutateAsync({
        companyId,
        month: parseInt(month),
        year: parseInt(year),
      });

      setResults(response.data);
      setShowResults(true);
    } catch (error) {
      console.error('Generate error:', error);
    }
  };

  const handleClose = () => {
    setShowResults(false);
    setResults(null);
    setMonth(String(currentDate.getMonth() + 1));
    setYear(String(currentDate.getFullYear()));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                إنشاء رواتب الشهر
              </h2>
              <p className="text-sm text-gray-600">
                إنشاء تلقائي لرواتب جميع الموظفين
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {!showResults ? (
            <div className="space-y-6">
              {/* Period Selection */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="الشهر *"
                  value={month}
                  onChange={setMonth}
                  options={monthOptions}
                />

                <Select
                  label="السنة *"
                  value={year}
                  onChange={setYear}
                  options={yearOptions}
                />
              </div>

              {/* Info Box */}
              <Card padding="md">
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                    كيف يعمل الإنشاء التلقائي؟
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-600 mr-7">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>سيتم إنشاء راتب لكل موظف لديه قالب راتب محفوظ</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>سيتم حساب أيام العمل والغياب تلقائياً من سجلات الحضور</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>الرواتب المنشأة ستكون في حالة "مسودة" ويمكن تعديلها</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      <span>إذا كان الراتب موجود بالفعل، سيتم تخطيه</span>
                    </li>
                  </ul>
                </div>
              </Card>

              {/* Selected Period Display */}
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-gray-600 mb-1">الفترة المحددة</p>
                <p className="text-lg font-bold text-purple-600">
                  {monthOptions.find(m => m.value === month)?.label} {year}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Results Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card padding="md">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {results?.created || 0}
                    </p>
                    <p className="text-sm text-gray-600">تم الإنشاء</p>
                  </div>
                </Card>

                <Card padding="md">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <AlertCircle className="w-6 h-6 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-blue-600">
                      {results?.alreadyExists || 0}
                    </p>
                    <p className="text-sm text-gray-600">موجود مسبقاً</p>
                  </div>
                </Card>

                <Card padding="md">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <p className="text-2xl font-bold text-red-600">
                      {results?.failed || 0}
                    </p>
                    <p className="text-sm text-gray-600">فشل</p>
                  </div>
                </Card>
              </div>

              {/* Detailed Results */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">تفاصيل النتائج</h3>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {results?.results?.map((result: any, index: number) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        result.status === 'created'
                          ? 'bg-green-50 border-green-200'
                          : result.status === 'already_exists'
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {result.status === 'created' ? (
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                          ) : result.status === 'already_exists' ? (
                            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {result.user}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {result.status === 'created' && (
                                <>
                                  صافي الراتب: {result.netSalary?.toFixed(2)} ج.م
                                  {' | '}
                                  أيام العمل: {result.workingDays}
                                  {' | '}
                                  الغياب: {result.absentDays}
                                </>
                              )}
                              {result.status === 'already_exists' && result.message}
                              {result.status === 'failed' && (
                                <span className="text-red-600">{result.error}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          {!showResults ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                إلغاء
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Zap className="w-4 h-4 ml-2" />
                {generateMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الرواتب'}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700 text-white">
              إغلاق
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
