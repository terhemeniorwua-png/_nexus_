import { io } from "socket.io-client";
import { SOCKET_URL } from "@/lib/workspaceApi";

let socket = null;

export function getSocket() {
  if (typeof window === "undefined") return null;

  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }

  return socket;
}

export function emitWithRetry(event, payload, maxAttempts = 2) {
  const client = getSocket();
  if (!client) return;

  client.emit(event, payload);
  if (!client.connected && maxAttempts > 0) {
    setTimeout(() => emitWithRetry(event, payload, maxAttempts - 1), 600);
  }
}

export default getSocket;