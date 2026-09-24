"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_ENDPOINTS, apiRequest } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const data = await apiRequest(AUTH_ENDPOINTS.me);
        if (active) setUser(data.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest(AUTH_ENDPOINTS.me);
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiRequest(AUTH_ENDPOINTS.login, {
      method: "POST",
      body: { email, password },
    });
    setUser(data.user);
    if (data.token) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("accessToken", data.token);
    }
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await apiRequest(AUTH_ENDPOINTS.register, {
      method: "POST",
      body: payload,
    });
    setUser(data.user);
    if (data.token) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("accessToken", data.token);
    }
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest(AUTH_ENDPOINTS.logout, { method: "POST" });
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("accessToken");
      disconnectSocket();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}