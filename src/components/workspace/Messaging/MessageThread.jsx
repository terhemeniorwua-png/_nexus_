"use client";

import { useEffect, useRef } from "react";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import { ChatIcon } from "../icons";

/**
 * A message list.
 *
 * Shared by all three communication types. The only thing that varies is
 * `compact`, which trims the vertical padding so the same list fits inside a
 * card on a project page.
 *
 * `author` is the name/avatar/email triple the server attaches. The API
 * deliberately returns *only* those, so a field added to the User model later
 * cannot leak into a message payload by accident — and the UI has no reason to
 * read anything else about the author.
 *
 * Content is rendered as a text node inside a `<p>`. That is the whole of the
 * "no rich text" guarantee on this side: the server stores whatever text it was
 * given without interpreting it, and React escapes it on the way out, so a
 * message is never able to introduce markup.
 */
export default function MessageThread({ messages = [], currentUserId, loading, compact = false }) {
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
          description="Say hello and start the conversation."
        />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto ws-scroll ${
        compact ? "p-3" : "p-5"
      }`}
    >
      {loading && messages.length === 0 && (
        <p className="py-8 text-center text-[13px] text-zinc-600">Loading messages…</p>
      )}

      <div className="flex flex-col gap-1">
        {messages.map((message) => {
          const mine = String(message.userId) === String(currentUserId);
          const author = message.author;
          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 rounded-xl px-3 transition-colors hover:bg-white/[0.03] ${
                compact ? "py-1.5" : "py-2"
              } ${mine ? "flex-row-reverse" : ""}`}
            >
              <Avatar name={author?.name} avatar={author?.avatar} size={30} />
              <div className={`min-w-0 ${mine ? "text-right" : ""}`}>
                <div className={`flex items-baseline gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  <span className="text-[13px] font-semibold text-zinc-100">
                    {mine ? "You" : author?.name || "Unknown"}
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
