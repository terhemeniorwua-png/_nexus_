"use strict";

// Phase 6 — Authorization integration tests.
//
// Runs against a dedicated MongoDB database (nexus_authz_test) using only
// Node's built-in test runner (node:test) and global fetch. No new
// dependencies are required.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_authz_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-authz-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";

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
const Document = require("../src/models/document.model");
const Activity = require("../src/models/activity.model");
const app = require("../src/app");

const PASSWORD = "Password123!";
const USER_NAMES = ["ada", "alan", "linus", "margaret", "katherine", "grace", "barbara", "nate", "outsider"];

let server;
let base;
const state = {};
const cookies = {};

async function api(method, path, { cookie, body, form } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response body
  }
  return { status: res.status, json };
}

// Deliverable uploads are multipart since Phase 12. These bytes really are a
// PDF: the storage service checks magic bytes, not the file name.
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n" + "x".repeat(200));

function pdfForm({ name = "spec.pdf", description } = {}) {
  const form = new FormData();
  form.append("file", new Blob([PDF_BYTES], { type: "application/pdf" }), name);
  if (description) form.append("description", description);
  return form;
}

async function login(email) {
  const res = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.json && res.json.message}`);
  const token = res.json.token;
  assert.ok(token, "login did not return a token");
  return `nexus_token=${token}`;
}

async function buildFixtures() {
  // --- Users -------------------------------------------------------------
  const users = {};
  for (const name of USER_NAMES) {
    users[name] = await User.create({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: `${name}@acme.test`,
      password: PASSWORD,
    });
    state[`${name}Id`] = String(users[name]._id);
  }

  // --- Workspace ----------------------------------------------------------
  const workspace = await Workspace.create({
    name: "Acme Research",
    description: "Internal workspace",
    ownerId: users.ada._id,
  });
  state.workspaceId = String(workspace._id);

  const roleMap = {
    ada: "Admin", // owner (membership is conventional)
    alan: "Admin",
    linus: "Member",
    margaret: "Member",
    katherine: "Member",
    grace: "Member",
    barbara: "Viewer",
    nate: "Member",
    // outsider deliberately has NO workspace membership.
  };
  await WorkspaceMember.insertMany(
    Object.entries(roleMap).map(([name, role]) => ({
      workspaceId: workspace._id,
      userId: users[name]._id,
      role,
    }))
  );

  // --- Projects ------------------------------------------------------------
  const mkProject = async (name, manager) =>
    Project.create({
      workspaceId: workspace._id,
      name,
      description: name,
      managerId: manager._id,
      createdBy: manager._id,
    });

  const platform = await mkProject("Nexus Platform Build", users.alan);
  const benchmark = await mkProject("AI Benchmark Suite", users.katherine);
  const designSystem = await mkProject("Design System", users.grace);

  state.platformId = String(platform._id);
  state.benchmarkId = String(benchmark._id);
  state.designSystemId = String(designSystem._id);
  state.adaId = String(users.ada._id);

  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.margaret._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.ada._id, role: "COLLABORATOR" },
    { projectId: benchmark._id, userId: users.katherine._id, role: "PROJECT_MANAGER" },
    { projectId: benchmark._id, userId: users.ada._id, role: "COLLABORATOR" },
    { projectId: designSystem._id, userId: users.grace._id, role: "PROJECT_MANAGER" },
    { projectId: designSystem._id, userId: users.margaret._id, role: "COLLABORATOR" },
    { projectId: designSystem._id, userId: users.barbara._id, role: "VIEWER" },
  ]);

  // --- Board columns + tasks ----------------------------------------------
  const mkColumns = async (projectId) => {
    const cols = {};
    for (const [i, name] of ["To Do", "In Progress", "Done"].entries()) {
      cols[name] = await BoardColumn.create({ projectId, name, position: i });
    }
    return cols;
  };

  const platformCols = await mkColumns(platform._id);
  const benchmarkCols = await mkColumns(benchmark._id);
  const designCols = await mkColumns(designSystem._id);

  const socketTask = await Task.create({
    projectId: platform._id,
    columnId: platformCols["In Progress"]._id,
    title: "Socket auth handshake",
    status: "APPROVED",
    assignedTo: users.linus._id,
    createdBy: users.alan._id,
  });
  const authTask = await Task.create({
    projectId: platform._id,
    columnId: platformCols["In Progress"]._id,
    title: "Auth API spec",
    status: "SUBMITTED",
    assignedTo: users.margaret._id,
    createdBy: users.alan._id,
  });
  const dataTask = await Task.create({
    projectId: benchmark._id,
    columnId: benchmarkCols["To Do"]._id,
    title: "Benchmark data pipeline",
    assignedTo: users.katherine._id,
    createdBy: users.katherine._id,
  });
  const designTask = await Task.create({
    projectId: designSystem._id,
    columnId: designCols["To Do"]._id,
    title: "Design tokens",
    assignedTo: users.grace._id,
    createdBy: users.grace._id,
  });

  state.socketTaskId = String(socketTask._id);
  state.authTaskId = String(authTask._id);
  state.dataTaskId = String(dataTask._id);
  state.designTaskId = String(designTask._id);
  state.platformDoneColumnId = String(platformCols["Done"]._id);

  // --- Deliverables (Phase 12 aggregate + versions + reviews) ---------------
  const platformTasks = {
    workspaceId: workspace._id,
    projectId: platform._id,
  };

  const authDeliverable = await Deliverable.create({
    ...platformTasks,
    taskId: authTask._id,
    createdBy: users.margaret._id,
    title: "Auth spec v1",
    status: "SUBMITTED",
    currentVersion: 1,
  });
  const socketDeliverable = await Deliverable.create({
    ...platformTasks,
    taskId: socketTask._id,
    createdBy: users.linus._id,
    title: "Socket impl",
    status: "APPROVED",
    currentVersion: 1,
    approvedVersion: 1,
  });
  const designDeliverable = await Deliverable.create({
    workspaceId: workspace._id,
    projectId: designSystem._id,
    taskId: designTask._id,
    createdBy: users.grace._id,
    title: "Button tokens",
    status: "APPROVED",
    currentVersion: 1,
    approvedVersion: 1,
  });

  state.authDeliverableId = String(authDeliverable._id);
  state.socketDeliverableId = String(socketDeliverable._id);
  state.designDeliverableId = String(designDeliverable._id);

  const versionFor = (deliverable, { number = 1, status, submitter, at, fileName }) =>
    DeliverableVersion.create({
      deliverableId: deliverable._id,
      versionNumber: number,
      status,
      fileName: fileName || `v${number}.pdf`,
      storageKey: `deliverables/${workspace._id}/${deliverable.projectId}/${deliverable._id}/v${number}.pdf`,
      fileUrl: `/api/deliverables/${deliverable._id}/file/v${number}.pdf`,
      fileSize: PDF_BYTES.length,
      mimeType: "application/pdf",
      checksum: "b".repeat(64),
      submittedBy: submitter,
      submittedAt: at,
    });

  await versionFor(authDeliverable, {
    status: "SUBMITTED",
    submitter: users.margaret._id,
    at: new Date("2026-02-10"),
  });
  const socketVersion = await versionFor(socketDeliverable, {
    status: "APPROVED",
    submitter: users.linus._id,
    at: new Date("2026-02-14"),
  });
  await versionFor(designDeliverable, {
    status: "APPROVED",
    submitter: users.grace._id,
    at: new Date("2026-02-16"),
  });

  await DeliverableReview.create({
    deliverableId: socketDeliverable._id,
    deliverableVersionId: socketVersion._id,
    versionNumber: 1,
    reviewerId: users.alan._id,
    decision: "APPROVED",
    feedback: "Merged.",
    reviewedAt: new Date("2026-02-15"),
  });

  // --- Documents ------------------------------------------------------------
  const platformDoc = await Document.create({
    workspaceId: workspace._id,
    projectId: platform._id,
    title: "Platform onboarding",
    content: "docs",
    createdBy: users.alan._id,
  });
  const benchmarkDoc = await Document.create({
    workspaceId: workspace._id,
    projectId: benchmark._id,
    title: "Benchmark methodology",
    content: "docs",
    createdBy: users.katherine._id,
  });
  const designDoc = await Document.create({
    workspaceId: workspace._id,
    projectId: designSystem._id,
    title: "Design system guide",
    content: "docs",
    createdBy: users.grace._id,
  });

  state.platformDocId = String(platformDoc._id);
  state.benchmarkDocId = String(benchmarkDoc._id);
  state.designDocId = String(designDoc._id);

  // --- Activity -------------------------------------------------------------
  await Activity.create({
    workspaceId: workspace._id,
    projectId: benchmark._id,
    userId: users.katherine._id,
    action: "TASK_CREATED",
    targetType: "task",
    targetId: dataTask._id,
  });
  await Activity.create({
    workspaceId: workspace._id,
    projectId: platform._id,
    userId: users.linus._id,
    action: "TASK_MOVED",
    targetType: "task",
    targetId: socketTask._id,
  });
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

// Helper path builders ---------------------------------------------------------
const ws = (id) => `/api/workspaces/${id}`;
const projectUrl = (id) => `${ws(state.workspaceId)}/projects/${id}`;

// ---------------------------------------------------------------------------
// 401 / 403 basics
// ---------------------------------------------------------------------------

test("server is healthy", async () => {
  const res = await api("GET", "/api/health");
  assert.equal(res.status, 200);
});

test("protected routes reject missing tokens with 401", async () => {
  const res = await api("GET", `${projectUrl(state.platformId)}/board`);
  assert.equal(res.status, 401);
  assert.equal(res.json.message, "Authentication required");
});

test("protected routes reject invalid tokens with 401", async () => {
  const res = await api("GET", `${projectUrl(state.platformId)}/board`, {
    cookie: "nexus_token=not-a-real-jwt",
  });
  assert.equal(res.status, 401);
});

test("users outside a workspace get 403 on workspace routes", async () => {
  const res = await api("GET", ws(state.workspaceId), { cookie: cookies.outsider });
  assert.equal(res.status, 403);
  assert.match(res.json.message, /do not have access/i);
});

test("workspace Viewer can read members but cannot manage the workspace", async () => {
  const read = await api("GET", `${ws(state.workspaceId)}/members`, { cookie: cookies.barbara });
  assert.equal(read.status, 200);

  const manage = await api("PATCH", ws(state.workspaceId), {
    cookie: cookies.barbara,
    body: { name: "Should not apply" },
  });
  assert.equal(manage.status, 403);

  const addMember = await api("POST", `${ws(state.workspaceId)}/members`, {
    cookie: cookies.barbara,
    body: { email: "outsider@acme.test", role: "Member" },
  });
  assert.equal(addMember.status, 403);
});

// ---------------------------------------------------------------------------
// Project access
// ---------------------------------------------------------------------------

test("regular workspace members without project membership are denied (403)", async () => {
  // linus is a workspace member but not a member of benchmark / designSystem.
  for (const projectId of [state.benchmarkId, state.designSystemId]) {
    const res = await api("GET", `${projectUrl(projectId)}/board`, { cookie: cookies.linus });
    assert.equal(res.status, 403);
    assert.match(res.json.message, /do not have access to this project/i);
  }

  // barbara (Viewer) is not a member of platform.
  const res = await api("GET", `${projectUrl(state.platformId)}/board`, { cookie: cookies.barbara });
  assert.equal(res.status, 403);
});

test("authorized project members can open their boards", async () => {
  const cases = [
    [cookies.linus, state.platformId, 200],
    [cookies.margaret, state.platformId, 200],
    [cookies.katherine, state.benchmarkId, 200],
    [cookies.margaret, state.designSystemId, 200],
    [cookies.barbara, state.designSystemId, 200],
  ];
  for (const [cookie, projectId, expected] of cases) {
    const res = await api("GET", `${projectUrl(projectId)}/board`, { cookie });
    assert.equal(res.status, expected, `board ${projectId}`);
  }
});

test("workspace owner and admin derive project access across the workspace", async () => {
  const adaBenchmark = await api("GET", `${projectUrl(state.benchmarkId)}/board`, { cookie: cookies.ada });
  assert.equal(adaBenchmark.status, 200);

  const alanDesign = await api("GET", `${projectUrl(state.designSystemId)}/board`, { cookie: cookies.alan });
  assert.equal(alanDesign.status, 200);
});

test("cross-team collaborator is allowed only on the permitted project", async () => {
  // margaret is COLLABORATOR on designSystem but has no role on benchmark.
  const design = await api("GET", `${projectUrl(state.designSystemId)}/board`, { cookie: cookies.margaret });
  assert.equal(design.status, 200);

  const benchmark = await api("GET", `${projectUrl(state.benchmarkId)}/board`, { cookie: cookies.margaret });
  assert.equal(benchmark.status, 403);
});

// ---------------------------------------------------------------------------
// Project listing filtering
// ---------------------------------------------------------------------------

test("project listing is filtered by accessibility", async () => {
  const names = async (cookie) => {
    const res = await api("GET", `${ws(state.workspaceId)}/projects`, { cookie });
    assert.equal(res.status, 200);
    return (res.json.projects || []).map((p) => p.name).sort();
  };

  assert.deepEqual(await names(cookies.linus), ["Nexus Platform Build"]);
  assert.deepEqual(await names(cookies.margaret), ["Design System", "Nexus Platform Build"]);
  assert.deepEqual(await names(cookies.barbara), ["Design System"]);
  assert.deepEqual(await names(cookies.katherine), ["AI Benchmark Suite"]);
  assert.deepEqual(await names(cookies.alan), [
    "AI Benchmark Suite",
    "Design System",
    "Nexus Platform Build",
  ]);

  // Roles attached per project.
  const res = await api("GET", `${ws(state.workspaceId)}/projects`, { cookie: cookies.margaret });
  const platform = res.json.projects.find((p) => p.id === state.platformId);
  const design = res.json.projects.find((p) => p.id === state.designSystemId);
  assert.equal(platform.role, "MEMBER");
  assert.equal(design.role, "COLLABORATOR");
});

// ---------------------------------------------------------------------------
// Task-level permissions
// ---------------------------------------------------------------------------

test("task creation respects project permissions and the assign_task gate", async () => {
  // MEMBER cannot create tasks at all.
  const memberCreate = await api("POST", `${projectUrl(state.platformId)}/tasks`, {
    cookie: cookies.margaret,
    body: { title: "Member-created task", status: "TO DO", assignedTo: state.linusId },
  });
  assert.equal(memberCreate.status, 403);

  // PROJECT_MANAGER may create tasks and assign them to other people.
  // (Phase 10 rule: the assignee must be a member of the project, so the PM
  // assigns the benchmark collaborator ada rather than off-project margaret.)
  const pmCreate = await api("POST", `${projectUrl(state.benchmarkId)}/tasks`, {
    cookie: cookies.katherine,
    body: { title: "PM-created task", status: "TO DO", assignedTo: state.adaId },
  });
  assert.equal(pmCreate.status, 201);
  assert.equal(String(pmCreate.json.task.assignedTo.id), state.adaId);
});

test("task ownership restricts update to assignee/creator for members", async () => {
  // margaret is the assignee of authTask → allowed.
  const own = await api("PATCH", `${projectUrl(state.platformId)}/tasks/${state.authTaskId}`, {
    cookie: cookies.margaret,
    body: { description: "updated by assignee" },
  });
  assert.equal(own.status, 200);

  // linus is not the assignee nor creator of authTask → denied.
  const other = await api("PATCH", `${projectUrl(state.platformId)}/tasks/${state.authTaskId}`, {
    cookie: cookies.linus,
    body: { description: "nope" },
  });
  assert.equal(other.status, 403);
  assert.match(other.json.message, /only modify tasks assigned to you/i);
});

test("deliverable submission requires create_deliverable plus task ownership", async () => {
  // A client-supplied fileUrl is not a submission: the route takes multipart,
  // so a JSON body carries no file and is refused (§22).
  const jsonInstead = await api("POST", `${projectUrl(state.benchmarkId)}/tasks/${state.dataTaskId}/deliverables`, {
    cookie: cookies.katherine,
    body: { title: "Benchmark v1", fileUrl: "https://example.test/bench-v1.pdf" },
  });
  assert.equal(jsonInstead.status, 400);

  // The assignee of that task can submit for real.
  const real = await api("POST", `${projectUrl(state.benchmarkId)}/tasks/${state.dataTaskId}/deliverables`, {
    cookie: cookies.katherine,
    form: pdfForm({ name: "bench-v1.pdf" }),
  });
  assert.equal(real.status, 201, JSON.stringify(real.json));
  assert.equal(real.json.deliverable.taskId, state.dataTaskId);

  // authTask already carries a deliverable: a second one is a conflict, not a
  // second aggregate.
  const duplicate = await api("POST", `${projectUrl(state.platformId)}/tasks/${state.authTaskId}/deliverables`, {
    cookie: cookies.margaret,
    form: pdfForm({ name: "auth-v2.pdf" }),
  });
  assert.equal(duplicate.status, 409);

  // linus is neither assignee nor creator of authTask → ownership fails.
  const notOwner = await api("POST", `${projectUrl(state.platformId)}/tasks/${state.authTaskId}/deliverables`, {
    cookie: cookies.linus,
    form: pdfForm({ name: "x.pdf" }),
  });
  assert.equal(notOwner.status, 403);
});

test("deliverable decisions are restricted to managers, owners and admins", async () => {
  const versionUrl = (id, n) => `/api/deliverables/${id}/versions/${n}`;

  // MEMBER (margaret) cannot approve.
  const memberApprove = await api("PATCH", `${versionUrl(state.authDeliverableId, 1)}/approve`, {
    cookie: cookies.margaret,
    body: { decision: "APPROVED", feedback: "fine" },
  });
  assert.equal(memberApprove.status, 403);

  // margaret submitted this version herself, so even a manager-permitted
  // reviewer other than her cannot shortcut the review step.
  const memberReview = await api("PATCH", `${versionUrl(state.authDeliverableId, 1)}/review`, {
    cookie: cookies.linus,
    body: {},
  });
  assert.equal(memberReview.status, 403);

  // PROJECT_MANAGER (alan) opens the review and approves.
  const start = await api("PATCH", `${versionUrl(state.authDeliverableId, 1)}/review`, {
    cookie: cookies.alan,
    body: {},
  });
  assert.equal(start.status, 200, JSON.stringify(start.json));

  const approve = await api("PATCH", `${versionUrl(state.authDeliverableId, 1)}/approve`, {
    cookie: cookies.alan,
    body: { feedback: "Looks good" },
  });
  assert.equal(approve.status, 200, JSON.stringify(approve.json));
  assert.equal(approve.json.deliverable.status, "APPROVED");
  assert.equal(approve.json.deliverable.approvedVersion, 1);

  // Approved work is final: no further version from the submitter.
  const another = await api("POST", `/api/deliverables/${state.authDeliverableId}/versions`, {
    cookie: cookies.margaret,
    form: pdfForm({ name: "v2.pdf" }),
  });
  assert.equal(another.status, 400);
});

test("Viewer can read deliverables but cannot submit or review", async () => {
  const list = await api("GET", `${projectUrl(state.designSystemId)}/deliverables`, { cookie: cookies.barbara });
  assert.equal(list.status, 200);

  const design = await api("GET", `/api/deliverables/${state.designDeliverableId}`, {
    cookie: cookies.barbara,
  });
  assert.equal(design.status, 200);
  assert.equal(design.json.deliverable.title, "Button tokens");
  assert.equal(design.json.versions.length, 1);

  const review = await api("PATCH", `/api/deliverables/${state.designDeliverableId}/versions/1/approve`, {
    cookie: cookies.barbara,
    body: { decision: "APPROVED" },
  });
  assert.equal(review.status, 403);

  const submit = await api("POST", `${projectUrl(state.designSystemId)}/tasks/${state.designTaskId}/deliverables`, {
    cookie: cookies.barbara,
    form: pdfForm({ name: "x.pdf" }),
  });
  assert.equal(submit.status, 403);
});

// ---------------------------------------------------------------------------
// Reassignment (runs after the deliverable review tests so margaret is still
// the assignee of authTask when the submission test above ran)
// ---------------------------------------------------------------------------

test("reassignment requires assign_task and is otherwise ignored", async () => {
  // linus is the assignee of socketTask; MEMBER → cannot reassign. Response keeps linus.
  const memberReassign = await api("PATCH", `${projectUrl(state.platformId)}/tasks/${state.socketTaskId}`, {
    cookie: cookies.linus,
    body: { assignedTo: state.margaretId },
  });
  assert.equal(memberReassign.status, 200);
  assert.equal(String(memberReassign.json.task.assignedTo.id), state.linusId);

  // margaret (MEMBER, assignee of authTask) cannot reassign a task either.
  const margaretReassign = await api("PATCH", `${projectUrl(state.platformId)}/tasks/${state.authTaskId}`, {
    cookie: cookies.margaret,
    body: { assignedTo: state.linusId },
  });
  assert.equal(margaretReassign.status, 200);
  assert.equal(String(margaretReassign.json.task.assignedTo.id), state.margaretId);

  // alan (PROJECT_MANAGER) can reassign to another project member.
  const pmReassign = await api("PATCH", `${projectUrl(state.platformId)}/tasks/${state.authTaskId}`, {
    cookie: cookies.alan,
    body: { assignedTo: state.linusId },
  });
  assert.equal(pmReassign.status, 200);
  assert.equal(String(pmReassign.json.task.assignedTo.id), state.linusId);
});

// ---------------------------------------------------------------------------
// Project member management
// ---------------------------------------------------------------------------

test("project member management requires invite / remove permissions", async () => {
  // alan (PROJECT_MANAGER + workspace admin) can invite.
  const invite = await api("POST", `${projectUrl(state.platformId)}/members`, {
    cookie: cookies.alan,
    body: { userId: state.nateId, role: "MEMBER" },
  });
  assert.equal(invite.status, 201);

  // Duplicate invite → 409.
  const duplicate = await api("POST", `${projectUrl(state.platformId)}/members`, {
    cookie: cookies.alan,
    body: { userId: state.nateId, role: "MEMBER" },
  });
  assert.equal(duplicate.status, 409);

  // MEMBER (margaret / linus) cannot invite.
  for (const who of ["margaret", "linus"]) {
    const denied = await api("POST", `${projectUrl(state.platformId)}/members`, {
      cookie: cookies[who],
      body: { userId: state.katherineId, role: "MEMBER" },
    });
    assert.equal(denied.status, 403);
  }

  // MEMBER cannot remove members.
  const removeDenied = await api("DELETE", `${projectUrl(state.platformId)}/members/${state.katherineId}`, {
    cookie: cookies.linus,
  });
  assert.equal(removeDenied.status, 403);
});

test("only workspace owners/admins can grant PROJECT_MANAGER", async () => {
  // katherine (PROJECT_MANAGER, not workspace admin/owner) cannot grant PM.
  const denied = await api("PATCH", `${projectUrl(state.benchmarkId)}/members/${state.linusId}`, {
    cookie: cookies.katherine,
    body: { role: "PROJECT_MANAGER" },
  });
  assert.equal(denied.status, 403);

  // alan (workspace admin) may grant PM on the project he manages.
  const granted = await api("PATCH", `${projectUrl(state.platformId)}/members/${state.nateId}`, {
    cookie: cookies.alan,
    body: { role: "PROJECT_MANAGER" },
  });
  assert.equal(granted.status, 200);
  assert.equal(granted.json.member.role, "PROJECT_MANAGER");

  // nate (a project manager, not workspace admin) cannot promote himself.
  const selfPromote = await api("PATCH", `${projectUrl(state.platformId)}/members/${state.nateId}`, {
    cookie: cookies.nate,
    body: { role: "PROJECT_MANAGER" },
  });
  assert.equal(selfPromote.status, 403);
});

test("a newly invited member can access the project only after being invited", async () => {
  const before = await api("GET", `${projectUrl(state.designSystemId)}/board`, { cookie: cookies.nate });
  assert.equal(before.status, 403);

  const after = await api("GET", `${projectUrl(state.platformId)}/board`, { cookie: cookies.nate });
  assert.equal(after.status, 200);
});

// ---------------------------------------------------------------------------
// Task reordering
// ---------------------------------------------------------------------------

test("task reorder respects project access and ownership", async () => {
  const reorder = (cookie, taskId) =>
    api("PATCH", "/api/tasks/reorder", {
      cookie,
      body: { taskId, destinationColumnId: state.platformDoneColumnId, newPosition: 0 },
    });

  // linus: his own task → allowed.
  const own = await reorder(cookies.linus, state.socketTaskId);
  assert.equal(own.status, 200);

  // margaret: not her task → denied by ownership.
  const notOwn = await reorder(cookies.margaret, state.socketTaskId);
  assert.equal(notOwn.status, 403);

  // katherine (PROJECT_MANAGER of benchmark) trying to move a platform task → 403.
  const crossProject = await reorder(cookies.katherine, state.socketTaskId);
  assert.equal(crossProject.status, 403);
});

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

test("document listing hides project-scoped documents the user cannot access", async () => {
  const res = await api("GET", `${ws(state.workspaceId)}/documents`, { cookie: cookies.margaret });
  assert.equal(res.status, 200);
  const ids = res.json.documents.map((d) => String(d.id));
  assert.ok(ids.includes(state.platformDocId), "should include the platform doc");
  assert.ok(ids.includes(state.designDocId), "should include the design doc");
  assert.ok(!ids.includes(state.benchmarkDocId), "must NOT expose the benchmark doc");
});

test("project-scoped documents enforce project access", async () => {
  const margaretPlatform = await api("GET", `${ws(state.workspaceId)}/documents/${state.platformDocId}`, {
    cookie: cookies.margaret,
  });
  assert.equal(margaretPlatform.status, 200);

  const margaretBenchmark = await api("GET", `${ws(state.workspaceId)}/documents/${state.benchmarkDocId}`, {
    cookie: cookies.margaret,
  });
  assert.equal(margaretBenchmark.status, 403);

  const linusDesign = await api("GET", `${ws(state.workspaceId)}/documents/${state.designDocId}`, {
    cookie: cookies.linus,
  });
  assert.equal(linusDesign.status, 403);

  const barbaraDesign = await api("GET", `${ws(state.workspaceId)}/documents/${state.designDocId}`, {
    cookie: cookies.barbara,
  });
  assert.equal(barbaraDesign.status, 200);
});

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

test("activity feed hides project-scoped entries from inaccessible projects", async () => {
  const linusFeed = await api("GET", `${ws(state.workspaceId)}/activity`, { cookie: cookies.linus });
  assert.equal(linusFeed.status, 200);
  const linusProjects = (linusFeed.json.activities || []).map((a) => String(a.projectId || ""));
  assert.ok(linusProjects.includes(state.platformId), "should include platform activity");
  assert.ok(!linusProjects.includes(state.benchmarkId), "must NOT include benchmark activity");

  const adaFeed = await api("GET", `${ws(state.workspaceId)}/activity`, { cookie: cookies.ada });
  assert.equal(adaFeed.status, 200);
  const adaProjects = (adaFeed.json.activities || []).map((a) => String(a.projectId || ""));
  assert.ok(adaProjects.includes(state.benchmarkId), "owner should see benchmark activity");
});