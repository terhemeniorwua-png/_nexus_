// lib/websocket.js (or utils/websocket.js)
import { io } from "socket.io-client";
import { SOCKET_URL } from "@/lib/workspaceApi";

let socket = null;

export function getSocket() {
  if (typeof window === "undefined") return null;

  if (!socket) {
    // 1. Retrieve the token stored when the user logs in
    const token = localStorage.getItem("token") || localStorage.getItem("accessToken");

    socket = io(SOCKET_URL, {
      auth: {
        token: token ? `Bearer ${token}` : "",
      },
      withCredentials: true,
      transports: ["polling", "websocket"], // Polling first prevents immediate WebSocket connection drops
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // 2. Log connection errors (like Auth failures) directly to your console
    socket.on("connect_error", (err) => {
      console.error("Socket Auth Error:", err.message);
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
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