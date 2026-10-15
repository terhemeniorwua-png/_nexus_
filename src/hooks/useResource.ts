"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiRequest } from "@/lib/workspaceApi";
import type { ApiRequestOptions } from "@/lib/api";
import type { ApiError } from "@/lib/types";

export interface UseResourceOptions<T> {
  deps?: unknown[];
  enabled?: boolean;
  initialData?: T | null;
}

export interface UseResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  setData: Dispatch<SetStateAction<T | null>>;
  refetch: () => Promise<T | null>;
}

export function useResource<T = any>(
  path?: string | null,
  { deps = [], enabled = true, initialData = null }: UseResourceOptions<T> = {}
): UseResourceResult<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async (): Promise<T | null> => {
    if (!path) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<T>(path);
      setData(result);
      return result;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [path]);

  // Initial data fetch runs on mount and whenever the path/deps change.
  // The synchronous state updates inside are intentional (loading + response).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (enabled && path) {
      refetch();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, path, ...deps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { data, loading, error, setData, refetch };
}

export interface MutationResult<T> {
  data: T | null;
  error: ApiError | null;
}

export function useMutation() {
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async <T = any>(path: string, options: ApiRequestOptions = {}): Promise<MutationResult<T>> => {
      setLoading(true);
      try {
        const data = await apiRequest<T>(path, options);
        return { data, error: null };
      } catch (err) {
        return { data: null, error: err as ApiError };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { run, loading };
}

export default useResource;
