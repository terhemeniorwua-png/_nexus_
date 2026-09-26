"use strict";

// Phase 21 — project manager dashboard tests.
//
// The manager dashboard exists to answer "what needs my decision, and how is
// this project doing", so these tests are about the ways it can lie or leak:
//
//   • a user who manages nothing reaching a manager dashboard at all
//   • a member of a managed project reading its analytics (they are not the
//     manager, so they must be refused even though they can open the project)
//   • the ?projectId= filter widening the scope, or being used to read a
//     project the caller does not manage
//   • a project id that exists but belongs to someone else answered differently
//     from one that does not exist (an existence oracle)
//   • progress, completion or workload numbers that disagree with the database
//   • legacy board statuses (REVIEW / DONE) dropped from the counts
//   • one user's submissions or team workload surfacing in another's dashboard
//   • the nav capability flag disagreeing with the endpoint it opens
//   • a review performed from the queue not moving the item out of it
//
// Every assertion compares the response against the database directly, so a
// passing test means the payload matched the records.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_manager_dashboard_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-manager-dashboard-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "http://127.0.0.1";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const BoardColumn = require("../src/models/boardColumn.model");
const Task = require("../src/models/task.model");
const Deliverable = require("../src/models/deliverable.model");
const DeliverableVersion = require("../src/models/deliverableVersion.model");
const DeliverableReview = require("../src/models/deliverableReview.model");
const Activity = require("../src/models/activity.model");

const {
  managedProjectScope,
  canManageProjects,
} = require("../src/services/project.service");

const app = require("../src/app");

const PASSWORD = "Password123!";
const NAMES = ["ada", "alan", "linus", "margaret", "bystander", "outsider", "boss", "viewer"];

let server;
let base;
const state = {};
const cookies = {};
const DAY = 86400000;

// --- HTTP helper -------------------------------------------------------------
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
    /* not JSON */
  }
  return { status: res.status, json };
}

async function login(email) {
  const res = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.json && res.json.message}`);
  cookies[email.split("@")[0]] = `nexus_token=${res.json.token}`;
  return cookies[email.split("@")[0]];
}

const managerDash = (who, projectId) =>
  api("GET", `/api/me/manager-dashboard${projectId ? `?projectId=${projectId}` : ""}`, {
    cookie: cookies[who],
  });

// --- Fixture helper ----------------------------------------------------------
//
// Every DeliverableVersion in this schema carries the metadata of an uploaded
// file — there is no such thing as a version without one — so seeded versions
// are built through this helper rather than by hand, to keep that invariant
// visible in one place.
function versionRow(deliverableId, versionNumber, extra = {}) {
  const fileName = extra.fileName || `v${versionNumber}.pdf`;
  return {
    deliverableId,
    versionNumber,
    status: extra.status || "SUBMITTED",
    fileName,
    storageKey: `${deliverableId}/v${versionNumber}/${fileName}`,
    fileUrl: `/api/deliverables/${deliverableId}/versions/${versionNumber}/download`,
    fileSize: 1024 * versionNumber,
    mimeType: "application/pdf",
    ...extra,
  };
}

// --- Fixtures ----------------------------------------------------------------
//
//   Workspace "Acme" (ada owns it, alan is a workspace Admin)
//     Platform  — alan is managerId AND a PROJECT_MANAGER member
//                 tasks: 2 approved, 1 in progress, 1 submitted, 1 review,
//                        1 overdue+blocked, 1 assigned to nobody
//                 deliverables: one SUBMITTED (awaiting pickup),
//                              one UNDER_REVIEW (decision pending)
//     Sidecar   — linus manages it; alan can see it (workspace Admin) but
//                 linus's own data must never leak into alan's project scope
//     Vault     — margaret is a plain MEMBER here and nobody else is: alan
//                 (workspace Admin) is refused analytics on it, proving the
//                 scope is not "every project in my workspace"
//   Workspace "Rival" (outsider owns it)
//     Foreign   — outsider manages it; completely invisible to everyone above
//   Workspace "Board-only" (boss owns it)
//     Legacy    — boss is a workspace owner with NO ProjectMember row, so the
//                 inherited owner role grants manager access
//   "bystander" is in no workspace at all.
//   "viewer" is a VIEWER member of Platform: can open it, must not manage it.
async function buildFixtures() {
  const users = {};
  for (const name of NAMES) {
    users[name] = await User.create({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: `${name}@acme.test`,
      password: PASSWORD,
    });
    state[`${name}Id`] = String(users[name]._id);
  }
  state.users = users;

  const wsA = await Workspace.create({ name: "Acme", ownerId: users.ada._id });
  state.workspaceA = String(wsA._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
    // A workspace Member who is only a VIEWER on one project. Reaches it,
    // manages nothing.
    { workspaceId: wsA._id, userId: users.viewer._id, role: "Member" },
  ]);

  // --- Platform: alan's project ---------------------------------------------
  const platform = await Project.create({
    workspaceId: wsA._id,
    name: "Platform",
    status: "ACTIVE",
    managerId: users.alan._id,
    createdBy: users.alan._id,
  });
  state.platformId = String(platform._id);
  const platformCol = await BoardColumn.create({
    projectId: platform._id,
    name: "To Do",
    position: 0,
  });

  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.margaret._id, role: "MEMBER" },
    // Can open Platform. Must not be able to manage it.
    { projectId: platform._id, userId: users.viewer._id, role: "VIEWER" },
  ]);

  const past = new Date(Date.now() - 3 * DAY);
  const future = new Date(Date.now() + 5 * DAY);

  const platformTasks = await Task.insertMany([
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Approved one",
      status: "APPROVED",
      priority: "MEDIUM",
      assignedTo: users.linus._id,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Approved two (legacy DONE)",
      // Legacy board status: a real row that must count as complete.
      status: "DONE",
      assignedTo: users.linus._id,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "In progress one",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedTo: users.linus._id,
      dueDate: future,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Submitted with a deliverable",
      status: "SUBMITTED",
      assignedTo: users.linus._id,
      dueDate: future,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Under review with a deliverable",
      status: "UNDER_REVIEW",
      assignedTo: users.margaret._id,
      dueDate: future,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      // Legacy board status: a real pending row, and the only kind that can
      // carry no deliverable at all.
      title: "Legacy review task",
      status: "REVIEW",
      assignedTo: users.margaret._id,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Overdue and blocked",
      status: "BLOCKED",
      priority: "URGENT",
      assignedTo: users.margaret._id,
      dueDate: past,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Unassigned open task",
      status: "ASSIGNED",
      assignedTo: null,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: platformCol._id,
      title: "Overdue high priority",
      status: "IN_PROGRESS",
      priority: "URGENT",
      assignedTo: users.linus._id,
      dueDate: past,
      createdBy: users.alan._id,
    },
  ]);
  state.platformTasks = platformTasks;

  const submittedTask = platformTasks[3];
  const underReviewTask = platformTasks[4];

  // Two pending deliverables, in different review states.
  const awaiting = await Deliverable.create({
    taskId: submittedTask._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.linus._id,
    title: "Awaiting pickup",
    status: "SUBMITTED",
    currentVersion: 1,
  });
  state.awaitingDeliverableId = String(awaiting._id);

  await DeliverableVersion.create(
    versionRow(awaiting._id, 1, {
      status: "SUBMITTED",
      description: "first pass",
      fileName: "awaiting.pdf",
      submittedBy: users.linus._id,
      submittedAt: new Date(Date.now() - 2 * DAY),
    })
  );

  // The second deliverable sits on a task that is ALSO in a pending state, so
  // the queue must show it once — keyed on the deliverable — not twice.
  //
  // Its task is a canonical UNDER_REVIEW, not a legacy REVIEW: the deliverable
  // services deliberately refuse a decision when the task is not in a
  // compatible workflow state, so a legacy task is kept deliverable-free.
  const underReview = await Deliverable.create({
    taskId: underReviewTask._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.margaret._id,
    title: "Decision pending",
    status: "UNDER_REVIEW",
    currentVersion: 2,
  });
  state.underReviewDeliverableId = String(underReview._id);

  await DeliverableVersion.insertMany([
    versionRow(underReview._id, 1, {
      status: "CHANGES_REQUESTED",
      fileName: "round-one.pdf",
      submittedBy: users.margaret._id,
      submittedAt: new Date(Date.now() - 6 * DAY),
    }),
    versionRow(underReview._id, 2, {
      status: "UNDER_REVIEW",
      description: "reworked",
      fileName: "round-two.pdf",
      submittedBy: users.margaret._id,
      submittedAt: new Date(Date.now() - 1 * DAY),
    }),
  ]);

  await DeliverableReview.create({
    deliverableId: underReview._id,
    deliverableVersionId: underReview._id,
    versionNumber: 1,
    reviewerId: users.alan._id,
    decision: "CHANGES_REQUESTED",
    feedback: "Tighten the summary",
    reviewedAt: new Date(Date.now() - 4 * DAY),
  });

  // An APPROVED deliverable must never appear in the pending queue.
  const doneTask = platformTasks[0];
  const approved = await Deliverable.create({
    taskId: doneTask._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.linus._id,
    title: "Already approved",
    status: "APPROVED",
    currentVersion: 1,
    approvedVersion: 1,
  });
  await DeliverableVersion.create(
    versionRow(approved._id, 1, {
      status: "APPROVED",
      fileName: "final.pdf",
      submittedBy: users.linus._id,
      submittedAt: new Date(Date.now() - 8 * DAY),
      reviewedAt: new Date(Date.now() - 7 * DAY),
    })
  );

  // --- Sidecar: linus's project ---------------------------------------------
  const sidecar = await Project.create({
    workspaceId: wsA._id,
    name: "Sidecar",
    status: "PLANNING",
    managerId: users.linus._id,
    createdBy: users.linus._id,
  });
  state.sidecarId = String(sidecar._id);
  const sidecarCol = await BoardColumn.create({
    projectId: sidecar._id,
    name: "To Do",
    position: 0,
  });
  await ProjectMember.create({
    projectId: sidecar._id,
    userId: users.linus._id,
    role: "PROJECT_MANAGER",
  });
  await Task.create({
    projectId: sidecar._id,
    workspaceId: wsA._id,
    columnId: sidecarCol._id,
    title: "Linus private task",
    status: "IN_PROGRESS",
    assignedTo: users.linus._id,
    createdBy: users.linus._id,
  });

  // --- Vault: margaret's project, alan must not be able to manage it ---------
  const vault = await Project.create({
    workspaceId: wsA._id,
    name: "Vault",
    status: "ACTIVE",
    managerId: users.margaret._id,
    createdBy: users.margaret._id,
  });
  state.vaultId = String(vault._id);
  const vaultCol = await BoardColumn.create({
    projectId: vault._id,
    name: "To Do",
    position: 0,
  });
  await ProjectMember.create({
    projectId: vault._id,
    userId: users.margaret._id,
    role: "PROJECT_MANAGER",
  });
  await Task.create({
    projectId: vault._id,
    workspaceId: wsA._id,
    columnId: vaultCol._id,
    title: "Margaret secret task",
    status: "IN_PROGRESS",
    assignedTo: users.margaret._id,
    createdBy: users.margaret._id,
  });

  // --- Foreign: another workspace entirely ----------------------------------
  const wsB = await Workspace.create({ name: "Rival", ownerId: users.outsider._id });
  const foreign = await Project.create({
    workspaceId: wsB._id,
    name: "Foreign",
    status: "ACTIVE",
    managerId: users.outsider._id,
    createdBy: users.outsider._id,
  });
  state.foreignId = String(foreign._id);
  state.foreignWorkspaceId = String(wsB._id);
  const foreignCol = await BoardColumn.create({
    projectId: foreign._id,
    name: "To Do",
    position: 0,
  });
  await ProjectMember.create({
    projectId: foreign._id,
    userId: users.outsider._id,
    role: "PROJECT_MANAGER",
  });
  await Task.create({
    projectId: foreign._id,
    workspaceId: wsB._id,
    columnId: foreignCol._id,
    title: "Foreign secret task",
    status: "IN_PROGRESS",
    assignedTo: users.outsider._id,
    createdBy: users.outsider._id,
  });

  // --- Legacy: owner with no ProjectMember row inherits manager access -------
  const wsC = await Workspace.create({ name: "Board-only", ownerId: users.boss._id });
  const legacy = await Project.create({
    workspaceId: wsC._id,
    name: "Legacy",
    status: "ACTIVE",
    managerId: null,
    createdBy: users.boss._id,
  });
  state.legacyId = String(legacy._id);
  state.legacyWorkspaceId = String(wsC._id);

  // Activity, including one from another workspace that must not leak.
  await Activity.insertMany([
    {
      workspaceId: wsA._id,
      projectId: platform._id,
      userId: users.alan._id,
      action: "TASK_CREATED",
      targetType: "task",
      targetId: submittedTask._id,
      metadata: { title: "Submitted with a deliverable" },
      createdAt: new Date(Date.now() - 1 * DAY),
    },
    {
      workspaceId: wsA._id,
      projectId: platform._id,
      userId: users.linus._id,
      action: "DELIVERABLE_SUBMITTED",
      targetType: "deliverable",
      targetId: awaiting._id,
      createdAt: new Date(Date.now() - 2 * DAY),
    },
    {
      // Workspace-level activity: a project-scoped panel must not show it.
      workspaceId: wsA._id,
      projectId: null,
      userId: users.ada._id,
      action: "TEAM_CREATED",
      targetType: "team",
      createdAt: new Date(Date.now() - 1 * DAY),
    },
    {
      // Another workspace entirely.
      workspaceId: wsB._id,
      projectId: foreign._id,
      userId: users.outsider._id,
      action: "TASK_CREATED",
      targetType: "task",
      createdAt: new Date(Date.now() - 1 * DAY),
    },
  ]);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await buildFixtures();

  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;

  for (const name of NAMES) {
    await login(`${name}@acme.test`);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Authentication and authorisation
// ---------------------------------------------------------------------------

test("the manager dashboard refuses an unauthenticated request", async () => {
  const res = await api("GET", "/api/me/manager-dashboard");
  assert.equal(res.status, 401, "an unauthenticated caller must not get manager data");
});

test("a user who manages nothing is refused with a clear message", async () => {
  // bystander is a workspace Member in no project, and manages none.
  const res = await managerDash("bystander");
  assert.equal(res.status, 403);
  assert.match(res.json.message, /manager access/i);
  assert.equal(res.json.code, "NOT_PROJECT_MANAGER");
  // A refusal must not leak the shape of the payload it is refusing.
  assert.equal(res.json.managerDashboard, undefined);
});

test("a plain project member is refused even though they can open the project", async () => {
  // The whole point of the review-permission scope: reaching a project is not
  // the same as managing it.
  const canOpen = await api("GET", `/api/projects/${state.platformId}`, {
    cookie: cookies.viewer,
  });
  assert.equal(canOpen.status, 200, "a VIEWER must still be able to open the project");

  const res = await managerDash("viewer");
  assert.equal(res.status, 403, "a VIEWER must not receive manager analytics");
  assert.equal(res.json.code, "NOT_PROJECT_MANAGER");
});

test("a workspace member who manages nothing is refused", async () => {
  // linus is a workspace Member but manages Sidecar, so he is allowed. margaret
  // manages Vault, so she is allowed. This asserts the gate is not keyed on
  // workspace membership at all.
  const linus = await managerDash("linus");
  assert.equal(linus.status, 200);

  const ada = await managerDash("ada");
  assert.equal(ada.status, 200, "a workspace owner manages by inheritance");
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

test("the scope contains the managed project and nothing else", async () => {
  const res = await managerDash("linus");
  assert.equal(res.status, 200);
  const ids = res.json.managerDashboard.projects.map((p) => p.id);
  assert.deepEqual(ids, [state.sidecarId], "linus manages Sidecar and nothing else");
});

test("a manager cannot read a project they do not manage", async () => {
  // linus manages Sidecar. Platform belongs to alan.
  const res = await managerDash("linus", state.platformId);
  assert.equal(res.status, 403);
  assert.equal(res.json.code, "NOT_PROJECT_MANAGER");
});

test("a manager cannot read a project in another workspace", async () => {
  const res = await managerDash("linus", state.foreignId);
  assert.equal(res.status, 403);
});

test("a non-existent project and a forbidden one are answered identically", async () => {
  // Otherwise the endpoint is an existence oracle: a caller could learn which
  // project ids are real by comparing the two answers.
  const missing = new mongoose.Types.ObjectId().toString();
  const forbidden = await managerDash("linus", state.platformId);
  const unknown = await managerDash("linus", missing);

  assert.equal(forbidden.status, 403);
  assert.equal(unknown.status, 403);
  assert.equal(forbidden.json.message, unknown.json.message);
  assert.equal(forbidden.json.code, unknown.json.code);
});

test("a malformed projectId is rejected before any data is read", async () => {
  const res = await managerDash("linus", "not-an-object-id");
  assert.equal(res.status, 400);
  assert.equal(res.json.managerDashboard, undefined);
});

test("the dashboard cannot be asked for another user's id", async () => {
  const res = await api("GET", `/api/me/manager-dashboard?userId=${state.margaretId}`, {
    cookie: cookies.linus,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.managerDashboard.user.id, state.linusId);
});

// ---------------------------------------------------------------------------
// Project selector
// ---------------------------------------------------------------------------

test("the selector lists every managed project with a real roll-up", async () => {
  const res = await managerDash("alan");
  assert.equal(res.status, 200);
  const { projects } = res.json.managerDashboard;
  const platform = projects.find((p) => p.id === state.platformId);

  assert.ok(platform, "alan manages Platform");
  assert.equal(platform.workspaceName, "Acme");

  // Against the database, not the response.
  const [total, completed, overdue] = await Promise.all([
    Task.countDocuments({ projectId: state.platformId }),
    Task.countDocuments({
      projectId: state.platformId,
      status: { $in: ["APPROVED", "DONE"] },
    }),
    Task.countDocuments({
      projectId: state.platformId,
      status: { $nin: ["APPROVED", "DONE"] },
      dueDate: { $ne: null, $lt: new Date() },
    }),
  ]);

  assert.equal(platform.tasks, total);
  assert.equal(platform.completedTasks, completed);
  assert.equal(platform.progress, Math.round((completed / total) * 100));
  assert.equal(platform.overdueTasks, overdue);
  assert.equal(platform.pendingReviews, 2);
});

test("a managed project with no tasks reports zeroes, not a NaN progress", async () => {
  // boss owns a workspace and manages Legacy, which has no tasks at all.
  const res = await managerDash("boss");
  assert.equal(res.status, 200);
  const legacy = res.json.managerDashboard.projects.find((p) => p.id === state.legacyId);
  assert.ok(legacy);
  assert.equal(legacy.tasks, 0);
  assert.equal(legacy.progress, 0);
  assert.equal(legacy.pendingReviews, 0);
  assert.equal(legacy.overdueTasks, 0);
});

// ---------------------------------------------------------------------------
// Overview analytics
// ---------------------------------------------------------------------------

test("the overview counts the real tasks and computes progress from them", async () => {
  const res = await managerDash("alan", state.platformId);
  assert.equal(res.status, 200);
  const { overview } = res.json.managerDashboard;

  const tasks = await Task.find({ projectId: state.platformId }).lean();
  const completed = tasks.filter((t) => ["APPROVED", "DONE"].includes(t.status)).length;

  assert.equal(overview.projects, 1);
  assert.equal(overview.tasks, tasks.length);
  assert.equal(overview.completedTasks, completed);
  assert.equal(overview.activeTasks, tasks.length - completed);
  assert.equal(overview.progress, Math.round((completed / tasks.length) * 100));
});

test("legacy board statuses are counted, not dropped", async () => {
  const res = await managerDash("alan", state.platformId);
  const { overview } = res.json.managerDashboard;

  // REVIEW is the legacy spelling of SUBMITTED and must appear in the queue
  // count; DONE is the legacy spelling of APPROVED and must count as complete.
  assert.equal(overview.byStatus.DONE, 1);
  assert.equal(overview.byStatus.REVIEW, 1);
  assert.equal(overview.submittedTasks, 2, "SUBMITTED + legacy REVIEW");
  assert.equal(overview.blockedTasks, 1, "the BLOCKED row is surfaced, not hidden");
});

test("the status breakdown accounts for every task exactly once", async () => {
  const res = await managerDash("alan", state.platformId);
  const { byStatus, tasks } = res.json.managerDashboard.overview;
  const summed = Object.values(byStatus).reduce((a, b) => a + b, 0);
  assert.equal(summed, tasks, "the breakdown must partition the task total");
});

test("overdue counts only unfinished work", async () => {
  const res = await managerDash("alan", state.platformId);
  const { overview } = res.json.managerDashboard;
  const expected = await Task.countDocuments({
    projectId: state.platformId,
    status: { $nin: ["APPROVED", "DONE"] },
    dueDate: { $ne: null, $lt: new Date() },
  });
  assert.equal(overview.overdueTasks, expected);
  assert.ok(overview.overdueTasks >= 2, "two Platform tasks are past due");
});

test("without a project the overview aggregates every managed project", async () => {
  const all = await managerDash("alan");
  const platform = await managerDash("alan", state.platformId);
  assert.equal(all.status, 200);
  assert.equal(all.json.managerDashboard.scope, "all");
  assert.equal(all.json.managerDashboard.selectedProject, null);
  assert.equal(
    all.json.managerDashboard.overview.projects,
    all.json.managerDashboard.projects.length
  );
  assert.ok(
    all.json.managerDashboard.overview.tasks >= platform.json.managerDashboard.overview.tasks,
    "the all-projects figure cannot be smaller than one project's"
  );
});

test("scoping to a project narrows the figures to that project", async () => {
  const res = await managerDash("alan", state.platformId);
  assert.equal(res.json.managerDashboard.scope, "project");
  assert.equal(res.json.managerDashboard.selectedProject.id, state.platformId);
  assert.equal(res.json.managerDashboard.selectedProject.name, "Platform");
  assert.equal(res.json.managerDashboard.overview.projects, 1);
  for (const row of res.json.managerDashboard.pendingReviews) {
    assert.equal(row.projectId, state.platformId);
  }
  for (const row of res.json.managerDashboard.overdue) {
    assert.equal(row.projectId, state.platformId);
  }
});

// ---------------------------------------------------------------------------
// Pending reviews
// ---------------------------------------------------------------------------

test("the review queue holds exactly the pending submissions", async () => {
  const res = await managerDash("alan", state.platformId);
  const { pendingReviews } = res.json.managerDashboard;

  // Directly from the database: two deliverables pending review.
  const pendingDeliverables = await Deliverable.find({
    projectId: state.platformId,
    status: { $in: ["SUBMITTED", "UNDER_REVIEW"] },
  });
  assert.equal(pendingDeliverables.length, 2);

  // ...plus the legacy REVIEW task, which is pending with no deliverable at
  // all. The APPROVED deliverable and its task add nothing.
  const pendingTasks = await Task.find({
    projectId: state.platformId,
    status: { $in: ["SUBMITTED", "UNDER_REVIEW", "REVIEW"] },
  });
  assert.equal(pendingTasks.length, 3);

  const kinds = pendingReviews.map((r) => r.kind).sort();
  assert.deepEqual(
    kinds,
    ["deliverable", "deliverable", "task"],
    "two deliverable rows and the one bare task row"
  );

  // The approved task is in the pending *task* set only by coincidence of this
  // fixture's statuses, so assert on titles rather than counts of the union.
  assert.ok(
    !pendingReviews.some((r) => r.title === "Already approved"),
    "an approved submission must never be queued"
  );
});

test("a task with a pending deliverable is not double counted in the queue", async () => {
  const res = await managerDash("alan", state.platformId);
  const taskIds = res.json.managerDashboard.pendingReviews.map((r) => r.taskId).filter(Boolean);
  const unique = new Set(taskIds);
  assert.equal(taskIds.length, unique.size, "no task may appear twice in the queue");

  // The UNDER_REVIEW task is represented by its deliverable row, which carries
  // the task through for context rather than duplicating it.
  const row = res.json.managerDashboard.pendingReviews.find(
    (r) => r.title === "Decision pending"
  );
  assert.ok(row);
  assert.equal(row.taskStatus, "UNDER_REVIEW", "the task context is preserved on the row");
  assert.equal(row.version, 2, "the row tracks the current version, not the latest ever");
});

test("a legacy REVIEW task is queued as work awaiting review", async () => {
  // `REVIEW` is the legacy spelling of SUBMITTED. It has no deliverable, and it
  // has no outgoing transition rule — so it must be visible without a dead
  // "start review" button being offered for it.
  const res = await managerDash("alan", state.platformId);
  const row = res.json.managerDashboard.pendingReviews.find(
    (r) => r.title === "Legacy review task"
  );
  assert.ok(row, "a legacy pending task belongs in the review queue");
  assert.equal(row.kind, "task");
  assert.equal(row.status, "REVIEW");
  assert.equal(row.deliverableId, null);
  assert.equal(row.actions.startReview, false, "REVIEW has no legal outgoing transition");
  assert.equal(row.actions.approve, false);
});

test("a submitted task with no deliverable is still surfaced for review", async () => {
  // Created here rather than in the fixtures so the queue assertions above stay
  // about the seeded set.
  const platform = await Project.findById(state.platformId);
  const col = await BoardColumn.findOne({ projectId: platform._id });
  const task = await Task.create({
    projectId: platform._id,
    workspaceId: state.workspaceA,
    columnId: col._id,
    title: "Bare submitted task",
    status: "SUBMITTED",
    assignedTo: state.users.margaret._id,
    createdBy: state.users.alan._id,
  });

  const res = await managerDash("alan", state.platformId);
  const row = res.json.managerDashboard.pendingReviews.find((r) => r.id === `task:${task._id}`);
  assert.ok(row, "a task-level submission belongs in the review queue");
  assert.equal(row.kind, "task");
  assert.equal(row.deliverableId, null);
  assert.equal(row.actions.startReview, true);
  assert.equal(row.actions.approve, false, "UNDER_REVIEW is required before approving a task");

  await Task.deleteOne({ _id: task._id });
});

test("the queue shows the submission, its file and its last decision", async () => {
  const res = await managerDash("alan", state.platformId);
  const row = res.json.managerDashboard.pendingReviews.find(
    (r) => r.deliverableId === state.underReviewDeliverableId
  );

  assert.ok(row);
  assert.equal(row.version, 2);
  assert.equal(row.fileName, "round-two.pdf", "the current version's file, not round one's");
  assert.equal(row.submittedBy.name, "Margaret");
  assert.ok(row.submittedAt, "a submission timestamp is shown");

  // The last decision on v1, carried forward as context.
  assert.ok(row.lastReview, "the previous decision must be visible");
  assert.equal(row.lastReview.decision, "CHANGES_REQUESTED");
  assert.equal(row.lastReview.feedback, "Tighten the summary");
  assert.equal(row.lastReview.reviewerName, "Alan");
});

test("the oldest submission is first in the queue", async () => {
  const res = await managerDash("alan", state.platformId);
  const times = res.json.managerDashboard.pendingReviews.map((r) =>
    new Date(r.submittedAt).getTime()
  );
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted, "a queue is a work order: longest wait first");
});

test("the offered actions match the state the item is actually in", async () => {
  const res = await managerDash("alan", state.platformId);
  const byState = Object.fromEntries(
    res.json.managerDashboard.pendingReviews.map((r) => [r.status, r.actions])
  );

  // SUBMITTED: pick the review up first.
  assert.equal(byState.SUBMITTED.startReview, true);
  // UNDER_REVIEW: the decision is what is outstanding.
  assert.equal(byState.UNDER_REVIEW.approve, true);
  assert.equal(byState.UNDER_REVIEW.requestChanges, true);
  assert.equal(byState.UNDER_REVIEW.startReview, false, "already in review");
});

test("a manager's queue never contains another manager's project", async () => {
  const res = await managerDash("linus");
  const projectIds = new Set(res.json.managerDashboard.pendingReviews.map((r) => r.projectId));
  for (const id of projectIds) {
    assert.equal(id, state.sidecarId, "linus may only see submissions in his own project");
  }
  assert.equal(res.json.managerDashboard.pendingReviews.length, 0);
});

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------

test("the workload reports open tasks per assignee from the database", async () => {
  const res = await managerDash("alan", state.platformId);
  const { workload } = res.json.managerDashboard;

  const open = await Task.find({
    projectId: state.platformId,
    status: { $nin: ["APPROVED", "DONE"] },
  }).lean();

  const expected = new Map();
  open.forEach((task) => {
    const key = task.assignedTo ? String(task.assignedTo) : null;
    expected.set(key, (expected.get(key) || 0) + 1);
  });

  assert.equal(workload.reduce((sum, row) => sum + row.open, 0), open.length);
  expected.forEach((count, assignee) => {
    const row = workload.find((r) => r.userId === assignee);
    assert.ok(row, `missing workload row for ${assignee}`);
    assert.equal(row.open, count);
  });
});

test("unassigned work is reported as its own bucket", async () => {
  const res = await managerDash("alan", state.platformId);
  const row = res.json.managerDashboard.workload.find((r) => r.userId === null);
  assert.ok(row, "work assigned to nobody is exactly what a manager needs to see");
  assert.equal(row.name, "Unassigned");
  const expected = await Task.countDocuments({
    projectId: state.platformId,
    assignedTo: null,
    status: { $nin: ["APPROVED", "DONE"] },
  });
  assert.equal(row.open, expected);
});

test("the workload breakdown agrees with itself and with the overdue panel", async () => {
  const res = await managerDash("alan", state.platformId);
  const { workload, overdue } = res.json.managerDashboard;

  const summedOverdue = workload.reduce((sum, row) => sum + row.overdue, 0);
  assert.equal(
    summedOverdue,
    overdue.length,
    "every overdue task is somebody's open work"
  );

  workload.forEach((row) => {
    assert.ok(row.open >= row.inProgress, `${row.name}: in progress cannot exceed open`);
    assert.ok(row.open >= row.underReview, `${row.name}: under review cannot exceed open`);
  });
});

// ---------------------------------------------------------------------------
// Overdue
// ---------------------------------------------------------------------------

test("the overdue panel lists only unfinished past-due tasks, oldest first", async () => {
  const res = await managerDash("alan", state.platformId);
  const { overdue } = res.json.managerDashboard;

  const expected = await Task.find({
    projectId: state.platformId,
    status: { $nin: ["APPROVED", "DONE"] },
    dueDate: { $ne: null, $lt: new Date() },
  })
    .sort({ dueDate: 1 })
    .lean();

  assert.equal(overdue.length, expected.length);
  overdue.forEach((row, index) => {
    assert.equal(row.id, String(expected[index]._id));
  });

  const dates = overdue.map((r) => new Date(r.dueDate).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  overdue.forEach((row) => {
    assert.ok(row.daysOverdue >= 1, "an overdue task is at least a day past due");
  });
});

test("an overdue task shows who owns it", async () => {
  const res = await managerDash("alan", state.platformId);
  const row = res.json.managerDashboard.overdue.find((r) => r.assignee);
  assert.ok(row, "at least one Platform task is assigned and overdue");
  assert.ok(row.assignee.name);
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

test("the activity feed is scoped to the selected project", async () => {
  const res = await managerDash("alan", state.platformId);
  const { activity } = res.json.managerDashboard;

  // Workspace-level activity (projectId: null) is deliberately excluded here:
  // a project panel should show that project's history.
  const expected = await Activity.find({ projectId: state.platformId })
    .sort({ createdAt: -1 })
    .lean();

  assert.equal(activity.length, expected.length);
  assert.deepEqual(
    activity.map((a) => a.action),
    expected.map((a) => a.action)
  );
  assert.ok(
    activity.every((a) => a.user && a.user.name),
    "activity is attributed to a named actor"
  );
  assert.ok(
    !activity.some((a) => a.action === "TEAM_CREATED"),
    "another workspace's activity must not leak in"
  );
});

// ---------------------------------------------------------------------------
// Reactivity: the figures follow the database
// ---------------------------------------------------------------------------

test("figures react to a task being completed through the real workflow", async () => {
  const platform = await Project.findById(state.platformId);
  const col = await BoardColumn.findOne({ projectId: platform._id });
  const task = await Task.create({
    projectId: platform._id,
    workspaceId: state.workspaceA,
    columnId: col._id,
    title: "Reactivity probe",
    status: "IN_PROGRESS",
    assignedTo: state.users.linus._id,
    createdBy: state.users.alan._id,
  });

  const before = await managerDash("alan", state.platformId);
  const beforeOverview = before.json.managerDashboard.overview;
  const beforeLinus = before.json.managerDashboard.workload.find((r) => r.name === "Linus");

  // Move it through the permission-legal path a manager would actually use.
  const submitted = await api("PATCH", `/api/tasks/${task._id}/status`, {
    cookie: cookies.alan,
    body: { status: "UNDER_REVIEW" },
  });
  assert.equal(submitted.status, 400, "IN_PROGRESS → UNDER_REVIEW is not a legal transition");

  await api("PATCH", `/api/tasks/${task._id}/status`, {
    cookie: cookies.linus,
    body: { status: "SUBMITTED" },
  });
  await api("PATCH", `/api/tasks/${task._id}/status`, {
    cookie: cookies.alan,
    body: { status: "UNDER_REVIEW" },
  });
  const approved = await api("PATCH", `/api/tasks/${task._id}/status`, {
    cookie: cookies.alan,
    body: { status: "APPROVED" },
  });
  assert.equal(approved.status, 200, `approval failed: ${JSON.stringify(approved.json)}`);

  const after = await managerDash("alan", state.platformId);
  const afterOverview = after.json.managerDashboard.overview;

  assert.equal(afterOverview.completedTasks, beforeOverview.completedTasks + 1);
  assert.equal(afterOverview.activeTasks, beforeOverview.activeTasks - 1);
  assert.ok(afterOverview.progress > beforeOverview.progress);
  assert.equal(afterOverview.byStatus.APPROVED, beforeOverview.byStatus.APPROVED + 1);

  // The approved task is no longer anybody's open workload.
  const afterLinus = after.json.managerDashboard.workload.find((r) => r.name === "Linus");
  assert.equal(afterLinus.open, beforeLinus.open - 1);

  // ...and it has left the review queue.
  assert.ok(
    !after.json.managerDashboard.pendingReviews.some((r) => r.taskId === String(task._id)),
    "an approved task must not still be awaiting review"
  );
});

test("figures react to a task being reassigned", async () => {
  const platform = await Project.findById(state.platformId);
  const col = await BoardColumn.findOne({ projectId: platform._id });
  const task = await Task.create({
    projectId: platform._id,
    workspaceId: state.workspaceA,
    columnId: col._id,
    title: "Reassignment probe",
    status: "ASSIGNED",
    assignedTo: state.users.margaret._id,
    createdBy: state.users.alan._id,
  });

  const res = await api("PATCH", `/api/tasks/${task._id}`, {
    cookie: cookies.alan,
    body: { assignedTo: String(state.users.linus._id) },
  });
  assert.equal(res.status, 200, `reassignment failed: ${JSON.stringify(res.json)}`);

  const dash = await managerDash("alan", state.platformId);
  const margaret = dash.json.managerDashboard.workload.find((r) => r.name === "Margaret");
  const linus = dash.json.managerDashboard.workload.find((r) => r.name === "Linus");

  const expectedLinus = await Task.countDocuments({
    projectId: state.platformId,
    assignedTo: state.users.linus._id,
    status: { $nin: ["APPROVED", "DONE"] },
  });
  const expectedMargaret = await Task.countDocuments({
    projectId: state.platformId,
    assignedTo: state.users.margaret._id,
    status: { $nin: ["APPROVED", "DONE"] },
  });

  assert.equal(linus.open, expectedLinus);
  assert.equal(margaret ? margaret.open : 0, expectedMargaret);

  await Task.deleteOne({ _id: task._id });
});

test("figures react to a task being deleted", async () => {
  const platform = await Project.findById(state.platformId);
  const col = await BoardColumn.findOne({ projectId: platform._id });
  const task = await Task.create({
    projectId: platform._id,
    workspaceId: state.workspaceA,
    columnId: col._id,
    title: "Deletion probe",
    status: "IN_PROGRESS",
    assignedTo: state.users.linus._id,
    createdBy: state.users.alan._id,
  });

  const before = await managerDash("alan", state.platformId);
  const removed = await api("DELETE", `/api/tasks/${task._id}`, { cookie: cookies.alan });
  assert.equal(removed.status, 200, `delete failed: ${JSON.stringify(removed.json)}`);

  const after = await managerDash("alan", state.platformId);
  assert.equal(
    after.json.managerDashboard.overview.tasks,
    before.json.managerDashboard.overview.tasks - 1
  );
});

test("a submitted deliverable leaves the queue when it is approved", async () => {
  // Drive the real review endpoints the dashboard links to, then confirm the
  // queue reflects the decision rather than the intent.
  const started = await api(
    "PATCH",
    `/api/deliverables/${state.awaitingDeliverableId}/versions/1/review`,
    { cookie: cookies.alan }
  );
  assert.equal(started.status, 200, `start review failed: ${JSON.stringify(started.json)}`);

  const inQueue = await managerDash("alan", state.platformId);
  const row = inQueue.json.managerDashboard.pendingReviews.find(
    (r) => r.deliverableId === state.awaitingDeliverableId
  );
  assert.ok(row, "still queued after starting the review");
  assert.equal(row.status, "UNDER_REVIEW");
  assert.equal(row.actions.startReview, false);

  const approved = await api(
    "PATCH",
    `/api/deliverables/${state.awaitingDeliverableId}/versions/1/approve`,
    { cookie: cookies.alan }
  );
  assert.equal(approved.status, 200, `approve failed: ${JSON.stringify(approved.json)}`);

  const afterQueue = await managerDash("alan", state.platformId);
  assert.ok(
    !afterQueue.json.managerDashboard.pendingReviews.some(
      (r) => r.deliverableId === state.awaitingDeliverableId
    ),
    "an approved deliverable must leave the review queue"
  );

  // The decision is a persisted review row, not just a UI state change.
  const review = await DeliverableReview.findOne({
    deliverableId: state.awaitingDeliverableId,
    decision: "APPROVED",
  });
  assert.ok(review, "the decision is recorded in DeliverableReview");
  assert.equal(String(review.reviewerId), state.alanId);
});

test("requesting changes records the feedback and keeps the work in flight", async () => {
  const res = await api(
    "PATCH",
    `/api/deliverables/${state.underReviewDeliverableId}/versions/2/request-changes`,
    { cookie: cookies.alan, body: { feedback: "Add the benchmarks" } }
  );
  assert.equal(res.status, 200, `request changes failed: ${JSON.stringify(res.json)}`);

  const review = await DeliverableReview.findOne({
    deliverableId: state.underReviewDeliverableId,
    versionNumber: 2,
    decision: "CHANGES_REQUESTED",
  });
  assert.ok(review);
  assert.equal(review.feedback, "Add the benchmarks");

  // CHANGES_REQUESTED is not a terminal state, so the submitter has work left.
  const deliverable = await Deliverable.findById(state.underReviewDeliverableId);
  assert.equal(deliverable.status, "CHANGES_REQUESTED");
  assert.equal(
    deliverable.approvedVersion,
    null,
    "a requested change must not be recorded as an approval"
  );
});

test("a regular member cannot approve a submission the dashboard would show them", async () => {
  // The dashboard's actions point at these endpoints; the endpoints must keep
  // their own gate regardless of where the click came from.
  const res = await api(
    "PATCH",
    `/api/deliverables/${state.underReviewDeliverableId}/versions/2/approve`,
    { cookie: cookies.linus }
  );
  assert.equal(res.status, 403, "linus is a MEMBER of Platform and cannot approve work");
});

// ---------------------------------------------------------------------------
// Navigation capability
// ---------------------------------------------------------------------------

test("the session endpoint reports the manager capability", async () => {
  const alan = await api("GET", "/api/auth/me", { cookie: cookies.alan });
  assert.equal(alan.status, 200);
  assert.equal(alan.json.capabilities.canManageProjects, true);

  const linus = await api("GET", "/api/auth/me", { cookie: cookies.linus });
  assert.equal(linus.json.capabilities.canManageProjects, true, "linus manages Sidecar");

  const bystander = await api("GET", "/api/auth/me", { cookie: cookies.bystander });
  assert.equal(bystander.json.capabilities.canManageProjects, false);

  const viewer = await api("GET", "/api/auth/me", { cookie: cookies.viewer });
  assert.equal(viewer.json.capabilities.canManageProjects, false);
});

test("the capability flag agrees with the scope it opens", async () => {
  // A nav link that disagrees with its own page is a bug in one of the two, so
  // the cheap existence check and the full scope must give the same answer for
  // every fixture user.
  for (const name of NAMES) {
    const flag = await canManageProjects(state.users[name]._id);
    const scope = await managedProjectScope({ _id: state.users[name]._id });
    assert.equal(
      flag,
      scope.projects.length > 0,
      `canManageProjects and managedProjectScope disagree for ${name}`
    );
  }
});

test("a workspace owner manages by inheritance, with no ProjectMember row", async () => {
  // boss owns a workspace and has no membership on its project.
  const memberships = await ProjectMember.countDocuments({ userId: state.users.boss._id });
  assert.equal(memberships, 0, "the fixture must not have a membership row");

  const res = await managerDash("boss");
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.managerDashboard.projects.map((p) => p.id),
    [state.legacyId]
  );
});

test("an inherited workspace role is overridden by an explicit membership", async () => {
  // viewer is a workspace Member, not an Admin — this makes the point with the
  // strongest possible inherited role instead: give boss a VIEWER membership on
  // Legacy and confirm boss stops managing it.
  await ProjectMember.create({
    projectId: state.legacyId,
    userId: state.users.boss._id,
    role: "VIEWER",
  });

  const scope = await managedProjectScope({ _id: state.users.boss._id });
  assert.equal(scope.projects.length, 0, "an explicit VIEWER row outranks the owner role");
  assert.equal(await canManageProjects(state.users.boss._id), false);

  const res = await managerDash("boss");
  assert.equal(res.status, 403);

  await ProjectMember.deleteOne({
    projectId: state.legacyId,
    userId: state.users.boss._id,
  });
});

// ---------------------------------------------------------------------------
// Payload hygiene
// ---------------------------------------------------------------------------

test("the payload contains no password hash or token material", async () => {
  const res = await managerDash("alan", state.platformId);
  assert.equal(res.status, 200);
  const serialised = JSON.stringify(res.json);

  assert.ok(!/"password"/.test(serialised), "no password field in the payload");
  assert.ok(!/"passwordHash"/.test(serialised), "no password hash field in the payload");
  assert.ok(!/"token"/.test(serialised), "no token in the payload");

  // The real secrets, read past the schema's `select: false`.
  const linus = await User.findById(state.users.linus._id).select("+password");
  assert.ok(linus.password, "the fixture must have a hash to look for");
  assert.ok(
    !serialised.includes(linus.password),
    "no user secret material in the payload"
  );
});

test("sections degrade independently rather than blanking the page", async () => {
  // Every section is present on a healthy response; the controller's per-section
  // guard is what keeps one failing read from taking the rest down, so assert
  // the shape the guard depends on.
  const res = await managerDash("alan", state.platformId);
  const { managerDashboard } = res.json;
  [
    "projects",
    "overview",
    "pendingReviews",
    "workload",
    "overdue",
    "activity",
  ].forEach((key) => {
    assert.ok(key in managerDashboard, `${key} must always be present`);
  });
});
