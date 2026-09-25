"use strict";

// Phase 11 — Progress calculation tests.
//
// Progress is derived, never stored and never accepted from a client:
//
//   subtasks.weight + subtasks.status -> task progress
//   tasks.status (only when a task has no subtasks) -> task progress
//   task progress -> project progress -> dashboard
//
// Covers the pure formulas, the HTTP surface (task/project/dashboard payloads),
// weight validation, the approval gate, and the authorization guarantees that
// progress may never leak from a project the caller cannot see.
//
// Runs against a dedicated MongoDB database (nexus_progress_test) with Node's
// built-in test runner and global fetch.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_progress_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-progress-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");
const Team = require("../src/models/team.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const BoardColumn = require("../src/models/boardColumn.model");
const Task = require("../src/models/task.model");
const app = require("../src/app");

const {
  calculateTaskProgress,
  taskProgress,
  calculateProjectProgress,
  subtaskWeightSummary,
  assertWeightTotalWithinLimit,
  assertSubtasksCompleteForApproval,
} = require("../src/services/progress.service");

const PASSWORD = "Password123!";
const USER_NAMES = ["ada", "alan", "linus", "margaret", "outsider"];

let server;
let base;
const state = {};
const cookies = {};

async function api(method, path, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }
  return { status: res.status, json };
}

async function login(email) {
  const res = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return `nexus_token=${res.json.token}`;
}

async function buildFixtures() {
  const users = {};
  for (const name of USER_NAMES) {
    users[name] = await User.create({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: `${name}@acme.test`,
      password: PASSWORD,
    });
    state[`${name}Id`] = String(users[name]._id);
    state[`${name}UserId`] = users[name]._id;
  }

  const wsA = await Workspace.create({
    name: "Progress Workspace",
    description: "Primary",
    ownerId: users.ada._id,
  });
  state.workspaceA = String(wsA._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
  ]);

  const teamA = await Team.create({ workspaceId: wsA._id, name: "Engineering", description: "Builds" });
  state.teamA = String(teamA._id);

  // ada owns the workspace, alan is the project manager (reviewer), linus and
  // margaret are members (workers). The project below is the "Nexus Website".
  const project = await Project.create({
    workspaceId: wsA._id,
    teamId: teamA._id,
    name: "Nexus Website",
    description: "Weighted progress demo",
    status: "ACTIVE",
    priority: "HIGH",
    managerId: users.alan._id,
    createdBy: users.ada._id,
  });
  state.projectId = String(project._id);
  await ProjectMember.insertMany([
    { projectId: project._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: project._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: project._id, userId: users.margaret._id, role: "MEMBER" },
  ]);

  // A second, empty project: no tasks at all.
  const empty = await Project.create({
    workspaceId: wsA._id,
    teamId: teamA._id,
    name: "Empty Project",
    description: "No tasks",
    status: "ACTIVE",
    priority: "LOW",
    managerId: users.alan._id,
    createdBy: users.ada._id,
  });
  state.emptyProjectId = String(empty._id);
  await ProjectMember.create({
    projectId: empty._id,
    userId: users.alan._id,
    role: "PROJECT_MANAGER",
  });

  // --- Workspace B: the project progress must never leak out of here --------
  const wsB = await Workspace.create({
    name: "Foreign Workspace",
    description: "Unrelated",
    ownerId: users.outsider._id,
  });
  await WorkspaceMember.insertMany([
    { workspaceId: wsB._id, userId: users.outsider._id, role: "Admin" },
  ]);
  const teamB = await Team.create({ workspaceId: wsB._id, name: "Other Team", description: "Other" });
  const foreign = await Project.create({
    workspaceId: wsB._id,
    teamId: teamB._id,
    name: "Foreign Project",
    description: "Has secret progress",
    status: "ACTIVE",
    priority: "HIGH",
    managerId: users.outsider._id,
    createdBy: users.outsider._id,
  });
  state.foreignProjectId = String(foreign._id);
  await ProjectMember.create({
    projectId: foreign._id,
    userId: users.outsider._id,
    role: "PROJECT_MANAGER",
  });

  // --- Board columns -------------------------------------------------------
  const cols = {};
  for (const [i, name] of ["To Do", "In Progress", "Done"].entries()) {
    cols[name] = await BoardColumn.create({ projectId: project._id, name, position: i });
  }
  cols.foreign = await BoardColumn.create({ projectId: foreign._id, name: "To Do", position: 0 });

  const makeTask = (projectId, col, assignee, status, title, subtasks = []) =>
    Task.create({
      projectId,
      workspaceId: wsA._id,
      columnId: col._id,
      title,
      status,
      assignedTo: assignee,
      createdBy: users.alan._id,
      subtasks,
    });

  // "Build Authentication": Research 20 ✓, Implementation 50 ✓, Testing 30 ○
  // -> 70, even though the task itself is still IN_PROGRESS.
  const auth = await makeTask(project._id, cols["In Progress"], users.linus._id, "IN_PROGRESS", "Build Authentication", [
    { title: "Research", status: "COMPLETED", weight: 20 },
    { title: "Implementation", status: "COMPLETED", weight: 50 },
    { title: "Testing", status: "TODO", weight: 30 },
  ]);
  state.authTaskId = String(auth._id);
  state.authSubtaskIds = auth.subtasks.map((s) => String(s._id));

  // "Build Dashboard": 25 + 25 done, 50 open -> 50
  const dash = await makeTask(project._id, cols["In Progress"], users.linus._id, "IN_PROGRESS", "Build Dashboard", [
    { title: "Layout", status: "COMPLETED", weight: 25 },
    { title: "Statistics", status: "COMPLETED", weight: 25 },
    { title: "Activity Feed", status: "TODO", weight: 50 },
  ]);
  state.dashTaskId = String(dash._id);
  state.dashSubtaskIds = dash.subtasks.map((s) => String(s._id));

  // A task with no subtasks at all: the workflow state is the only signal.
  const plain = await makeTask(project._id, cols["To Do"], users.margaret._id, "ASSIGNED", "Write release notes");
  state.plainTaskId = String(plain._id);

  // A foreign task carrying weighted subtasks, for the leak tests.
  const foreignTask = await makeTask(
    foreign._id,
    cols.foreign,
    users.outsider._id,
    "IN_PROGRESS",
    "Secret task",
    [{ title: "Secret work", status: "COMPLETED", weight: 100 }]
  );
  state.foreignTaskId = String(foreignTask._id);
  state.foreignSubtaskId = String(foreignTask.subtasks[0]._id);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await buildFixtures();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const name of USER_NAMES) {
    cookies[name] = await login(`${name}@acme.test`);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

const taskUrl = (id) => `/api/tasks/${id}`;
const projectUrl = (id) => `/api/projects/${id}`;

/**
 * Create a project (managed by alan) with a fixed set of tasks so the
 * expected project progress is deterministic regardless of test order.
 * `subtasks` use the { title, status, weight } shape.
 */
async function makeProject(name, tasks) {
  const project = await Project.create({
    workspaceId: state.workspaceA,
    teamId: state.teamA,
    name,
    description: "Weighted progress fixture",
    status: "ACTIVE",
    priority: "MEDIUM",
    managerId: state.alanUserId,
    createdBy: state.alanUserId,
  });
  await ProjectMember.create({
    projectId: project._id,
    userId: state.alanUserId,
    role: "PROJECT_MANAGER",
  });
  const column = await BoardColumn.create({ projectId: project._id, name: "To Do", position: 0 });

  for (const [index, task] of tasks.entries()) {
    await Task.create({
      projectId: project._id,
      workspaceId: state.workspaceA,
      columnId: column._id,
      title: task.title,
      status: task.status || "IN_PROGRESS",
      position: index,
      createdBy: state.alanUserId,
      subtasks: task.subtasks || [],
    });
  }

  return String(project._id);
}

// ===========================================================================
// 1. Subtask progress — the pure formula
// ===========================================================================
test("subtask progress sums the weights of COMPLETED subtasks only", () => {
  const research = { weight: 20, status: "COMPLETED" };
  const implementation = { weight: 50, status: "COMPLETED" };
  const testing = { weight: 30, status: "TODO" };

  assert.equal(calculateTaskProgress([research, implementation, testing]), 70);
  assert.equal(calculateTaskProgress([{ weight: 20, status: "COMPLETED" }, testing, { weight: 30, status: "TODO" }]), 20);
  assert.equal(calculateTaskProgress([research, implementation, { weight: 30, status: "COMPLETED" }]), 100);
  assert.equal(calculateTaskProgress([{ weight: 20, status: "COMPLETED" }, { weight: 50, status: "IN_PROGRESS" }, testing]), 20);
  assert.equal(calculateTaskProgress([research, { weight: 50, status: "IN_PROGRESS" }, testing]), 20);
});

test("task progress is an integer 0-100, never a decimal", () => {
  const value = calculateTaskProgress([
    { weight: 33.33, status: "COMPLETED" },
    { weight: 33.33, status: "COMPLETED" },
    { weight: 33.34, status: "COMPLETED" },
  ]);
  assert.equal(value, 100);
  assert.equal(Number.isInteger(value), true);

  const partial = calculateTaskProgress([
    { weight: 33.33, status: "COMPLETED" },
    { weight: 33.33, status: "TODO" },
    { weight: 33.34, status: "TODO" },
  ]);
  assert.equal(Number.isInteger(partial), true);
  assert.equal(partial, 33);
});

test("weight totals are float-safe and never exceed the task", () => {
  // 0.1 + 0.2 must be exactly 0.3 in the reported allocation.
  const summary = subtaskWeightSummary([
    { title: "a", weight: 0.1, status: "TODO" },
    { title: "b", weight: 0.2, status: "TODO" },
    { title: "c", weight: 99.7, status: "TODO" },
  ]);
  assert.equal(summary.total, 100);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.isComplete, false);
  assert.equal(summary.pendingSubtasks, 3);
});

test("progress is never normalized by the configured total", () => {
  // Deleting the 30-weight TODO subtask leaves 20 + 50, both COMPLETED. The
  // completed work is 70 points; dividing by the remaining 70 would report
  // 100% for a task that never finished its allocated work.
  const afterDelete = calculateTaskProgress([
    { weight: 20, status: "COMPLETED" },
    { weight: 50, status: "COMPLETED" },
  ]);
  assert.equal(afterDelete, 70);

  // Deleting the 20-weight COMPLETED subtask leaves 50 + 50: only 50 of the
  // 100 points were delivered, and 50% is what gets reported.
  const afterDeletingDoneWork = calculateTaskProgress([
    { weight: 50, status: "COMPLETED" },
    { weight: 50, status: "TODO" },
  ]);
  assert.equal(afterDeletingDoneWork, 50);

  // Unweighted legacy checklists keep a count-based percentage.
  assert.equal(calculateTaskProgress([{ status: "COMPLETED" }, { status: "TODO" }]), 50);
  assert.equal(calculateTaskProgress([]), null);
});

// ===========================================================================
// 2. Task progress — subtasks beat status, status is the fallback
// ===========================================================================
test("task with subtasks reports the subtask progress, not 0", () => {
  const subtasks = [
    { weight: 20, status: "COMPLETED" },
    { weight: 50, status: "COMPLETED" },
    { weight: 30, status: "TODO" },
  ];
  assert.equal(taskProgress({ status: "IN_PROGRESS", subtasks }), 70);
  assert.equal(taskProgress({ status: "UNDER_REVIEW", subtasks }), 70);
  assert.equal(taskProgress({ status: "ASSIGNED", subtasks }), 70);
});

test("task without subtasks: only APPROVED is complete", () => {
  assert.equal(taskProgress({ status: "ASSIGNED" }), 0);
  assert.equal(taskProgress({ status: "IN_PROGRESS" }), 0);
  assert.equal(taskProgress({ status: "SUBMITTED" }), 0);
  assert.equal(taskProgress({ status: "UNDER_REVIEW" }), 0);
  assert.equal(taskProgress({ status: "CHANGES_REQUESTED" }), 0);
  assert.equal(taskProgress({ status: "APPROVED" }), 100);
  // Legacy board data.
  assert.equal(taskProgress({ status: "DONE" }), 100);
  assert.equal(taskProgress({ status: "TO DO" }), 0);
});

test("project progress is the equal-weighted average of its tasks", () => {
  const at = (p) => ({ subtasks: [{ weight: 100, status: p ? "COMPLETED" : "TODO" }] });

  assert.equal(calculateProjectProgress([at(true), at(true), at(true)]), 100);
  assert.equal(calculateProjectProgress([at(true), at(true), at(false)]), 67);
  assert.equal(
    calculateProjectProgress([
      at(true),
      { subtasks: [{ weight: 50, status: "COMPLETED" }, { weight: 50, status: "TODO" }] },
      at(false),
    ]),
    50
  );
  // Section 14: (100 + 70 + 50 + 20) / 4 = 60
  const partial = (weight, done) => [
    { weight, status: done ? "COMPLETED" : "TODO" },
    { weight: 100 - weight, status: "TODO" },
  ];
  assert.equal(
    calculateProjectProgress([
      { subtasks: partial(100, true) },
      { subtasks: partial(70, true) },
      { subtasks: partial(50, true) },
      { subtasks: partial(20, true) },
    ]),
    60
  );
  // Section 42: (70 + 100 + 50) / 3 = 73
  assert.equal(
    calculateProjectProgress([
      { subtasks: [
        { weight: 20, status: "COMPLETED" },
        { weight: 50, status: "COMPLETED" },
        { weight: 30, status: "TODO" },
      ] },
      { status: "APPROVED" },
      { subtasks: [{ weight: 50, status: "COMPLETED" }, { weight: 50, status: "TODO" }] },
    ]),
    73
  );
});

test("an empty project is 0%, never 100%", () => {
  assert.equal(calculateProjectProgress([]), 0);
  assert.equal(calculateProjectProgress(null), 0);
});

// ===========================================================================
// 3. Weight validation
// ===========================================================================
test("weight validation accepts 100 and rejects everything above it", () => {
  assert.doesNotThrow(() => assertWeightTotalWithinLimit([{ weight: 20 }, { weight: 50 }, { weight: 30 }]));
  assert.throws(() => assertWeightTotalWithinLimit([{ weight: 20 }, { weight: 50 }, { weight: 50 }]), /cannot exceed 100/);
  assert.throws(() => assertWeightTotalWithinLimit([{ weight: 150 }]), /cannot exceed 100/);
  // Under-allocation stays legal: weights are added one subtask at a time.
  assert.doesNotThrow(() => assertWeightTotalWithinLimit([{ weight: 20 }, { weight: 50 }]));
  assert.doesNotThrow(() => assertWeightTotalWithinLimit([]));
});

test("the approval gate rejects a task with open subtasks", () => {
  assert.throws(
    () =>
      assertSubtasksCompleteForApproval({
        status: "UNDER_REVIEW",
        subtasks: [{ title: "Testing", status: "TODO", weight: 30 }],
      }),
    /Complete every subtask before approving/
  );
  assert.doesNotThrow(() =>
    assertSubtasksCompleteForApproval({ status: "UNDER_REVIEW", subtasks: [] })
  );
  assert.doesNotThrow(() =>
    assertSubtasksCompleteForApproval({
      status: "UNDER_REVIEW",
      subtasks: [{ title: "Testing", status: "COMPLETED", weight: 30 }],
    })
  );
});

// ===========================================================================
// 4. HTTP surface — task progress
// ===========================================================================
test("GET /api/tasks/:id returns server-computed progress and weights", async () => {
  const res = await api("GET", taskUrl(state.authTaskId), { cookie: cookies.linus });
  assert.equal(res.status, 200);
  assert.equal(res.json.task.progress, 70);
  assert.equal(res.json.task.status, "IN_PROGRESS", "progress and status stay separate concepts");
  assert.equal(res.json.task.weights.total, 100);
  assert.equal(res.json.task.weights.remaining, 0);
  assert.equal(res.json.task.weights.completedWeight, 70);
  assert.equal(res.json.task.subtasks.length, 3);
  assert.deepEqual(
    res.json.task.subtasks.map((s) => s.weight),
    [20, 50, 30]
  );
});

test("subtask status changes immediately move task progress", async () => {
  // Complete "Testing" (weight 30) -> 100
  const done = await api("PATCH", `/api/subtasks/${state.authSubtaskIds[2]}`, {
    cookie: cookies.linus,
    body: { status: "COMPLETED" },
  });
  assert.equal(done.status, 200);
  assert.equal(done.json.progress, 100);
  assert.equal(done.json.weights.isComplete, true);

  // Re-open it -> back to 70 (20 + 50 of the completed weight).
  const reopened = await api("PATCH", `/api/subtasks/${state.authSubtaskIds[2]}`, {
    cookie: cookies.linus,
    body: { status: "TODO" },
  });
  assert.equal(reopened.json.progress, 70);

  const task = await api("GET", taskUrl(state.authTaskId), { cookie: cookies.linus });
  assert.equal(task.json.task.progress, 70, "no stale progress left on the task payload");
});

test("a task without subtasks follows the workflow, not an arbitrary number", async () => {
  const detail = await api("GET", taskUrl(state.plainTaskId), { cookie: cookies.margaret });
  assert.equal(detail.json.task.progress, 0, "ASSIGNED with no subtasks = 0%");
  assert.equal(detail.json.task.weights.total, 0);
});

test("subtask weight validation is enforced by the backend", async () => {
  // 20 + 50 + 30 is exactly 100 — the remaining 0 cannot take another point.
  const overflow = await api("POST", `${taskUrl(state.authTaskId)}/subtasks`, {
    cookie: cookies.linus,
    body: { title: "Extra", weight: 1 },
  });
  assert.equal(overflow.status, 400);
  assert.match(overflow.json.message, /cannot exceed 100/);

  const negative = await api("POST", `${taskUrl(state.plainTaskId)}/subtasks`, {
    cookie: cookies.margaret,
    body: { title: "Bad", weight: -20 },
  });
  assert.equal(negative.status, 400);

  const tooBig = await api("POST", `${taskUrl(state.plainTaskId)}/subtasks`, {
    cookie: cookies.margaret,
    body: { title: "Impossible", weight: 150 },
  });
  assert.equal(tooBig.status, 400);

  const notANumber = await api("POST", `${taskUrl(state.plainTaskId)}/subtasks`, {
    cookie: cookies.margaret,
    body: { title: "NaN", weight: "abc" },
  });
  assert.equal(notANumber.status, 400);
});

test("unweighted subtasks (legacy checklists) report a completion count", async () => {
  const created = await api("POST", `/api/projects/${state.projectId}/tasks`, {
    cookie: cookies.alan,
    body: { title: "Checklist task", assigneeId: state.linusId },
  });
  const id = created.json.task.id;

  const first = await api("POST", `${taskUrl(id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Step one" },
  });
  const second = await api("POST", `${taskUrl(id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Step two" },
  });
  assert.equal(first.json.weights.total, 0);
  assert.equal(second.json.weights.total, 0);
  assert.equal(second.json.progress, 0);

  const done = await api("PATCH", `/api/subtasks/${first.json.subtask.id}`, {
    cookie: cookies.alan,
    body: { status: "COMPLETED" },
  });
  assert.equal(done.json.progress, 50, "one of two unweighted subtasks done");

  const all = await api("PATCH", `/api/subtasks/${second.json.subtask.id}`, {
    cookie: cookies.alan,
    body: { status: "COMPLETED" },
  });
  assert.equal(all.json.progress, 100);
  assert.equal(all.json.weights.isComplete, true);

  await api("DELETE", taskUrl(id), { cookie: cookies.alan });
});

test("20 + 50 + 30 = 100 is a valid allocation", async () => {
  const res = await api("PATCH", `/api/subtasks/${state.dashSubtaskIds[0]}`, {
    cookie: cookies.linus,
    body: { weight: 25 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.weights.total, 100);
  assert.equal(res.json.weights.remaining, 0);
  assert.equal(res.json.progress, 50, "25 + 25 completed of 100 = 50%");
});

test("editing a weight beyond the ceiling is rejected and the total is unchanged", async () => {
  const before = await api("GET", `${taskUrl(state.dashTaskId)}/subtasks`, { cookie: cookies.linus });
  assert.equal(before.json.weights.total, 100);

  // 25 + 25 + 50 = 100 today; raising Layout to 60 would make 135.
  const bad = await api("PATCH", `/api/subtasks/${state.dashSubtaskIds[0]}`, {
    cookie: cookies.linus,
    body: { weight: 60 },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.json.message, /cannot exceed 100/);

  const after = await api("GET", `${taskUrl(state.dashTaskId)}/subtasks`, { cookie: cookies.linus });
  assert.equal(after.json.weights.total, 100, "a rejected edit must not persist");
  assert.equal(after.json.progress, 50);
});

test("deleting a subtask recalculates without inflating progress to 100%", async () => {
  // dash: Layout 25 ✓, Statistics 25 ✓, Activity Feed 50 ○  -> 50%
  const before = await api("GET", taskUrl(state.dashTaskId), { cookie: cookies.linus });
  assert.equal(before.json.task.progress, 50);

  const removed = await api("DELETE", `/api/subtasks/${state.dashSubtaskIds[0]}`, {
    cookie: cookies.linus,
  });
  assert.equal(removed.status, 200);
  // Layout (25) gone, 25 points unallocated: 25 done of the remaining 75 is
  // still 25% — not 33% and certainly not 100%.
  assert.equal(removed.json.progress, 25);
  assert.equal(removed.json.weights.total, 75);
  assert.equal(removed.json.weights.remaining, 25);
});

// ===========================================================================
// 5. Progress cannot be set by the client
// ===========================================================================
test("PATCH task with progress: 99 is ignored — the response is still derived", async () => {
  const res = await api("PATCH", taskUrl(state.dashTaskId), {
    cookie: cookies.linus,
    body: { title: "Build Dashboard", progress: 99 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.task.progress, 25, "the client value was discarded");

  const stored = await Task.findById(state.dashTaskId).lean();
  assert.equal(stored.progress, undefined, "no progress field is persisted on the task");
});

test("progress: 100 cannot be forced on a task with open subtasks", async () => {
  const before = await api("GET", taskUrl(state.authTaskId), { cookie: cookies.linus });
  const actual = before.json.task.progress;

  const attempt = await api("PATCH", taskUrl(state.authTaskId), {
    cookie: cookies.linus,
    body: { progress: 100 },
  });
  assert.equal(attempt.status, 200);
  assert.equal(attempt.json.task.progress, actual);
  assert.notEqual(attempt.json.task.progress, 100);
});

test("creating a task with a client-supplied progress is ignored", async () => {
  const res = await api("POST", `/api/projects/${state.projectId}/tasks`, {
    cookie: cookies.alan,
    body: { title: "Injected progress", progress: 100 },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.task.progress, 0, "a brand new task with no work is 0%");

  await api("DELETE", taskUrl(res.json.task.id), { cookie: cookies.alan });
});

test("progress is not accepted on a subtask update either", async () => {
  const res = await api("PATCH", `/api/subtasks/${state.authSubtaskIds[2]}`, {
    cookie: cookies.linus,
    body: { status: "TODO", weight: 30, progress: 100 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.progress, 70);
});

// ===========================================================================
// 6. Approval gate (progress 100 vs. APPROVED must not contradict)
// ===========================================================================
test("a task cannot be APPROVED while weighted subtasks remain open", async () => {
  const created = await api("POST", `/api/projects/${state.projectId}/tasks`, {
    cookie: cookies.alan,
    body: { title: "Approval gate check", assigneeId: state.alanId },
  });
  const id = created.json.task.id;
  await api("POST", `${taskUrl(id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Open work", weight: 100 },
  });

  // ASSIGNED -> IN_PROGRESS (worker) -> SUBMITTED -> UNDER_REVIEW -> APPROVED
  await api("PATCH", `${taskUrl(id)}/status`, { cookie: cookies.alan, body: { status: "IN_PROGRESS" } });
  await api("PATCH", `${taskUrl(id)}/status`, { cookie: cookies.alan, body: { status: "SUBMITTED" } });
  await api("PATCH", `${taskUrl(id)}/status`, { cookie: cookies.alan, body: { status: "UNDER_REVIEW" } });

  const blocked = await api("PATCH", `${taskUrl(id)}/status`, {
    cookie: cookies.alan,
    body: { status: "APPROVED" },
  });
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.message, /Complete every subtask before approving/);

  const detail = await api("GET", taskUrl(id), { cookie: cookies.alan });
  assert.equal(detail.json.task.status, "UNDER_REVIEW", "the rejected move did not persist");
  assert.equal(detail.json.task.progress, 0);

  // Finish the work, then approval goes through and progress agrees with it.
  const subtasks = detail.json.task.subtasks;
  await api("PATCH", `/api/subtasks/${subtasks[0].id}`, {
    cookie: cookies.alan,
    body: { status: "COMPLETED" },
  });
  const approved = await api("PATCH", `${taskUrl(id)}/status`, {
    cookie: cookies.alan,
    body: { status: "APPROVED" },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.task.progress, 100);
  assert.equal(approved.json.task.status, "APPROVED");

  // An approved task cannot silently drift back to incomplete.
  const reopen = await api("PATCH", `/api/subtasks/${subtasks[0].id}`, {
    cookie: cookies.alan,
    body: { status: "TODO" },
  });
  assert.equal(reopen.status, 400);

  await api("DELETE", taskUrl(id), { cookie: cookies.alan });
});

test("completing every remaining subtask fills the allocation, never the status", async () => {
  // Completing work never auto-approves: progress and status are separate
  // concepts. `dash` has had a subtask deleted by an earlier test, so the
  // expected value is whatever weight is actually allocated — 75, not 100.
  const detail = await api("GET", taskUrl(state.dashTaskId), { cookie: cookies.linus });
  const allocated = detail.json.task.weights.total;
  assert.equal(allocated, 75, "an earlier test removed a 25-weight subtask");

  for (const subtask of detail.json.task.subtasks) {
    await api("PATCH", `/api/subtasks/${subtask.id}`, {
      cookie: cookies.linus,
      body: { status: "COMPLETED" },
    });
  }

  const after = await api("GET", taskUrl(state.dashTaskId), { cookie: cookies.linus });
  assert.equal(after.json.task.progress, allocated, "all allocated weight is delivered");
  assert.equal(after.json.task.weights.isComplete, true);
  assert.equal(after.json.task.status, "IN_PROGRESS", "full progress does not approve a task");

  // A fully weighted task that completes all 100 points does report 100.
  const auth = await api("GET", taskUrl(state.authTaskId), { cookie: cookies.linus });
  assert.equal(auth.json.task.weights.total, 100);
});

// ===========================================================================
// 7. Project progress
// ===========================================================================
test("project progress is the average of its tasks' calculated progress", async () => {
  // Dedicated project with a known composition: 100, 70, 50, 20 -> 60.
  const demo = await makeProject("Weighted Demo", [
    { title: "A 100%", subtasks: [{ title: "done", status: "COMPLETED", weight: 100 }] },
    {
      title: "B 70%",
      subtasks: [
        { title: "x", status: "COMPLETED", weight: 70 },
        { title: "y", status: "TODO", weight: 30 },
      ],
    },
    {
      title: "C 50%",
      subtasks: [
        { title: "x", status: "COMPLETED", weight: 50 },
        { title: "y", status: "TODO", weight: 50 },
      ],
    },
    {
      title: "D 20%",
      subtasks: [
        { title: "x", status: "COMPLETED", weight: 20 },
        { title: "y", status: "TODO", weight: 80 },
      ],
    },
  ]);

  const res = await api("GET", projectUrl(demo), { cookie: cookies.alan });
  assert.equal(res.status, 200);
  // (100 + 70 + 50 + 20) / 4 = 60
  assert.equal(res.json.project.progress, 60);
  assert.equal(res.json.project.stats.taskCount, 4);
  assert.ok(Number.isInteger(res.json.project.progress));

  // The project figure is exactly the average of the task figures the same
  // API reports — the two can never drift apart.
  const tasks = await api("GET", `/api/projects/${demo}/tasks`, { cookie: cookies.alan });
  const values = tasks.json.tasks.map((t) => t.progress).sort((a, b) => b - a);
  assert.deepEqual(values, [100, 70, 50, 20]);
  const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  assert.equal(res.json.project.progress, average);

  state.demoProjectId = demo;
});

test("a project with no tasks reports 0%, not 100%", async () => {
  const res = await api("GET", projectUrl(state.emptyProjectId), { cookie: cookies.alan });
  assert.equal(res.status, 200);
  assert.equal(res.json.project.progress, 0);
  assert.equal(res.json.project.stats.taskCount, 0);
});

test("creating a task moves project progress; deleting it moves it back", async () => {
  const before = await api("GET", projectUrl(state.demoProjectId), { cookie: cookies.alan });
  assert.equal(before.json.project.progress, 60);

  const created = await api("POST", `/api/projects/${state.demoProjectId}/tasks`, {
    cookie: cookies.alan,
    body: { title: "Quick task" },
  });
  assert.equal(created.status, 201);
  const id = created.json.task.id;

  // 5 tasks, the new one at 0% -> (100 + 70 + 50 + 20 + 0) / 5 = 48
  const during = await api("GET", projectUrl(state.demoProjectId), { cookie: cookies.alan });
  assert.equal(during.json.project.progress, 48);
  assert.equal(during.json.project.stats.taskCount, 5);

  const removed = await api("DELETE", taskUrl(id), { cookie: cookies.alan });
  assert.equal(removed.status, 200);
  const after = await api("GET", projectUrl(state.demoProjectId), { cookie: cookies.alan });
  assert.equal(after.json.project.progress, 60, "deleting the task restores the average");
});

test("completing a subtask propagates to project progress", async () => {
  const before = await api("GET", projectUrl(state.demoProjectId), { cookie: cookies.alan });
  const tasks = await api("GET", `/api/projects/${state.demoProjectId}/tasks`, { cookie: cookies.alan });
  const target = tasks.json.tasks.find((t) => t.title === "D 20%");

  // "D 20%": 20 done of 100 allocated. Completing the remaining 80 moves the
  // task to 100 and the project from 60 to 80: (100 + 70 + 50 + 100) / 4.
  const open = target.subtasks.find((s) => !s.completed);
  const res = await api("PATCH", `/api/subtasks/${open.id}`, {
    cookie: cookies.alan,
    body: { status: "COMPLETED" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.progress, 100);

  const after = await api("GET", projectUrl(state.demoProjectId), { cookie: cookies.alan });
  assert.equal(after.json.project.progress, 80);
  assert.notEqual(before.json.project.progress, after.json.project.progress);
});

test("GET /api/projects includes progress for every listed project", async () => {
  const res = await api("GET", `/api/projects`, { cookie: cookies.alan });
  assert.equal(res.status, 200);
  const demo = res.json.projects.find((p) => p.id === state.demoProjectId);
  assert.ok(demo, "the project is listed");
  assert.equal(typeof demo.progress, "number");
  assert.equal(demo.progress, 80);
  assert.ok(
    res.json.projects.every((p) => typeof p.progress === "number"),
    "every listed project carries a server-computed progress"
  );
});

// ===========================================================================
// 8. Dashboard
// ===========================================================================
test("GET /api/me/overview exposes per-project progress for the dashboard", async () => {
  const res = await api("GET", "/api/me/overview", { cookie: cookies.alan });
  assert.equal(res.status, 200);
  const rows = res.json.overview.projects;
  assert.ok(Array.isArray(rows));

  const project = rows.find((p) => p.id === state.demoProjectId);
  assert.ok(project, "the dashboard lists the project");
  assert.equal(project.progress, 80, "dashboard progress is the same backend number");
  assert.equal(project.stats.taskCount, 4);
  assert.equal(typeof project.stats.doneCount, "number");
  assert.equal(typeof project.stats.inProgressCount, "number");

  const empty = rows.find((p) => p.id === state.emptyProjectId);
  assert.equal(empty.progress, 0);
});

test("the board payload carries calculated progress per card", async () => {
  const res = await api("GET", `/api/workspaces/${state.workspaceA}/projects/${state.projectId}/board`, {
    cookie: cookies.linus,
  });
  assert.equal(res.status, 200);
  const auth = res.json.tasks.find((t) => String(t.id) === state.authTaskId);
  assert.ok(auth, "the task is on the board");
  assert.equal(auth.progress, 70);
});

// ===========================================================================
// 9. Security — progress never leaks from a project the caller cannot see
// ===========================================================================
test("unauthenticated progress requests are rejected", async () => {
  assert.equal((await api("GET", taskUrl(state.authTaskId))).status, 401);
  assert.equal((await api("GET", projectUrl(state.projectId))).status, 401);
  assert.equal((await api("GET", "/api/projects")).status, 401);
  assert.equal((await api("GET", "/api/me/overview")).status, 401);
});

test("another workspace cannot read project, task, or subtask progress", async () => {
  const project = await api("GET", projectUrl(state.foreignProjectId), { cookie: cookies.alan });
  assert.equal(project.status, 403);
  assert.ok(!JSON.stringify(project.json).includes("Secret work"));

  const task = await api("GET", taskUrl(state.foreignTaskId), { cookie: cookies.alan });
  assert.equal(task.status, 403);
  assert.equal(task.json.task, undefined);

  const subtask = await api("GET", `/api/subtasks/${state.foreignSubtaskId}`, { cookie: cookies.alan });
  assert.equal(subtask.status, 403);
  assert.equal(subtask.json.subtask, undefined);

  const list = await api("GET", `/api/projects/${state.projectId}/tasks`, { cookie: cookies.outsider });
  assert.equal(list.status, 403);
  assert.equal(list.json.tasks, undefined);
});

test("the dashboard only reports projects the caller may see", async () => {
  // A member of the demo project sees that project...
  const mine = await api("GET", "/api/me/overview", { cookie: cookies.linus });
  assert.equal(mine.status, 200);
  const mineIds = mine.json.overview.projects.map((p) => p.id);
  assert.ok(mineIds.includes(state.projectId));
  assert.ok(!mineIds.includes(state.foreignProjectId), "no foreign project in the payload");
  assert.ok(!JSON.stringify(mine.json).includes("Secret work"), "no foreign subtask data anywhere");

  // ...and the other workspace's member sees only their own.
  const theirs = await api("GET", "/api/me/overview", { cookie: cookies.outsider });
  assert.equal(theirs.status, 200);
  const theirIds = theirs.json.overview.projects.map((p) => p.id);
  assert.deepEqual(theirIds, [state.foreignProjectId]);
  assert.ok(!JSON.stringify(theirs.json).includes("Build Authentication"));
});

test("an authorized member sees exactly their own progress values", async () => {
  const res = await api("GET", taskUrl(state.authTaskId), { cookie: cookies.margaret });
  assert.equal(res.status, 200, "members of the project can read its progress");
  assert.equal(res.json.task.progress, 70);
});
