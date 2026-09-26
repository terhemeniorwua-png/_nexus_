"use client";

import Link from "next/link";
import { BellIcon, CheckIcon } from "../icons";
import { useNotifications } from "@/hooks/useNotifications";
import Avatar from "../Avatar";

/**
 * Phase 20 — dashboard notifications.
 *
 * This reuses `useNotifications` rather than reading `/me/dashboard`: that hook
 * already owns the list, the unread count, live `notification:new` deliveries,
 * reconnect resync and mark-as-read. Building a second copy of any of that
 * here would mean two sources of truth for the same unread count.
 *
 * Unread rows are marked visually *and* with `aria-label`, so the distinction
 * is not carried by colour alone.
 */

function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationRow({ notification, onRead }) {
  const unread = !notification.read;
  const when = timeAgo(notification.createdAt);

  const body = (
    <>
      {notification.actorId ? (
        <Avatar name={notification.actorId.name} avatar={notification.actorId.avatar} size={28} />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-500">
          <BellIcon size={13} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] ${unread ? "font-medium text-zinc-100" : "text-zinc-400"}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-1 text-[11.5px] text-zinc-600">{notification.body}</p>
        )}
      </div>
      {when && <span className="shrink-0 text-[11px] text-zinc-600">{when}</span>}
      {unread && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
          aria-label="Unread"
          role="img"
        />
      )}
    </>
  );

  const shared =
    "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors";
  const tone = unread ? "bg-white/[0.03] hover:bg-white/[0.055]" : "hover:bg-white/[0.02]";

  // An unread notification is a button (mark read); a read one is a plain link
  // to whatever it points at. An unread row that also has a link still marks
  // read on activation, which is the behaviour a mail client has.
  if (unread) {
    return (
      <button
        type="button"
        onClick={() => onRead(notification.id)}
        className={`${shared} ${tone}`}
        aria-label={`Mark "${notification.title}" as read`}
      >
        {body}
      </button>
    );
  }

  if (notification.link) {
    return (
      <Link href={notification.link} className={`${shared} ${tone}`}>
        {body}
      </Link>
    );
  }

  return <div className={`${shared} ${tone}`}>{body}</div>;
}

export default function NotificationsPanel() {
  const { notifications, unreadCount, markRead } = useNotifications();
  const recent = notifications.slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px] text-zinc-500">
          <BellIcon size={13} />
          {unreadCount === 0
            ? "All caught up"
            : `${unreadCount} unread`}
        </span>
        <Link
          href="/notifications"
          className="text-[12px] text-zinc-500 transition-colors hover:text-white"
        >
          View all
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 px-6 py-10 text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-500">
            <CheckIcon size={16} />
          </span>
          <p className="text-[13.5px] font-medium text-zinc-300">No notifications</p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Activity on your projects and tasks will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {recent.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} onRead={markRead} />
          ))}
        </div>
      )}
    </div>
  );
}
