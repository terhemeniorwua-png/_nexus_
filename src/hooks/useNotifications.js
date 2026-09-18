"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/workspaceApi";
import { getSocket } from "@/lib/socket";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);

  const refetch = useCallback(async () => {
    try {
      const data = await apiRequest("/notifications");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // session not established yet
    }
  }, []);

  // Load the notification list on mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    refetch();
  }, [refetch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = ({ notification }) => {
      if (!notification) return;
      setNotifications((prev) => [notification, ...prev].slice(0, 100));
      setUnreadCount((count) => count + 1);
      const toastId = `${notification.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id: toastId, notification }].slice(-4));
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
      }, 6000);
    };

    socket.on("notification:new", onNew);
    return () => socket.off("notification:new", onNew);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await apiRequest(`/notifications/${id}`, { method: "PATCH", body: { read: true } });
    } catch {
      // best effort
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiRequest("/notifications/read-all", { method: "POST" });
    } catch {
      // best effort
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    toasts,
    dismissToast,
    markRead,
    markAllRead,
    refetch,
  };
}

export default useNotifications;