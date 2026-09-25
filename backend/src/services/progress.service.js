const { ApiError } = require("../middleware/errorHandler");

/**
 * Phase 11 — the single authoritative progress implementation.
 *
 * Source of truth (never stored, never accepted from a client):
 *
 *   subtasks.weight + subtasks.status  ->  task progress
 *   tasks.status (no subtasks)         ->  task progress
 *   task progress                      ->  project progress  ->  dashboard
 *
 * Representation: an integer 0-100, always. `progress: 70` means 70%. The
 * same rounding (Math.round of a value already in 0-100) is used by every
 * caller — service, API, and UI — so a task, its project, and the dashboard
 * never disagree about the same number.
 */

const SUBTASK_COMPLETED = "COMPLETED";

// A task without subtasks is complete only once it has been APPROVED. Legacy
// board data ("DONE") is treated the same way. Every other workflow state —
// including SUBMITTED / UNDER_REVIEW — reports 0: those states describe a
// workflow step, not delivered work.
const TASK_COMPLETE_STATUSES = ["APPROVED", "DONE"];

// Full allocation of a task's 100 points.
const TOTAL_TASK_WEIGHT = 100;

function clampPercentage(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Sum of subtask weights, computed in hundredths so float drift (0.1 + 0.2)
 * can never leak into a reported number. Integer weights are exact.
 */
function subtaskWeightTotal(subtasks = []) {
  const list = Array.isArray(subtasks) ? subtasks : [];
  const sum = list.reduce((acc, s) => acc + (Number(s && s.weight) || 0) * 100, 0);
  return Math.round(sum) / 100;
}

function weightOf(subtask) {
  return Math.max(0, Number(subtask && subtask.weight) || 0);
}

function isCompleted(subtask) {
  if (!subtask) return false;
  // Pre-Phase-11 documents stored only the boolean; new data uses the status.
  return (
    String(subtask.status || "").toUpperCase() === SUBTASK_COMPLETED ||
    Boolean(subtask.completed)
  );
}

/**
 * Weighted completion of a task's subtasks (0-100), or null when the task has
 * none. Only COMPLETED subtasks contribute, and their weight is summed
 * verbatim — no normalization by the configured total:
 *
 *   20 + 50 + 30 with the first two COMPLETED  ->  70
 *   20 + 50 + 30 all COMPLETED                  ->  100
 *
 * A task whose weights only partially allocated (e.g. 20 + 50 after a third
 * subtask was deleted) therefore reports the work that is actually done
 * (50) instead of silently promoting 50/70 to 71%. Progress is a measure of
 * completed work out of a 100% task, never a ratio of the weights that happen
 * to exist right now.
 *
 * Subtasks with no weights at all (legacy checklists, total 0) fall back to a
 * plain completion count so old data keeps reporting meaningful progress.
 */
function calculateTaskProgress(subtasks = []) {
  const list = Array.isArray(subtasks) ? subtasks : [];
  if (list.length === 0) return null;

  const totalWeight = subtaskWeightTotal(list);
  if (totalWeight > 0) {
    const completedWeight = list
      .filter(isCompleted)
      .reduce((acc, s) => acc + weightOf(s) * 100, 0);
    return clampPercentage(completedWeight / 100);
  }

  const completedCount = list.filter(isCompleted).length;
  return clampPercentage((completedCount / list.length) * 100);
}

/**
 * Progress of a single task, always 0-100 (never null).
 *
 * With subtasks, the subtasks are the finer-grained measurement, so they win
 * over the status: an IN_PROGRESS task with 70% of its weight COMPLETED
 * reports 70. Without subtasks, APPROVED is the only completion state.
 */
function taskProgress(task) {
  const subtasks = (task && task.subtasks) || [];
  if (subtasks.length > 0) {
    return calculateTaskProgress(subtasks) ?? 0;
  }
  return task && TASK_COMPLETE_STATUSES.includes(String(task.status || "").toUpperCase()) ? 100 : 0;
}

/**
 * Project progress = equal-weighted average of its tasks' progress
 * (Phase 11 §22: tasks start equally weighted; the service is structured so
 * per-task weights can be introduced later without touching callers).
 * A project with no tasks has no completed work -> 0, never 100.
 */
function calculateProjectProgress(tasks = []) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (list.length === 0) return 0;
  const total = list.reduce((acc, task) => acc + taskProgress(task), 0);
  return clampPercentage(total / list.length);
}

/**
 * Weight allocation for a task, used by the API/UI to show how much of the
 * 100 points is allocated and what is still available.
 *   { total, remaining, isComplete, completedWeight, pendingSubtasks }
 */
function subtaskWeightSummary(subtasks = []) {
  const list = Array.isArray(subtasks) ? subtasks : [];
  const total = subtaskWeightTotal(list);
  const pending = list.filter((s) => !isCompleted(s));
  return {
    total,
    remaining: Math.max(0, Math.round((TOTAL_TASK_WEIGHT - total) * 100) / 100),
    completedWeight: clampPercentage(
      list.filter(isCompleted).reduce((acc, s) => acc + weightOf(s) * 100, 0) / 100
    ),
    isComplete: list.length > 0 && pending.length === 0,
    pendingSubtasks: pending.length,
  };
}

/**
 * Guard for any mutation of a task's subtask set: the combined weight may
 * never exceed 100. Totals below 100 stay legal (weights are added one subtask
 * at a time) — they simply leave the task unable to report 100% until the
 * remaining points are allocated. The only rejected configuration is one that
 * claims more than the whole task.
 */
function assertWeightTotalWithinLimit(subtasks = []) {
  if (subtaskWeightTotal(subtasks) > TOTAL_TASK_WEIGHT) {
    throw new ApiError(
      400,
      "Subtask weights cannot exceed 100 once combined; lower a weight or remove a subtask"
    );
  }
}

/**
 * Approval gate (Phase 11 §8): a task may only be APPROVED once every subtask
 * is COMPLETED, so "APPROVED" and "100% complete" can never contradict each
 * other. Progress is never overridden to paper over the conflict — the task
 * has to actually be finished.
 */
function assertSubtasksCompleteForApproval(task) {
  const subtasks = (task && task.subtasks) || [];
  if (subtasks.length === 0) return;

  const pending = subtasks.filter((s) => !isCompleted(s));
  if (pending.length > 0) {
    const names = pending
      .slice(0, 3)
      .map((s) => `"${s.title}"`)
      .join(", ");
    throw new ApiError(
      400,
      `Complete every subtask before approving (${pending.length} open: ${names}${pending.length > 3 ? "…" : ""})`
    );
  }
}

/**
 * Reverse guard for the same invariant: once a task is APPROVED it cannot
 * drift back to incomplete work by re-opening one of its subtasks or adding a
 * new one. Approval is terminal in the Phase 10 workflow, so the only ways
 * forward are completing the open subtasks or tracking the extra work in a
 * separate task — the guard never blocks the completion that fixes the state.
 */
function assertApprovedTaskStaysComplete(task) {
  if (!task || String(task.status || "").toUpperCase() !== "APPROVED") return;
  if (!((task && task.subtasks) || []).some((s) => !isCompleted(s))) return;

  throw new ApiError(
    400,
    "This task is already approved, so its subtasks must stay complete — complete the open subtasks or track the new work in a separate task"
  );
}

module.exports = {
  TOTAL_TASK_WEIGHT,
  TASK_COMPLETE_STATUSES,
  clampPercentage,
  subtaskWeightTotal,
  subtaskWeightSummary,
  isCompleted,
  calculateTaskProgress,
  taskProgress,
  calculateProjectProgress,
  assertWeightTotalWithinLimit,
  assertSubtasksCompleteForApproval,
  assertApprovedTaskStaysComplete,
};
