"use client";

import { useEffect, useRef } from "react";
import {
  emitSocket,
  isSocketConnected,
  onSocket,
  onSocketMany,
  onSocketReconnect,
} from "@/lib/socket";
import {
  CLIENT_EVENTS,
  SOCKET_EVENTS,
  PROJECT_REFRESH_EVENTS,
} from "@/lib/socketEvents";

/**
 * Phase 18 — React bindings for the single shared socket.
 *
 * Every hook here returns nothing and cleans up after itself, so a component
 * can be mounted, unmounted and re-mounted freely without ever accumulating
 * duplicate listeners.
 *
 * Handlers are held in a ref that is refreshed after every render. That keeps
 * an inline arrow function from re-subscribing on each render while still
 * letting the handler read the latest props and state.
 */

/** Keep `ref.current` pointing at the newest value, without re-rendering. */
function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Run `handler` whenever a server event fires.
 *
 * Reconnection needs no special handling here: the underlying Socket.IO client
 * keeps its listeners when it reconnects.
 */
export function useSocketEvent(event, handler, { enabled = true } = {}) {
  const handlerRef = useLatest(handler);

  useEffect(() => {
    if (!enabled || !event) return;
    return onSocket(event, (payload) => handlerRef.current?.(payload));
  }, [event, enabled, handlerRef]);
}

/** Run `handler` for any of several events. */
export function useSocketEvents(events, handler, { enabled = true } = {}) {
  const handlerRef = useLatest(handler);
  const key = (events || []).join("|");

  useEffect(() => {
    if (!enabled || !key) return;
    return onSocketMany(key.split("|"), (payload) => handlerRef.current?.(payload));
  }, [key, enabled, handlerRef]);
}

/**
 * Join a project room for as long as this component is mounted, and re-join
 * after a reconnect.
 *
 * The backend authorizes the join against real project membership, so a client
 * cannot subscribe to a project it does not belong to. `onDenied` lets a page
 * react to a refused join instead of waiting for events that will never come.
 */
export function useProjectRoom(projectId, workspaceId, { onDenied, onJoined, enabled = true } = {}) {
  const deniedRef = useLatest(onDenied);
  const joinedRef = useLatest(onJoined);

  useEffect(() => {
    if (!enabled || !projectId) return;

    const join = () => emitSocket(CLIENT_EVENTS.PROJECT_JOIN, { projectId, workspaceId });
    const leave = () => emitSocket(CLIENT_EVENTS.PROJECT_LEAVE, { projectId });

    const offReconnect = onSocketReconnect(join);
    const offJoined = onSocket(SOCKET_EVENTS.PROJECT_JOINED, (payload) => {
      if (String(payload?.projectId) === String(projectId)) joinedRef.current?.(payload);
    });
    const offDenied = onSocket(SOCKET_EVENTS.PROJECT_DENIED, (payload) => {
      if (String(payload?.projectId) === String(projectId)) deniedRef.current?.(payload);
    });

    // Request the room only when the connection is already up. Otherwise the
    // emit is buffered by Socket.IO and the reconnect hook above delivers it on
    // connect — so the request happens exactly once either way.
    if (isSocketConnected()) join();

    return () => {
      offReconnect();
      offJoined();
      offDenied();
      leave();
    };
  }, [projectId, workspaceId, enabled, joinedRef, deniedRef]);
}

/**
 * Refetch whenever anything in the project changes, and once more after a
 * reconnect — events missed while offline are not replayed, so the REST API is
 * re-read instead.
 */
export function useProjectRefresh(refetch, { enabled = true, debounceMs = 250 } = {}) {
  const refetchRef = useLatest(refetch);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => refetchRef.current?.(), debounceMs);
    };

    const off = onSocketMany(PROJECT_REFRESH_EVENTS, schedule);
    const offReconnect = onSocketReconnect(schedule);

    return () => {
      clearTimeout(timerRef.current);
      off();
      offReconnect();
    };
  }, [enabled, debounceMs, refetchRef]);
}

/**
 * Re-run a callback on every (re)connect — used to re-read state from the REST
 * API after the socket dropped, since Socket.IO does not replay missed events.
 */
export function useSocketResync(callback, { enabled = true } = {}) {
  const callbackRef = useLatest(callback);

  useEffect(() => {
    if (!enabled) return;
    return onSocketReconnect(() => callbackRef.current?.());
  }, [enabled, callbackRef]);
}

/**
 * Keep a single task's detail view fresh.
 *
 * Refetches when an event about *this* task arrives, when its deliverable
 * changes, and once after a reconnect. The payload is only used to decide
 * whether the event is relevant — the refreshed data always comes from the
 * REST API.
 */
export function useTaskRoomSignal(taskId, refetch, { enabled = true, debounceMs = 200 } = {}) {
  const refetchRef = useLatest(refetch);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !taskId) return;

    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => refetchRef.current?.(), debounceMs);
    };

    const onTaskEvent = (payload) => {
      const id = String(taskId);
      if (String(payload?.taskId) !== id && String(payload?.task?.id) !== id) return;
      schedule();
    };

    const onDeliverable = (payload) => {
      if (String(payload?.taskId) !== String(taskId)) return;
      schedule();
    };

    const unsubscribes = [
      onSocket(SOCKET_EVENTS.TASK_CREATED, onTaskEvent),
      onSocket(SOCKET_EVENTS.TASK_UPDATED, onTaskEvent),
      onSocket(SOCKET_EVENTS.TASK_MOVED, onTaskEvent),
      onSocket(SOCKET_EVENTS.TASK_DELETED, onTaskEvent),
      onSocket(SOCKET_EVENTS.DELIVERABLE_UPDATED, onDeliverable),
    ];

    const offReconnect = onSocketReconnect(schedule);

    return () => {
      clearTimeout(timerRef.current);
      unsubscribes.forEach((off) => off());
      offReconnect();
    };
  }, [taskId, enabled, debounceMs, refetchRef]);
}

export default useSocketEvent;
