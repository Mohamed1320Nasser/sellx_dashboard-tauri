import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productService } from "../../services/productService";
import { handleApiError } from "../../utils/errorHandler";
import { qk } from "../../config/queryKeys";
import toast from "react-hot-toast";
import type { Product } from "../../types/business";

type ProductListParams = {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  noPrice?: boolean;
};

// List products
export const useProducts = (params: ProductListParams) => {
  return useQuery({
    queryKey: qk.products.list(params),
    queryFn: () => productService.getList(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
  });
};

// List products with infinite scroll (e.g. the Sales/Quote product picker)
// so callers aren't capped at a single page's worth of results.
export const useProductsInfinite = (params: Omit<ProductListParams, "page">) => {
  const limit = params.limit ?? 50;
  return useInfiniteQuery({
    queryKey: qk.products.list({ ...params, limit, infinite: true }),
    queryFn: ({ pageParam }) =>
      productService.getList({ ...params, limit, page: pageParam }),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const data = (lastPage as any)?.data;
      if (!data) return undefined;
      return data.page < data.totalPages ? data.page + 1 : undefined;
    },
  });
};

// Get single product — seeds from list cache so edit/detail pages render instantly
export const useProduct = (id: string, companyId: number) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: qk.products.detail(id, companyId),
    queryFn: () => productService.getById(id, companyId),
    enabled: !!id && !!companyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: () => {
      const lists = queryClient.getQueriesData<any>({
        queryKey: qk.products.lists(),
      });
      for (const [, data] of lists) {
        const hit = data?.data?.list?.find((p: any) => String(p.id) === String(id));
        if (hit) return { data: hit };
      }
      return undefined;
    },
    select: (data) => data?.data || data,
  }) as { data: Product | undefined; isLoading: boolean; isFetching: boolean; error: any };
};

// Create product
export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.all });
      toast.success("تم إنشاء المنتج بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Update product — optimistic: writes to detail + list caches before the server responds
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      productService.edit(id, data),
    onMutate: async ({ id, data }) => {
      const companyId = data?.companyId;
      const detailKey = companyId
        ? qk.products.detail(id, companyId)
        : undefined;

      await queryClient.cancelQueries({ queryKey: qk.products.all });

      const prevDetail = detailKey
        ? queryClient.getQueryData<any>(detailKey)
        : undefined;
      const prevLists = queryClient.getQueriesData<any>({
        queryKey: qk.products.lists(),
      });

      if (detailKey && prevDetail) {
        queryClient.setQueryData(detailKey, {
          ...prevDetail,
          data: { ...(prevDetail.data || {}), ...data, id },
        });
      }

      for (const [key, listData] of prevLists) {
        if (!listData?.data?.list) continue;
        queryClient.setQueryData(key, {
          ...listData,
          data: {
            ...listData.data,
            list: listData.data.list.map((p: any) =>
              String(p.id) === String(id) ? { ...p, ...data } : p,
            ),
          },
        });
      }

      return { prevDetail, prevLists, detailKey };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.detailKey && ctx.prevDetail !== undefined) {
        queryClient.setQueryData(ctx.detailKey, ctx.prevDetail);
      }
      if (ctx?.prevLists) {
        for (const [key, data] of ctx.prevLists) {
          queryClient.setQueryData(key, data);
        }
      }
      const message = handleApiError(error);
      toast.error(message);
    },
    onSuccess: () => {
      toast.success("تم تحديث المنتج بنجاح");
    },
    onSettled: () => {
      // Force a refetch of every list + detail cache, even if no component is mounted yet.
      // This guarantees the list page shows fresh data the moment the user navigates back.
      queryClient.refetchQueries({ queryKey: qk.products.lists() });
      queryClient.refetchQueries({ queryKey: qk.products.details() });
    },
  });
};

// Delete product
export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) =>
      productService.delete(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.all });
      toast.success("تم حذف المنتج بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};
