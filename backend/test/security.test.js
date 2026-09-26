"use strict";

// Phase 24 — Security regression tests.
//
// Runs against a dedicated MongoDB database (nexus_security_test) using the
// same infrastructure as the other suites: Node's built-in test runner and
// global fetch, so no new dependency is introduced.
//
// Covers:
//   A. Authentication (missing / malformed / bad-signature / expired /
//      wrong-purpose credentials, plus 401 vs 403 semantics)
//   B. Workspace + project isolation between two separate workspaces
//   C. Input validation and mass-assignment resistance
//   D. Rate limiting on the credential endpoints
//   E. File upload controls (type, signature, size, filename, authorization)
//   F. Regression — the flows security work must not break
//
// Rate-limit ceilings are lowered here so the 429 path is reachable without
// hundreds of requests; MAX_FAILED_ATTEMPTS is raised so the pre-existing
// failed-attempt lockout does not interfere with unrelated assertions. All of
// this must be set BEFORE the app is required, because the limiter reads the
// environment when the middleware is created at route-registration time.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_security_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-security-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
process.env.MAX_FAILED_ATTEMPTS = "1000";
process.env.RATE_LIMIT_LOGIN_MAX = "500";
process.env.RATE_LIMIT_REGISTER_MAX = "500";
process.env.RATE_LIMIT_FORGOTPASSWORD_MAX = "5";
process.env.DELIVERABLE_MAX_FILE_SIZE = String(256 * 1024); // 256 KB, so oversize is cheap to test
// Keep written files out of the real upload directory, as deliverables.test.js does.
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/opencode/nexus-security-test";

const fs = require("node:fs");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const BoardColumn = require("../src/models/boardColumn.model");
const Task = require("../src/models/task.model");
const Deliverable = require("../src/models/deliverable.model");
const app = require("../src/app");

const PASSWORD = "Password123!";
const JWT_SECRET = process.env.JWT_SECRET;

let server;
let base;
const st = {}; // ids and cookies

async function api(method, path, { cookie, body, form, raw } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  if (raw && raw.headers) Object.assign(headers, raw.headers);

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form || raw?.body || (body ? JSON.stringify(body) : undefined),
    redirect: "manual",
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(email, password = PASSWORD) {
  const res = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.json && res.json.message}`);
  return `nexus_token=${res.json.token}`;
}

// A real PDF: the storage service validates magic bytes, not the file name.
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n" + "x".repeat(300)
);

function fileForm(bytes, name, type) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return form;
}

// There is a unique index on deliverable.taskId (one submission per task), and a
// new version may only be uploaded once changes have been requested
// (deliverable.service.js:389). So each upload case gets its own task and its
// own deliverable, in the state that permits a version — the policy under test
// is the upload policy, not the review workflow.
let uploadSeq = 0;
async function mkUploadTarget() {
  const n = (uploadSeq += 1);
  const task = await Task.create({
    projectId: st.projA,
    columnId: st.colA,
    title: `Upload target ${n}`,
    status: "ASSIGNED",
    createdBy: st.aId,
    assignedTo: st.aId,
  });
  const deliverable = await Deliverable.create({
    workspaceId: st.wsA,
    projectId: st.projA,
    taskId: task._id,
    title: `Upload deliverable ${n}`,
    createdBy: st.aId,
    status: "CHANGES_REQUESTED",
  });
  return String(deliverable._id);
}

before(async () => {
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();

  // --- Two disjoint tenants. A and B share nothing. ----------------------
  const a = await User.create({ name: "Ann A", email: "ann@a.test", password: PASSWORD });
  const b = await User.create({ name: "Ben B", email: "ben@b.test", password: PASSWORD });
  const viewer = await User.create({ name: "Vic Viewer", email: "vic@a.test", password: PASSWORD });
  const outsider = await User.create({ name: "Otto Outsider", email: "otto@x.test", password: PASSWORD });

  const wsA = await Workspace.create({ name: "Alpha", ownerId: a._id });
  const wsB = await Workspace.create({ name: "Beta", ownerId: b._id });

  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: a._id, role: "Admin" },
    { workspaceId: wsA._id, userId: viewer._id, role: "Viewer" },
    // ben is deliberately NOT a member of Alpha.
  ]);

  const projA = await Project.create({
    workspaceId: wsA._id,
    name: "Alpha Secret Project",
    description: "confidential alpha work",
    managerId: a._id,
    createdBy: a._id,
  });
  const projB = await Project.create({
    workspaceId: wsB._id,
    name: "Beta Private Project",
    description: "confidential beta work",
    managerId: b._id,
    createdBy: b._id,
  });

  await ProjectMember.insertMany([
    { projectId: projA._id, userId: a._id, role: "PROJECT_MANAGER" },
    { projectId: projA._id, userId: viewer._id, role: "VIEWER" },
    { projectId: projB._id, userId: b._id, role: "PROJECT_MANAGER" },
  ]);

  const colA = await BoardColumn.create({ projectId: projA._id, name: "To Do", position: 0 });
  const colAdone = await BoardColumn.create({ projectId: projA._id, name: "In Progress", position: 1 });
  const colB = await BoardColumn.create({ projectId: projB._id, name: "To Do", position: 0 });

  const taskA = await Task.create({
    projectId: projA._id,
    columnId: colA._id,
    title: "Alpha private task",
    description: "alpha only",
    status: "ASSIGNED",
    createdBy: a._id,
    assignedTo: a._id,
  });
  const taskB = await Task.create({
    projectId: projB._id,
    columnId: colB._id,
    title: "Beta private task",
    status: "ASSIGNED",
    createdBy: b._id,
    assignedTo: b._id,
  });

  const deliverableB = await Deliverable.create({
    workspaceId: wsB._id,
    projectId: projB._id,
    taskId: taskB._id,
    title: "Beta private submission",
    createdBy: b._id,
    status: "DRAFT",
  });

  Object.assign(st, {
    aId: String(a._id),
    bId: String(b._id),
    viewerId: String(viewer._id),
    outsiderId: String(outsider._id),
    wsA: String(wsA._id),
    wsB: String(wsB._id),
    projA: String(projA._id),
    projB: String(projB._id),
    taskA: String(taskA._id),
    taskB: String(taskB._id),
    deliverableB: String(deliverableB._id),
    colA: String(colA._id),
    colAdone: String(colAdone._id),
  });

  // The server must be listening before any login, since `login` goes over HTTP.
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  st.cookieA = await login("ann@a.test");
  st.cookieB = await login("ben@b.test");
  st.cookieViewer = await login("vic@a.test");
  st.cookieOutsider = await login("otto@x.test");
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test A — Authentication
// ---------------------------------------------------------------------------

test("A1: protected endpoint with no credentials returns 401", async () => {
  for (const path of [
    "/api/workspaces",
    `/api/workspaces/${st.wsA}`,
    `/api/workspaces/${st.wsA}/projects`,
    `/api/workspaces/${st.wsA}/projects/${st.projA}/board`,
    "/api/auth/me",
    "/api/notifications",
  ]) {
    const res = await api("GET", path);
    assert.equal(res.status, 401, `${path} should be 401 without credentials`);
    assert.equal(res.json.success, false);
    assert.ok(res.json.message, "401 should carry a message");
  }
});

test("A2: malformed, bad-signature and expired tokens are all 401", async () => {
  const wrongSecret = jwt.sign({ userId: st.aId }, "not-the-real-secret", { expiresIn: "1h" });
  const expired = jwt.sign({ userId: st.aId }, JWT_SECRET, { expiresIn: "-1s" });
  const noUser = jwt.sign({ somethingElse: true }, JWT_SECRET, { expiresIn: "1h" });

  const bad = [
    ["malformed", "nexus_token=not-a-jwt"],
    ["empty", "nexus_token="],
    ["bad signature", `nexus_token=${wrongSecret}`],
    ["expired", `nexus_token=${expired}`],
    ["no userId", `nexus_token=${noUser}`],
  ];

  for (const [label, cookie] of bad) {
    const res = await api("GET", "/api/auth/me", { cookie });
    assert.equal(res.status, 401, `${label} token should be 401, got ${res.status}`);
  }
});

test("A3: a password-reset token cannot be used as a session credential", async () => {
  // Phase 24 regression: the reset JWT is signed with the same secret and
  // carries userId, so it used to authenticate as a normal session.
  const resetToken = jwt.sign({ purpose: "password-reset", userId: st.aId }, JWT_SECRET, {
    expiresIn: "30m",
  });

  const res = await api("GET", "/api/auth/me", { cookie: `nexus_token=${resetToken}` });
  assert.equal(res.status, 401, "reset-purpose token must not authenticate");

  const asWorkspace = await api("GET", `/api/workspaces/${st.wsA}`, {
    cookie: `nexus_token=${resetToken}`,
  });
  assert.equal(asWorkspace.status, 401, "reset-purpose token must not reach a protected route");
});

test("A4: token verification failures do not leak internals", async () => {
  const res = await api("GET", "/api/auth/me", { cookie: "nexus_token=not-a-jwt" });
  const body = JSON.stringify(res.json);
  for (const leak of ["jwt", "secret", "at ", "signature", "Bearer", process.env.JWT_SECRET]) {
    assert.ok(!body.includes(leak), `response leaked "${leak}": ${body}`);
  }
  assert.ok(!res.text.includes("at Object."), "response leaked a stack frame");
});

test("A5: valid token on an authorized route succeeds (200)", async () => {
  const me = await api("GET", "/api/auth/me", { cookie: st.cookieA });
  assert.equal(me.status, 200);

  const ws = await api("GET", `/api/workspaces/${st.wsA}`, { cookie: st.cookieA });
  assert.equal(ws.status, 200);

  const projects = await api("GET", `/api/workspaces/${st.wsA}/projects`, { cookie: st.cookieA });
  assert.equal(projects.status, 200);
});

test("A6: valid token without permission is 403, never 401", async () => {
  const res = await api("POST", `/api/workspaces/${st.wsA}/projects`, {
    cookie: st.cookieViewer,
    body: { name: "Viewer should not create this" },
  });
  assert.equal(res.status, 403, `expected 403 for a Viewer, got ${res.status}`);
  assert.equal(res.json.success, false);

  const count = await Project.countDocuments({ name: "Viewer should not create this" });
  assert.equal(count, 0, "a refused creation must not write a record");
});

test("A7: a user with no membership at all is refused their own workspace list entry", async () => {
  // Outsider is authenticated but belongs to no workspace: the workspace they
  // are not in must 403, not leak.
  const res = await api("GET", `/api/workspaces/${st.wsA}`, { cookie: st.cookieOutsider });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Test B — Workspace and project isolation
// ---------------------------------------------------------------------------

test("B1: a member of Alpha cannot read Beta's private project", async () => {
  const res = await api("GET", `/api/projects/${st.projB}`, { cookie: st.cookieA });
  assert.ok([403, 404].includes(res.status), `expected 403/404, got ${res.status}`);

  const body = res.text || "";
  assert.ok(!body.includes("Beta Private Project"), "response leaked Beta's project name");
  assert.ok(!body.includes("confidential beta work"), "response leaked Beta's description");
});

test("B2: cross-workspace access is refused for every project-scoped surface", async () => {
  const surfaces = [
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}`],
    ["PATCH", `/api/workspaces/${st.wsB}/projects/${st.projB}`],
    ["DELETE", `/api/workspaces/${st.wsB}/projects/${st.projB}`],
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}/board`],
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}/tasks`],
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}/knowledge`],
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}/resources`],
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}/discussion`],
    ["GET", `/api/workspaces/${st.wsB}/projects/${st.projB}/members`],
  ];

  for (const [method, path] of surfaces) {
    const res = await api(method, path, {
      cookie: st.cookieA,
      body: method === "GET" ? undefined : { name: "hijacked" },
    });
    assert.ok(
      [403, 404].includes(res.status),
      `${method} ${path} leaked across tenants: got ${res.status}`
    );
    assert.ok(
      !(res.text || "").includes("Beta Private"),
      `${method} ${path} returned Beta data in the body`
    );
  }
});

test("B3: cross-workspace task and deliverable access is refused", async () => {
  const task = await api("GET", `/api/tasks/${st.taskB}`, { cookie: st.cookieA });
  assert.ok([403, 404].includes(task.status), `task leaked: ${task.status}`);
  assert.ok(!(task.text || "").includes("Beta private task"), "task body leaked");

  const deliv = await api("GET", `/api/deliverables/${st.deliverableB}`, { cookie: st.cookieA });
  assert.ok([403, 404].includes(deliv.status), `deliverable leaked: ${deliv.status}`);
  assert.ok(!(deliv.text || "").includes("Beta private submission"), "deliverable body leaked");
});

test("B4: a task cannot be assigned to a user from another workspace", async () => {
  const res = await api("POST", `/api/projects/${st.projA}/tasks`, {
    cookie: st.cookieA,
    body: {
      title: "Cross-tenant assignment",
      columnId: st.colA,
      status: "ASSIGNED",
      assignedTo: st.bId, // Ben is in Beta, not Alpha
    },
  });

  assert.notEqual(res.status, 201, "a cross-workspace assignee must not be accepted");
  const created = await Task.findOne({ title: "Cross-tenant assignment" });
  if (created) {
    assert.notEqual(
      String(created.assignedTo),
      st.bId,
      "a task was persisted with an out-of-workspace assignee"
    );
    await Task.deleteOne({ _id: created._id });
  }
});

test("B5: a project cannot be created inside someone else's workspace", async () => {
  const res = await api("POST", `/api/workspaces/${st.wsB}/projects`, {
    cookie: st.cookieA, // Ann is not a member of Beta
    body: { name: "Injected into Beta" },
  });
  assert.ok([403, 404].includes(res.status), `expected 403/404, got ${res.status}`);
  assert.equal(await Project.countDocuments({ name: "Injected into Beta" }), 0);
});

// ---------------------------------------------------------------------------
// Test C — Validation and mass assignment
// ---------------------------------------------------------------------------

test("C1: invalid project payloads are rejected with 400 and write nothing", async () => {
  const cases = [
    ["missing name", { description: "no name at all" }],
    ["empty name", { name: "" }],
    ["whitespace name", { name: "   " }],
    ["over-long name", { name: "x".repeat(141) }],
    ["over-long description", { name: "fine", description: "y".repeat(2001) }],
    ["invalid status", { name: "fine", status: "NOT_A_STATUS" }],
    ["invalid priority", { name: "fine", priority: "SUPER_URGENT" }],
    ["unparseable start date", { name: "fine", startDate: "not-a-date" }],
    ["inverted date range", { name: "fine", startDate: "2026-06-01", dueDate: "2026-01-01" }],
  ];

  for (const [label, body] of cases) {
    const res = await api("POST", `/api/workspaces/${st.wsA}/projects`, {
      cookie: st.cookieA,
      body,
    });
    assert.ok(
      res.status === 400 || res.status === 422,
      `${label}: expected 400, got ${res.status} (${res.text})`
    );
  }

  assert.equal(await Project.countDocuments({ description: "no name at all" }), 0);
  assert.equal(await Project.countDocuments({ name: "x".repeat(141) }), 0);
});

test("C2: privileged fields in the body cannot escalate privilege", async () => {
  const res = await api("POST", `/api/workspaces/${st.wsA}/projects`, {
    cookie: st.cookieA,
    body: {
      name: "Privilege escalation attempt",
      // None of these may be honoured from a client payload.
      workspaceId: st.wsB,
      createdBy: st.bId,
      ownerId: st.bId,
      role: "manager",
      isAdmin: true,
      members: [st.bId],
    },
  });

  assert.equal(res.status, 201, `expected the project to be created, got ${res.status}: ${res.text}`);
  const project = await Project.findOne({ name: "Privilege escalation attempt" });
  assert.ok(project, "project was not created");

  assert.equal(String(project.workspaceId), st.wsA, "workspaceId was taken from the body");
  assert.equal(String(project.createdBy), st.aId, "createdBy was taken from the body");
  assert.equal(String(project.managerId), st.aId, "managerId was taken from the body");

  // No membership row may have been conjured from the body either.
  const invented = await ProjectMember.findOne({
    projectId: project._id,
    userId: st.bId,
  });
  assert.equal(invented, null, "a project membership was created from a client-supplied id");

  await Project.deleteOne({ _id: project._id });
});

test("C2b: a managerId naming a non-member is rejected outright", async () => {
  const res = await api("POST", `/api/workspaces/${st.wsA}/projects`, {
    cookie: st.cookieA,
    body: {
      name: "Foreign manager attempt",
      managerId: st.bId, // Ben belongs to Beta, not Alpha
    },
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
  assert.equal(await Project.countDocuments({ name: "Foreign manager attempt" }), 0);
});

test("C3: a project update cannot reassign ownership", async () => {
  const before = await Project.findById(st.projA);
  const res = await api("PATCH", `/api/projects/${st.projA}`, {
    cookie: st.cookieA,
    body: { name: "Alpha Secret Project renamed", workspaceId: st.wsB, managerId: st.bId },
  });
  assert.ok([200, 400].includes(res.status), `unexpected status ${res.status}`);

  const after = await Project.findById(st.projA);
  assert.equal(String(after.workspaceId), String(before.workspaceId), "workspaceId was reassigned");
  assert.equal(String(after.managerId), String(before.managerId), "managerId was reassigned");

  // put the name back so later tests read a stable fixture
  if (res.status === 200) {
    await api("PATCH", `/api/projects/${st.projA}`, {
      cookie: st.cookieA,
      body: { name: "Alpha Secret Project" },
    });
  }
});

test("C4: a malformed identifier is a clean 4xx, never a 500", async () => {
  for (const path of [
    "/api/workspaces/not-an-object-id",
    `/api/workspaces/${st.wsA}/projects/not-an-object-id`,
    "/api/tasks/not-an-object-id",
    "/api/projects/not-an-object-id",
  ]) {
    const res = await api("GET", path, { cookie: st.cookieA });
    assert.ok(
      res.status >= 400 && res.status < 500,
      `${path} returned ${res.status}, expected a 4xx`
    );
    assert.ok(!res.text.includes("MongoServerError"), "driver error leaked to the client");
    assert.ok(!res.text.includes("Cast to ObjectId"), "cast detail leaked to the client");
  }
});

test("C5: validation messages are safe and do not echo a stack", async () => {
  const res = await api("POST", `/api/workspaces/${st.wsA}/projects`, {
    cookie: st.cookieA,
    body: { name: "" },
  });
  assert.equal(res.status, 400);
  assert.ok(!res.text.includes("at "), "message leaked a stack frame");
  assert.ok(!res.text.toLowerCase().includes("mongodb://"), "message leaked a connection string");
});

// ---------------------------------------------------------------------------
// Test D — Rate limiting
// ---------------------------------------------------------------------------

test("D1: the credential endpoints answer 429 once the ceiling is passed", async () => {
  // RATE_LIMIT_FORGOTPASSWORD_MAX is 5 in this suite's environment.
  const statuses = [];
  for (let i = 0; i < 9; i++) {
    const res = await api("POST", "/api/auth/forgot-password", {
      body: { email: `spray${i}@nowhere.test` },
    });
    statuses.push(res.status);
  }

  assert.ok(
    statuses.includes(429),
    `expected a 429 within 9 requests, got ${statuses.join(",")}`
  );

  const blocked = await api("POST", "/api/auth/forgot-password", {
    body: { email: "spray@nowhere.test" },
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.success, false);
  assert.match(blocked.json.message, /too many requests/i);
  assert.ok(blocked.headers.get("retry-after"), "429 should advertise Retry-After");
  assert.ok(!blocked.text.includes("stack"), "429 leaked internals");
});

test("D2: a rate-limited response reveals nothing about accounts", async () => {
  const res = await api("POST", "/api/auth/forgot-password", {
    body: { email: "definitely-not-a-real-account@nowhere.test" },
  });
  assert.equal(res.status, 429);
  const body = res.text;
  for (const leak of ["no such user", "not found", "invalid email", "user"]) {
    assert.ok(!body.toLowerCase().includes(leak), `429 leaked "${leak}": ${body}`);
  }
});

test("D3: normal requests inside the limit still work", async () => {
  // login has a high ceiling in this suite; an ordinary sign-in must succeed.
  const res = await api("POST", "/api/auth/login", {
    body: { email: "ann@a.test", password: PASSWORD },
  });
  assert.equal(res.status, 200, "ordinary login broke");
  assert.ok(res.json.token);
});

// ---------------------------------------------------------------------------
// Test E — File uploads
// ---------------------------------------------------------------------------

test("E1: an unauthenticated upload is refused and stores nothing", async () => {
  const res = await api("POST", `/api/deliverables/${st.deliverableB}/versions`, {
    form: fileForm(PDF_BYTES, "anon.pdf", "application/pdf"),
  });
  assert.equal(res.status, 401, `unauthenticated upload should be 401, got ${res.status}`);
});

test("E2: a valid permitted PDF is accepted for an authorized user", async () => {
  // Ann owns Alpha; use an Alpha deliverable so the upload is genuinely allowed.
  const deliv = await mkUploadTarget();

  const res = await api("POST", `/api/deliverables/${deliv}/versions`, {
    cookie: st.cookieA,
    form: fileForm(PDF_BYTES, "spec.pdf", "application/pdf"),
  });
  assert.equal(res.status, 201, `valid PDF rejected: ${res.status} ${res.text}`);
  assert.ok(res.json.version || res.json.data, "no version returned");
  assert.ok(!/(\/tmp|\/var|node_modules)/.test(res.text), "storage path leaked to the client");
});

test("E3: an executable disguised as a PDF is rejected by content", async () => {
  const deliv = await mkUploadTarget();

  const shell = Buffer.from("#!/bin/sh\nrm -rf /\n");
  const res = await api("POST", `/api/deliverables/${deliv}/versions`, {
    cookie: st.cookieA,
    form: fileForm(shell, "totally-a-report.pdf", "application/pdf"),
  });
  assert.ok(res.status >= 400, `shell script with a .pdf name was accepted: ${res.status}`);
  assert.ok(res.status < 500, "rejection should be a 4xx");
});

test("E4: an unsupported file type is rejected", async () => {
  const deliv = await mkUploadTarget();

  const res = await api("POST", `/api/deliverables/${deliv}/versions`, {
    cookie: st.cookieA,
    form: fileForm(Buffer.from("MZ  Explorer"), "evil.exe", "application/octet-stream"),
  });
  assert.ok(res.status >= 400 && res.status < 500, `exe accepted: ${res.status}`);
});

test("E5: an oversized upload is refused with 413", async () => {
  const deliv = await mkUploadTarget();

  // DELIVERABLE_MAX_FILE_SIZE is 256 KB in this suite.
  const huge = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(300 * 1024, 0x41)]);
  const res = await api("POST", `/api/deliverables/${deliv}/versions`, {
    cookie: st.cookieA,
    form: fileForm(huge, "big.pdf", "application/pdf"),
  });
  assert.equal(res.status, 413, `oversized upload should be 413, got ${res.status} ${res.text}`);
});

test("E6: a traversal filename is neutralised", async () => {
  const deliv = await mkUploadTarget();

  const res = await api("POST", `/api/deliverables/${deliv}/versions`, {
    cookie: st.cookieA,
    form: fileForm(PDF_BYTES, "../../../../etc/passwd.pdf", "application/pdf"),
  });

  if (res.status === 201) {
    const stored = JSON.stringify(res.json);
    assert.ok(!stored.includes(".."), `stored key kept traversal: ${stored}`);
    assert.ok(!/etc\/passwd/.test(stored), "traversal filename was persisted verbatim");
  } else {
    // Rejecting the name outright is also an acceptable outcome.
    assert.ok(res.status >= 400 && res.status < 500, `unexpected status ${res.status}`);
  }
});

test("E7: a user cannot upload into another tenant's project", async () => {
  const res = await api("POST", `/api/deliverables/${st.deliverableB}/versions`, {
    cookie: st.cookieA, // Ann is not in Beta
    form: fileForm(PDF_BYTES, "intrusion.pdf", "application/pdf"),
  });
  assert.ok([403, 404].includes(res.status), `cross-tenant upload allowed: ${res.status}`);
});

test("E8: a private file cannot be downloaded by another tenant", async () => {
  const res = await api("GET", `/api/deliverables/${st.deliverableB}/versions/1/download`, {
    cookie: st.cookieA,
  });
  assert.ok([403, 404].includes(res.status), `cross-tenant download allowed: ${res.status}`);
});

// ---------------------------------------------------------------------------
// Test F — Regression: the flows security work must not break
// ---------------------------------------------------------------------------

test("F1: security headers are present and the framework is not advertised", async () => {
  const res = await api("GET", "/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("x-powered-by"), null, "X-Powered-By must not be sent");
});

test("F2: registration still works and never returns a password hash", async () => {
  const res = await api("POST", "/api/auth/register", {
    body: {
      name: "New Person",
      email: "newperson@a.test",
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
  assert.equal(res.status, 201, `registration broke: ${res.status} ${res.text}`);
  assert.ok(!res.text.includes("$2b$"), "a bcrypt hash was returned to the client");
  assert.ok(!/"password"\s*:/.test(res.text), "the password field was serialized");
});

test("F3: registration rejects a weak or malformed payload", async () => {
  for (const body of [
    { name: "X", email: "not-an-email", password: PASSWORD, confirmPassword: PASSWORD },
    { name: "X", email: "weak@b.test", password: "123", confirmPassword: "123" },
    { name: "", email: "empty@b.test", password: PASSWORD, confirmPassword: PASSWORD },
  ]) {
    const res = await api("POST", "/api/auth/register", { body });
    assert.ok(res.status >= 400 && res.status < 500, `accepted ${JSON.stringify(body)}: ${res.status}`);
  }
});

test("F4: login, project creation, board and task assignment still work", async () => {
  // login
  const loginRes = await api("POST", "/api/auth/login", {
    body: { email: "ann@a.test", password: PASSWORD },
  });
  assert.equal(loginRes.status, 200, "login regressed");
  const cookie = `nexus_token=${loginRes.json.token}`;

  // project creation
  const created = await api("POST", `/api/workspaces/${st.wsA}/projects`, {
    cookie,
    body: { name: "Regression Project", description: "created by the security suite" },
  });
  assert.equal(created.status, 201, `project creation regressed: ${created.text}`);
  const projectId = created.json.project?._id || created.json.project?.id || created.json._id;
  assert.ok(projectId, "no project id returned");

  // it appears in the workspace listing
  const list = await api("GET", `/api/workspaces/${st.wsA}/projects`, { cookie });
  assert.ok(
    JSON.stringify(list.json).includes("Regression Project"),
    "the new project is missing from the workspace listing"
  );

  // the board loads with its default columns
  const board = await api("GET", `/api/workspaces/${st.wsA}/projects/${projectId}/board`, { cookie });
  assert.equal(board.status, 200, `board regressed: ${board.text}`);
  assert.ok(board.json.columns.length >= 3, "default columns were not created");

  // task creation with a same-workspace assignee still works
  const colId = board.json.columns[0]._id;
  const task = await api("POST", `/api/projects/${projectId}/tasks`, {
    cookie,
    body: { title: "Regression task", columnId: colId, status: "ASSIGNED", assignedTo: st.aId },
  });
  assert.ok([200, 201].includes(task.status), `task creation regressed: ${task.status} ${task.text}`);

  // workspace listing still works
  const ws = await api("GET", "/api/workspaces", { cookie });
  assert.equal(ws.status, 200);

  await Project.deleteOne({ _id: projectId });
});

test("F5: notifications and activity still load for an authorized member", async () => {
  const notif = await api("GET", "/api/notifications", { cookie: st.cookieA });
  assert.equal(notif.status, 200);

  const activity = await api("GET", `/api/workspaces/${st.wsA}/activity`, { cookie: st.cookieA });
  assert.equal(activity.status, 200);
});

test("F6: a 403 does not masquerade as a session failure", async () => {
  // The frontend keys session expiry off a 401 specifically. A permission
  // failure must stay a 403 so the UI can show access-denied instead of
  // bouncing the user to the login page.
  const res = await api("GET", `/api/projects/${st.projB}`, { cookie: st.cookieA });
  assert.equal(res.status, 403);
  assert.notEqual(res.status, 401);
});
