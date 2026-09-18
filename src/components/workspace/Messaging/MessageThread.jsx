"use client";

import { useEffect, useRef } from "react";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import { ChatIcon } from "../icons";

export default function MessageThread({ messages = [], currentUserId, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length]);

  if (!loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<ChatIcon size={20} />}
          title="No messages yet"
          description="Say hello to your team and start the conversation."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto ws-scroll p-5">
      {loading && messages.length === 0 && (
        <p className="py-8 text-center text-[13px] text-zinc-600">Loading messages…</p>
      )}

      <div className="flex flex-col gap-1">
        {messages.map((message) => {
          const mine = String(message.userId?.id) === String(currentUserId);
          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.03] ${
                mine ? "flex-row-reverse" : ""
              }`}
            >
              <Avatar name={message.userId?.name} avatar={message.userId?.avatar} size={30} />
              <div className={`min-w-0 ${mine ? "text-right" : ""}`}>
                <div className={`flex items-baseline gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  <span className="text-[13px] font-semibold text-zinc-100">
                    {mine ? "You" : message.userId?.name}
                  </span>
                  <span className="text-[11px] text-zinc-600">
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p
                  className={`mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed ${
                    mine ? "text-zinc-300" : "text-zinc-200"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}