import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { Layout } from "../components/layout";
import QuoteForm from "../components/quotes/QuoteForm";
import { fromQuote, rememberTerms, toRequest, type QuoteFormState } from "../components/quotes/quoteFormModel";
import { useQuote, useUpdateQuote } from "../hooks/api/useQuotes";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import type { Quote } from "../types";

const QuoteEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || company?.company?.id);
  const { data, isLoading } = useQuote(id!, companyId);
  const quote = data as Quote | undefined;
  const update = useUpdateQuote();
  // built once per loaded quote (a refetch must not wipe what is being typed)
  const initial = useMemo(() => (quote?.id ? fromQuote(quote) : null), [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (form: QuoteFormState) => {
    const body = toRequest(form, companyId);
    try {
      await update.mutateAsync({ id: id!, data: body });
      rememberTerms(body.terms || []);
      navigate(`/quotes/${id}`);
    } catch {
      // the hook shows the server's message
    }
  };

  if (isLoading || (!quote && !initial)) {
    return (
      <Layout>
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (quote?.convertedToSaleId) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg py-16 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-amber-500" />
          <h1 className="mb-2 text-lg font-semibold text-gray-900">لا يمكن تعديل هذا العرض</h1>
          <p className="mb-5 text-gray-600">تم تحويله إلى فاتورة{quote.convertedToSale?.receiptNumber ? ` (${quote.convertedToSale.receiptNumber})` : ""}.</p>
          <Link to={`/quotes/${id}`} className="text-primary-600 hover:underline">
            عرض العرض
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {initial && (
        <QuoteForm
          title={
            <>
              تعديل العرض{" "}
              <span dir="ltr" className="whitespace-nowrap">
                {quote?.quoteNumber}
              </span>
            </>
          }
          subtitle={quote?.customerName || undefined}
          companyId={companyId}
          initial={initial}
          isNew={false}
          saving={update.isPending}
          saveLabel="حفظ التغييرات"
          onSave={save}
          onCancel={() => navigate(`/quotes/${id}`)}
        />
      )}
    </Layout>
  );
};

export default QuoteEdit;
