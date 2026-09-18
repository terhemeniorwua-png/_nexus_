"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password"];

export default function Footer() {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();

  if (loading || !isAuthenticated) return null;
  if (PUBLIC_PATHS.includes(pathname)) return null;

  return (
    <footer className="relative z-10 border-t border-zinc-800/80 bg-[#09090B]">
      <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-between gap-3 px-5 md:px-6">
        <p className="text-[11.5px] tracking-tight text-zinc-500">
          © {new Date().getFullYear()} Nexus · All rights reserved.
        </p>

        <nav
          aria-label="Workspace footer"
          className="flex items-center gap-4 text-[11.5px] text-zinc-500"
        >
          <Link href="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
          <span className="flex items-center gap-1.5 text-emerald-300/90">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            All Systems Operational
          </span>
        </nav>
      </div>
    </footer>
  );
}