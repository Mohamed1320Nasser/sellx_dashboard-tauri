import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { stocktakeService, type CountMode, type StocktakeItemFilter, type StocktakeStatus } from "../../services/stocktakeService";
import { handleApiError } from "../../utils/errorHandler";

export const useStocktakes = (params: { companyId: number; page?: number; limit?: number; search?: string; status?: StocktakeStatus }) =>
  useQuery({
    queryKey: ["stocktakes", params],
    queryFn: () => stocktakeService.getList(params),
    enabled: !!params.companyId,
    placeholderData: keepPreviousData,
  });

export const useStocktake = (id: string, params: { companyId: number; filter?: StocktakeItemFilter; search?: string }) =>
  useQuery({
    queryKey: ["stocktake", id, params],
    queryFn: () => stocktakeService.getById(id, params),
    enabled: !!id && !!params.companyId,
    placeholderData: keepPreviousData,
  });

const invalidate = (queryClient: ReturnType<typeof useQueryClient>, withStock = false) => {
  queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
  queryClient.invalidateQueries({ queryKey: ["stocktake"] });
  if (withStock) {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    queryClient.invalidateQueries({ queryKey: ["stockMovements"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }
};

export const useStartStocktake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stocktakeService.start,
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم بدء الجرد");
    },
    onError: (error) => toast.error(handleApiError(error)),
  });
};

/** Counting is fast and frequent: no success toast, the page shows the result */
export const useCountStocktakeItem = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyId: number; productId?: string; barcode?: string; mode?: CountMode; quantity?: number }) =>
      stocktakeService.count(id, data),
    onSuccess: () => invalidate(queryClient),
  });
};

export const useCompleteStocktake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) => stocktakeService.complete(id, companyId),
    onSuccess: () => {
      invalidate(queryClient, true);
      toast.success("تم اعتماد الجرد وتحديث المخزون");
    },
    onError: (error) => toast.error(handleApiError(error)),
  });
};

export const useCancelStocktake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) => stocktakeService.cancel(id, companyId),
    onSuccess: () => {
      invalidate(queryClient);
      toast.success("تم إلغاء الجرد");
    },
    onError: (error) => toast.error(handleApiError(error)),
  });
};
