"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useResource } from "@/hooks/useResource";
import { TrashIcon, UsersIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import EmptyState from "@/components/workspace/EmptyState";
import Modal from "@/components/workspace/Modal";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/workspaceApi";

const ROLE_STYLES = {
  Admin: "bg-blue-400/15 text-blue-300",
  Member: "bg-white/8 text-zinc-300",
  Viewer: "bg-white/5 text-zinc-400",
};

// The API accepts exactly these, in this casing, and refuses anything else.
const ASSIGNABLE_ROLES = ["Admin", "Member", "Viewer"];

export default function WorkspaceMembersPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const { user: me } = useAuth();

  const { data, loading, error, refetch } = useResource(`/workspaces/${workspaceId}/members`);
  // The caller's own role in this workspace. Only an Admin holds
  // `manage_workspace_members`, so this only decides which controls to draw —
  // the endpoints re-check and answer 403 regardless.
  const { data: workspaceData } = useResource(`/workspaces/${workspaceId}`);
  const canManage = workspaceData?.role === "Admin";

  const { run, loading: acting } = useMutation();
  const [actionError, setActionError] = useState("");
  const [pendingRole, setPendingRole] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState("");

  const members = data?.members || [];
  const roleCounts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1;
    return acc;
  }, {});

  async function changeRole(member, role) {
    if (role === member.role) return;
    setActionError("");
    setPendingRole(member.id);

    const result = await run(`/workspaces/${workspaceId}/members/${member.user?.id}`, {
      method: "PATCH",
      body: { role },
    });

    setPendingRole(null);

    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    refetch();
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveError("");

    const result = await run(`/workspaces/${workspaceId}/members/${removing.user?.id}`, {
      method: "DELETE",
    });

    if (result.error) {
      setRemoveError(result.error.message);
      return;
    }
    setRemoving(null);
    refetch();
  }

  if (loading && members.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
        <div className="mt-6 space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
        <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Members</h1>
        <p className="mt-1 text-[13.5px] text-zinc-400">
          Everyone with access to this workspace.
        </p>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(roleCounts).map(([role, count]) => (
          <div key={role} className="ws-card rounded-2xl p-4">
            <p className="text-[22px] font-bold leading-none text-white">{count}</p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">
              {role}s
            </p>
          </div>
        ))}
      </section>

      {canManage && actionError ? (
        <p
          className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      {members.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<UsersIcon size={20} />}
            title="No members yet"
            description="Invite people to this workspace to get started."
          />
        </div>
      ) : (
        <div className="ws-card mt-6 rounded-2xl p-2">
          {members.map((member) => {
            const isSelf = String(member.user?.id) === String(me?.id);
            // The owner must stay an admin and cannot be removed, so those
            // controls are not offered rather than offered and refused.
            const locked = Boolean(member.isOwner);

            return (
              <div
                key={member.id}
                className="flex flex-wrap items-center gap-3 rounded-xl px-2.5 py-3 transition-colors hover:bg-white/[0.04]"
              >
                <Avatar name={member.user?.name} avatar={member.user?.avatar} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-zinc-100">
                    {member.user?.name}
                    {isSelf ? <span className="ml-1.5 text-[11.5px] text-zinc-500">(you)</span> : null}
                    {locked ? (
                      <span className="ml-1.5 text-[11.5px] text-zinc-500">(owner)</span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[11.5px] text-zinc-600">
                    {member.user?.email}
                  </p>
                </div>
                <span className="hidden text-[11.5px] text-zinc-600 sm:block">
                  Joined {formatDate(member.joinedAt)}
                </span>

                {canManage && !locked ? (
                  <>
                    <select
                      value={member.role}
                      disabled={acting && pendingRole === member.id}
                      onChange={(event) => changeRole(member, event.target.value)}
                      aria-label={`Role for ${member.user?.name}`}
                      className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-[12px] text-zinc-200 transition-colors hover:border-white/20 focus:border-white/30 disabled:opacity-50"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveError("");
                        setRemoving(member);
                      }}
                      aria-label={`Remove ${member.user?.name}`}
                      title="Remove from workspace"
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-400/12 hover:text-red-300"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </>
                ) : (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      ROLE_STYLES[member.role] || "bg-white/8 text-zinc-300"
                    }`}
                  >
                    {member.role}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove member"
        maxWidth="max-w-md"
      >
        <p className="text-[14px] leading-relaxed text-zinc-300">
          Remove{" "}
          <span className="font-medium text-white">{removing?.user?.name}</span> from this
          workspace? They lose access to its projects, teams and documents straight away.
        </p>
        {removeError ? (
          <p
            className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300"
            role="alert"
          >
            {removeError}
          </p>
        ) : null}
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
            onClick={confirmRemove}
            disabled={acting}
            className="rounded-lg bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
          >
            {acting ? "Removing…" : "Remove member"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
