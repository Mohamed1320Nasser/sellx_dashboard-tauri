import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Tags } from "lucide-react";
import { usePriceGrid, useSetPrices } from "../../hooks/api/usePriceLists";
import { PriceCell } from "../../pages/PriceLists";
import { describeFormula, type PriceGridProduct, type PriceList } from "../../services/priceListService";
import { formatCurrency } from "../../utils";
import ProductFormSection from "./ProductFormSection";

/**
 * The product's prices, edited in the price lists themselves: the default list is the base
 * selling price, the others follow their rule unless a price is typed. Saved (and logged) at once.
 */
const ProductListPrices: React.FC<{ productId: string; companyId: number; step?: number; unitLabel?: string }> = ({
  productId,
  companyId,
  step,
  unitLabel,
}) => {
  const { data, isLoading } = usePriceGrid({ companyId, productId, page: 1, limit: 1 });
  const setPrices = useSetPrices();
  const product: PriceGridProduct | undefined = data?.products?.[0];
  const lists: PriceList[] = [...(data?.lists || [])].sort((a: PriceList, b: PriceList) => Number(b.isDefault) - Number(a.isDefault));
  const basePrice = product ? Number(product.sellingPrice) || 0 : 0;

  return (
    <ProductFormSection
      step={step}
      title="الأسعار"
      description={`سعر ${unitLabel || "القطعة"} في كل قائمة أسعار. التغيير يُحفظ فوراً ويُسجَّل في سجل العمليات.`}
      aside={
        <Link to="/price-lists" className="flex items-center gap-1 whitespace-nowrap text-sm text-primary-600 hover:underline">
          <Tags className="h-4 w-4" />
          قوائم الأسعار
        </Link>
      }
    >
      {isLoading || !product ? (
        <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <>
          {basePrice <= 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>المنتج بدون سعر بيع، فلا يمكن بيعه حتى تكتب سعره في القائمة الأساسية.</span>
            </div>
          )}
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {lists.map(list => (
              <div key={list.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    {list.name}
                    {list.isDefault && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">الأساسي</span>}
                  </div>
                  <div className="text-xs text-gray-500">{list.isDefault ? "سعر البيع العادي" : describeFormula(list)}</div>
                </div>
                <PriceCell
                  product={product}
                  list={list}
                  saving={setPrices.isPending}
                  onSave={(p, l, price) => setPrices.mutate({ companyId, prices: [{ productId: p.id, priceListId: l.id, price }] })}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            التكلفة الحالية: <span className="font-medium text-gray-700">{formatCurrency(Number(product.purchasePrice) || 0)}</span>
            {" "}— تتحدث من فواتير الشراء.
          </p>
        </>
      )}
    </ProductFormSection>
  );
};

export default ProductListPrices;
