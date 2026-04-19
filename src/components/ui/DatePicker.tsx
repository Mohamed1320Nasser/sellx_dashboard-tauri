import React from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  label?: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  required?: boolean;
}

const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  error,
  placeholder = 'اختر التاريخ',
  minDate,
  maxDate,
  required = false,
}) => {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      <div className="relative">
        <ReactDatePicker
          selected={value}
          onChange={onChange}
          dateFormat="yyyy/MM/dd"
          placeholderText={placeholder}
          minDate={minDate}
          maxDate={maxDate}
          className={`input-field pr-10 h-10 text-sm ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
          calendarClassName="custom-datepicker-calendar"
          wrapperClassName="w-full"
          popperClassName="custom-datepicker-popper"
          showYearDropdown
          showMonthDropdown
          dropdownMode="select"
        />
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default DatePicker;
