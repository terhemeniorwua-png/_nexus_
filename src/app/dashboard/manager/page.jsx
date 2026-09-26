"use client";

import { useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useAuth } from "@/context/AuthContext";
import { useResource } from "@/hooks/useResource";
import "../../workspace.css";
import GlobalNav from "@/components/workspace/GlobalNav";
import ProjectPicker from "@/components/workspace/ManagerDashboard/ProjectPicker";
import ManagerOverview from "@/components/workspace/ManagerDashboard/ManagerOverview";
import PendingReviews, {
  awaitingReviewLabel,
} from "@/components/workspace/ManagerDashboard/PendingReviews";
import TeamWorkload from "@/components/workspace/ManagerDashboard/TeamWorkload";
import OverdueTasks from "@/components/workspace/ManagerDashboard/OverdueTasks";
import ProjectActivity from "@/components/workspace/ManagerDashboard/ProjectActivity";
import { DocIcon, UsersIcon, ClockIcon, ActivityIcon, BoardIcon } from "@/components/workspace/icons";

/**
 * Phase 21 — project manager dashboard.
 *
 * Every figure on this page comes from `GET /api/me/manager-dashboard`, which
 * computes everything from the database at request time and re-validates the
 * selected project on every call. The page adds no figures of its own and no
 * fallbacks, so what is on screen is what the server is willing to report.
 *
 * Scope is a `projectId` on the request, not client-side filtering: changing the
 * picker refetches rather than filtering the aggregate response, because an
 * aggregate cannot be un-aggregated honestly.
 */
export default function ManagerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  // null = every managed project, which is the endpoint's aggregate scope and
  // the first thing a manager wants to see.
  const [selected, setSelected] = useState(null);

  const path = selected
    ? `/me/manager-dashboard?projectId=${encodeURIComponent(selected)}`
    : "/me/manager-dashboard";

  const { data, loading, error, refetch } = useResource(path, { deps: [selected] });

  const dashboard = data?.managerDashboard;
  const projects = dashboard?.projects || [];
  const overview = dashboard?.overview;
  const reviews = dashboard?.pendingReviews;
  const workload = dashboard?.workload;
  const overdue = dashboard?.overdue;
  const activity = dashboard?.activity;

  // A section that failed arrives as `null` (the controller degrades one read
  // without taking the page down), so each panel is told about its own failure
  // instead of the whole page showing a single error.
  const sectionError = (section) =>
    !loading && section === null ? "The server could not load this section." : null;

  // The 403 is the authorisation answer, not a transient failure: it means this
  // user manages nothing, and the page should say so plainly rather than
  // offering a retry that can never succeed.
  const forbidden = error?.status === 403;

  const firstName = user?.name?.trim()?.split(/\s+/)[0] || "";
  const scopeLabel = dashboard?.selectedProject
    ? dashboard.selectedProject.name
    : `all ${projects.length} managed ${projects.length === 1 ? "project" : "projects"}`;

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-10%] top-[-15%] h-[380px] w-[380px] bg-purple-600/20" />
        <div className="ws-glow right-[-8%] top-[28%] h-[340px] w-[340px] bg-blue-600/15" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />

          <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-zinc-500">Project manager</p>
                <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">
                  {firstName ? `${firstName}'s delivery desk` : "Delivery desk"}
                </h1>
                <p className="mt-1 text-[14px] text-zinc-400">
                  What needs a decision, and how the work is tracking.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="rounded-xl border border-white/10 px-4 py-2.5 text-[13.5px] font-semibold text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
              >
                My dashboard
              </Link>
            </header>

            {forbidden ? (
              <div
                className="mt-8 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-6 py-10 text-center"
                role="alert"
              >
                <h2 className="text-[15px] font-semibold text-amber-100">
                  No projects to manage yet
                </h2>
                <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-amber-200/70">
                  {error.message} This page is for project managers and workspace
                  admins. If you are expecting access, ask a workspace admin to
                  make you a project manager.
                </p>
                <Link
                  href="/projects"
                  className="mt-5 inline-block rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Go to projects
                </Link>
              </div>
            ) : error && !loading ? (
              <div
                className="mt-8 flex flex-col items-center rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-6 py-8 text-center"
                role="alert"
              >
                <p className="text-[14px] font-semibold text-red-200">
                  We couldn&apos;t load the manager dashboard
                </p>
                <p className="mt-1.5 max-w-sm text-[12.5px] text-red-200/70">
                  {error.message || "Something went wrong fetching your data."}
                </p>
                <button
                  type="button"
                  onClick={refetch}
                  className="mt-4 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                  <ProjectPicker
                    projects={projects}
                    selected={selected}
                    onSelect={setSelected}
                    loading={loading}
                  />
                  {dashboard?.scope === "project" && (
                    <Link
                      href={`/projects/${selected}`}
                      className="flex items-center gap-1.5 text-[12.5px] text-zinc-400 transition-colors hover:text-white"
                    >
                      <BoardIcon size={14} /> Open {scopeLabel}
                    </Link>
                  )}
                </div>

                <section className="mt-6">
                  <ManagerOverview
                    overview={overview}
                    pendingCount={reviews ? reviews.length : undefined}
                    loading={loading || !dashboard}
                    error={sectionError(overview)}
                  />
                </section>

                <div className="mt-8 grid gap-6 lg:grid-cols-3">
                  <section className="lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <DocIcon size={15} /> Awaiting review
                      </h2>
                      {!loading && (
                        <span className="text-[12px] text-zinc-500">
                          {awaitingReviewLabel(reviews?.length || 0)}
                        </span>
                      )}
                    </div>
                    <PendingReviews
                      reviews={reviews}
                      loading={loading || !dashboard}
                      error={sectionError(reviews)}
                      onRefresh={refetch}
                    />
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <UsersIcon size={15} /> Team workload
                      </h2>
                      {!loading && (
                        <span className="text-[12px] text-zinc-500">
                          {workload ? `${workload.length} with open work` : ""}
                        </span>
                      )}
                    </div>
                    <TeamWorkload
                      workload={workload}
                      loading={loading || !dashboard}
                      error={sectionError(workload)}
                    />
                  </section>
                </div>

                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <span className="h-2 w-2 rounded-full bg-red-400" /> Overdue
                      </h2>
                      {!loading && (
                        <span className="text-[12px] text-zinc-500">
                          {overdue ? `${overdue.length} late` : ""}
                        </span>
                      )}
                    </div>
                    <OverdueTasks
                      tasks={overdue}
                      loading={loading || !dashboard}
                      error={sectionError(overdue)}
                      showProject={!selected}
                    />
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
                        <ActivityIcon size={15} /> Recent activity
                      </h2>
                      {!loading && (
                        <span className="flex items-center gap-1 text-[12px] text-zinc-500">
                          <ClockIcon size={12} /> {scopeLabel}
                        </span>
                      )}
                    </div>
                    <div className="ws-card rounded-2xl p-3">
                      <ProjectActivity
                        activities={activity}
                        loading={loading || !dashboard}
                        error={sectionError(activity)}
                      />
                    </div>
                  </section>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
