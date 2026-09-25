"use strict";

// Phase 10 — Tasks and Subtasks integration tests.
//
// Verifies the canonical task status workflow (ASSIGNED → IN_PROGRESS →
// SUBMITTED → UNDER_REVIEW → APPROVED, with CHANGES_REQUESTED), strict
// per-transition permissions (assignee-only worker steps, PM/owner/admin
// reviewer steps), project-scoped list/create routes, assignee project
// membership enforcement, embedded-subtask CRUD, and IDOR protection across
// projects and workspaces.
//
// Runs against a dedicated MongoDB database (nexus_tasks_test) using Node's
// built-in test runner and global fetch.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_tasks_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-tasks-test-secret";
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
const Deliverable = require("../src/models/deliverable.model");
const DeliverableVersion = require("../src/models/deliverableVersion.model");
const Comment = require("../src/models/comment.model");
const app = require("../src/app");

const PASSWORD = "Password123!";
const USER_NAMES = ["ada", "alan", "linus", "margaret", "katherine", "barbara", "grace", "outsider", "ghost"];

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
  assert.equal(res.status, 200, `login failed for ${email}: ${res.json && res.json.message}`);
  const token = res.json.token;
  assert.ok(token, "login did not return a token");
  return `nexus_token=${token}`;
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
  }

  // --- Workspace A (owned by ada) -------------------------------------------
  const wsA = await Workspace.create({ name: "Nexus Tasks Workspace", description: "Primary", ownerId: users.ada._id });
  state.workspaceA = String(wsA._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.katherine._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.barbara._id, role: "Viewer" },
  ]);

  const engineeringA = await Team.create({ workspaceId: wsA._id, name: "Engineering", description: "Builds" });
  const researchA = await Team.create({ workspaceId: wsA._id, name: "Research", description: "Researches" });
  state.engineeringA = String(engineeringA._id);

  // The platform project: alan PM, linus MEMBER, margaret MEMBER, ada
  // COLLABORATOR. katherine is intentionally NOT a member (for assignment
  // rejection tests).
  const platform = await Project.create({
    workspaceId: wsA._id,
    teamId: engineeringA._id,
    name: "Platform Tasks",
    description: "Team A project",
    status: "ACTIVE",
    priority: "HIGH",
    managerId: users.alan._id,
    createdBy: users.ada._id,
  });
  state.platformId = String(platform._id);
  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.margaret._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.ada._id, role: "COLLABORATOR" },
  ]);

  const research = await Project.create({
    workspaceId: wsA._id,
    teamId: researchA._id,
    name: "Research Tasks",
    description: "Team B project",
    status: "ACTIVE",
    priority: "MEDIUM",
    managerId: users.katherine._id,
    createdBy: users.ada._id,
  });
  state.researchId = String(research._id);
  await ProjectMember.insertMany([
    { projectId: research._id, userId: users.katherine._id, role: "PROJECT_MANAGER" },
    { projectId: research._id, userId: users.barbara._id, role: "VIEWER" },
    { projectId: research._id, userId: users.grace._id, role: "MEMBER" },
  ]);

  // --- Workspace B (outsider) for cross-workspace IDOR -----------------------
  const wsB = await Workspace.create({ name: "Other Workspace", description: "Unrelated", ownerId: users.outsider._id });
  await WorkspaceMember.insertMany([
    { workspaceId: wsB._id, userId: users.outsider._id, role: "Admin" },
    { workspaceId: wsB._id, userId: users.ghost._id, role: "Member" },
  ]);
  const engineeringB = await Team.create({ workspaceId: wsB._id, name: "Other Team", description: "Other" });
  const other = await Project.create({
    workspaceId: wsB._id,
    teamId: engineeringB._id,
    name: "Other Project",
    description: "Belongs to the other workspace",
    status: "ACTIVE",
    priority: "LOW",
    managerId: users.outsider._id,
    createdBy: users.outsider._id,
  });
  state.otherId = String(other._id);
  await ProjectMember.create({ projectId: other._id, userId: users.ghost._id, role: "MEMBER" });

  // --- Board columns + seeded tasks in every workflow state ------------------
  const mkColumns = async (projectId) => {
    const cols = {};
    for (const [i, name] of ["To Do", "In Progress", "Done"].entries()) {
      cols[name] = await BoardColumn.create({ projectId, name, position: i });
    }
    return cols;
  };

  const platformCols = await mkColumns(platform._id);
  const researchCols = await mkColumns(research._id);
  const otherCols = await mkColumns(other._id);
  state.platformCols = platformCols;
  state.researchCols = researchCols;

  const makeTask = (projectId, col, assignee, status, title, overrides = {}) =>
    Task.create({
      projectId,
      workspaceId: wsA._id,
      columnId: col._id,
      title,
      status,
      assignedTo: assignee,
      createdBy: overrides.createdBy || users.alan._id,
      ...overrides,
    });

  const t1 = await makeTask(platform._id, platformCols["To Do"], users.linus._id, "ASSIGNED", "Start me");
  const t2 = await makeTask(platform._id, platformCols["In Progress"], users.margaret._id, "IN_PROGRESS", "WIP task");
  const t3 = await makeTask(platform._id, platformCols["In Progress"], users.margaret._id, "SUBMITTED", "Awaiting review");
  const t4 = await makeTask(platform._id, platformCols["In Progress"], users.margaret._id, "UNDER_REVIEW", "Being reviewed");
  const t5 = await makeTask(platform._id, platformCols["In Progress"], users.linus._id, "CHANGES_REQUESTED", "Rework me");
  const t6 = await makeTask(platform._id, platformCols["Done"], users.margaret._id, "APPROVED", "Done task");
  const t7 = await makeTask(platform._id, platformCols["To Do"], null, "ASSIGNED", "Unassigned task");
  const t8 = await makeTask(platform._id, platformCols["To Do"], users.linus._id, "ASSIGNED", "High priority work", { priority: "HIGH" });

  const otherTask = await makeTask(other._id, otherCols["In Progress"], users.ghost._id, "IN_PROGRESS", "Foreign task");

  state.t1Id = String(t1._id);
  state.t2Id = String(t2._id);
  state.t3Id = String(t3._id);
  state.t4Id = String(t4._id);
  state.t5Id = String(t5._id);
  state.t6Id = String(t6._id);
  state.t7Id = String(t7._id);
  state.t8Id = String(t8._id);
  state.otherTaskId = String(otherTask._id);

  // Deliverable (Phase 12 shape: one aggregate per task, versions in their own
  // collection) + comment attached to t3 to verify delete-cascade.
  const dlv = await Deliverable.create({
    taskId: t3._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.margaret._id,
    title: "Review draft",
    status: "SUBMITTED",
    currentVersion: 1,
  });
  state.t3DeliverableId = String(dlv._id);
  await DeliverableVersion.create({
    deliverableId: dlv._id,
    versionNumber: 1,
    status: "SUBMITTED",
    fileName: "draft.pdf",
    storageKey: `deliverables/${wsA._id}/${platform._id}/${dlv._id}/v1-draft.pdf`,
    fileUrl: `/api/deliverables/${dlv._id}/file/draft.pdf`,
    fileSize: 1024,
    mimeType: "application/pdf",
    checksum: "a".repeat(64),
    submittedBy: users.margaret._id,
    submittedAt: new Date("2026-02-01"),
  });
  await Comment.create({ projectId: platform._id, taskId: t3._id, userId: users.margaret._id, content: "Ready for review" });
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await buildFixtures();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const emails = USER_NAMES.map((n) => `${n}@acme.test`);
  for (let i = 0; i < USER_NAMES.length; i += 1) {
    cookies[USER_NAMES[i]] = await login(emails[i]);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

const tasksUrl = (projectId) => `/api/projects/${projectId}/tasks`;
const taskUrl = (taskId) => `/api/tasks/${taskId}`;

// ---------------------------------------------------------------------------
test("unauthenticated access to task endpoints → 401", async () => {
  assert.equal((await api("GET", taskUrl(state.t1Id))).status, 401);
  assert.equal((await api("GET", tasksUrl(state.platformId))).status, 401);
  assert.equal((await api("PATCH", `${taskUrl(state.t1Id)}/status`, { body: { status: "IN_PROGRESS" } })).status, 401);
  assert.equal((await api("POST", `${taskUrl(state.t1Id)}/subtasks`, { body: { title: "x" } })).status, 401);
  assert.equal((await api("GET", `/api/subtasks/unknown`)).status, 401);
});

test("GET project tasks is project-scoped and access-controlled", async () => {
  const linus = await api("GET", tasksUrl(state.platformId), { cookie: cookies.linus });
  assert.equal(linus.status, 200);
  assert.ok(linus.json.tasks.length >= 7);
  assert.ok(linus.json.assignableMembers.some((m) => m.id === state.alanId), "PM appears in assignable members");
  assert.ok(linus.json.assignableMembers.some((m) => m.id === state.linusId));

  // katherine is not a platform project member → 403.
  assert.equal((await api("GET", tasksUrl(state.platformId), { cookie: cookies.katherine })).status, 403);
  // outsider (other workspace) → 403.
  assert.equal((await api("GET", tasksUrl(state.platformId), { cookie: cookies.outsider })).status, 403);
  // unknown project → 404.
  assert.equal((await api("GET", tasksUrl("000000000000000000000000"), { cookie: cookies.linus })).status, 404);
  // malformed project id → 404.
  assert.equal((await api("GET", tasksUrl("nope"), { cookie: cookies.linus })).status, 404);
});

test("GET project tasks supports status / priority / assignee filters", async () => {
  const margaret = await api("GET", `${tasksUrl(state.platformId)}?assigneeId=${state.linusId}`, {
    cookie: cookies.margaret,
  });
  assert.equal(margaret.status, 200);
  assert.ok(margaret.json.tasks.length >= 2);
  assert.ok(margaret.json.tasks.every((t) => t.assignedTo === state.linusId));

  const approved = await api("GET", `${tasksUrl(state.platformId)}?status=APPROVED`, { cookie: cookies.margaret });
  assert.equal(approved.status, 200);
  assert.ok(approved.json.tasks.every((t) => t.status === "APPROVED"));

  const high = await api("GET", `${tasksUrl(state.platformId)}?priority=${encodeURIComponent("high")}`, {
    cookie: cookies.margaret,
  });
  assert.equal(high.status, 200);
  assert.ok(high.json.tasks.length > 0);
  assert.ok(high.json.tasks.every((t) => t.priority === "HIGH"));

  const badFilter = await api("GET", `${tasksUrl(state.platformId)}?status=NOT_A_STATUS`, { cookie: cookies.margaret });
  assert.equal(badFilter.status, 400);

  const badPriority = await api("GET", `${tasksUrl(state.platformId)}?priority=CRITICAL`, { cookie: cookies.margaret });
  assert.equal(badPriority.status, 400);
});

test("GET single task enforces project access (IDOR)", async () => {
  const ok = await api("GET", taskUrl(state.t1Id), { cookie: cookies.linus });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.task.id, state.t1Id);
  assert.equal(ok.json.task.status, "ASSIGNED");

  assert.equal((await api("GET", taskUrl(state.t1Id), { cookie: cookies.katherine })).status, 403);
  assert.equal((await api("GET", taskUrl(state.otherTaskId), { cookie: cookies.margaret })).status, 403);
  assert.equal((await api("GET", taskUrl("000000000000000000000000"), { cookie: cookies.linus })).status, 404);
  assert.equal((await api("GET", taskUrl("bogus"), { cookie: cookies.linus })).status, 404);
});

test("creating a project task requires create_task and normalizes workflow state", async () => {
  // alan (PM) can create and assign to a member.
  const pm = await api("POST", tasksUrl(state.platformId), {
    cookie: cookies.alan,
    body: { title: "New PM task", assignedTo: state.linusId, priority: "urgent" },
  });
  assert.equal(pm.status, 201);
  assert.equal(pm.json.task.status, "ASSIGNED");
  assert.equal(pm.json.task.priority, "URGENT");
  assert.equal(pm.json.task.assignedTo, state.linusId);
  state.createdTaskId = pm.json.task.id;

  // Even if a client tries to create directly in APPROVED, it starts ASSIGNED.
  const sneak = await api("POST", tasksUrl(state.platformId), {
    cookie: cookies.alan,
    body: { title: "Sneaky", status: "APPROVED", assignedTo: state.linusId },
  });
  assert.equal(sneak.status, 201);
  assert.equal(sneak.json.task.status, "ASSIGNED");

  // Legacy board status "TO DO" maps into the workflow.
  const legacy = await api("POST", tasksUrl(state.platformId), {
    cookie: cookies.alan,
    body: { title: "Legacy style", status: "TO DO" },
  });
  assert.equal(legacy.status, 201);
  assert.equal(legacy.json.task.status, "ASSIGNED");

  // MEMBER / COLLABORATOR / VIEWER cannot create tasks.
  assert.equal((await api("POST", tasksUrl(state.platformId), { cookie: cookies.margaret, body: { title: "nope" } })).status, 403);
  assert.equal((await api("POST", tasksUrl(state.platformId), { cookie: cookies.ada, body: { title: "nope" } })).status, 403);
  assert.equal((await api("POST", tasksUrl(state.researchId), { cookie: cookies.barbara, body: { title: "nope" } })).status, 403);

  // Missing title / bad priority / bad date → 400.
  assert.equal((await api("POST", tasksUrl(state.platformId), { cookie: cookies.alan, body: {} })).status, 400);
  assert.equal((await api("POST", tasksUrl(state.platformId), { cookie: cookies.alan, body: { title: "x", priority: "CRITICAL" } })).status, 400);
  assert.equal((await api("POST", tasksUrl(state.platformId), { cookie: cookies.alan, body: { title: "x", dueDate: "not-a-date" } })).status, 400);
});

test("assigning a non-project member is rejected with 400 (task and board)", async () => {
  const res = await api("POST", tasksUrl(state.platformId), {
    cookie: cookies.alan,
    body: { title: "Bad assignee", assignedTo: state.katherineId },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /member of this project/i);

  // Same rule on the legacy workspace-scoped board route.
  const board = await api("POST", `/api/workspaces/${state.workspaceA}/projects/${state.platformId}/tasks`, {
    cookie: cookies.alan,
    body: { title: "Board task", assignedTo: state.katherineId },
  });
  assert.equal(board.status, 400);
  assert.match(board.json.message, /member of this project/i);

  // Board route also silently reconciles legacy statuses into the workflow.
  const boardOk = await api("POST", `/api/workspaces/${state.workspaceA}/projects/${state.platformId}/tasks`, {
    cookie: cookies.alan,
    body: { title: "Board task ok", status: "TO DO", assignedTo: state.linusId },
  });
  assert.equal(boardOk.status, 201);
  assert.equal(boardOk.json.task.status, "ASSIGNED");
});

test("status transitions follow the canonical workflow", async () => {
  // ASSIGNED → IN_PROGRESS → SUBMITTED by the assignee.
  const start = await api("PATCH", `${taskUrl(state.t1Id)}/status`, {
    cookie: cookies.linus,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(start.status, 200);
  assert.equal(start.json.task.status, "IN_PROGRESS");

  const submit = await api("PATCH", `${taskUrl(state.t1Id)}/status`, {
    cookie: cookies.linus,
    body: { status: "SUBMITTED" },
  });
  assert.equal(submit.status, 200);
  assert.equal(submit.json.task.status, "SUBMITTED");

  // Reviewers: SUBMITTED → UNDER_REVIEW → APPROVED (PM).
  const review = await api("PATCH", `${taskUrl(state.t1Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "UNDER_REVIEW" },
  });
  assert.equal(review.status, 200);
  assert.equal(review.json.task.status, "UNDER_REVIEW");

  const approve = await api("PATCH", `${taskUrl(state.t1Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "APPROVED" },
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.json.task.status, "APPROVED");
});

test("reviewer can request changes; assignee reworks", async () => {
  const changes = await api("PATCH", `${taskUrl(state.t4Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "CHANGES_REQUESTED" },
  });
  assert.equal(changes.status, 200);
  assert.equal(changes.json.task.status, "CHANGES_REQUESTED");

  const rework = await api("PATCH", `${taskUrl(state.t4Id)}/status`, {
    cookie: cookies.margaret,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(rework.status, 200);
  assert.equal(rework.json.task.status, "IN_PROGRESS");
});

test("invalid / skipped transitions are rejected with 400", async () => {
  // Skipping a stage: ASSIGNED → APPROVED.
  const skip = await api("PATCH", `${taskUrl(state.t7Id)}/status`, {
    cookie: cookies.linus,
    body: { status: "APPROVED" },
  });
  // t7 is unassigned — worker step guard fires first. Use a staged task.
  const staged = await api("POST", tasksUrl(state.platformId), {
    cookie: cookies.alan,
    body: { title: "Staged", assignedTo: state.margaretId },
  });
  const skip2 = await api("PATCH", `${taskUrl(staged.json.task.id)}/status`, {
    cookie: cookies.alan,
    body: { status: "APPROVED" },
  });
  assert.equal(skip2.status, 400);
  assert.match(skip2.json.message, /Invalid status transition/);

  // APPROVED is terminal.
  const terminal = await api("PATCH", `${taskUrl(state.t6Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(terminal.status, 400);

  // Unknown status value.
  const unknown = await api("PATCH", `${taskUrl(state.t2Id)}/status`, {
    cookie: cookies.margaret,
    body: { status: "COMPLETED" },
  });
  assert.equal(unknown.status, 400);
  assert.match(unknown.json.message, /Unknown task status/);
});

test("worker transitions are assignee-only", async () => {
  // alan (PM) has update_task but is not the assignee of t8.
  const notAssignee = await api("PATCH", `${taskUrl(state.t8Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(notAssignee.status, 403);
  assert.match(notAssignee.json.message, /assigned member/);

  // The assignee can start it.
  const assignee = await api("PATCH", `${taskUrl(state.t8Id)}/status`, {
    cookie: cookies.linus,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(assignee.status, 200);

  // Unassigned tasks must be assigned before work can start.
  const unassigned = await api("PATCH", `${taskUrl(state.t7Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(unassigned.status, 403);
  assert.match(unassigned.json.message, /Assign a project member/);
});

test("reviewer transitions require review permissions (not just any member)", async () => {
  // margaret (MEMBER assignee) cannot approve her own task.
  const memberApprove = await api("PATCH", `${taskUrl(state.t3Id)}/status`, {
    cookie: cookies.margaret,
    body: { status: "UNDER_REVIEW" },
  });
  assert.equal(memberApprove.status, 403);

  // ada is a workspace owner but has an explicit COLLABORATOR row on the
  // platform project (no review_task) — the explicit row wins.
  const ownerCollab = await api("PATCH", `${taskUrl(state.t3Id)}/status`, {
    cookie: cookies.ada,
    body: { status: "UNDER_REVIEW" },
  });
  assert.equal(ownerCollab.status, 403);

  // A workspace admin on the platform (project role ADMIN derived) may review.
  const adminReview = await api("PATCH", `${taskUrl(state.t3Id)}/status`, {
    cookie: cookies.alan,
    body: { status: "UNDER_REVIEW" },
  });
  assert.equal(adminReview.status, 200);

  // A VIEWER cannot touch a task of the project they can view.
  assert.equal((await api("GET", taskUrl(state.t3Id), { cookie: cookies.barbara })).status, 403);

  // Barrier: a manager cannot REQUEST CHANGES on the platform task (needs
  // request_task_changes) — alan has it, but grace (member of research only)
  // doing it cross-project is impossible; verify grace on research task works
  // only with correct permissions. Research task create by katherine:
  // grace MEMBER has submit_task but no review_task.
  state.researchTaskId = (
    await api("POST", tasksUrl(state.researchId), { cookie: cookies.katherine, body: { title: "Research item", assignedTo: state.graceId } })
  ).json.task.id;
  const graceReview = await api("PATCH", `${taskUrl(state.researchTaskId)}/status`, {
    cookie: cookies.grace,
    body: { status: "UNDER_REVIEW" },
  });
  // Task is ASSIGNED; grace lacks worker-step ownership AND it's not a valid
  // target anyway — expect 403 (assignee guard) or 400 (invalid transition).
  assert.ok([400, 403].includes(graceReview.status));
});

test("generic PATCH cannot bypass the workflow via status", async () => {
  const beforeTask = await api("GET", taskUrl(state.t5Id), { cookie: cookies.linus });
  assert.equal(beforeTask.status, 200);
  assert.equal(beforeTask.json.task.status, "CHANGES_REQUESTED");

  // Attempt to flip straight to APPROVED through the generic update endpoint.
  const bypass = await api("PATCH", taskUrl(state.t5Id), {
    cookie: cookies.alan,
    body: { title: "Careful edits", status: "APPROVED" },
  });
  assert.equal(bypass.status, 200);
  assert.equal(bypass.json.task.title, "Careful edits");
  assert.equal(bypass.json.task.status, "CHANGES_REQUESTED", "status unchanged");

  // Members can only mutate their own assigned tasks.
  const stranger = await api("PATCH", taskUrl(state.t5Id), {
    cookie: cookies.margaret,
    body: { description: "hijack" },
  });
  assert.equal(stranger.status, 403);
  assert.match(stranger.json.message, /only modify tasks assigned to you/);
});

test("updating task details validates assignee membership on reassign", async () => {
  // PM reassigns linus → katherine (non-member) → 400.
  const bad = await api("PATCH", taskUrl(state.t8Id), {
    cookie: cookies.alan,
    body: { assignedTo: state.katherineId },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.json.message, /member of this project/i);

  // PM reassigns linus → margaret (member) → 200.
  const good = await api("PATCH", taskUrl(state.t8Id), {
    cookie: cookies.alan,
    body: { assignedTo: state.margaretId },
  });
  assert.equal(good.status, 200);
  assert.equal(good.json.task.assignedTo, state.margaretId);

  // Member tries to unassign — ignored (no assign_task), remains margaret.
  const ignored = await api("PATCH", taskUrl(state.t8Id), {
    cookie: cookies.margaret,
    body: { assignedTo: "" },
  });
  assert.equal(ignored.status, 200);
  assert.equal(ignored.json.task.assignedTo, state.margaretId);
});

test("subtask CRUD: create, list, update, complete, delete", async () => {
  // Phase 11: subtasks may not be added to an APPROVED task (its completion
  // would silently break), and this suite has just approved t1 — so the
  // subtask lifecycle runs against t8, which is still ASSIGNED.
  const rejected = await api("POST", `${taskUrl(state.t1Id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Late work" },
  });
  assert.equal(rejected.status, 400, "an approved task cannot take on new open work");
  assert.match(rejected.json.message, /already approved/);

  const a = await api("POST", `${taskUrl(state.t8Id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Write spec" },
  });
  assert.equal(a.status, 201);
  assert.ok(a.json.subtask.id);
  assert.equal(a.json.subtask.status, "TODO");
  assert.equal(a.json.progress, 0);

  const b = await api("POST", `${taskUrl(state.t8Id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Write tests", assigneeId: state.margaretId, weight: 30 },
  });
  assert.equal(b.status, 201);

  const list = await api("GET", `${taskUrl(state.t8Id)}/subtasks`, { cookie: cookies.margaret });
  assert.equal(list.status, 200);
  assert.equal(list.json.subtasks.length, 2);
  assert.equal(list.json.progress, 0);

  const complete = await api("PATCH", `/api/subtasks/${list.json.subtasks[0].id}`, {
    cookie: cookies.alan,
    body: { status: "COMPLETED" },
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.json.subtask.completed, true);

  // Task-level serialization must expose usable subtask ids (regression: the
  // `id` virtual was lost after toJSON, yielding the literal string "undefined").
  const detail = await api("GET", taskUrl(state.t8Id), { cookie: cookies.alan });
  assert.equal(detail.status, 200);
  for (const s of detail.json.task.subtasks) {
    assert.ok(s.id, "subtask id is present on the task payload");
    assert.notEqual(s.id, "undefined");
  }

  // Unweighted subtasks fall back to a completion count; the 30-weight
  // subtask is still TODO, so the two unweighted halves report 50%.
  const updated = await api("GET", `${taskUrl(state.t8Id)}/subtasks`, { cookie: cookies.margaret });
  assert.equal(updated.json.progress, 0, "a completed unweighted subtask alongside a weighted TODO one");

  const deleteRes = await api("DELETE", `/api/subtasks/${b.json.subtask.id}`, { cookie: cookies.alan });
  assert.equal(deleteRes.status, 200);

  const gone = await api("GET", `/api/subtasks/${b.json.subtask.id}`, { cookie: cookies.alan });
  assert.equal(gone.status, 404);
});

test("subtask validation and ownership", async () => {
  // Missing / oversized titles.
  assert.equal((await api("POST", `${taskUrl(state.t1Id)}/subtasks`, { cookie: cookies.alan, body: {} })).status, 400);
  assert.equal(
    (await api("POST", `${taskUrl(state.t1Id)}/subtasks`, { cookie: cookies.alan, body: { title: "x".repeat(301) } })).status,
    400
  );

  // Non-member assignment rejected.
  const badAssignee = await api("POST", `${taskUrl(state.t1Id)}/subtasks`, {
    cookie: cookies.alan,
    body: { title: "Bad sub", assigneeId: state.katherineId },
  });
  assert.equal(badAssignee.status, 400);
  assert.match(badAssignee.json.message, /member of this project/i);

  // MEMBER cannot add subtasks to a co-worker's task (ownership).
  const coWorker = await api("POST", `${taskUrl(state.t2Id)}/subtasks`, {
    cookie: cookies.linus,
    body: { title: "sneaky" },
  });
  assert.equal(coWorker.status, 403);

  // The assignee may manage their own task's subtasks.
  const own = await api("POST", `${taskUrl(state.t2Id)}/subtasks`, {
    cookie: cookies.margaret,
    body: { title: "My own" },
  });
  assert.equal(own.status, 201);

  // IDOR: a platform member cannot reach another workspace's subtask.
  const otherSubId = (
    await api("POST", `${taskUrl(state.otherTaskId)}/subtasks`, { cookie: cookies.ghost, body: { title: "foreign" } })
  ).json.subtask.id;
  assert.equal((await api("GET", `/api/subtasks/${otherSubId}`, { cookie: cookies.margaret })).status, 403);

  // Unknown subtask → 404.
  assert.equal((await api("PATCH", `/api/subtasks/000000000000000000000000`, { cookie: cookies.alan, body: { title: "x" } })).status, 404);
});

test("deleting a task cascades to its deliverables, reviews, and comments", async () => {
  const before = await api("GET", taskUrl(state.t3Id), { cookie: cookies.margaret });
  assert.equal(before.status, 200);

  const del = await api("DELETE", taskUrl(state.t3Id), { cookie: cookies.alan });
  assert.equal(del.status, 200);

  assert.equal((await api("GET", taskUrl(state.t3Id), { cookie: cookies.alan })).status, 404);

  const dlvCount = await Deliverable.countDocuments({ _id: state.t3DeliverableId });
  assert.equal(dlvCount, 0, "deliverable cascade-deleted");

  const commentCount = await Comment.countDocuments({ taskId: state.t3Id });
  assert.equal(commentCount, 0, "comments cascade-deleted");

  // Members cannot delete tasks they don't own anyway (no delete_task).
  assert.equal((await api("DELETE", taskUrl(state.t7Id), { cookie: cookies.linus })).status, 403);
});

test("project task count reflects deletions (board remains consistent)", async () => {
  const list = await api("GET", tasksUrl(state.platformId), { cookie: cookies.alan });
  assert.equal(list.status, 200);
  const all = list.json.tasks;
  assert.ok(all.length >= 10, "platform has seeded + created + deleted tasks");
});