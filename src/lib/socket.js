import { io } from "socket.io-client";
import { SOCKET_URL } from "@/lib/workspaceApi";

let socket = null;

export function getSocket() {
  if (typeof window === "undefined") return null;

  // Retrieve token from localStorage
  const token = 
    localStorage.getItem("token") || 
    localStorage.getItem("accessToken") || 
    localStorage.getItem("jwt");

  // 1. DO NOT connect if the user is not authenticated yet (e.g. on /login page)
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }

  // 2. Return existing socket if already initialized
  if (socket) {
    return socket;
  }

  // 3. Only attempt connection when a valid token is present
  socket = io(SOCKET_URL, {
    auth: {
      token: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    },
    withCredentials: true,
    transports: ["polling", "websocket"],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected successfully with ID:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("Socket Auth Error:", err.message);
  });

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