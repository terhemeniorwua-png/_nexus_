"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useResource } from "@/hooks/useResource";
import Topbar from "@/components/workspace/Topbar";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import { XIcon } from "@/components/workspace/icons";
import "../../workspace.css";

export default function WorkspaceLayout({ children }) {
  const params = useParams();
  const workspaceId = String(params.workspaceId);

  const { data } = useResource(`/workspaces/${workspaceId}`);

  const workspaceName = data?.workspace?.name || "Workspace";
  const role = data?.role || "";

  // The sidebar is a fixed column from md up. Below that it is removed from the
  // flow entirely, so the same component is re-mounted as a drawer — one
  // navigation source, two presentations, rather than a second nav written for
  // small screens.
  //
  // The open state records *which route* the drawer was opened on rather than a
  // bare boolean. Navigating therefore closes it as a consequence of the
  // comparison, instead of needing an effect to reset it, and a link can never
  // leave the drawer covering the page it just opened.
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState(null);
  const navOpen = openedOn === pathname;

  const openNav = () => setOpenedOn(pathname);
  const closeNav = () => setOpenedOn(null);

  // Growing past the md breakpoint restores the fixed sidebar, so the drawer
  // has to stand down or the same navigation would be on screen twice.
  useEffect(() => {
    if (!navOpen) return;
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) setOpenedOn(null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [navOpen]);

  // Escape closes it, matching the behaviour of the existing modals.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpenedOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const sidebar = <WorkspaceSidebar workspaceId={workspaceId} workspaceName={workspaceName} role={role} />;

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-10%] h-[380px] w-[380px] bg-blue-600/20" />
        <div className="ws-glow right-[-6%] top-[30%] h-[340px] w-[340px] bg-purple-600/12" />

        <div className="relative z-10 flex h-dvh flex-col">
          <Topbar
            workspaceName={workspaceName}
            backHref="/workspaces"
            onOpenNav={openNav}
          />
          <div className="flex min-h-0 flex-1">
            <div className="hidden md:block">{sidebar}</div>
            <main className="min-h-0 flex-1 overflow-y-auto ws-scroll">{children}</main>
          </div>
        </div>

        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={closeNav}
            />
            <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col">
              {/* The sidebar is a stretch-to-fit column in the desktop shell; giving it
                  a bounded, full-height wrapper here is what lets its own nav scroll
                  instead of the drawer growing past the viewport. */}
              <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
              <button
                type="button"
                onClick={closeNav}
                aria-label="Close navigation"
                className="absolute right-3 top-4 rounded-lg border border-white/10 bg-black/40 p-1.5 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
              >
                <XIcon size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
