import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "../contexts/AuthContext";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Never retry auth/permission/validation failures — retrying
        // them just re-triggers the same 401/403/400 three times.
        if (isApiError(error) && [400, 401, 403, 404].includes(error.status)) return false;
        return failureCount < 2;
      },
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});
