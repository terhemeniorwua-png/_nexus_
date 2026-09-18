"use client";

import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useResource } from "@/hooks/useResource";
import Topbar from "@/components/workspace/Topbar";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import "../../workspace.css";

export default function WorkspaceLayout({ children }) {
  const params = useParams();
  const workspaceId = String(params.workspaceId);

  const { data } = useResource(`/workspaces/${workspaceId}`);

  const workspaceName = data?.workspace?.name || "Workspace";
  const role = data?.role || "";

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-10%] h-[380px] w-[380px] bg-blue-600/20" />
        <div className="ws-glow right-[-6%] top-[30%] h-[340px] w-[340px] bg-purple-600/12" />

        <div className="relative z-10 flex h-dvh flex-col">
          <Topbar workspaceName={workspaceName} backHref="/workspaces" />
          <div className="flex min-h-0 flex-1">
            <div className="hidden md:block">
              <WorkspaceSidebar
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                role={role}
              />
            </div>
            <main className="min-h-0 flex-1 overflow-y-auto ws-scroll">{children}</main>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}