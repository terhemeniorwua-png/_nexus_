"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useResource } from "@/hooks/useResource";
import "../workspace.css";
import { PlusIcon, GridIcon, UsersIcon, BoardIcon } from "@/components/workspace/icons";
import EmptyState from "@/components/workspace/EmptyState";
import WorkspaceForm from "@/components/workspace/WorkspaceForm";

export default function WorkspacesPage() {
  const router = useRouter();
  const { data, loading, refetch } = useResource("/workspaces");
  const [showCreate, setShowCreate] = useState(false);

  const workspaces = data?.workspaces || [];

  async function handleCreateWorkspace(form, runFn) {
    const { data: created, error } = await runFn("/workspaces", {
      method: "POST",
      body: { name: form.name, description: form.description },
    });
    if (error) throw error;
    setShowCreate(false);
    if (created.workspace?.id) {
      router.push(`/workspaces/${created.workspace.id}`);
    } else {
      refetch();
    }
  }

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-12%] h-[360px] w-[360px] bg-blue-600/20" />
        <div className="ws-glow right-[-10%] top-[35%] h-[320px] w-[320px] bg-purple-600/15" />

        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-10 md:px-8">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight text-white">Workspaces</h1>
              <p className="mt-1 text-[14px] text-zinc-400">
                All the places your team builds together.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              <PlusIcon size={16} /> New workspace
            </button>
          </header>

          {loading && workspaces.length === 0 ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
              ))}
            </div>
          ) : workspaces.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                icon={<GridIcon size={20} />}
                title="No workspaces yet"
                description="Create a workspace to organize projects, tasks, documents, and conversations."
                action={
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    Create workspace
                  </button>
                }
              />
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/workspaces/${workspace.id}`}
                  className="ws-card group rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-blue-600/35 to-purple-600/35 text-[15px] font-bold text-white">
                      {workspace.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-400">
                      {workspace.role}
                    </span>
                  </div>

                  <p className="mt-4 text-[15px] font-semibold text-white">{workspace.name}</p>
                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-zinc-500">
                    {workspace.description || "No description yet."}
                  </p>

                  <div className="mt-4 flex items-center gap-4 border-t border-white/8 pt-3.5 text-[12px] text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <UsersIcon size={13} /> {workspace.stats?.memberCount || 0} members
                    </span>
                    <span className="flex items-center gap-1.5">
                      <GridIcon size={13} /> {workspace.stats?.projectCount || 0} projects
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BoardIcon size={13} /> {workspace.stats?.taskCount || 0} tasks
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <WorkspaceForm
            open={showCreate}
            onClose={() => setShowCreate(false)}
            title="New workspace"
            submitLabel="Create workspace"
            onSubmit={handleCreateWorkspace}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}