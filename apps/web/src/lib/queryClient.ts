import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

/** The one cache for all server data in the app. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data counts as fresh for 30 seconds: no refetch when a page reopens.
      staleTime: 30_000,
      // Unused data is kept for 5 minutes (this is also the default).
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // A 4xx answer will not change if we ask again.
        if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});
