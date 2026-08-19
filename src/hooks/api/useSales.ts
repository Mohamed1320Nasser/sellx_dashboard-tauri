import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { saleService } from "../../services/saleService";
import { companyService } from "../../services/companyService";
import { handleApiError } from "../../utils/errorHandler";
import { generateSaleInvoicePdf } from "../../components/invoice/generateSaleInvoicePdf";
import toast from "react-hot-toast";

export const useSales = (params: {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  clientId?: number;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  additionalFeeFilter?: string;
}) => {
  return useQuery({
    queryKey: ["sales", params],
    queryFn: () => saleService.getList(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useSale = (id: number, companyId: number) => {
  return useQuery({
    queryKey: ["sale", id, companyId],
    queryFn: () => saleService.getById(id.toString(), companyId),
    enabled: !!id && !!companyId,
  });
};

export const useCreateSale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saleService.create,
    onSuccess: () => {
      // Invalidate ALL sales queries to ensure refresh
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم إنشاء عملية البيع بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

export const useUpdateSale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      saleService.edit(id, data),
    onSuccess: (_, variables) => {
      // Invalidate ALL sales queries to ensure refresh
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale", variables.id] });
      toast.success("تم تحديث عملية البيع بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

export const useDeleteSale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: number; companyId: number }) =>
      saleService.delete(id, companyId),
    onSuccess: () => {
      // Invalidate ALL sales queries to ensure refresh
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("تم حذف عملية البيع بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

export const useGenerateReceipt = () => {
  return useMutation({
    mutationFn: async ({
      saleId,
      companyId,
    }: {
      saleId: number;
      companyId: number;
    }) => {
      const [saleResponse, company] = await Promise.all([
        saleService.getById(saleId.toString(), companyId),
        companyService.getProfile(companyId),
      ]);

      // Handle different response structures
      let saleData: any = saleResponse;
      if (saleResponse && typeof saleResponse === "object" && "data" in saleResponse) {
        saleData = (saleResponse as any).data;
      }

      // Validate that we have the required data
      if (!saleData || !saleData.receiptNumber) {
        throw new Error(
          `Invalid sale data received: ${JSON.stringify(saleData)}`
        );
      }

      return { saleData, company };
    },
    onSuccess: async ({ saleData, company }) => {
      try {
        await generateSaleInvoicePdf({ sale: saleData, company });
        toast.success("تم تحميل الفاتورة بنجاح");
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء إنشاء الفاتورة";
        toast.error(errorMessage);
      }
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message || "حدث خطأ أثناء إنشاء الفاتورة");
    },
  });
};
