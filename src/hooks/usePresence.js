"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

export function usePresence(workspaceId) {
  const [online, setOnline] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const socket = getSocket();
    if (!socket) return;

    const setOnlineFromIds = ({ userIds }) => {
      setOnline(new Set(userIds || []));
      setReady(true);
    };

    const handleOnline = ({ userId }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    };

    const handleOffline = ({ userId }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    socket.on("presence:online", setOnlineFromIds);
    socket.on("user:online", handleOnline);
    socket.on("user:offline", handleOffline);

    getSocket().emit("presence:subscribe", { workspaceId });

    return () => {
      socket.off("presence:online", setOnlineFromIds);
      socket.off("user:online", handleOnline);
      socket.off("user:offline", handleOffline);
    };
  }, [workspaceId]);

  const isOnline = (userId) => online.has(String(userId));

  return { online, ready, isOnline };
}

export default usePresence;