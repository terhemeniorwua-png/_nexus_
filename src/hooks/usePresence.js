"use client";

import { useEffect, useState } from "react";
import {
  emitSocket,
  isSocketConnected,
  onSocket,
  onSocketReconnect,
} from "@/lib/socket";
import { CLIENT_EVENTS, SOCKET_EVENTS } from "@/lib/socketEvents";

/**
 * Phase 18 — workspace presence.
 *
 * The server keeps a reference count per user, so this hook never has to
 * guess: a user with five tabs open is online, and only the departure of their
 * final tab produces `user:offline`.
 *
 * The snapshot is scoped to one workspace. Asking the server is the only way
 * this hook learns who is online there — the global online list is never
 * broadcast to a client.
 */
export function usePresence(workspaceId) {
  const [online, setOnline] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const onSnapshot = (payload) => {
      if (!payload || String(payload.workspaceId) !== String(workspaceId)) return;
      setOnline(new Set((payload.userIds || []).map(String)));
      setReady(true);
    };

    const onOnline = (payload) => {
      const userId = payload?.userId ? String(payload.userId) : null;
      if (!userId) return;
      setOnline((prev) => (prev.has(userId) ? prev : new Set(prev).add(userId)));
    };

    const onOffline = (payload) => {
      const userId = payload?.userId ? String(payload.userId) : null;
      if (!userId) return;
      setOnline((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const subscribe = () => emitSocket(CLIENT_EVENTS.PRESENCE_SUBSCRIBE, { workspaceId });

    const offSnapshot = onSocket(SOCKET_EVENTS.PRESENCE_SNAPSHOT, onSnapshot);
    const offOnline = onSocket(SOCKET_EVENTS.USER_ONLINE, onOnline);
    const offOffline = onSocket(SOCKET_EVENTS.USER_OFFLINE, onOffline);

    // Buffered and delivered on connect when there is no connection yet; sent
    // straight away when there is. Either way, exactly one subscribe.
    if (isSocketConnected()) subscribe();
    // A reconnected socket starts with no rooms, so the subscription and the
    // snapshot are requested again.
    const offReconnect = onSocketReconnect(subscribe);

    return () => {
      offSnapshot();
      offOnline();
      offOffline();
      offReconnect();
      // Leave explicitly: moving between workspaces reuses the same socket, so
      // without this the previous workspace room would keep counting us.
      emitSocket(CLIENT_EVENTS.PRESENCE_UNSUBSCRIBE, { workspaceId });
    };
  }, [workspaceId]);

  const isOnline = (userId) => (userId ? online.has(String(userId)) : false);

  return { online, ready, isOnline };
}

export default usePresence;
