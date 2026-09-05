import { QueryClient, type QueryFunction, type QueryKey } from "@tanstack/react-query";

import { ApiError, apiRequest } from "@/lib/apiRequest";

/**
 * Query keys are API paths: `["/api/kb/status"]`, `["/api/workspaces", token]`.
 * Extra segments are appended and URL-encoded, which is exactly how the REST
 * routes are shaped, so most reads need no `queryFn` of their own.
 */
function pathFromKey(queryKey: QueryKey): string {
  const parts = queryKey
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .map(String);

  const [head, ...rest] = parts;
  if (!head || !head.startsWith("/")) {
    // Deliberately does not echo the key: a workspace token may be in it.
    throw new Error("Query key does not start with an API path — pass an explicit queryFn.");
  }

  if (rest.length === 0) return head;
  return `${head.replace(/\/+$/, "")}/${rest.map(encodeURIComponent).join("/")}`;
}

const defaultQueryFn: QueryFunction<unknown> = ({ queryKey, signal }) =>
  apiRequest<unknown>("GET", pathFromKey(queryKey), undefined, { signal });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // One retry for anything that might be transient; none for 4xx, where a
      // dead workspace token would otherwise take three round trips to report.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
