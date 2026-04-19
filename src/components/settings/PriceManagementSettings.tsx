import React, { useState } from 'react';
import { DollarSign, Info } from 'lucide-react';
import { Card, Select, Button } from '../ui';
import { useSessionAuthStore } from '../../stores/sessionAuthStore';
import toast from 'react-hot-toast';

interface PriceManagementSettingsProps {
  companyId: number;
  currentRoundingRule?: string;
  onUpdate?: () => void;
}

export const PriceManagementSettings: React.FC<PriceManagementSettingsProps> = ({
  companyId,
  currentRoundingRule = '0.50',
  onUpdate,
}) => {
  const [roundingRule, setRoundingRule] = useState(currentRoundingRule);
  const [isSaving, setIsSaving] = useState(false);

  const roundingOptions = [
    {
      value: '0.00',
      label: '0.00 - أرقام كاملة (16.00, 17.00)',
      description: 'الأفضل للتعامل النقدي السريع'
    },
    {
      value: '0.50',
      label: '0.50 - نصف جنيه (16.00, 16.50, 17.00)',
      description: 'موصى به - سهل في التعامل النقدي'
    },
    {
      value: '0.95',
      label: '0.95 - تسعير تسويقي (16.95, 17.95)',
      description: 'للسوبر ماركت والمنافسة العالية'
    },
    {
      value: '0.99',
      label: '0.99 - تسعير نفسي (16.99, 17.99)',
      description: 'يبدو أرخص للعميل'
    },
    {
      value: 'NONE',
      label: 'بدون تقريب',
      description: 'الاحتفاظ بالسعر كما هو'
    },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Call API to update company settings
      // await companyService.updatePriceSettings(companyId, { priceRoundingRule: roundingRule });

      toast.success('تم حفظ الإعدادات بنجاح');
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedOption = roundingOptions.find(opt => opt.value === roundingRule);

  return (
    <Card padding="lg">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
          <div className="p-2 bg-green-100 rounded-lg">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">إدارة الأسعار</h3>
            <p className="text-sm text-gray-600">تحكم في كيفية حساب وتقريب الأسعار</p>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">كيف يعمل التقريب التلقائي؟</p>
            <p>
              عند تحديث سعر منتج من خلال المشتريات، سيتم تطبيق قاعدة التقريب المختارة على السعر الجديد.
              مثال: السعر المحسوب 16.43 جنيه سيصبح 16.50 جنيه عند اختيار قاعدة 0.50
            </p>
          </div>
        </div>

        {/* Rounding Rule Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            قاعدة تقريب الأسعار
          </label>

          <Select
            options={roundingOptions.map(opt => ({
              value: opt.value,
              label: opt.label,
            }))}
            value={roundingRule}
            onChange={(value) => setRoundingRule(value)}
          />

          {selectedOption && (
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
              💡 {selectedOption.description}
            </p>
          )}
        </div>

        {/* Examples */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            أمثلة على التقريب:
          </label>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <ExampleRow original={16.23} rule={roundingRule} />
            <ExampleRow original={16.43} rule={roundingRule} />
            <ExampleRow original={16.75} rule={roundingRule} />
            <ExampleRow original={16.96} rule={roundingRule} />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button
            onClick={handleSave}
            disabled={isSaving || roundingRule === currentRoundingRule}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

// Helper component to show rounding examples
const ExampleRow: React.FC<{ original: number; rule: string }> = ({ original, rule }) => {
  const getRoundedValue = (price: number, rule: string): number => {
    if (rule === 'NONE') return price;

    const integerPart = Math.floor(price);
    const decimalPart = price - integerPart;

    switch (rule) {
      case '0.00':
        return Math.round(price);
      case '0.50':
        if (decimalPart < 0.25) return integerPart;
        else if (decimalPart < 0.75) return integerPart + 0.5;
        else return integerPart + 1;
      case '0.95':
        return decimalPart <= 0.95 ? integerPart + 0.95 : integerPart + 1.95;
      case '0.99':
        return decimalPart <= 0.99 ? integerPart + 0.99 : integerPart + 1.99;
      default:
        return parseFloat(price.toFixed(2));
    }
  };

  const rounded = getRoundedValue(original, rule);
  const changed = original !== rounded;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{original.toFixed(2)} جنيه</span>
      <span className="text-gray-400">←</span>
      <span className={`font-medium ${changed ? 'text-green-600' : 'text-gray-900'}`}>
        {rounded.toFixed(2)} جنيه
      </span>
    </div>
  );
};
