"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useAuth } from "@/context/AuthContext";
import { useResource } from "@/hooks/useResource";
import "../workspace.css";
import { PlusIcon, GridIcon, BoardIcon, UsersIcon, ClockIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import EmptyState from "@/components/workspace/EmptyState";
import ActivityFeed from "@/components/workspace/ActivityFeed";
import TaskItem from "@/components/workspace/TaskItem";
import WorkspaceForm from "@/components/workspace/WorkspaceForm";
import GlobalNav from "@/components/workspace/GlobalNav";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, loading } = useResource("/me/overview");
  const [showCreate, setShowCreate] = useState(false);

  const overview = data?.overview;
  const dueSoon = overview?.dueSoonTasks || [];
  const overdue = overview?.overdueTasks || [];
  const tasks = overview?.inProgressTasks || [];
  const workspaces = useMemo(() => overview?.workspaces || [], [overview]);
  const activity = overview?.recentActivity || [];

  const firstName = user?.name?.split(" ")[0] || "there";
  const workCount = new Set([...dueSoon, ...overdue, ...tasks].map((t) => t.id)).size;

  const stats = useMemo(
    () => [
      { icon: <GridIcon size={18} />, label: "Workspaces", value: workspaces.length, color: "#3b82f6" },
      { icon: <BoardIcon size={18} />, label: "Active tasks", value: workCount, color: "#a855f7" },
      { icon: <ClockIcon size={18} />, label: "Due this week", value: dueSoon.length, color: "#eab308" },
      { icon: <UsersIcon size={18} />, label: "Team size", value: workspaces.reduce((sum, ws) => sum + (ws.stats?.memberCount || 0), 0), color: "#22c55e" },
    ],
    [workspaces, workCount, dueSoon.length]
  );

  async function handleCreateWorkspace(form, runFn) {
    const { data: created, error } = await runFn("/workspaces", {
      method: "POST",
      body: { name: form.name, description: form.description },
    });
    if (error) throw error;
    setShowCreate(false);
    router.push(`/workspaces/${created.workspace.id}`);
  }

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-10%] top-[-15%] h-[380px] w-[380px] bg-blue-600/20" />
        <div className="ws-glow right-[-8%] top-[28%] h-[340px] w-[340px] bg-purple-600/15" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />

          <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
            <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-zinc-500">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">
                {greeting()}, {firstName}.
              </h1>
              <p className="mt-1 text-[14px] text-zinc-400">
                Here&apos;s what&apos;s happening across your workspaces.
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

          {loading && !overview ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
              ))}
            </div>
          ) : (
            <>
              <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="ws-card flex items-center gap-4 rounded-2xl p-4.5"
                    style={{ padding: "18px" }}
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10"
                      style={{ color: stat.color, backgroundColor: `${stat.color}14` }}
                    >
                      {stat.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[24px] font-bold leading-none text-white">{stat.value}</p>
                      <p className="mt-1.5 truncate text-[12px] font-medium uppercase tracking-wide text-zinc-500">
                        {stat.label}
                      </p>
                    </div>
                  </div>
                ))}
              </section>

              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <section className="space-y-5">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <span className="h-2 w-2 rounded-full bg-red-400" /> Overdue
                      </h2>
                      <span className="text-[12px] text-zinc-500">{overdue.length}</span>
                    </div>
                    <div className="space-y-2.5">
                      {overdue.length === 0 ? (
                        <EmptyState
                          icon={<ClockIcon size={18} />}
                          title="Nothing overdue"
                          description="You're all caught up. Nice."
                          className="py-8"
                        />
                      ) : (
                        overdue.map((task) => <TaskItem key={task.id} task={task} />)
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <span className="h-2 w-2 rounded-full bg-amber-400" /> Due soon
                      </h2>
                      <span className="text-[12px] text-zinc-500">{dueSoon.length}</span>
                    </div>
                    <div className="space-y-2.5">
                      {dueSoon.length === 0 ? (
                        <EmptyState
                          icon={<ClockIcon size={18} />}
                          title="All clear this week"
                          description="No tasks with upcoming due dates."
                          className="py-8"
                        />
                      ) : (
                        dueSoon.map((task) => <TaskItem key={task.id} task={task} />)
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-5">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <GridIcon size={15} /> Your workspaces
                      </h2>
                      <Link href="/workspaces" className="text-[12px] text-zinc-500 transition-colors hover:text-white">
                        View all
                      </Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {workspaces.length === 0 ? (
                        <div className="sm:col-span-2">
                          <EmptyState
                            icon={<GridIcon size={18} />}
                            title="No workspaces yet"
                            description="Create a workspace to start planning with your team."
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
                        workspaces.map((workspace) => (
                          <Link
                            key={workspace.id}
                            href={`/workspaces/${workspace.id}`}
                            className="ws-card group rounded-2xl p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-blue-600/35 to-purple-600/35 text-[13px] font-bold text-white">
                                {workspace.name.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] text-zinc-400">
                                {workspace.role}
                              </span>
                            </div>
                            <p className="mt-3 truncate text-[14px] font-semibold text-white">
                              {workspace.name}
                            </p>
                            {workspace.description && (
                              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500">
                                {workspace.description}
                              </p>
                            )}
                            <p className="mt-3 text-[11.5px] text-zinc-600">
                              {workspace.stats?.memberCount || 0} members ·{" "}
                              {workspace.stats?.taskCount || 0} tasks
                            </p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-[14px] font-semibold text-white">Recent activity</h2>
                    </div>
                    <div className="ws-card rounded-2xl p-3">
                      <ActivityFeed activities={activity} limit={10} />
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}

          <WorkspaceForm
            open={showCreate}
            onClose={() => setShowCreate(false)}
            title="New workspace"
            submitLabel="Create workspace"
            onSubmit={handleCreateWorkspace}
          />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}