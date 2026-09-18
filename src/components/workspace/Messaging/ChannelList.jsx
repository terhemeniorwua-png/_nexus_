"use client";

import { useState } from "react";
import Avatar from "../Avatar";
import { ChatIcon, PlusIcon, DotsIcon } from "../icons";

export default function ChannelList({
  channels = [],
  members = [],
  activeChannelId,
  onSelect,
  onNewChannel,
  currentUserId,
  isOnline,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const dms = members.filter((m) => m.user?.id && String(m.user.id) !== String(currentUserId));

  return (
    <div className="flex h-full w-full flex-col md:w-64 md:border-r md:border-white/8">
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
          const active = String(activeChannelId) === String(channel._id);
          return (
            <button
              key={channel._id}
              type="button"
              onClick={() => onSelect(String(channel._id))}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              }`}
            >
              <span className="text-zinc-500">
                <ChatIcon size={15} />
              </span>
              <span className="font-medium"># {channel.name}</span>
              <span className="flex-1" />
              {channel.lastActive && (
                <span className="text-[10.5px] text-zinc-600">{channel.lastActive}</span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <DotsIcon size={13} />
          Direct messages ({dms.length})
        </button>

        {!collapsed &&
          dms.map((member) => {
            const channelId = ["dm", String(member.user.id), String(currentUserId)].sort().join("_");
            const active = String(activeChannelId) === channelId;
            const memberOnline = isOnline && isOnline(member.user.id);
            return (
              <button
                key={member.user.id}
                type="button"
                onClick={() => onSelect(channelId)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                <Avatar name={member.user.name} size={22} showPresence online={memberOnline} />
                <span className="truncate">{member.user.name}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}