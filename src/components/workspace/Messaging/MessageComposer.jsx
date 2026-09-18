"use client";

import { useState } from "react";
import { SendIcon } from "../icons";

export default function MessageComposer({ onSend, disabled = false }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const content = value.trim();
    if (!content || sending || disabled) return;

    setSending(true);
    try {
      const ok = await onSend(content);
      if (ok !== false) setValue("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-end gap-2.5 border-t border-white/8 p-3.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        rows={1}
        disabled={disabled}
        placeholder={disabled ? "Viewers can't send messages" : "Message this channel…  (@name to mention)"}
        aria-label="Message"
        className="ws-input max-h-32 min-h-[44px] flex-1 resize-none rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed"
        style={{ fieldSizing: "content" }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || sending || !value.trim()}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-950 transition-all hover:bg-zinc-300 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-zinc-500"
      >
        <SendIcon size={17} />
      </button>
    </div>
  );
}