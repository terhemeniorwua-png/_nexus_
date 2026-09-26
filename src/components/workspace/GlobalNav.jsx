"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { NexusLogo } from "@/components/NexusLogo";
import Avatar from "./Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { HomeIcon, ListTasksIcon, BellIcon, GridIcon, BoardIcon, LogOutIcon, SparkIcon, SettingsIcon } from "./icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: <HomeIcon size={16} /> },
  { href: "/tasks", label: "My Tasks", icon: <ListTasksIcon size={16} /> },
  { href: "/projects", label: "Projects", icon: <BoardIcon size={16} /> },
  // Phase 21 — shown only to users who actually manage a project. The flag
  // comes from the server (`/api/auth/me`), which derives it from the same
  // permission the manager dashboard enforces; a user without it sees no link,
  // and following the URL anyway returns a clear 403 rather than data.
  { href: "/dashboard/manager", label: "Manager", icon: <SparkIcon size={16} />, managerOnly: true },
  { href: "/notifications", label: "Notifications", icon: <BellIcon size={16} /> },
  { href: "/workspaces", label: "Workspaces", icon: <GridIcon size={16} /> },
];

export function GlobalNavLinks({ className = "", canManageProjects = false }) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  const items = NAV_ITEMS.filter((item) => !item.managerOnly || canManageProjects);

  return (
    <nav className={`flex items-center gap-1 ${className}`} aria-label="Global navigation">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/workspaces" && pathname.startsWith("/workspaces/")) ||
          (item.href === "/projects" && pathname.startsWith("/projects/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
              active ? "bg-white/8 text-white" : "ws-link"
            }`}
          >
            <span className="opacity-80">{item.icon}</span>
            {item.label}
            {item.href === "/notifications" && unreadCount > 0 && (
              <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold text-oncolor">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default function GlobalNav() {
  const { user, logout, canManageProjects } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  // Phase 21: the session endpoint reports whether this user manages a project,
  // so the Manager link costs no extra request and cannot drift from the
  // dashboard's own authorisation.

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/");
    } finally {
      setLoggingOut(false);
    }
  }

  // Phase 21 — same reasoning: the user menu carries the same gate, so the
  // Manager entry is offered in both places or neither.
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--header-bg)] backdrop-blur-md">
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <NexusLogo size={26} />
          <span className="hidden text-[15px] font-semibold tracking-tight text-white sm:inline">Nexus</span>
        </Link>

        <div className="hidden lg:block">
          <GlobalNavLinks canManageProjects={canManageProjects} />
        </div>

        <div className="flex flex-1 items-center justify-end gap-2.5">
          <ThemeToggle />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1.5 pl-2 transition-colors hover:border-white/20"
            >
              <Avatar name={user?.name} size={26} />
              <span className="hidden max-w-[140px] truncate text-[13px] font-medium text-zinc-200 sm:block">
                {user?.name?.split(" ")[0]}
              </span>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="ws-glass absolute right-0 z-20 mt-2 w-60 rounded-xl p-1.5">
                  <div className="border-b border-white/10 px-3 py-2.5">
                    <p className="truncate text-[13.5px] font-semibold text-white">{user?.name}</p>
                    <p className="truncate font-mono text-[11.5px] text-zinc-500">{user?.email}</p>
                  </div>
                  <Link
                    href="/tasks"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <ListTasksIcon size={15} /> My Tasks
                  </Link>
                  {canManageProjects && (
                    <Link
                      href="/dashboard/manager"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <SparkIcon size={15} /> Manager dashboard
                    </Link>
                  )}
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <SettingsIcon size={15} /> Settings
                  </Link>
                  <Link
                    href="/notifications"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <BellIcon size={15} /> Notifications
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <LogOutIcon size={15} /> {loggingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-white/8 px-3 py-1.5 lg:hidden ws-scroll">
        <GlobalNavLinks canManageProjects={canManageProjects} />
      </div>
    </header>
  );
}