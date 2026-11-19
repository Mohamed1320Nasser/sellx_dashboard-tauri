import React from "react";

interface Props {
  step?: number;
  title: string;
  description?: string;
  /** Small note on the side of the title, e.g. "يُحفظ فوراً" */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/** One numbered section of the product form (same look on create and edit) */
const ProductFormSection: React.FC<Props> = ({ step, title, description, aside, children }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {step !== undefined && (
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
            {step}
          </span>
        )}
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
      </div>
      {aside}
    </div>
    {children}
  </section>
);

export default ProductFormSection;
