"use client";

import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useNotifications } from "@/hooks/useNotifications";
import "../workspace.css";
import Topbar from "@/components/workspace/Topbar";
import Avatar from "@/components/workspace/Avatar";
import EmptyState from "@/components/workspace/EmptyState";
import {
  BellIcon,
  BoardIcon,
  ChatIcon,
  UsersIcon,
  CheckIcon,
} from "@/components/workspace/icons";
import { formatRelative } from "@/lib/workspaceApi";

const TYPE_META = {
  TASK_ASSIGNED: { icon: <BoardIcon size={15} />, color: "#3b82f6" },
  MENTION: { icon: <ChatIcon size={15} />, color: "#eab308" },
  MEMBER_ADDED: { icon: <UsersIcon size={15} />, color: "#22c55e" },
  DEFAULT: { icon: <BellIcon size={15} />, color: "#a855f7" },
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const router = useRouter();

  async function handleOpen(notification) {
    if (!notification.read) markRead(notification.id);
    if (notification.link) {
      router.push(notification.link);
    }
  }

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-12%] h-[360px] w-[360px] bg-purple-600/18" />
        <div className="ws-glow right-[-10%] top-[30%] h-[320px] w-[320px] bg-blue-600/15" />

        <div className="relative z-10 flex min-h-dvh flex-col">
          <Topbar backHref="/dashboard" />

          <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-[24px] font-semibold tracking-tight text-white">
                  Notifications
                </h1>
                <p className="mt-1 text-[13.5px] text-zinc-400">
                  {unreadCount} unread · {notifications.length} total
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
                >
                  <CheckIcon size={14} /> Mark all read
                </button>
              )}
            </header>

            <div className="mt-7 space-y-2">
              {notifications.length === 0 ? (
                <EmptyState
                  icon={<BellIcon size={20} />}
                  title="You're all caught up"
                  description="Assignments, mentions, and invites will land here."
                />
              ) : (
                notifications.map((notification) => {
                  const meta =
                    TYPE_META[notification.type] || TYPE_META.DEFAULT;
                  const unread = !notification.read;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleOpen(notification)}
                      className={`flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                        unread
                          ? "border-white/14 bg-white/[0.05] hover:bg-white/[0.07]"
                          : "border-white/6 bg-transparent opacity-70 hover:border-white/12 hover:opacity-100"
                      }`}
                    >
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10"
                        style={{ color: meta.color, backgroundColor: `${meta.color}12` }}
                      >
                        {meta.icon}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span
                            className={`truncate text-[14px] font-medium ${
                              unread ? "text-white" : "text-zinc-300"
                            }`}
                          >
                            {notification.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-zinc-600">
                            {formatRelative(notification.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
                          {notification.body}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                            <Avatar name={notification.actorId?.name} size={18} />
                            {notification.actorId?.name || "Someone"}
                          </span>
                          {notification.workspaceId?.name && (
                            <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] text-zinc-500">
                              {notification.workspaceId.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {unread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}