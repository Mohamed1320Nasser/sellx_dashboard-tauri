import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { returnService } from "../../services/returnService";
import type {
  CreateReturnRequest,
  UpdateReturnStatusRequest,
  GetReturnListRequest,
} from "../../types";

// Query Keys
export const returnKeys = {
  all: ["returns"] as const,
  lists: () => [...returnKeys.all, "list"] as const,
  list: (params: GetReturnListRequest) =>
    [...returnKeys.lists(), params] as const,
  details: () => [...returnKeys.all, "detail"] as const,
  detail: (id: string) => [...returnKeys.details(), id] as const,
  statistics: (companyId: number) =>
    [...returnKeys.all, "statistics", companyId] as const,
  bySale: (saleId: number) => [...returnKeys.all, "bySale", saleId] as const,
};

// Get returns list
export const useReturns = (params: GetReturnListRequest) => {
  return useQuery({
    queryKey: returnKeys.list(params),
    queryFn: () => returnService.getList(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Get return by ID
export const useReturn = (id: string, companyId: number) => {
  return useQuery({
    queryKey: returnKeys.detail(id),
    queryFn: () => returnService.getById(id, companyId),
    enabled: !!id && !!companyId,
  });
};

// Get return statistics
export const useReturnStatistics = (companyId: number) => {
  return useQuery({
    queryKey: returnKeys.statistics(companyId),
    queryFn: () => returnService.getStatistics(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Get returns by sale ID
export const useReturnsBySale = (saleId: number, companyId: number) => {
  return useQuery({
    queryKey: returnKeys.bySale(saleId),
    queryFn: () => returnService.getBySale(saleId, companyId),
    enabled: !!saleId && !!companyId,
  });
};

// Create return mutation
export const useCreateReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateReturnRequest) => returnService.create(data),
    onSuccess: (data, variables) => {
      // Invalidate and refetch returns list
      queryClient.invalidateQueries({ queryKey: returnKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: returnKeys.statistics(variables.companyId),
      });

      // Invalidate sales data to update return counts
      queryClient.invalidateQueries({ queryKey: ["sales"] });

      // Invalidate analytics and dashboard data
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["financialReports"] });

      toast.success("تم إنشاء المرتجع بنجاح");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.msg || "تعذر إنشاء المرتجع";
      toast.error(message);
    },
  });
};

// Update return status mutation
export const useUpdateReturnStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateReturnStatusRequest;
    }) => returnService.updateStatus(id, data),
    onSuccess: (data) => {
      // Invalidate and refetch returns data
      queryClient.invalidateQueries({ queryKey: returnKeys.lists() });
      queryClient.invalidateQueries({ queryKey: returnKeys.detail(data.id) });
      queryClient.invalidateQueries({
        queryKey: returnKeys.statistics(data.companyId),
      });

      // Invalidate stock movements if status is COMPLETED
      if (data.status === "COMPLETED") {
        queryClient.invalidateQueries({ queryKey: ["stockMovements"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      }

      // Invalidate analytics and dashboard data
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["financialReports"] });

      toast.success("تم تحديث حالة المرتجع");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.msg || "تعذر تحديث حالة المرتجع";
      toast.error(message);
    },
  });
};

// Delete return mutation
export const useDeleteReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) => returnService.delete(id, companyId),
    onSuccess: (data, { id }) => {
      // Invalidate and refetch returns data
      queryClient.invalidateQueries({ queryKey: returnKeys.lists() });
      queryClient.invalidateQueries({ queryKey: returnKeys.detail(id) });

      // Invalidate analytics and dashboard data
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["financialReports"] });

      toast.success("تم حذف المرتجع");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.msg || "تعذر حذف المرتجع";
      toast.error(message);
    },
  });
};
