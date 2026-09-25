"use client";

import { useState } from "react";
import Avatar from "../Avatar";
import { ChatIcon, PlusIcon, DotsIcon } from "../icons";

/**
 * Phase 19 — the channel and direct-message rail.
 *
 * Direct messages are keyed by the *other person's* id, not by a synthetic
 * `dm:<a>_<b>` channel string. Two reasons that matters:
 *
 *   • the old string was a channel name the message API accepted, and a caller
 *     could construct one naming any user in the system;
 *   • a conversation is a real thing now. `conversations` carries the last
 *     message and an unread count, so the rail can show a badge and a preview
 *     instead of guessing from workspace membership alone.
 *
 * The list merges two sources: threads the user already has, and every other
 * workspace member as a way to start one. Anyone who has left the workspace
 * still appears if a thread exists, so a conversation cannot become unreachable.
 */
export default function ChannelList({
  channels = [],
  members = [],
  conversations = [],
  totalUnread = 0,
  active,
  onSelect,
  onNewChannel,
  currentUserId,
  isOnline,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const selfId = String(currentUserId ?? "");
  const conversationByPartner = new Map(
    conversations.map((c) => [String(c.partner?.id), c])
  );

  // Everyone with a thread, plus every other workspace member as a candidate.
  // Members first (they are the people you can actually reach), then any
  // remaining conversations whose partner is no longer a member.
  const people = [
    ...members
      .filter((m) => m.user?.id && String(m.user.id) !== selfId)
      .map((m) => ({ id: String(m.user.id), name: m.user.name, isMember: true })),
    ...conversations
      .filter((c) => c.partner?.id && !members.some((m) => String(m.user?.id) === String(c.partner.id)))
      .map((c) => ({ id: String(c.partner.id), name: c.partner.name, isMember: false })),
  ];

  return (
    <div className="flex h-full w-full flex-col md:w-72 md:border-r md:border-white/8">
      <div className="flex items-center justify-between border-b border-white/8 p-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Channels
        </span>
        <button
          type="button"
          onClick={onNewChannel}
          aria-label="New channel"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto ws-scroll p-2.5">
        {channels.map((channel) => {
          const selected = active?.type === "CHANNEL" && String(active.id) === String(channel.id);
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onSelect({ type: "CHANNEL", id: String(channel.id) })}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                selected ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              }`}
            >
              <span className="text-zinc-500">
                <ChatIcon size={15} />
              </span>
              <span className="truncate font-medium"># {channel.name}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <DotsIcon size={13} />
          Direct messages
          {totalUnread > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>

        {!collapsed &&
          people.map((person) => {
            const conversation = conversationByPartner.get(person.id);
            const selected = active?.type === "DIRECT" && String(active.id) === person.id;
            const unread = conversation?.unreadCount || 0;
            const memberOnline = isOnline && isOnline(person.id);

            return (
              <button
                key={person.id}
                type="button"
                onClick={() => onSelect({ type: "DIRECT", id: person.id })}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  selected ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                <Avatar name={person.name} size={22} showPresence online={memberOnline} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${unread > 0 ? "font-semibold text-white" : ""}`}>
                    {person.name}
                  </span>
                  {conversation?.lastMessage && (
                    <span className="block truncate text-[11px] text-zinc-600">
                      {conversation.lastMessage.content}
                    </span>
                  )}
                </span>
                {unread > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
