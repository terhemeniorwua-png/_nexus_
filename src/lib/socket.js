import { io } from "socket.io-client";
import { SOCKET_URL } from "@/lib/workspaceApi";

/**
 * Phase 18 — the single Socket.IO connection for this browser session.
 *
 * One connection, created once and shared. Components never call `io()`
 * themselves; they subscribe through `onSocket` (or the `useSocketEvent` hook),
 * which keeps the listener registry authoritative so a listener registered
 * before the connection existed is still bound, and is always removable.
 *
 * Rules this module enforces:
 *
 *   1. Connect only while authenticated; disconnect on logout. An
 *      authenticated socket must never outlive the session.
 *   2. Room membership is re-requested on every (re)connect, because a
 *      reconnect is a brand new socket with a brand new id and no rooms. The
 *      server re-checks membership each time, so a revoked project cannot be
 *      re-joined by a stale client.
 *   3. The socket never persists anything. It signals that something changed;
 *      the REST API is what the UI reads from.
 *
 * The database is the source of truth. Nothing in this file writes.
 */

let socket = null;

/** event name → Set<handler> for server→client events. */
const listeners = new Map();

/** Observers of the connection itself. */
const lifecycleHandlers = new Set();

/** Re-run on every successful (re)connect so components can re-join rooms. */
const reconnectHandlers = new Set();

let authenticated = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function storedToken() {
  if (!isBrowser()) return null;
  try {
    return (
      window.localStorage.getItem("token") ||
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("jwt")
    );
  } catch {
    return null;
  }
}

function notify(set, payload) {
  set.forEach((handler) => {
    try {
      handler(payload);
    } catch {
      // One misbehaving subscriber must never stop the others.
    }
  });
}

/** Attach every registered listener to a freshly created socket. */
function bindListeners(client) {
  listeners.forEach((handlers, event) => {
    handlers.forEach((handler) => client.on(event, handler));
  });
}

function createSocket() {
  const token = storedToken();

  const client = io(SOCKET_URL, {
    // The token is a convenience for non-cookie sessions. The httpOnly
    // `nexus_token` cookie is sent by `withCredentials` either way, and the
    // server reads whichever it finds first.
    auth: token ? { token: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {},
    withCredentials: true,
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  client.on("connect", () => {
    notify(lifecycleHandlers, { connected: true, socket: client });
    // Rooms are not carried across a reconnect, so every component that
    // depends on a room is asked to request it again. This also covers the case
    // where a component outlived a logout/login cycle and so never re-ran its
    // mount effect for the new connection.
    notify(reconnectHandlers, { connected: true, socket: client });
  });

  client.on("disconnect", (reason) => {
    notify(lifecycleHandlers, { connected: false, reason, socket: client });
  });

  client.on("connect_error", () => {
    // A rejected handshake (expired session, untrusted origin) surfaces only
    // as "not connected". The raw reason is never shown to a user.
    notify(lifecycleHandlers, { connected: false, error: "socket-unavailable", socket: client });
  });

  return client;
}

/**
 * The current connection, created on demand once the session is authenticated.
 *
 * @returns {import("socket.io-client").Socket|null}
 */
export function getSocket() {
  if (!isBrowser() || !authenticated) return null;
  if (socket) return socket;

  socket = createSocket();
  bindListeners(socket);
  return socket;
}

/**
 * Mark the browser as having a live session and open the connection.
 * Called by AuthContext once `/auth/me` or a login has succeeded.
 */
export function connectSocket() {
  if (!isBrowser()) return null;
  authenticated = true;
  return getSocket();
}

/**
 * Close the connection. Called on logout, so no authenticated events keep
 * arriving after the session ends.
 *
 * The listener registries are deliberately left intact. Entries belong to
 * mounted components, which unsubscribe on their own unmount; clearing them
 * here would silently strip a component that survives a logout/login cycle
 * (a board left open, say) of the re-join it needs once the session comes back.
 */
export function disconnectSocket() {
  authenticated = false;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to a server event.
 *
 * Safe to call before the connection exists: the handler is queued and bound
 * on creation. Registering the same handler twice for the same event is a
 * no-op, so a re-render or a remounted effect can never leave two live
 * listeners behind.
 *
 * @returns {() => void} unsubscribe
 */
export function onSocket(event, handler) {
  if (!event || typeof handler !== "function") return () => {};

  if (!listeners.has(event)) listeners.set(event, new Set());
  const handlers = listeners.get(event);

  if (handlers.has(handler)) return () => handlers.delete(handler);

  handlers.add(handler);
  socket?.on(event, handler);

  return () => {
    handlers.delete(handler);
    socket?.off(event, handler);
  };
}

/** Subscribe to several events with one handler. Returns an unsubscribe. */
export function onSocketMany(events, handler) {
  const unsubscribes = (events || []).map((event) => onSocket(event, handler));
  return () => unsubscribes.forEach((off) => off());
}

/** Observe the connection itself. Returns an unsubscribe function. */
export function onSocketLifecycle(handler) {
  if (typeof handler !== "function") return () => {};
  lifecycleHandlers.add(handler);
  return () => lifecycleHandlers.delete(handler);
}

/**
 * Run on every successful (re)connect, so a mounted component can re-request
 * the room it needs. Returns an unsubscribe function.
 */
export function onSocketReconnect(handler) {
  if (typeof handler !== "function") return () => {};
  reconnectHandlers.add(handler);
  return () => reconnectHandlers.delete(handler);
}

/**
 * Emit to the server. A no-op when there is no connection — a caller must
 * never read "the socket was not connected" as "the write succeeded"; the
 * REST response is what says that.
 */
export function emitSocket(event, payload) {
  const client = getSocket();
  if (!client) return false;
  client.emit(event, payload);
  return true;
}

export function isSocketConnected() {
  return Boolean(socket?.connected);
}

export default getSocket;
