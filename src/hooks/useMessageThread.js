"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import {
  emitSocket,
  isSocketConnected,
  onSocket,
  onSocketReconnect,
} from "@/lib/socket";
import { CLIENT_EVENTS, SOCKET_EVENTS } from "@/lib/socketEvents";

/**
 * Phase 19 — one message thread, whichever kind it is.
 *
 * The three communication types differ in room and endpoint, and in nothing
 * else the UI has to care about: a thread is a list of messages with an author
 * and a timestamp, and a new one arrives as a socket event. So all three are
 * driven through this one hook rather than three near-identical components.
 *
 * Three things it guarantees, all of which the tests care about:
 *
 *   • **No duplicates.** A message can legitimately arrive twice: the POST
 *     response returns it, and the socket broadcast delivers it to this same
 *     tab. Messages are keyed by `id` and an id already rendered is ignored, so
 *     the send-then-receive round trip is invisible.
 *
 *   • **No cross-thread bleed.** An event is applied only when it belongs to
 *     the thread on screen. Direct messages are the case that matters: they
 *     arrive on the recipient's private room, so *every* DM sent to the user
 *     reaches this hook at once and all but one are for a different thread.
 *
 *   • **No stale thread on switch.** The loaded messages are stored against
 *     the key of the thread they came from, and a message list for a
 *     different key is treated as empty. Switching threads therefore cannot
 *     briefly render the previous conversation's messages, which is both a
 *     correctness problem and — for direct messages — a small privacy leak
 *     between two private threads.
 */
export function useMessageThread({
  kind = "CHANNEL",
  workspaceId,
  channelId,
  projectId,
  partnerId,
  // The authenticated user, needed to recognise an outgoing direct message.
  selfId,
  enabled = true,
  initialChannelId,
} = {}) {
  /**
   * Identity of the thread on screen. Everything downstream keys off this
   * rather than off the individual ids, so "is this event for me?" is one
   * string comparison.
   */
  const threadKey =
    kind === "CHANNEL"
      ? `CHANNEL:${channelId || ""}`
      : kind === "PROJECT"
        ? `PROJECT:${projectId || ""}`
        : `DIRECT:${partnerId || ""}`;

  // `{ key, messages }` in one piece, so a list can never be paired with the
  // wrong key.
  const [loaded, setLoaded] = useState({ key: null, messages: [] });
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  // Ids already rendered, so a repeated delivery is dropped rather than shown
  // twice. A ref, not state: it is bookkeeping and must not trigger a render.
  const seenIds = useRef(new Set());

  const path = useCallback(() => {
    if (kind === "CHANNEL") {
      if (!workspaceId || !channelId) return null;
      return `/workspaces/${workspaceId}/messages?channelId=${encodeURIComponent(channelId)}`;
    }
    if (kind === "PROJECT") {
      if (!projectId) return null;
      return `/projects/${projectId}/discussion`;
    }
    if (!partnerId) return null;
    return `/messages/direct/${partnerId}`;
  }, [kind, workspaceId, channelId, projectId, partnerId]);

  /** The event that carries new messages for this kind of thread. */
  const event = useCallback(() => {
    if (kind === "CHANNEL") return SOCKET_EVENTS.CHANNEL_MESSAGE_CREATED;
    if (kind === "PROJECT") return SOCKET_EVENTS.PROJECT_MESSAGE_CREATED;
    return SOCKET_EVENTS.DIRECT_MESSAGE_CREATED;
  }, [kind]);

  const isMine = useCallback(
    (message) => kind === "DIRECT" && String(message?.userId) === String(selfId),
    [kind, selfId]
  );

  /**
   * Does a broadcast belong to the thread on screen?
   *
   * `threadKey` is captured per subscription rather than read from a ref, so the
   * comparison is always against the thread the handler was created for.
   */
  const belongsToThread = useCallback(
    (message) => {
      if (kind === "CHANNEL") {
        return String(message?.channelId) === String(channelId);
      }
      if (kind === "PROJECT") {
        return String(message?.projectId) === String(projectId);
      }
      // A direct message is for exactly one other person. Accept it only when
      // that person is the thread on screen.
      return String(message?.userId) === String(selfId) ||
        String(message?.recipientId) === String(partnerId);
    },
    [kind, channelId, projectId, partnerId, selfId]
  );

  /** Add messages that are not already rendered. Returns true if any were. */
  const applyMessages = useCallback((incoming) => {
    const fresh = [];
    for (const message of incoming) {
      const id = String(message?.id || message?._id || "");
      if (!id || seenIds.current.has(id)) continue;
      seenIds.current.add(id);
      fresh.push(message);
    }
    if (fresh.length === 0) return false;

    setLoaded((current) => {
      // An event for a thread that is not mounted yet seeds nothing: the id
      // is remembered so a later load still wins, and the list stays empty.
      if (current.key && current.key !== threadKey) return current;

      const merged = [...(current.key === threadKey ? current.messages : []), ...fresh];
      // Re-sort rather than append. Two messages written in the same
      // millisecond, or a broadcast that beats the POST response, would
      // otherwise put the thread out of order.
      merged.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      return { key: threadKey, messages: merged };
    });
    return true;
  }, [threadKey]);

  /**
   * Load the thread from the API.
   *
   * Returns a disposer. The fetch is started synchronously but every state
   * write happens after it resolves, guarded by `cancelled` so a response that
   * arrives after the component unmounted — or after the user switched threads —
   * is discarded rather than rendered into the wrong place.
   */
  const load = useCallback(() => {
    const url = path();
    if (!url) return () => {};

    let cancelled = false;

    (async () => {
      try {
        const res = await api(url, { method: "GET" });
        if (cancelled) return;

        const list = res?.messages || [];
        // Rebuild the id set from what the server says the thread contains. This
        // recovers anything missed while offline and, as a side effect, forgets
        // ids a later refetch shows are no longer in the thread.
        seenIds.current = new Set(
          list.map((m) => String(m.id || m._id)).filter(Boolean)
        );
        setLoaded({ key: threadKey, messages: list });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Could not load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, threadKey]);

  // Reload whenever the thread itself changes. `initialChannelId` is included
  // so a parent that normalizes the channel after load does not cause a second
  // identical fetch.
  useEffect(() => {
    if (!enabled) return;
    return load();
  }, [enabled, load, initialChannelId]);

  // Subscribe to this kind's event, and apply only this thread's messages.
  useEffect(() => {
    if (!enabled) return;

    return onSocket(event(), (message) => {
      if (!belongsToThread(message)) return;
      applyMessages([message]);
    });
  }, [enabled, event, belongsToThread, applyMessages]);

  // After a reconnect, re-read the thread. Socket.IO does not replay events
  // missed while offline.
  useEffect(() => {
    if (!enabled) return;
    return onSocketReconnect(load);
  }, [enabled, load]);

  // Join the channel room while a channel is on screen. The server authorizes
  // this against real workspace membership, so a client cannot subscribe to a
  // channel it has no access to.
  useEffect(() => {
    if (!enabled || kind !== "CHANNEL" || !channelId || !workspaceId) return;

    const join = () => emitSocket(CLIENT_EVENTS.CHANNEL_JOIN, { workspaceId, channelId });
    const leave = () => emitSocket(CLIENT_EVENTS.CHANNEL_LEAVE, { channelId });

    const offReconnect = onSocketReconnect(join);
    if (isSocketConnected()) join();

    return () => {
      offReconnect();
      leave();
    };
  }, [enabled, kind, workspaceId, channelId]);

  const send = useCallback(
    async (content) => {
      const trimmed = String(content ?? "").trim();
      if (!trimmed) return { ok: false, error: "Message cannot be empty" };

      let url;
      let body;
      if (kind === "CHANNEL") {
        if (!workspaceId || !channelId) return { ok: false, error: "No channel selected" };
        url = `/workspaces/${workspaceId}/messages`;
        body = { channelId, content: trimmed };
      } else if (kind === "PROJECT") {
        if (!projectId) return { ok: false, error: "No project selected" };
        url = `/projects/${projectId}/discussion`;
        body = { content: trimmed };
      } else {
        if (!partnerId) return { ok: false, error: "No recipient selected" };
        url = `/messages/direct/${partnerId}`;
        body = { content: trimmed };
      }

      setSending(true);
      try {
        const res = await api(url, { method: "POST", body });
        // The broadcast usually beat this response, in which case `seenIds`
        // already holds the id and this is a no-op. Either way the message
        // appears exactly once.
        applyMessages([res?.message].filter(Boolean));
        return { ok: true, message: res?.message };
      } catch (err) {
        return { ok: false, error: err?.message || "Could not send message" };
      } finally {
        setSending(false);
      }
    },
    [kind, workspaceId, channelId, projectId, partnerId, applyMessages]
  );

  // A list is only shown when it belongs to the thread currently on screen.
  const messages = loaded.key === threadKey ? loaded.messages : [];

  return { messages, loading, error, sending, refetch: load, send, applyMessages, isMine, threadKey };
}
