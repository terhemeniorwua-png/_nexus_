"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useResource, useMutation } from "@/hooks/useResource";
import { usePresence } from "@/hooks/usePresence";
import { getSocket } from "@/lib/socket";
import ChannelList from "@/components/workspace/Messaging/ChannelList";
import MessageThread from "@/components/workspace/Messaging/MessageThread";
import MessageComposer from "@/components/workspace/Messaging/MessageComposer";
import Modal from "@/components/workspace/Modal";
import { PlusIcon, HashIcon } from "@/components/workspace/icons";
import { formatRelative } from "@/lib/workspaceApi";

function upsertMessage(list, message) {
  if (!message) return list;
  if (list.some((m) => String(m.id) === String(message.id))) return list;
  return [...list, message];
}

export default function MessagesPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const { user } = useAuth();

  const { data: wsData, refetch: refetchWs } = useResource(`/workspaces/${workspaceId}`);
  const { run } = useMutation();
  const { isOnline } = usePresence(workspaceId);

  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [channelError, setChannelError] = useState("");
  const [channelLoading, setChannelLoading] = useState(false);

  const channelRef = useRef(null);

  const channels = useMemo(() => wsData?.workspace?.channels || [], [wsData]);
  const members = wsData?.members || [];
  const role = wsData?.role || "";
  const canSend = role === "Admin" || role === "Member";

  // Select the default (first) channel once the workspace loads.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeChannel === null && channels.length > 0) {
      setActiveChannel(String(channels[0]._id));
    }
  }, [channels, activeChannel]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: messagesData, loading: messagesLoading } = useResource(
    activeChannel
      ? `/workspaces/${workspaceId}/messages?channelId=${encodeURIComponent(activeChannel)}`
      : null,
    { deps: [activeChannel] }
  );

  // Load message history whenever the channel switches.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (messagesData?.messages) {
      setMessages(messagesData.messages);
    }
  }, [messagesData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeChannel || !workspaceId) return;

    channelRef.current = activeChannel;

    socket.emit("channel:join", { workspaceId, channelId: activeChannel });

    const onMessage = ({ message }) => {
      if (String(message.channelId) === String(channelRef.current)) {
        setMessages((prev) => upsertMessage(prev, message));
      }
    };

    socket.on("message:sent", onMessage);
    socket.on("dm:sent", onMessage);

    return () => {
      socket.off("message:sent", onMessage);
      socket.off("dm:sent", onMessage);
    };
  }, [activeChannel, workspaceId]);

  async function handleSend(content) {
    if (!activeChannel) return false;
    const { error } = await run(`/workspaces/${workspaceId}/messages`, {
      method: "POST",
      body: { channelId: activeChannel, content },
    });
    if (error) return false;
    return true;
  }

  async function handleNewChannel(event) {
    event.preventDefault();
    setChannelError("");
    if (!newChannelName.trim()) {
      setChannelError("A channel name is required");
      return;
    }
    setChannelLoading(true);
    const { data, error } = await run(`/workspaces/${workspaceId}/channels`, {
      method: "POST",
      body: { name: newChannelName.trim() },
    });
    setChannelLoading(false);
    if (error) {
      setChannelError(error.message || "Could not create channel");
      return;
    }
    const created = data?.channels?.at(-1);
    setNewChannelName("");
    setShowNewChannel(false);
    await refetchWs();
    if (created) setActiveChannel(String(created._id));
  }

  function isDmChannel() {
    return Boolean(activeChannel && activeChannel.startsWith("dm:"));
  }

  function channelMeta() {
    if (!activeChannel) return null;
    if (activeChannel.startsWith("dm:")) {
      const partnerId = activeChannel
        .replace(/^dm:/, "")
        .split("_")
        .find((id) => id !== String(user.id));
      const member = members.find((m) => String(m.user?.id) === String(partnerId));
      return {
        key: partnerId,
        title: member?.user?.name || "Direct message",
        subtitle: `@${member?.user?.email || partnerId} · Direct message`,
      };
    }
    const channel = channels.find((c) => String(c._id) === activeChannel);
    return {
      key: activeChannel,
      title: channel ? `# ${channel.name}` : "Channel",
      subtitle: `${members.length} team members · Created ${formatRelative(channel?.createdAt)}`,
    };
  }

  const meta = channelMeta();

  return (
    <div className="flex h-full min-h-[60vh] flex-col md:flex-row md:min-h-0">
      <ChannelList
        channels={channels}
        members={members}
        activeChannelId={activeChannel}
        onSelect={setActiveChannel}
        onNewChannel={() => setShowNewChannel(true)}
        currentUserId={user?.id}
        isOnline={isOnline}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {meta ? (
          <>
            <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3">
              {isDmChannel() ? (
                <span className="relative mt-0.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#09090b]" />
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
              {canSend && !isDmChannel() && (
                <button
                  type="button"
                  onClick={() => setShowNewChannel(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
                >
                  <PlusIcon size={13} /> Channel
                </button>
              )}
            </div>

            <MessageThread messages={messages} currentUserId={user?.id} loading={messagesLoading} />

            {canSend ? (
              <MessageComposer onSend={handleSend} />
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