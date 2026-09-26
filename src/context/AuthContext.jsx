"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_ENDPOINTS, apiRequest } from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Phase 21 — server-derived capability flags (currently: whether this user
  // manages at least one project). Kept beside `user` rather than inside it
  // because they are not user fields: they are a fact about the user's
  // relationships, and they must not be mistaken for something a client may set.
  // `/api/auth/me` already returns them, so this costs no extra request.
  const [capabilities, setCapabilities] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const data = await apiRequest(AUTH_ENDPOINTS.me);
        if (active) {
          setUser(data.user);
          setCapabilities(data.capabilities || null);
        }
      } catch {
        if (active) {
          setUser(null);
          setCapabilities(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // Phase 18 — the real-time connection follows the session: it opens once the
  // user is known to be authenticated (whether that came from the httpOnly
  // cookie or from a fresh login) and closes again on logout. Keyed on the id
  // so a profile refresh does not tear the connection down and drop rooms.
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    connectSocket();
    return () => disconnectSocket();
  }, [isAuthenticated]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest(AUTH_ENDPOINTS.me);
      setUser(data.user);
      setCapabilities(data.capabilities || null);
      return data.user;
    } catch {
      setUser(null);
      setCapabilities(null);
      return null;
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiRequest(AUTH_ENDPOINTS.login, {
      method: "POST",
      body: { email, password },
    });
    setUser(data.user);
    setCapabilities(data.capabilities || null);
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
    setCapabilities(data.capabilities || null);
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
      setCapabilities(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      capabilities,
      canManageProjects: Boolean(capabilities?.canManageProjects),
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, capabilities, loading, login, register, logout, refreshUser]
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