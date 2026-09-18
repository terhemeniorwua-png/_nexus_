"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useResource, useMutation } from "@/hooks/useResource";
import { usePresence } from "@/hooks/usePresence";
import { PlusIcon, UsersIcon, GridIcon, BoardIcon, CheckIcon, MailIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import Modal from "@/components/workspace/Modal";
import EmptyState from "@/components/workspace/EmptyState";
import ActivityFeed from "@/components/workspace/ActivityFeed";
import WorkspaceForm from "@/components/workspace/WorkspaceForm";

export default function WorkspaceHomePage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);

  const { data: wsData } = useResource(`/workspaces/${workspaceId}`);
  const {
    data: projectsData,
    refetch: refetchProjects,
    loading: projectsLoading,
  } = useResource(`/workspaces/${workspaceId}/projects`);
  const { data: activityData } = useResource(`/workspaces/${workspaceId}/activity`);
  const { run } = useMutation();
  const { isOnline, ready } = usePresence(workspaceId);

  const [showProject, setShowProject] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [inviteError, setInviteError] = useState("");
  const [invited, setInvited] = useState("");

  const workspace = wsData?.workspace;
  const role = wsData?.role || "";
  const members = wsData?.members || [];
  const projects = useMemo(() => projectsData?.projects || [], [projectsData]);
  const activity = activityData?.activities || [];

  const canManage = role === "Admin" || role === "Member";

  const stats = useMemo(() => {
    const taskTotal = projects.reduce((sum, p) => sum + (p.stats?.taskCount || 0), 0);
    const doneTotal = projects.reduce((sum, p) => sum + (p.stats?.completedCount || 0), 0);
    return [
      { icon: <UsersIcon size={18} />, label: "Members", value: wsData?.stats?.memberCount || members.length, color: "#3b82f6" },
      { icon: <GridIcon size={18} />, label: "Projects", value: projects.length, color: "#a855f7" },
      { icon: <BoardIcon size={18} />, label: "Tasks", value: taskTotal, color: "#eab308" },
      {
        icon: <CheckIcon size={18} />,
        label: "Completion",
        value: taskTotal ? `${Math.round((doneTotal / taskTotal) * 100)}%` : "—",
        color: "#22c55e",
      },
    ];
  }, [projects, members.length, wsData]);

  async function handleCreateProject(form, runFn) {
    const { error } = await runFn(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: { name: form.name, description: form.description },
    });
    if (error) throw error;
    setShowProject(false);
    refetchProjects();
  }

  async function handleInvite(event) {
    event.preventDefault();
    setInviteError("");
    setInvited("");
    const { error } = await run(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: { email: inviteEmail.trim(), role: inviteRole },
    });
    if (error) {
      setInviteError(error.message || "Could not add member");
      return;
    }
    setInvited(`${inviteEmail.trim()} is now a member`);
    setInviteEmail("");
    setTimeout(() => window.location.reload(), 600);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-blue-600/35 to-purple-600/35 text-[16px] font-bold text-white">
            {(workspace?.name || "W").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-semibold tracking-tight text-white">
                {workspace?.name || "Workspace"}
              </h1>
              <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-zinc-400">
                {role || "Member"}
              </span>
            </div>
            <p className="mt-1 text-[13.5px] text-zinc-400">
              {workspace?.description || "No description yet."}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-[13px] font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
            >
              <UsersIcon size={15} /> Invite member
            </button>
            <button
              type="button"
              onClick={() => setShowProject(true)}
              className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              <PlusIcon size={15} /> New project
            </button>
          </div>
        )}
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="ws-card flex items-center gap-4 rounded-2xl p-[18px]">
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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Projects</h2>
            {projects.length > 0 && canManage && (
              <button
                type="button"
                onClick={() => setShowProject(true)}
                className="flex items-center gap-1.5 text-[12.5px] text-zinc-500 transition-colors hover:text-white"
              >
                <PlusIcon size={13} /> New project
              </button>
            )}
          </div>

          {projectsLoading && projects.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<BoardIcon size={20} />}
              title="No projects yet"
              description="Create a project to start a board with columns and tasks."
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setShowProject(true)}
                    className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    New project
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => {
                const total = project.stats?.taskCount || 0;
                const done = project.stats?.completedCount || 0;
                const percent = total ? Math.round((done / total) * 100) : 0;
                return (
                  <Link
                    key={project.id}
                    href={`/workspaces/${workspaceId}/projects/${project.id}/board`}
                    className="ws-card group rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors group-hover:text-white">
                        <BoardIcon size={16} />
                      </span>
                      <span className="text-[12px] text-zinc-500">{total} tasks</span>
                    </div>
                    <p className="mt-3 text-[14.5px] font-semibold text-white">{project.name}</p>
                    <p className="mt-1 line-clamp-2 min-h-[2rem] text-[12.5px] leading-relaxed text-zinc-500">
                      {project.description || "No description yet."}
                    </p>
                    {total > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] text-zinc-500">
                          {done} done · {percent}%
                        </p>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-white">Members</h2>
              <span className="text-[12px] text-zinc-500">{members.length}</span>
            </div>
            <div className="ws-card rounded-2xl p-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.04]"
                >
                  <Avatar
                    name={member.user?.name}
                    avatar={member.user?.avatar}
                    size={30}
                    showPresence={ready}
                    online={isOnline(member.user?.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-zinc-100">
                      {member.user?.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-zinc-600">
                      {member.user?.email}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      member.role === "Admin"
                        ? "bg-blue-400/15 text-blue-300"
                        : member.role === "Viewer"
                          ? "bg-white/5 text-zinc-400"
                          : "bg-white/8 text-zinc-300"
                    }`}
                  >
                    {member.role}
                  </span>
                </div>
              ))}
              {members.length === 0 && (
                <p className="px-3 py-6 text-center text-[13px] text-zinc-600">No members yet.</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-white">Recent activity</h2>
            </div>
            <div className="ws-card rounded-2xl p-3">
              <ActivityFeed activities={activity} workspaceId={workspaceId} limit={12} />
            </div>
          </div>
        </div>
      </div>

      <WorkspaceForm
        open={showProject}
        onClose={() => setShowProject(false)}
        title="New project"
        submitLabel="Create project"
        onSubmit={handleCreateProject}
      />

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite member">
        <form onSubmit={handleInvite} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Email address
            </span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Role
            </span>
            <div className="flex gap-1.5 rounded-lg border border-white/10 bg-white/5 p-1">
              {["Member", "Admin", "Viewer"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                    inviteRole === r ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </label>

          {invited && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-300">
              <CheckIcon size={14} /> {invited}
            </p>
          )}
          {inviteError && (
            <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
              {inviteError}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-1.5 text-[12px] text-zinc-600">
              <MailIcon size={13} /> They must have an account.
            </span>
            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Invite
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}