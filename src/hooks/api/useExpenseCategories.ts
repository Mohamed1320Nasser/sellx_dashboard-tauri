import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { expenseCategoryService } from "../../services/expenseCategoryService";
import { handleApiError } from "../../utils/errorHandler";
import toast from "react-hot-toast";

// List expense categories
export const useExpenseCategories = (params: {
  companyId: number;
  includeInactive?: boolean;
  search?: string;
}) => {
  return useQuery({
    queryKey: ["expense-categories", params],
    queryFn: () => expenseCategoryService.getList(params),
    enabled: !!params.companyId,
    staleTime: 10 * 60 * 1000, // Categories change less frequently
  });
};

// Get single expense category
export const useExpenseCategory = (id: string, companyId: number) => {
  return useQuery({
    queryKey: ["expense-category", id, companyId],
    queryFn: () => expenseCategoryService.getById(id, companyId),
    enabled: !!id && !!companyId,
    select: (data) => data?.data || data,
  });
};

// Create expense category
export const useCreateExpenseCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, companyId }: { data: any; companyId: number }) =>
      expenseCategoryService.create(data, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("تم إضافة التصنيف بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Update expense category
export const useUpdateExpenseCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data, companyId }: { id: string; data: any; companyId: number }) =>
      expenseCategoryService.update(id, data, companyId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      queryClient.invalidateQueries({ queryKey: ["expense-category", variables.id] });
      toast.success("تم تحديث التصنيف بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Delete expense category
export const useDeleteExpenseCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) =>
      expenseCategoryService.delete(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("تم حذف التصنيف بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Toggle category active status
export const useToggleExpenseCategoryActive = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) =>
      expenseCategoryService.toggleActive(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("تم تحديث حالة التصنيف");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Seed default categories
export const useSeedDefaultExpenseCategories = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: number) =>
      expenseCategoryService.seedDefaults(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("تم إضافة التصنيفات الافتراضية بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};
