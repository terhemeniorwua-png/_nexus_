"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useResource, useMutation } from "@/hooks/useResource";
import { TeamIcon, UsersIcon, BoardIcon, PlusIcon, TrashIcon, ArrowLeftIcon, CheckIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import Modal from "@/components/workspace/Modal";
import EmptyState from "@/components/workspace/EmptyState";
import { formatDate } from "@/lib/workspaceApi";

export default function TeamDetailPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const teamId = String(params.teamId);

  const { data, loading, error, refetch } = useResource(`/teams/${teamId}`);
  const {
    data: membersData,
    loading: membersLoading,
    refetch: refetchMembers,
  } = useResource(`/teams/${teamId}/members`);
  const { data: wsMembersData } = useResource(`/workspaces/${workspaceId}/members`);
  const { run } = useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [addError, setAddError] = useState("");
  const [added, setAdded] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const team = data?.team;
  const workspace = data?.workspace;
  const role = data?.role || "";
  const isTeamLead = Boolean(data?.isTeamLead);
  const projects = data?.projects || [];
  const members = useMemo(() => membersData?.members || [], [membersData]);
  const wsMembers = useMemo(() => wsMembersData?.members || [], [wsMembersData]);

  const canManage = role === "WORKSPACE_OWNER" || role === "ADMIN" || isTeamLead;

  const availableMembers = useMemo(() => {
    const teamIds = new Set(members.map((m) => String(m.user.id)));
    return wsMembers.filter((m) => !teamIds.has(String(m.user.id)));
  }, [members, wsMembers]);

  async function handleAdd(event) {
    event.preventDefault();
    setAddError("");
    setAdded("");
    if (!selectedUser) {
      setAddError("Choose a member to add");
      return;
    }
    setBusy(true);
    const { data: result, error: err } = await run(`/teams/${teamId}/members`, {
      method: "POST",
      body: { userId: selectedUser },
    });
    setBusy(false);
    if (err) {
      setAddError(err.message || "Could not add member");
      return;
    }
    const addable = wsMembers.find((m) => String(m.user.id) === selectedUser);
    setAdded(`${addable?.user?.name || "Member"} added to ${team?.name}`);
    setSelectedUser("");
    refetchMembers();
    refetch();
  }

async function handleRemoveConfirm() {
  if (!removing) return;
  const { error: err } = await run(`/teams/${teamId}/members/${removing.userId}`, {
    method: "DELETE",
  });
  setRemoving(null);
  if (err) {
    setAddError(err.message || "Could not remove member");
    return;
  }
  refetchMembers();
  refetch();
}

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
          {error?.message || "Team not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <Link
        href={`/workspaces/${workspaceId}/teams`}
        className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-white"
      >
        <ArrowLeftIcon size={15} /> All teams
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-emerald-600/30 to-teal-600/30 text-white">
            <TeamIcon size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-semibold tracking-tight text-white">{team.name}</h1>
              {isTeamLead && (
                <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                  You lead this team
                </span>
              )}
            </div>
            <p className="mt-1 text-[13.5px] text-zinc-400">
              {team.description || "No description yet."}
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <PlusIcon size={15} /> Add member
          </button>
        )}
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ws-card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300">
            <UsersIcon size={17} />
          </span>
          <div>
            <p className="text-[22px] font-bold leading-none text-white">{team.stats?.memberCount ?? members.length}</p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">Members</p>
          </div>
        </div>
        <div className="ws-card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300">
            <BoardIcon size={17} />
          </span>
          <div>
            <p className="text-[22px] font-bold leading-none text-white">{team.stats?.projectCount ?? projects.length}</p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">Projects</p>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Members</h2>
            <span className="text-[12px] text-zinc-500">{members.length}</span>
          </div>

          {membersLoading && members.length === 0 ? (
            <div className="grid gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl border border-white/6 bg-white/[0.03]" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              icon={<UsersIcon size={20} />}
              title="No members yet"
              description="Add people from this workspace to the team."
            />
          ) : (
            <div className="ws-card rounded-2xl p-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.04]"
                >
                  <Avatar name={member.user?.name} avatar={member.user?.avatar} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-zinc-100">
                      {member.user?.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-zinc-600">{member.user?.email}</p>
                  </div>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      member.role === "TEAM_LEAD"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-white/8 text-zinc-300"
                    }`}
                  >
                    {member.role === "TEAM_LEAD" ? "Team lead" : "Member"}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setRemoving({ userId: member.user?.id, name: member.user?.name })}
                      aria-label={`Remove ${member.user?.name}`}
                      className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-red-400/10 hover:text-red-300"
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Projects</h2>
            <span className="text-[12px] text-zinc-500">{projects.length}</span>
          </div>
          {projects.length === 0 ? (
            <EmptyState
              icon={<BoardIcon size={20} />}
              title="No projects assigned"
              description="Projects linked to this team will show up here."
              className="py-8"
            />
          ) : (
            <div className="space-y-2.5">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/workspaces/${workspaceId}/projects/${project.id}/board`}
                  className="ws-card flex items-center justify-between rounded-xl px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-zinc-100">{project.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-zinc-500">{project.taskCount} tasks</p>
                  </div>
                  <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    {project.status || "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={`Add member to ${team.name}`}>
        <form onSubmit={handleAdd} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Workspace member
            </span>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px]"
            >
              <option value="">Select a member…</option>
              {availableMembers.map((m) => (
                <option key={m.user?.id} value={m.user?.id}>
                  {m.user?.name} · {m.user?.email}
                </option>
              ))}
            </select>
          </label>

          {availableMembers.length === 0 && (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-zinc-400">
              Everyone in this workspace is already on the team.
            </p>
          )}

          {added && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-300">
              <CheckIcon size={14} /> {added}
            </p>
          )}
          {addError && (
            <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
              {addError}
            </p>
          )}

          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || availableMembers.length === 0}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add member"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove from ${team?.name || ""}`}
        maxWidth="max-w-md"
      >
        <p className="text-[14px] leading-relaxed text-zinc-300">
          Remove <span className="font-medium text-white">{removing?.name}</span> from this team? They
          will lose access to team-specific pages, but keep their workspace membership.
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setRemoving(null)}
            className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRemoveConfirm}
            className="rounded-lg bg-red-500/90 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-500"
          >
            Remove
          </button>
        </div>
      </Modal>
    </div>
  );
}