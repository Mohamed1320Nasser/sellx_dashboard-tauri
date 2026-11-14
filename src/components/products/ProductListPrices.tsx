import React from "react";
import { Link } from "react-router-dom";
import { Tags } from "lucide-react";
import { Card } from "../ui";
import { usePriceGrid, useSetPrices } from "../../hooks/api/usePriceLists";
import { PriceCell } from "../../pages/PriceLists";
import { describeFormula, type PriceGridProduct, type PriceList } from "../../services/priceListService";

/** The product's price in every other list (the default list is the selling price field above) */
const ProductListPrices: React.FC<{ productId: string; companyId: number }> = ({ productId, companyId }) => {
  const { data } = usePriceGrid({ companyId, productId, page: 1, limit: 1 });
  const setPrices = useSetPrices();
  const product: PriceGridProduct | undefined = data?.products?.[0];
  const lists: PriceList[] = (data?.lists || []).filter((l: PriceList) => !l.isDefault);
  if (!product || lists.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Tags className="w-5 h-5 text-emerald-600" />
          أسعار القوائم الأخرى
        </h3>
        <Link to="/price-lists" className="text-sm text-primary-600 hover:underline">
          كل قوائم الأسعار
        </Link>
      </div>
      <div className="divide-y divide-gray-100">
        {lists.map((list) => (
          <div key={list.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="font-medium text-gray-900">{list.name}</div>
              <div className="text-xs text-gray-500">{describeFormula(list)}</div>
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
        الخانة المنقطة سعر تلقائي من معادلة القائمة. اكتب سعراً لتثبيته، أو امسحه للرجوع للتلقائي. يُحفظ فوراً.
      </p>
    </Card>
  );
};

export default ProductListPrices;
