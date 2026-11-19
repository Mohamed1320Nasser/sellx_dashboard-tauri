import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/layout";
import QuoteForm from "../components/quotes/QuoteForm";
import { emptyForm, rememberTerms, toRequest, type QuoteFormState } from "../components/quotes/quoteFormModel";
import { useCreateQuote } from "../hooks/api/useQuotes";
import { useSessionAuthStore } from "../stores/sessionAuthStore";

const QuoteCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || company?.company?.id);
  const create = useCreateQuote();
  const initial = useMemo(() => emptyForm(), []);

  const save = async (form: QuoteFormState) => {
    try {
      const res: any = await create.mutateAsync(toRequest(form, companyId));
      rememberTerms(toRequest(form, companyId).terms || []);
      const id = res?.data?.id || res?.id;
      navigate(id ? `/quotes/${id}` : "/quotes");
    } catch {
      // the hook shows the server's message
    }
  };

  return (
    <Layout>
      <QuoteForm
        title="عرض سعر جديد"
        subtitle="البنود والأسعار كما سيستلمها العميل"
        companyId={companyId}
        initial={initial}
        isNew
        saving={create.isPending}
        saveLabel="حفظ العرض"
        onSave={save}
        onCancel={() => navigate("/quotes")}
      />
    </Layout>
  );
};

export default QuoteCreate;
