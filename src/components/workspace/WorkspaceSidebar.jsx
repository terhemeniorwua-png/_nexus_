"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useResource } from "@/hooks/useResource";
import { usePresence } from "@/hooks/usePresence";
import Avatar from "./Avatar";
import { GridIcon, BoardIcon, DocIcon, ChatIcon, SparkIcon } from "./icons";

function NavLink({ href, active, icon, label, badge }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${active ? "bg-white/8 text-white" : "ws-link"}`}
    >
      <span className="text-current opacity-80">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-bold text-oncolor">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function WorkspaceSidebar({ workspaceId, workspaceName, role }) {
  const pathname = usePathname();
  const { data: projectData } = useResource(`/workspaces/${workspaceId}/projects`);
  const { data: memberData } = useResource(`/workspaces/${workspaceId}/members`);
  const { isOnline, ready } = usePresence(workspaceId);

  const projects = projectData?.projects || [];
  const members = memberData?.members || [];

  const isActive = (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[var(--sidebar-bg)] backdrop-blur-md">
      <div className="px-4 pt-5 pb-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Workspace
        </p>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-blue-600/40 to-purple-600/40 text-[13px] font-bold text-white">
            {(workspaceName || "W").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-white">{workspaceName}</p>
            <p className="text-[11px] text-zinc-500">{role || ""}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto ws-scroll px-3">
        <Link
          href="/workspaces"
          className="mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-500 transition-colors hover:text-white"
        >
          <SparkIcon size={15} /> All workspaces
        </Link>

        <NavLink href={`/workspaces/${workspaceId}`} active={isActive(`/workspaces/${workspaceId}`) && !isActive(`/workspaces/${workspaceId}/projects`)} icon={<GridIcon size={16} />} label="Overview" />
        <NavLink href={`/workspaces/${workspaceId}/documents`} active={isActive(`/workspaces/${workspaceId}/documents`)} icon={<DocIcon size={16} />} label="Documents" />
        <NavLink href={`/workspaces/${workspaceId}/messages`} active={isActive(`/workspaces/${workspaceId}/messages`)} icon={<ChatIcon size={16} />} label="Messages" />

        <p className="pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          Boards
        </p>
        {projects.length === 0 && (
          <p className="px-2.5 py-1.5 text-[12.5px] text-zinc-600">No projects yet</p>
        )}
        {projects.map((project) => {
          const href = `/workspaces/${workspaceId}/projects/${project.id}/board`;
          return (
            <NavLink
              key={project.id}
              href={href}
              active={isActive(`/workspaces/${workspaceId}/projects/${project.id}`)}
              icon={<BoardIcon size={16} />}
              label={project.name}
            />
          );
        })}

        <p className="pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          Members
        </p>
        <div className="space-y-1 px-1 py-1">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
              <Avatar
                name={member.user?.name}
                avatar={member.user?.avatar}
                size={24}
                showPresence={ready}
                online={isOnline(member.user?.id)}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-300">
                {member.user?.name}
              </span>
              <span className="text-[10.5px] text-zinc-600">{member.role}</span>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}