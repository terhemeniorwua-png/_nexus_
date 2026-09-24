"use client";

import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useResource } from "@/hooks/useResource";
import "../../workspace.css";
import GlobalNav from "@/components/workspace/GlobalNav";
import ProjectForm from "@/components/workspace/ProjectForm";

export default function NewProjectPage() {
  const router = useRouter();

  async function handleCreate(values, runFn) {
    const { data, error } = await runFn("/projects", {
      method: "POST",
      body: values,
    });
    if (error) throw error;
    if (data?.project?.id) {
      router.push(`/projects/${data.project.id}`);
    }
  }

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow right-[-10%] top-[-10%] h-[340px] w-[340px] bg-purple-600/15" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />
          <main className="mx-auto w-full max-w-2xl px-5 py-12 md:px-8">
            <h1 className="text-[26px] font-semibold tracking-tight text-white">New project</h1>
            <p className="mt-1 text-[14px] text-zinc-400">
              Create a project inside one of your teams.
            </p>

            <div className="mt-8">
              <ProjectForm
                open
                onClose={() => router.push("/projects")}
                title="New project"
                submitLabel="Create project"
                onSubmit={handleCreate}
              />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}