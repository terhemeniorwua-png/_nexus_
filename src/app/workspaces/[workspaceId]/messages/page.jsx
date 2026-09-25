"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useResource, useMutation } from "@/hooks/useResource";
import { usePresence } from "@/hooks/usePresence";
import { useMessageThread } from "@/hooks/useMessageThread";
import { onSocket, onSocketReconnect } from "@/lib/socket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
import ChannelList from "@/components/workspace/Messaging/ChannelList";
import MessageThread from "@/components/workspace/Messaging/MessageThread";
import MessageComposer from "@/components/workspace/Messaging/MessageComposer";
import Modal from "@/components/workspace/Modal";
import { PlusIcon, HashIcon } from "@/components/workspace/icons";
import { formatRelative } from "@/lib/workspaceApi";

/**
 * Phase 19 — workspace messaging: channels and direct messages.
 *
 * Both live here because they are the same surface in the product (a workspace's
 * communication), and they differ only in who may read them — a channel is open
 * to the workspace, a direct message to its two participants. Project discussion
 * is *not* here; it lives on the project, because it is authorized by project
 * access rather than workspace access.
 *
 * The active thread is a `{ type, id }` pair rather than a single id. The old
 * code encoded both kinds into one string (`dm:<a>_<b>`), which meant the
 * component had to parse a channel id to work out what it was looking at, and
 * nothing on the server checked that the two people could actually talk to each
 * other. A direct message is now addressed by the other person's id, and the
 * server decides whether that is allowed.
 */
export default function MessagesPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const { user } = useAuth();

  const { data: wsData, refetch: refetchWs } = useResource(`/workspaces/${workspaceId}`);
  const { run } = useMutation();
  const { isOnline } = usePresence(workspaceId);

  // { type: "CHANNEL" | "DIRECT", id }
  const [active, setActive] = useState(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [channelError, setChannelError] = useState("");
  const [channelLoading, setChannelLoading] = useState(false);
  const [sendError, setSendError] = useState(null);

  // The thread on screen. One hook drives channels and DMs alike; which
  // endpoint and which socket event it uses follows from `kind`.
  const thread = useMessageThread({
    kind: active?.type === "DIRECT" ? "DIRECT" : "CHANNEL",
    workspaceId,
    channelId: active?.type === "CHANNEL" ? active.id : null,
    projectId: null,
    partnerId: active?.type === "DIRECT" ? active.id : null,
    selfId: user?.id,
    enabled: Boolean(active?.id),
  });

  // Conversation list with unread counts. Re-read on reconnect, since events
  // missed while offline are not replayed.
  const {
    data: inboxData,
    refetch: refetchConversations,
  } = useResource("/messages/conversations");

  // `useResource` returns a fresh object identity on every render while
  // loading, so each of these is memoized on the array it derives from.
  // Otherwise every `useMemo` below would rebuild on every render.
  const conversations = useMemo(() => inboxData?.conversations || [], [inboxData]);
  const totalUnread = inboxData?.totalUnread || 0;

  const rawChannels = useMemo(() => wsData?.workspace?.channels || [], [wsData]);
  const members = useMemo(() => wsData?.members || [], [wsData]);
  const role = wsData?.role || "";
  const canSend = role === "Admin" || role === "Member";

  // Channels are addressed by `_id`. Older payloads used a different field name
  // for the same thing, so normalize once here rather than at each use.
  const channels = useMemo(
    () =>
      rawChannels
        .map((channel) => ({
          id: String(channel._id ?? channel.id ?? ""),
          name: channel.name,
          slug: channel.slug || channel.name,
          createdAt: channel.createdAt,
        }))
        .filter((channel) => channel.id),
    [rawChannels]
  );

  // Open the first channel by default. DMs are never auto-opened: landing
  // straight in a private conversation would be a poor default and would
  // silently mark it read.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (active === null && channels.length > 0) {
      setActive({ type: "CHANNEL", id: channels[0].id });
    }
  }, [channels, active]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Direct messages arrive on the user's private room — every DM addressed to
   * them, from all conversations. The list is refetched rather than patched
   * here, so the unread count the server computes is the one that is shown.
   */
  useEffect(() => {
    const onDirect = () => refetchConversations();
    const off = onSocket(SOCKET_EVENTS.DIRECT_MESSAGE_CREATED, onDirect);
    const offRead = onSocket(SOCKET_EVENTS.DIRECT_MESSAGE_READ, onDirect);
    const offReconnect = onSocketReconnect(onDirect);
    return () => {
      off();
      offRead();
      offReconnect();
    };
  }, [refetchConversations]);

  // A newly created channel is selected by name, because the create response
  // lists every channel rather than only the new one.
  const selectChannelByName = useCallback(
    (name) => {
      const created = channels.find((channel) => channel.name === name);
      if (created) setActive({ type: "CHANNEL", id: created.id });
    },
    [channels]
  );

  async function handleSend(content) {
    const result = await thread.send(content);
    if (!result.ok) {
      setSendError(result.error);
      return false;
    }
    setSendError(null);

    // Opening a direct message marks it read, which is also what clears the
    // badge in the list.
    if (active?.type === "DIRECT") {
      await run(`/messages/direct/${active.id}/read`, { method: "PATCH" });
      refetchConversations();
    }

    return true;
  }

  // Clear the unread badge when a conversation is opened.
  useEffect(() => {
    if (active?.type !== "DIRECT" || !user?.id) return;
    const entry = conversations.find((c) => String(c.partner.id) === String(active.id));
    if (!entry || entry.unreadCount === 0) return;

    run(`/messages/direct/${active.id}/read`, { method: "PATCH" }).then(() =>
      refetchConversations()
    );
    // `conversations` is intentionally left out of the deps: this should fire
    // when the thread is opened, not again every time the refreshed list
    // arrives with a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.type, active?.id, run]);

  async function handleNewChannel(event) {
    event.preventDefault();
    setChannelError("");
    const name = newChannelName.trim();
    if (!name) {
      setChannelError("A channel name is required");
      return;
    }

    setChannelLoading(true);
    const { error } = await run(`/workspaces/${workspaceId}/channels`, {
      method: "POST",
      body: { name },
    });
    setChannelLoading(false);

    if (error) {
      setChannelError(error.message || "Could not create channel");
      return;
    }

    setNewChannelName("");
    setShowNewChannel(false);
    await refetchWs();
    selectChannelByName(name);
  }

  const meta = useMemo(() => {
    if (!active?.id) return null;

    if (active.type === "DIRECT") {
      const entry = conversations.find((c) => String(c.partner.id) === String(active.id));
      const member = members.find((m) => String(m.user?.id) === String(active.id));
      const name = entry?.partner?.name || member?.user?.name || "Direct message";
      return {
        title: name,
        subtitle: entry?.partner?.email
          ? `${entry.partner.email} · Direct message`
          : "Direct message",
        isDirect: true,
      };
    }

    const channel = channels.find((c) => c.id === String(active.id));
    return {
      title: channel ? `# ${channel.name}` : "Channel",
      subtitle: `${members.length} team members · Created ${formatRelative(channel?.createdAt)}`,
      isDirect: false,
    };
  }, [active, conversations, channels, members]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col md:flex-row md:min-h-0">
      <ChannelList
        channels={channels}
        members={members}
        conversations={conversations}
        totalUnread={totalUnread}
        active={active}
        onSelect={setActive}
        onNewChannel={() => setShowNewChannel(true)}
        currentUserId={user?.id}
        isOnline={isOnline}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {meta ? (
          <>
            <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
              {meta.isDirect ? (
                <span className="relative mt-0.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[var(--page)]" />
                </span>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300">
                  <HashIcon size={14} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white">{meta.title}</p>
                <p className="truncate text-[11px] text-zinc-600">{meta.subtitle}</p>
              </div>
              {canSend && !meta.isDirect && (
                <button
                  type="button"
                  onClick={() => setShowNewChannel(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
                >
                  <PlusIcon size={13} /> Channel
                </button>
              )}
            </div>

            <MessageThread
              messages={thread.messages}
              currentUserId={user?.id}
              loading={thread.loading}
            />

            {canSend ? (
              <>
                <MessageComposer onSend={handleSend} />
                {sendError && (
                  <p
                    className="border-t border-white/8 px-3.5 py-2 text-center text-[12px] text-red-300"
                    role="alert"
                  >
                    {sendError}
                  </p>
                )}
              </>
            ) : (
              <div className="border-t border-white/8 p-3.5 text-center text-[12.5px] text-zinc-600">
                Viewers can read, but not send messages.
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-zinc-600">
            No channels yet. Create one to start the conversation.
          </div>
        )}
      </div>

      <Modal open={showNewChannel} onClose={() => setShowNewChannel(false)} title="Create channel">
        <form onSubmit={handleNewChannel} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Channel name
            </span>
            <input
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="design-critiques"
              className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px]"
            />
          </label>
          {channelError && (
            <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
              {channelError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={channelLoading}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              {channelLoading ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
