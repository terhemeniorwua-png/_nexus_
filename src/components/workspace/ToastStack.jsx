"use client";

import { useNotifications } from "@/hooks/useNotifications";
import { BoardIcon, ChatIcon, SparkIcon, CheckIcon } from "./icons";

const ICON_BY_TYPE = {
  TASK_ASSIGNED: <BoardIcon size={15} />,
  MENTION: <ChatIcon size={15} />,
  DIRECT_MESSAGE: <ChatIcon size={15} />,
  MEMBER_ADDED: <SparkIcon size={15} />,
  TASK_MOVED: <BoardIcon size={15} />,
  DOCUMENT_SHARED: <SparkIcon size={15} />,
};

const ACCENT_BY_TYPE = {
  TASK_ASSIGNED: "#3b82f6",
  MENTION: "#a855f7",
  DIRECT_MESSAGE: "#38bdf8",
  MEMBER_ADDED: "#22c55e",
  TASK_MOVED: "#eab308",
  DOCUMENT_SHARED: "#0d9488",
};

export default function ToastStack() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2.5">
      {toasts.map(({ id, notification }) => {
        const accent = ACCENT_BY_TYPE[notification.type] || "#8b8b91";
        return (
          <button
            key={id}
            type="button"
            onClick={() => dismissToast(id)}
            className="ws-glass ws-toast pointer-events-auto flex items-start gap-3 rounded-xl p-3.5 text-left"
          >
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ color: accent, backgroundColor: `${accent}1f`, border: `1px solid ${accent}33` }}
            >
              {ICON_BY_TYPE[notification.type] || <CheckIcon size={15} />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-white">
                {notification.title}
              </span>
              {notification.body && (
                <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-zinc-400">
                  {notification.body}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}