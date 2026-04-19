import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { expenseService } from "../../services/expenseService";
import { handleApiError } from "../../utils/errorHandler";
import toast from "react-hot-toast";
import type { GetExpenseListRequest } from "../../types/business";

// List expenses with filters
export const useExpenses = (params: GetExpenseListRequest) => {
  return useQuery({
    queryKey: ["expenses", params],
    queryFn: () => expenseService.getList(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
  });
};

// Get single expense
export const useExpense = (id: string, companyId: number) => {
  return useQuery({
    queryKey: ["expense", id, companyId],
    queryFn: () => expenseService.getById(id, companyId),
    enabled: !!id && !!companyId,
    select: (data) => data?.data || data,
  });
};

// Get expense summary
export const useExpenseSummary = (params: {
  companyId: number;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ["expense-summary", params],
    queryFn: () => expenseService.getSummary(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
  });
};

// Create expense
export const useCreateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, companyId }: { data: any; companyId: number }) =>
      expenseService.create(data, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      toast.success("تم إضافة المصروف بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Update expense
export const useUpdateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data, companyId }: { id: string; data: any; companyId: number }) =>
      expenseService.update(id, data, companyId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      toast.success("تم تحديث المصروف بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Delete expense
export const useDeleteExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) =>
      expenseService.delete(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      toast.success("تم حذف المصروف بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};
