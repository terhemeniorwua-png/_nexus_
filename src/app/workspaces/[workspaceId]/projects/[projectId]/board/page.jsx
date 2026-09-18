"use client";

import { useParams } from "next/navigation";
import { useResource } from "@/hooks/useResource";
import Board from "@/components/workspace/Kanban/Board";

export default function BoardPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const projectId = String(params.projectId);

  const { data: wsData } = useResource(`/workspaces/${workspaceId}`);
  const { data: projectsData } = useResource(`/workspaces/${workspaceId}/projects`);

  const members = wsData?.members || [];
  const project = projectsData?.projects?.find((p) => p.id === projectId);
  const role = wsData?.role || "";

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-7 md:px-8">
      <header className="mb-6">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          Board
        </p>
        <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
          {project?.name || "Project board"}
        </h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Drag cards between columns to move work forward.
        </p>
      </header>

      <Board workspaceId={workspaceId} projectId={projectId} members={members} role={role} />
    </div>
  );
}