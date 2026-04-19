import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salaryService } from "../../services/salaryService";
import { handleApiError } from "../../utils/errorHandler";
import toast from "react-hot-toast";
import type {
  Salary,
  GetSalaryListRequest,
  CreateSalaryRequest,
  UpdateSalaryRequest,
  PaySalaryRequest,
  PaymentPreviewRequest,
} from "../../types";

// List salaries with filters
export const useSalaries = (params: GetSalaryListRequest) => {
  return useQuery({
    queryKey: ["salaries", params],
    queryFn: () => salaryService.getList(params),
    enabled: !!params.companyId,
    staleTime: 5 * 60 * 1000,
  });
};

// Get single salary
export const useSalary = (id: string, companyId: number) => {
  return useQuery({
    queryKey: ["salary", id, companyId],
    queryFn: () => salaryService.getById(id, companyId),
    enabled: !!id && !!companyId,
    select: (data): Salary => {
      // Handle both wrapped and unwrapped responses
      if ('data' in data && data.data) {
        return data.data as Salary;
      }
      return data as unknown as Salary;
    },
  });
};

// Get salary summary
export const useSalarySummary = (companyId: number) => {
  return useQuery({
    queryKey: ["salary-summary", companyId],
    queryFn: () => salaryService.getSummary(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
};

// Get payment preview
export const usePaymentPreview = () => {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PaymentPreviewRequest }) =>
      salaryService.getPaymentPreview(id, data),
  });
};

// Create salary template
export const useCreateSalary = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, companyId }: { data: CreateSalaryRequest; companyId: number }) =>
      salaryService.create(data, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["salary-summary"] });
      toast.success("تم إضافة قالب الراتب بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Update salary template
export const useUpdateSalary = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
      companyId,
    }: {
      id: string;
      data: UpdateSalaryRequest;
      companyId: number;
    }) => salaryService.update(id, data, companyId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["salary", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["salary-summary"] });
      toast.success("تم تحديث قالب الراتب بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Pay salary for specific month/year
export const usePaySalary = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PaySalaryRequest }) =>
      salaryService.pay(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["salary", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["salary-summary"] });
      toast.success("تم دفع الراتب بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Delete salary template
export const useDeleteSalary = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: number }) =>
      salaryService.delete(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["salary-summary"] });
      toast.success("تم حذف قالب الراتب بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};

// Generate monthly salaries for all employees
export const useGenerateMonthlySalaries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, month, year }: { companyId: number; month: number; year: number }) =>
      salaryService.generateMonthlySalaries(companyId, month, year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["salary-summary"] });
      toast.success("تم إنشاء رواتب الشهر بنجاح");
    },
    onError: (error) => {
      const message = handleApiError(error);
      toast.error(message);
    },
  });
};
