"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/workspaceApi";
import { onSocket, onSocketReconnect } from "@/lib/socket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

/**
 * Phase 18 — notifications.
 *
 * The bell is fed by two sources that agree on one list:
 *
 *   `GET /api/notifications`      the truth, re-read on mount and on reconnect
 *   `notification:new`            the same payload, delivered live
 *
 * Both carry the identical shape, and every insert is keyed by id, so a
 * notification that arrives over the socket and is also returned by the next
 * fetch appears exactly once.
 *
 * Reconnecting refetches, because Socket.IO does not replay events that
 * happened while the client was away — without it a notification raised during
 * a network drop would never reach the badge.
 */
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
      // Session not established yet — the next mount or reconnect retries.
    }
  }, []);

  // Load the notification list on mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    refetch();
  }, [refetch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const onNew = ({ notification }) => {
      if (!notification?.id) return;

      setNotifications((prev) => {
        // Dedupe on id: the author of a notification may receive both the
        // socket event and the API response for the same change.
        if (prev.some((n) => String(n.id) === String(notification.id))) return prev;
        return [notification, ...prev].slice(0, 100);
      });

      setUnreadCount((count) => (notification.read ? count : count + 1));

      const toastId = `${notification.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id: toastId, notification }].slice(-4));
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
      }, 6000);
    };

    const unsubscribe = onSocket(SOCKET_EVENTS.NOTIFICATION_NEW, onNew);
    // Reconnect resync: anything raised while the socket was down is picked
    // up from the API, so no notification is permanently missed.
    const unsubscribeResync = onSocketReconnect(refetch);

    return () => {
      unsubscribe();
      unsubscribeResync();
    };
  }, [refetch]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await apiRequest(`/notifications/${id}`, { method: "PATCH", body: { read: true } });
    } catch {
      // best effort — the local state below still reflects the intent
    }
    setNotifications((prev) =>
      prev.map((n) => (String(n.id) === String(id) ? { ...n, read: true } : n))
    );
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
