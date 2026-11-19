import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "../components/layout";
import QuoteForm from "../components/quotes/QuoteForm";
import { emptyForm, fromQuote, isoDateIn, rememberTerms, toRequest, type QuoteFormState } from "../components/quotes/quoteFormModel";
import { useCreateQuote, useQuote } from "../hooks/api/useQuotes";
import { useSessionAuthStore } from "../stores/sessionAuthStore";

/** A copy keeps the customer, lines, prices, discounts and terms; it gets a fresh validity */
function copyOf(form: QuoteFormState): QuoteFormState {
  return { ...form, validUntil: isoDateIn(14), lines: form.lines.map(l => ({ ...l, key: `${l.key}c` })) };
}

const QuoteCreate: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get("from") || "";
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || company?.company?.id);
  const create = useCreateQuote();
  const source = useQuote(fromId, companyId);

  const initial = useMemo(
    () => (fromId ? (source.data ? copyOf(fromQuote(source.data)) : null) : emptyForm()),
    // build once the source quote is in
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromId, source.data?.id]
  );

  const save = async (form: QuoteFormState) => {
    try {
      const request = toRequest(form, companyId);
      const res: any = await create.mutateAsync(request);
      rememberTerms(request.terms || []);
      const id = res?.data?.id || res?.id;
      navigate(id ? `/quotes/${id}` : "/quotes");
    } catch {
      // the hook shows the server's message
    }
  };

  if (fromId && !initial) {
    return (
      <Layout>
        <div className="mx-auto max-w-md py-16 text-center text-sm text-gray-500">
          {source.isError ? "تعذر تحميل العرض المنسوخ" : "جاري تجهيز النسخة..."}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <QuoteForm
        key={fromId || "new"}
        title={source.data && fromId ? "نسخة من عرض سعر" : "عرض سعر جديد"}
        subtitle={
          source.data && fromId ? (
            <>
              منسوخ من <bdi dir="ltr">{source.data.quoteNumber}</bdi>. راجع العميل والأسعار قبل الحفظ.
            </>
          ) : (
            "البنود والأسعار كما سيستلمها العميل"
          )
        }
        companyId={companyId}
        initial={initial!}
        isNew
        saving={create.isPending}
        saveLabel="حفظ العرض"
        onSave={save}
        onCancel={() => navigate(fromId ? `/quotes/${fromId}` : "/quotes")}
      />
    </Layout>
  );
};

export default QuoteCreate;
