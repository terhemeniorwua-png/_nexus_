"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/workspaceApi";

export function useResource(path, { deps = [], enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest(path);
      setData(result);
      return result;
    } catch (err) {
      setError(err);
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

export function useMutation() {
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (path, options = {}) => {
    setLoading(true);
    try {
      const data = await apiRequest(path, options);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  }, []);

  return { run, loading };
}

export default useResource;