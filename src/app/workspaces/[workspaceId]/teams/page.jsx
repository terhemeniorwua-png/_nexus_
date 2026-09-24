"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useResource, useMutation } from "@/hooks/useResource";
import { PlusIcon, TeamIcon, UsersIcon, BoardIcon } from "@/components/workspace/icons";
import EmptyState from "@/components/workspace/EmptyState";
import TeamForm from "@/components/workspace/TeamForm";

export default function WorkspaceTeamsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = String(params.workspaceId);

  const { data: wsData, error: wsError } = useResource(`/workspaces/${workspaceId}`);
  const {
    data: teamsData,
    loading,
    error,
    refetch,
  } = useResource(`/workspaces/${workspaceId}/teams`);
  const { run } = useMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState("");

  const role = wsData?.role || "";
  const canManage = role === "Admin";
  const teams = teamsData?.teams || [];

  async function handleCreate(form, runFn) {
    setCreateError("");
    const { data, error: err } = await runFn("/teams", {
      method: "POST",
      body: { workspaceId, name: form.name, description: form.description },
    });
    if (err) {
      setCreateError(err.message || "Could not create team");
      return;
    }
    setShowCreate(false);
    if (data?.team?.id) {
      router.push(`/workspaces/${workspaceId}/teams/${data.team.id}`);
    } else {
      refetch();
    }
  }

  const loadingState = loading || (!wsData && !wsError);
  const errorMessage = error?.message || wsError?.message || "";

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-white">Teams</h1>
          <p className="mt-1 text-[13.5px] text-zinc-400">
            Organize your workspace into focused groups of people.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <PlusIcon size={15} /> New team
          </button>
        )}
      </header>

      {errorMessage && (
        <p className="mt-6 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
          {errorMessage}
        </p>
      )}

      {loadingState && teams.length === 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<TeamIcon size={20} />}
            title="No teams yet"
            description="Create a team so people can rally around a shared goal."
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Create team
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/workspaces/${workspaceId}/teams/${team.id}`}
              className="ws-card group rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-emerald-600/30 to-teal-600/30 text-white transition-colors group-hover:text-emerald-200">
                  <TeamIcon size={17} />
                </span>
              </div>

              <p className="mt-4 text-[15px] font-semibold text-white">{team.name}</p>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-zinc-500">
                {team.description || "No description yet."}
              </p>

              <div className="mt-4 flex items-center gap-4 border-t border-white/8 pt-3.5 text-[12px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <UsersIcon size={13} /> {team.stats?.memberCount || 0} members
                </span>
                <span className="flex items-center gap-1.5">
                  <BoardIcon size={13} /> {team.stats?.projectCount || 0} projects
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <TeamForm
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setCreateError("");
        }}
        title="New team"
        submitLabel="Create team"
        onSubmit={handleCreate}
      />

      {createError && (
        <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
          {createError}
        </p>
      )}
    </div>
  );
}