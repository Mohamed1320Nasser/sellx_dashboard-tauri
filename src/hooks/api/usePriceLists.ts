import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { priceListService, type PriceList, type PriceListInput } from "../../services/priceListService";
import { handleApiError } from "../../utils/errorHandler";

/** Active lists (sale screen, client form); all = include stopped ones (settings) */
export const usePriceLists = (companyId: number, all = false) =>
  useQuery({
    queryKey: ["price-lists", companyId, all],
    queryFn: async () => ((await priceListService.getList(companyId, all))?.data || []) as PriceList[],
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

/** { productId: price } of one list; not needed for the default list (= selling price) */
export const usePriceListPrices = (companyId: number, priceListId?: string | null) =>
  useQuery({
    queryKey: ["price-list-prices", companyId, priceListId],
    queryFn: async () => ((await priceListService.getPrices(priceListId!, companyId))?.data?.prices || {}) as Record<string, number>,
    enabled: !!companyId && !!priceListId,
    staleTime: 60 * 1000,
  });

export const usePriceGrid = (params: { companyId: number; page?: number; limit?: number; search?: string; categoryId?: string; productId?: string; noPrice?: boolean }) =>
  useQuery({
    queryKey: ["price-grid", params],
    queryFn: async () => (await priceListService.getGrid(params))?.data,
    enabled: !!params.companyId,
    placeholderData: keepPreviousData,
  });

const invalidatePrices = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ["price-lists"] });
  queryClient.invalidateQueries({ queryKey: ["price-list-prices"] });
  queryClient.invalidateQueries({ queryKey: ["price-grid"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["product"] });
  queryClient.invalidateQueries({ queryKey: ["clients"] });
};

export const useSavePriceList = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: PriceListInput & { name: string } }) =>
      id ? priceListService.edit(id, data) : priceListService.create(data),
    onSuccess: (_, { id }) => {
      invalidatePrices(queryClient);
      toast.success(id ? "تم حفظ قائمة الأسعار" : "تمت إضافة قائمة الأسعار");
    },
    onError: (error) => toast.error(handleApiError(error)),
  });
};

export const useTogglePriceList = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, companyId, active }: { id: string; companyId: number; active: boolean }) =>
      priceListService.edit(id, { companyId, active }),
    onSuccess: () => invalidatePrices(queryClient),
    onError: (error) => toast.error(handleApiError(error)),
  });
};

export const useDeletePriceList = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) => priceListService.remove(id, companyId),
    onSuccess: () => {
      invalidatePrices(queryClient);
      toast.success("تم حذف قائمة الأسعار");
    },
    onError: (error) => toast.error(handleApiError(error)),
  });
};

export const useSetPrices = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, prices }: { companyId: number; prices: { productId: string; priceListId: string; price: number | null }[] }) =>
      priceListService.setPrices(companyId, prices),
    onSuccess: () => invalidatePrices(queryClient),
    onError: (error) => toast.error(handleApiError(error)),
  });
};

export const useAdjustPrices = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: priceListService.adjust,
    onSuccess: (res: any) => {
      invalidatePrices(queryClient);
      toast.success(`تم تعديل ${res?.data?.changed ?? 0} سعر`);
    },
    onError: (error) => toast.error(handleApiError(error)),
  });
};
