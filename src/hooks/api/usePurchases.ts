import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseService } from "../../services/purchaseService";
import { supplierReturnService, type CreateSupplierReturnRequest } from "../../services/supplierReturnService";
import { handleApiError } from "../../utils/errorHandler";
import toast from "react-hot-toast";

export const usePurchases = (params: {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  supplierId?: number;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ["purchases", params],
    queryFn: () => purchaseService.getList(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreatePurchase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: purchaseService.create,
    onSuccess: () => {
      // Invalidate ALL purchases queries to ensure refresh
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("تم إنشاء عملية الشراء بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

/** Everything a purchase, its payments or its returns can change */
const invalidatePurchaseData = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ["purchases"] });
  queryClient.invalidateQueries({ queryKey: ["purchase"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["payments"] });
  queryClient.invalidateQueries({ queryKey: ["supplier-statement"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
};

export const useEditPurchase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData | Record<string, any> }) =>
      purchaseService.edit(id, data as any),
    onSuccess: () => {
      invalidatePurchaseData(queryClient);
      toast.success("تم حفظ التعديلات");
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
};

export const useCreateSupplierReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSupplierReturnRequest) => supplierReturnService.create(data),
    onSuccess: () => {
      invalidatePurchaseData(queryClient);
      toast.success("تم تسجيل المرتجع للمورد");
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
};

export const useDeleteSupplierReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) =>
      supplierReturnService.delete(id, companyId),
    onSuccess: () => {
      invalidatePurchaseData(queryClient);
      toast.success("تم حذف المرتجع");
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
};

export const useDeletePurchase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: number; companyId: number }) =>
      purchaseService.delete(id, companyId),
    onSuccess: () => {
      invalidatePurchaseData(queryClient);
      toast.success("تم حذف عملية الشراء بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};
