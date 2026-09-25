"use client";

import { useState } from "react";
import { SendIcon } from "../icons";

/**
 * Keep in step with `MAX_CONTENT_LENGTH` in backend/src/models/message.model.js.
 *
 * Enforced here as well as on the server so the user is stopped at 2000
 * characters rather than after a round trip, and so the counter reflects what
 * the server will actually accept.
 */
const MAX_LENGTH = 2000;

export default function MessageComposer({
  onSend,
  disabled = false,
  placeholder = "Message this channel…  (@name to mention)",
  disabledPlaceholder = "You do not have permission to post here",
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const content = value.trim();
    if (!content || sending || disabled) return;
    if (content.length > MAX_LENGTH) return;

    setSending(true);
    try {
      const ok = await onSend(content);
      if (ok !== false) setValue("");
    } finally {
      setSending(false);
    }
  }

  const tooLong = value.trim().length > MAX_LENGTH;

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
        maxLength={MAX_LENGTH + 200}
        disabled={disabled}
        placeholder={disabled ? disabledPlaceholder : placeholder}
        aria-label="Message"
        className="ws-input max-h-32 min-h-[44px] flex-1 resize-none rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed"
        style={{ fieldSizing: "content" }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || sending || !value.trim() || tooLong}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-950 transition-all hover:bg-zinc-300 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-zinc-500"
      >
        <SendIcon size={17} />
      </button>
      {tooLong && (
        <p className="absolute bottom-full right-4 mb-1 text-[11.5px] text-red-300" role="alert">
          Message cannot exceed {MAX_LENGTH} characters
        </p>
      )}
    </div>
  );
}