"use client";

import { useParams } from "next/navigation";
import { useResource } from "@/hooks/useResource";
import { UsersIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import EmptyState from "@/components/workspace/EmptyState";
import { formatDate } from "@/lib/workspaceApi";

const ROLE_STYLES = {
  Admin: "bg-blue-400/15 text-blue-300",
  Member: "bg-white/8 text-zinc-300",
  Viewer: "bg-white/5 text-zinc-400",
};

export default function WorkspaceMembersPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);

  const { data, loading, error } = useResource(`/workspaces/${workspaceId}/members`);

  const members = data?.members || [];
  const roleCounts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1;
    return acc;
  }, {});

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
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl px-2.5 py-3 transition-colors hover:bg-white/[0.04]"
            >
              <Avatar name={member.user?.name} avatar={member.user?.avatar} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-zinc-100">
                  {member.user?.name}
                </p>
                <p className="truncate font-mono text-[11.5px] text-zinc-600">
                  {member.user?.email}
                </p>
              </div>
              <span className="hidden text-[11.5px] text-zinc-600 sm:block">
                Joined {formatDate(member.joinedAt)}
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  ROLE_STYLES[member.role] || "bg-white/8 text-zinc-300"
                }`}
              >
                {member.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}