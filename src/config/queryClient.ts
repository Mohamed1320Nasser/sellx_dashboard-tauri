import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes — keep cached data alive across navigation
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
