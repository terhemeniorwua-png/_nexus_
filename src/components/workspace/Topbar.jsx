"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { NexusLogo } from "@/components/NexusLogo";
import { useNotifications } from "@/hooks/useNotifications";
import { BellIcon, ArrowLeftIcon, LogOutIcon, SparkIcon, MenuIcon, SettingsIcon } from "./icons";
import Avatar from "./Avatar";
import { GlobalNavLinks } from "./GlobalNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useRouter } from "next/navigation";

/**
 * `onOpenNav` is optional on purpose. The workspace shell hides its sidebar
 * below the md breakpoint, so it passes a handler to reopen it as a drawer;
 * pages that have no hidden sidebar (notifications) simply omit it and get no
 * hamburger, rather than a button that opens nothing.
 */
export default function Topbar({ workspaceName, backHref = "/dashboard", onOpenNav }) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[var(--header-bg)] px-4 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onOpenNav ? (
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <MenuIcon size={17} />
          </button>
        ) : null}
        <Link href={backHref} className="text-zinc-400 transition-colors hover:text-white" aria-label="Go back">
          <ArrowLeftIcon size={18} />
        </Link>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <NexusLogo size={26} />
          <span className="hidden text-[15px] font-semibold tracking-tight text-white sm:inline">
            Nexus
          </span>
        </Link>
        {workspaceName && (
          <>
            <span className="text-white/15">/</span>
            <span className="truncate text-sm font-medium text-zinc-300">{workspaceName}</span>
          </>
        )}
      </div>

      <div className="hidden lg:block">
        <GlobalNavLinks />
      </div>

      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        <Link
          href="/notifications"
          aria-label={`Notifications (${unreadCount} unread)`}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
        >
          <BellIcon size={17} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold text-oncolor shadow-[0_0_10px_rgba(37,99,235,0.6)]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

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
                {/* Leaving the workspace shell for a global page: the drawer has
                    to be put away as well, or it would still be covering the
                    screen on arrival. */}
                <Link
                  href="/settings"
                  onClick={() => {
                    setMenuOpen(false);
                    if (onOpenNav) onOpenNav();
                  }}
                  className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <SettingsIcon size={15} /> Settings
                </Link>
                <Link
                  href="/notifications"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <SparkIcon size={15} /> Notifications
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

      {/* Below lg the horizontal nav has nowhere else to live. Same treatment as
          GlobalNav's own header, so a phone or tablet is never left without a
          way to move between the top-level sections. */}
      <div className="overflow-x-auto border-t border-white/8 px-3 py-1.5 lg:hidden ws-scroll">
        <GlobalNavLinks />
      </div>
    </header>
  );
}