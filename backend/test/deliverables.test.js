"use strict";

// Phase 12 — Deliverables and Review integration tests.
//
// Verifies the full submission → review → decision → re-version → approval
// loop: multipart upload with real magic-byte validation, one deliverable per
// task, server-computed version numbers, append-only history, draft editing
// before freezing, task↔deliverable state mirroring, feedback required on
// changes requested, self-approval refusal, the approval subtask gate, IDOR
// across projects and workspaces, authorized downloads, notification/activity
// side effects, and the task-delete cascade.
//
// Runs against a dedicated MongoDB database (nexus_deliverables_test) using
// Node's built-in test runner and global fetch.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_deliverables_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-deliverables-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
// Deliberately tiny so the size-limit test does not have to push 10 MB.
process.env.DELIVERABLE_MAX_FILE_SIZE = process.env.DELIVERABLE_MAX_FILE_SIZE || "1024";
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/opencode/nexus-deliverables-test";
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "http://localhost:3000";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
const DeliverableReview = require("../src/models/deliverableReview.model");
const Activity = require("../src/models/activity.model");
const Notification = require("../src/models/notification.model");
const app = require("../src/app");

const PASSWORD = "Password123!";
const USER_NAMES = ["ada", "alan", "linus", "margaret", "barbara", "outsider", "ghost"];

let server;
let base;
const state = {};
const cookies = {};

// Minimal real files: the storage service checks magic bytes, not the
// extension or the client-declared MIME type.
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n" + "x".repeat(400)
);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("fake-png-body"),
]);

async function api(method, path, { cookie, body, form } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (form) {
    payload = form;
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON (e.g. a file download)
  }
  return { status: res.status, json, text, headers: res.headers };
}

function fileForm({ buffer = PDF_BYTES, name = "spec.pdf", type = "application/pdf", description } = {}) {
  const form = new FormData();
  if (buffer !== null) {
    form.append("file", new Blob([buffer], { type }), name);
  }
  if (description !== undefined) form.append("description", description);
  return form;
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
  }

  const wsA = await Workspace.create({ name: "Deliverables Workspace", ownerId: users.ada._id });
  state.workspaceId = String(wsA._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.barbara._id, role: "Viewer" },
  ]);

  const teamA = await Team.create({ workspaceId: wsA._id, name: "Engineering", description: "Builds" });
  const platform = await Project.create({
    workspaceId: wsA._id,
    teamId: teamA._id,
    name: "Platform",
    description: "Deliverable project",
    status: "ACTIVE",
    priority: "HIGH",
    managerId: users.alan._id,
    createdBy: users.ada._id,
  });
  state.projectId = String(platform._id);
  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.margaret._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.ada._id, role: "COLLABORATOR" },
    { projectId: platform._id, userId: users.barbara._id, role: "VIEWER" },
  ]);

  const cols = {};
  for (const [i, name] of ["To Do", "In Progress", "Done"].entries()) {
    cols[name] = await BoardColumn.create({ projectId: platform._id, name, position: i });
  }

  const makeTask = (assignee, status, title, overrides = {}) =>
    Task.create({
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: cols["In Progress"]._id,
      title,
      status,
      assignedTo: assignee,
      createdBy: users.alan._id,
      ...overrides,
    });

  // linus is the worker on the happy path; margaret is a second member.
  const work = await makeTask(users.linus._id, "IN_PROGRESS", "Write the API spec");
  // All subtasks already DONE, so this task can reach APPROVED.
  const gated = await makeTask(users.linus._id, "IN_PROGRESS", "Ship the migration", {
    subtasks: [
      { title: "Write migration", status: "COMPLETED", createdBy: users.linus._id },
      { title: "Backfill", status: "COMPLETED", createdBy: users.linus._id },
    ],
  });
  // Incomplete subtasks: approval must be refused until they are done.
  const blocked = await makeTask(users.linus._id, "IN_PROGRESS", "Blocked deliverable", {
    subtasks: [
      { title: "Step one", status: "COMPLETED", createdBy: users.linus._id },
      { title: "Step two", status: "IN_PROGRESS", createdBy: users.linus._id },
    ],
  });
  // The PM is the assignee, so this is the self-approval case.
  const selfReview = await makeTask(users.alan._id, "IN_PROGRESS", "PM writes, PM cannot approve");
  // ASSIGNED, not yet started: submitting needs IN_PROGRESS first.
  const fresh = await makeTask(users.linus._id, "ASSIGNED", "Not started yet", {
    columnId: cols["To Do"]._id,
  });

  state.workTaskId = String(work._id);
  state.gatedTaskId = String(gated._id);
  state.blockedTaskId = String(blocked._id);
  state.selfTaskId = String(selfReview._id);
  state.freshTaskId = String(fresh._id);

  // --- Cross-project + cross-workspace IDOR targets ------------------------
  const other = await Project.create({
    workspaceId: wsA._id,
    teamId: teamA._id,
    name: "Research",
    description: "Second project, same workspace",
    status: "ACTIVE",
    managerId: users.margaret._id,
    createdBy: users.ada._id,
  });
  state.researchId = String(other._id);
  await ProjectMember.create({ projectId: other._id, userId: users.margaret._id, role: "PROJECT_MANAGER" });
  const otherCols = await BoardColumn.create({ projectId: other._id, name: "To Do", position: 0 });
  const otherTask = await Task.create({
    projectId: other._id,
    workspaceId: wsA._id,
    columnId: otherCols._id,
    title: "Research writeup",
    status: "IN_PROGRESS",
    assignedTo: users.margaret._id,
    createdBy: users.margaret._id,
  });
  state.researchTaskId = String(otherTask._id);

  const wsB = await Workspace.create({ name: "Other Workspace", ownerId: users.outsider._id });
  await WorkspaceMember.create({ workspaceId: wsB._id, userId: users.outsider._id, role: "Admin" });
  const teamB = await Team.create({ workspaceId: wsB._id, name: "Other Team" });
  const foreign = await Project.create({
    workspaceId: wsB._id,
    teamId: teamB._id,
    name: "Foreign",
    managerId: users.outsider._id,
    createdBy: users.outsider._id,
  });
  const foreignCols = await BoardColumn.create({ projectId: foreign._id, name: "To Do", position: 0 });
  const foreignTask = await Task.create({
    projectId: foreign._id,
    workspaceId: wsB._id,
    columnId: foreignCols._id,
    title: "Foreign work",
    status: "IN_PROGRESS",
    assignedTo: users.ghost._id,
    createdBy: users.outsider._id,
  });
  state.foreignTaskId = String(foreignTask._id);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
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
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

const taskUrl = (taskId) => `/api/tasks/${taskId}`;
const createUrl = (taskId) => `/api/tasks/${taskId}/deliverables`;
const dlvUrl = (id) => `/api/deliverables/${id}`;
const versionUrl = (id, n) => `/api/deliverables/${id}/versions/${n}`;

const taskStatus = async (taskId) => (await Task.findById(taskId)).status;

/** Drive a task to UNDER_REVIEW through the public API. */
async function submitForReview({ taskId, cookie, reviewerCookie, buffer, name, description }) {
  const created = await api("POST", createUrl(taskId), {
    cookie,
    form: fileForm({ buffer, name, description }),
  });
  assert.equal(created.status, 201, `create failed: ${JSON.stringify(created.json)}`);
  const deliverableId = created.json.deliverable.id;
  const submitted = await api("PATCH", `${versionUrl(deliverableId, 1)}/submit`, {
    cookie,
    body: {},
  });
  assert.equal(submitted.status, 200, `submit failed: ${JSON.stringify(submitted.json)}`);
  const review = await api("PATCH", `${versionUrl(deliverableId, 1)}/review`, {
    cookie: reviewerCookie || cookie,
    body: {},
  });
  assert.equal(review.status, 200, `review start failed: ${JSON.stringify(review.json)}`);
  return deliverableId;
}

// ---------------------------------------------------------------------------
test("unauthenticated deliverable access → 401", async () => {
  const created = await api("POST", createUrl(state.workTaskId), { form: fileForm() });
  assert.equal(created.status, 401);
  assert.equal((await api("GET", createUrl(state.workTaskId).replace("/deliverables", "/deliverable"))).status, 401);
});

test("POST /api/tasks/:taskId/deliverables rejects non-partipart and missing files", async () => {
  // A well-formed multipart body that simply has no file part.
  const none = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    form: fileForm({ buffer: null, description: "forgot the attachment" }),
  });
  assert.equal(none.status, 400);
  assert.match(none.json.message, /file/i);

  // JSON body instead of multipart: the route only parses multipart, so there
  // is no file and nothing to validate against.
  const json = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    body: { fileUrl: "https://evil.test/x.pdf", title: "Sneaky" },
  });
  assert.equal(json.status, 400);
  assert.equal(await Deliverable.countDocuments({ taskId: state.workTaskId }), 0);
});

test("upload validation: type allowlist, magic bytes, and size limit", async () => {
  // Declared type not on the allowlist.
  const badType = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    form: fileForm({ buffer: Buffer.from("#!/bin/sh\necho hi\n"), name: "run.sh", type: "application/x-sh" }),
  });
  assert.equal(badType.status, 400);
  assert.match(badType.json.message, /not allowed|type/i);

  // PDF extension and MIME, but not PDF bytes → rejected on content.
  const spoofed = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    form: fileForm({ buffer: Buffer.from("this is definitely not a pdf"), name: "invoice.pdf" }),
  });
  assert.equal(spoofed.status, 400);
  assert.match(spoofed.json.message, /content|signature|does not match/i);

  // Over the configured limit (DELIVERABLE_MAX_FILE_SIZE=1024 here).
  const tooBig = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    form: fileForm({ buffer: Buffer.concat([PDF_BYTES, Buffer.alloc(2048, 0x20)]), name: "big.pdf" }),
  });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.json.message, /too large/i);

  assert.equal(await Deliverable.countDocuments({}), 0, "rejected uploads create nothing");
});

test("creating a deliverable requires create_deliverable and task ownership", async () => {
  // Viewer lacks create_deliverable.
  const viewer = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.barbara,
    form: fileForm(),
  });
  assert.equal(viewer.status, 403, `viewer got ${viewer.status}: ${JSON.stringify(viewer.json)}`);

  // Member of the project but not the assignee and not an `assign_task`
  // holder → refused by the ownership rule.
  const notMine = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.margaret,
    form: fileForm(),
  });
  assert.equal(notMine.status, 403);
  assert.match(notMine.json.message, /assigned|creator|manager/i);

  // Cross-project member → 403.
  const crossProject = await api("POST", createUrl(state.researchTaskId), {
    cookie: cookies.linus,
    form: fileForm(),
  });
  assert.equal(crossProject.status, 403);

  // Out-of-workspace user on one of our tasks → 403.
  const outsider = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.outsider,
    form: fileForm(),
  });
  assert.equal(outsider.status, 403);

  // An outsider may of course work on their own workspace's tasks.
  const theirs = await api("POST", createUrl(state.foreignTaskId), {
    cookie: cookies.outsider,
    form: fileForm(),
  });
  assert.equal(theirs.status, 201, JSON.stringify(theirs.json));

  // Unknown task → 404.
  const missing = await api("POST", createUrl("000000000000000000000000"), {
    cookie: cookies.linus,
    form: fileForm(),
  });
  assert.equal(missing.status, 404);
});

test("draft creation does not move the task, and one deliverable per task", async () => {
  const created = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    form: fileForm({ description: "Draft of the API spec" }),
  });
  assert.equal(created.status, 201);
  const d = created.json.deliverable;
  state.deliverableId = d.id;
  assert.equal(d.status, "DRAFT");
  assert.equal(d.currentVersion, 1);
  assert.equal(d.taskId, state.workTaskId);
  assert.equal(created.json.versions.length, 1);
  assert.equal(created.json.versions[0].versionNumber, 1);
  assert.equal(created.json.versions[0].status, "DRAFT");
  assert.equal(created.json.versions[0].fileName, "spec.pdf");
  assert.equal(created.json.versions[0].mimeType, "application/pdf");
  assert.ok(created.json.versions[0].checksum, "checksum recorded");
  assert.equal(await taskStatus(state.workTaskId), "IN_PROGRESS", "draft leaves the task alone");

  // Second deliverable on the same task is refused.
  const second = await api("POST", createUrl(state.workTaskId), {
    cookie: cookies.linus,
    form: fileForm({ name: "other.pdf" }),
  });
  assert.equal(second.status, 409);
  assert.match(second.json.message, /already has a deliverable/i);
});

test("submitting requires the task to be in progress and freezes the version", async () => {
  // fresh is ASSIGNED → submit is refused with an actionable message.
  const created = await api("POST", createUrl(state.freshTaskId), {
    cookie: cookies.linus,
    form: fileForm(),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const freshId = created.json.deliverable.id;

  const tooEarly = await api("PATCH", `${versionUrl(freshId, 1)}/submit`, { cookie: cookies.linus, body: {} });
  assert.equal(tooEarly.status, 400, `tooEarly got ${tooEarly.status}: ${JSON.stringify(tooEarly.json)}`);
  assert.match(tooEarly.json.message, /start the task/i);

  // Start the task through Phase 10, then submit.
  const started = await api("PATCH", `${taskUrl(state.freshTaskId)}/status`, {
    cookie: cookies.linus,
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(started.status, 200);
  const submitted = await api("PATCH", `${versionUrl(freshId, 1)}/submit`, { cookie: cookies.linus, body: {} });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.version.status, "SUBMITTED");
  assert.equal(submitted.json.version.submittedBy.id, state.linusId);
  assert.ok(submitted.json.version.submittedAt);
  assert.equal(submitted.json.deliverable.status, "SUBMITTED");
  assert.equal(
    await taskStatus(state.freshTaskId),
    "SUBMITTED",
    "the task mirrors the submission so the board shows it awaiting review"
  );

  // A submitted version is frozen: description edits and re-submission fail.
  const edit = await api("PATCH", versionUrl(freshId, 1), {
    cookie: cookies.linus,
    body: { description: "late edit" },
  });
  assert.equal(edit.status, 400);
  const again = await api("PATCH", `${versionUrl(freshId, 1)}/submit`, { cookie: cookies.linus, body: {} });
  assert.equal(again.status, 400);

  // A member who is not the assignee cannot submit.
  const notMine = await api("PATCH", `${versionUrl(freshId, 1)}/submit`, {
    cookie: cookies.margaret,
    body: {},
  });
  assert.equal(notMine.status, 403);
});

test("draft versions are editable until submitted", async () => {
  const patched = await api("PATCH", versionUrl(state.deliverableId, 1), {
    cookie: cookies.linus,
    body: { description: "API spec, revised after review feedback" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.version.description, "API spec, revised after review feedback");

  // Someone else cannot edit my draft.
  const other = await api("PATCH", versionUrl(state.deliverableId, 1), {
    cookie: cookies.margaret,
    body: { description: "hijack" },
  });
  assert.equal(other.status, 403);
});

test("start review moves version, deliverable, and task to UNDER_REVIEW", async () => {
  const submitted = await api("PATCH", `${versionUrl(state.deliverableId, 1)}/submit`, {
    cookie: cookies.linus,
    body: {},
  });
  assert.equal(submitted.status, 200);

  // A worker cannot start the review of their own submission.
  const asWorker = await api("PATCH", `${versionUrl(state.deliverableId, 1)}/review`, {
    cookie: cookies.linus,
    body: {},
  });
  assert.equal(asWorker.status, 403);

  const asPm = await api("PATCH", `${versionUrl(state.deliverableId, 1)}/review`, {
    cookie: cookies.alan,
    body: {},
  });
  assert.equal(asPm.status, 200);
  assert.equal(asPm.json.version.status, "UNDER_REVIEW");
  assert.equal(asPm.json.deliverable.status, "UNDER_REVIEW");
  assert.equal(await taskStatus(state.workTaskId), "UNDER_REVIEW");

  // Starting twice is refused.
  const repeat = await api("PATCH", `${versionUrl(state.deliverableId, 1)}/review`, {
    cookie: cookies.alan,
    body: {},
  });
  assert.equal(repeat.status, 400);
});

test("a reviewer cannot approve their own submission (403)", async () => {
  const created = await api("POST", createUrl(state.selfTaskId), {
    cookie: cookies.alan,
    form: fileForm({ description: "Written by the PM" }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.deliverable.id;
  const submitted = await api("PATCH", `${versionUrl(id, 1)}/submit`, { cookie: cookies.alan, body: {} });
  assert.equal(submitted.status, 200);

  // alan is the assignee *and* the PM: reviewer-permitted on paper, but the
  // submission is his own — so even opening the review is refused.
  const startOwnReview = await api("PATCH", `${versionUrl(id, 1)}/review`, { cookie: cookies.alan, body: {} });
  assert.equal(startOwnReview.status, 403);
  assert.match(startOwnReview.json.message, /own/i);

  const selfApprove = await api("PATCH", `${versionUrl(id, 1)}/approve`, {
    cookie: cookies.alan,
    body: {},
  });
  assert.equal(selfApprove.status, 403);
  assert.match(selfApprove.json.message, /own/i);

  // Neither attempt left a trace: still SUBMITTED, no review row, task still
  // SUBMITTED.
  const version = await DeliverableVersion.findOne({ deliverableId: id });
  assert.equal(version.status, "SUBMITTED");
  assert.equal(await DeliverableReview.countDocuments({ deliverableId: id }), 0);
  assert.equal(await taskStatus(state.selfTaskId), "SUBMITTED");
});

test("requesting changes freezes the version, records feedback, and returns the task", async () => {
  const id = await submitForReview({
    taskId: state.gatedTaskId,
    cookie: cookies.linus,
    reviewerCookie: cookies.alan,
    description: "Migration script",
  });
  state.gatedDeliverableId = id;

  const tooShort = await api("PATCH", `${versionUrl(id, 1)}/request-changes`, {
    cookie: cookies.alan,
    body: { feedback: "fix it" },
  });
  assert.equal(tooShort.status, 400);
  assert.match(tooShort.json.message, /at least 10 characters/i);
  assert.equal(await DeliverableReview.countDocuments({ deliverableId: id }), 0, "no review row for a rejected request");

  const decided = await api("PATCH", `${versionUrl(id, 1)}/request-changes`, {
    cookie: cookies.alan,
    body: { feedback: "The backfill batches are too large; use 1000 rows per batch." },
  });
  assert.equal(decided.status, 200, JSON.stringify(decided.json));
  assert.equal(decided.json.version.status, "CHANGES_REQUESTED");
  assert.equal(decided.json.deliverable.status, "CHANGES_REQUESTED");
  assert.equal(await taskStatus(state.gatedTaskId), "CHANGES_REQUESTED");

  const review = await DeliverableReview.findOne({ deliverableId: id });
  assert.equal(review.decision, "CHANGES_REQUESTED");
  assert.equal(review.reviewerId.toString(), state.alanId);
  assert.equal(review.versionNumber, 1);
});

test("a new version is server-numbered, the history is preserved, and the task resumes", async () => {
  const id = state.gatedDeliverableId;
  const before = await DeliverableVersion.find({ deliverableId: id }).sort({ versionNumber: 1 });
  assert.equal(before.length, 1);
  const v1 = before[0];

  // versionNumber from the client is ignored: the server decides.
  const created = await api("POST", `${dlvUrl(id)}/versions`, {
    cookie: cookies.linus,
    form: (() => {
      const form = new FormData();
      form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "chart.png");
      form.append("description", "Batches reduced to 1000 rows");
      form.append("versionNumber", "99");
      return form;
    })(),
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.version.versionNumber, 2, "client cannot pick the version number");
  assert.equal(created.json.version.status, "DRAFT");
  assert.equal(created.json.deliverable.status, "DRAFT");
  assert.equal(created.json.deliverable.currentVersion, 2);
  assert.equal(await taskStatus(state.gatedTaskId), "IN_PROGRESS");

  // v1 is byte-for-byte unchanged, including its storage key and decision.
  const after = await DeliverableVersion.findOne({ _id: v1._id });
  assert.equal(after.versionNumber, 1);
  assert.equal(after.status, "CHANGES_REQUESTED");
  assert.equal(after.storageKey, v1.storageKey);
  assert.equal(after.checksum, v1.checksum);
  assert.equal(after.fileName, v1.fileName);
  assert.equal(
    (await DeliverableReview.countDocuments({ deliverableId: id })),
    1,
    "v1's review is not rewritten"
  );

  // Both versions are visible, v1 first.
  const list = await api("GET", `${dlvUrl(id)}/versions`, { cookie: cookies.linus });
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.json.versions.map((v) => v.versionNumber),
    [1, 2]
  );
  assert.equal(list.json.versions[0].reviews.at(-1).decision, "CHANGES_REQUESTED");
  assert.equal(list.json.versions[1].reviews.length, 0);

  // Only from CHANGES_REQUESTED: a second new version is refused while a
  // draft is open.
  const again = await api("POST", `${dlvUrl(id)}/versions`, {
    cookie: cookies.linus,
    form: fileForm({ name: "v3.pdf" }),
  });
  assert.equal(again.status, 400);
});

test("new version requires permission and rejects an approved deliverable", async () => {
  // margaret is not the assignee of the gated task.
  const notMine = await api("POST", `${dlvUrl(state.gatedDeliverableId)}/versions`, {
    cookie: cookies.margaret,
    form: fileForm({ name: "v3.pdf" }),
  });
  assert.equal(notMine.status, 403);

  // Approve v2, then try for v3.
  await api("PATCH", `${versionUrl(state.gatedDeliverableId, 2)}/submit`, { cookie: cookies.linus, body: {} });
  await api("PATCH", `${versionUrl(state.gatedDeliverableId, 2)}/review`, { cookie: cookies.alan, body: {} });
  const approved = await api("PATCH", `${versionUrl(state.gatedDeliverableId, 2)}/approve`, {
    cookie: cookies.alan,
    body: {},
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.deliverable.status, "APPROVED");
  assert.equal(approved.json.deliverable.approvedVersion, 2);
  assert.equal(await taskStatus(state.gatedTaskId), "APPROVED");

  const afterApproval = await api("POST", `${dlvUrl(state.gatedDeliverableId)}/versions`, {
    cookie: cookies.linus,
    form: fileForm({ name: "v3.pdf" }),
  });
  assert.equal(afterApproval.status, 400);
  assert.match(afterApproval.json.message, /approved/i);
});

test("approval is refused while subtasks are open, then succeeds once complete", async () => {
  const id = await submitForReview({
    taskId: state.blockedTaskId,
    cookie: cookies.linus,
    reviewerCookie: cookies.alan,
  });
  const blocked = await api("PATCH", `${versionUrl(id, 1)}/approve`, { cookie: cookies.alan, body: {} });
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.message, /subtask/i);

  // The refusal changed nothing.
  const version = await DeliverableVersion.findOne({ deliverableId: id });
  assert.equal(version.status, "UNDER_REVIEW");
  assert.equal(await DeliverableReview.countDocuments({ deliverableId: id }), 0);
  assert.equal(await taskStatus(state.blockedTaskId), "UNDER_REVIEW");

  // Finish the open subtask through Phase 10, then approve.
  const task = await Task.findById(state.blockedTaskId);
  const open = task.subtasks.find((s) => s.status !== "COMPLETED");
  const done = await api("PATCH", `/api/subtasks/${open._id}`, {
    cookie: cookies.linus,
    body: { status: "COMPLETED" },
  });
  assert.equal(done.status, 200);

  const approved = await api("PATCH", `${versionUrl(id, 1)}/approve`, { cookie: cookies.alan, body: {} });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.version.status, "APPROVED");
  assert.equal(approved.json.version.reviewedAt ? true : false, true);
  assert.equal(approved.json.deliverable.approvedVersion, 1);
  assert.equal(await taskStatus(state.blockedTaskId), "APPROVED");

  // A review row was written.
  const review = await DeliverableReview.findOne({ deliverableId: id });
  assert.equal(review.decision, "APPROVED");
  assert.equal(review.reviewerId.toString(), state.alanId);

  // Re-approving is refused.
  const again = await api("PATCH", `${versionUrl(id, 1)}/approve`, { cookie: cookies.alan, body: {} });
  assert.equal(again.status, 400);
});

test("a submitted version cannot be edited or re-decided; approved work is final", async () => {
  const id = state.blockedTaskId ? (await Deliverable.findOne({ taskId: state.blockedTaskId }))._id : null;
  const edit = await api("PATCH", versionUrl(id, 1), { cookie: cookies.linus, body: { description: "x" } });
  assert.equal(edit.status, 400);
  const resubmit = await api("PATCH", `${versionUrl(id, 1)}/submit`, { cookie: cookies.linus, body: {} });
  assert.equal(resubmit.status, 400);
  const reReview = await api("PATCH", `${versionUrl(id, 1)}/review`, { cookie: cookies.alan, body: {} });
  assert.equal(reReview.status, 400);
});

test("deliverable detail, task deliverable, and project list are project-scoped", async () => {
  const id = state.blockedTaskId ? (await Deliverable.findOne({ taskId: state.blockedTaskId }))._id.toString() : null;

  const detail = await api("GET", dlvUrl(id), { cookie: cookies.linus });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.deliverable.id, id);
  assert.ok(detail.json.task, "detail includes the mirrored task");
  assert.equal(detail.json.task.status, "APPROVED");
  assert.equal(detail.json.versions.length, 1);
  assert.equal(detail.json.versions[0].versionNumber, 1);
  assert.equal(detail.json.deliverable.createdBy.id, state.linusId, "creator is resolved");
  assert.equal(detail.json.deliverable.createdBy.name, "Linus", "creator name is resolved");

  const byTask = await api("GET", `/api/tasks/${state.blockedTaskId}/deliverable`, { cookie: cookies.linus });
  assert.equal(byTask.status, 200);
  assert.equal(byTask.json.deliverable.id, id);

  const list = await api(
    "GET",
    `/api/workspaces/${state.workspaceId}/projects/${state.projectId}/deliverables`,
    { cookie: cookies.linus }
  );
  assert.equal(list.status, 200);
  assert.ok(list.json.deliverables.length >= 3);
  assert.ok(list.json.deliverables.every((d) => d.projectId === state.projectId));

  // Viewer may read.
  assert.equal((await api("GET", dlvUrl(id), { cookie: cookies.barbara })).status, 200);
  // Non-member of the project → 403.
  assert.equal((await api("GET", dlvUrl(id), { cookie: cookies.margaret })).status, 403);
  // Unknown deliverable → 404.
  assert.equal((await api("GET", dlvUrl("000000000000000000000000"), { cookie: cookies.linus })).status, 404);
  // Malformed id → 404.
  assert.equal((await api("GET", dlvUrl("nope"), { cookie: cookies.linus })).status, 404);
});

test("unknown version numbers and malformed paths → 404", async () => {
  const id = state.blockedTaskId ? (await Deliverable.findOne({ taskId: state.blockedTaskId }))._id.toString() : null;
  assert.equal((await api("GET", versionUrl(id, 7), { cookie: cookies.linus })).status, 404);
  assert.equal((await api("GET", versionUrl(id, 0), { cookie: cookies.linus })).status, 404);
  assert.equal((await api("PATCH", `${versionUrl(id, 7)}/submit`, { cookie: cookies.linus, body: {} })).status, 404);
});

test("IDOR: every deliverable endpoint refuses outsiders and other projects", async () => {
  const id = state.blockedTaskId ? (await Deliverable.findOne({ taskId: state.blockedTaskId }))._id.toString() : null;
  const cases = [
    ["GET", dlvUrl(id)],
    ["GET", `${dlvUrl(id)}/versions`],
    ["GET", versionUrl(id, 1)],
    ["GET", `${versionUrl(id, 1)}/download`],
    ["PATCH", versionUrl(id, 1)],
    ["PATCH", `${versionUrl(id, 1)}/submit`],
    ["PATCH", `${versionUrl(id, 1)}/review`],
    ["PATCH", `${versionUrl(id, 1)}/approve`],
    ["PATCH", `${versionUrl(id, 1)}/request-changes`],
    ["POST", `${dlvUrl(id)}/versions`],
  ];
  for (const [method, url] of cases) {
    const res = await api(method, url, { cookie: cookies.outsider, body: method === "GET" ? undefined : {} });
    assert.equal(res.status, 403, `${method} ${url} leaked to an outsider: ${res.status}`);
  }

  // A member of a different project in the same workspace is refused too.
  for (const [method, url] of cases.slice(0, 5)) {
    const res = await api(method, url, { cookie: cookies.margaret, body: method === "GET" ? undefined : {} });
    assert.ok([403, 404].includes(res.status), `${method} ${url} leaked across projects: ${res.status}`);
  }
});

test("downloads are authorized and return the stored bytes", async () => {
  const deliverable = await Deliverable.findOne({ taskId: state.blockedTaskId });
  const version = await DeliverableVersion.findOne({ deliverableId: deliverable._id });
  const onDisk = path.join(process.env.UPLOAD_DIR, version.storageKey);
  assert.ok(fs.existsSync(onDisk), `expected the upload at ${onDisk}`);
  assert.deepEqual(fs.readFileSync(onDisk), PDF_BYTES, "stored bytes match what was uploaded");

  const res = await fetch(`${base}${versionUrl(deliverable._id, 1)}/download`, {
    headers: { Cookie: cookies.linus },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition") || "", /attachment/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF_BYTES);

  // Outsider and non-member are refused.
  assert.equal(
    (await fetch(`${base}${versionUrl(deliverable._id, 1)}/download`, { headers: { Cookie: cookies.outsider } })).status,
    403
  );
  assert.equal(
    (await fetch(`${base}${versionUrl(deliverable._id, 1)}/download`, { headers: { Cookie: cookies.margaret } })).status,
    403
  );
  // No unauthenticated static path to the file.
  assert.equal((await fetch(`${base}/${version.storageKey}`)).status, 404);
});

test("activity and notifications are recorded for the workflow", async () => {
  const deliverable = await Deliverable.findOne({ taskId: state.blockedTaskId });
  const actions = (await Activity.find({ targetId: deliverable._id })).map((a) => a.action);
  assert.ok(actions.includes("DELIVERABLE_CREATED"), `actions: ${actions.join(",")}`);
  assert.ok(actions.includes("DELIVERABLE_SUBMITTED"), `actions: ${actions.join(",")}`);
  assert.ok(actions.includes("DELIVERABLE_REVIEW_STARTED"), `actions: ${actions.join(",")}`);
  assert.ok(actions.includes("DELIVERABLE_APPROVED"), `actions: ${actions.join(",")}`);

  // linus was notified of the decision; margaret never entered this flow.
  const forLinus = await Notification.find({ userId: state.linusId, type: "DELIVERABLE_REVIEWED" });
  assert.ok(forLinus.length >= 1, "submitter is notified of the decision");
  assert.equal(await Notification.countDocuments({ userId: state.margaretId, type: "DELIVERABLE_REVIEWED" }), 0);
});

test("version numbers stay sequential under concurrent creation", async () => {
  const id = await submitForReview({
    taskId: state.researchTaskId,
    cookie: cookies.margaret,
    reviewerCookie: cookies.margaret,
  });
  await api("PATCH", `${versionUrl(id, 1)}/request-changes`, {
    cookie: cookies.margaret,
    body: { feedback: "Please add a diagram and expand section three." },
  });

  // Two simultaneous uploads: exactly one becomes v2, the other gets 409.
  const [a, b] = await Promise.all([
    api("POST", `${dlvUrl(id)}/versions`, {
      cookie: cookies.margaret,
      form: fileForm({ name: "a.pdf" }),
    }),
    api("POST", `${dlvUrl(id)}/versions`, {
      cookie: cookies.margaret,
      form: fileForm({ name: "b.pdf" }),
    }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], `concurrent create gave ${statuses}`);

  const versions = await DeliverableVersion.find({ deliverableId: id }).sort({ versionNumber: 1 });
  assert.deepEqual(
    versions.map((v) => v.versionNumber),
    [1, 2]
  );
});

test("deleting a task cascades its deliverable aggregate", async () => {
  const id = await submitForReview({
    taskId: state.workTaskId,
    cookie: cookies.linus,
    reviewerCookie: cookies.alan,
  });
  await api("PATCH", `${versionUrl(id, 1)}/request-changes`, {
    cookie: cookies.alan,
    body: { feedback: "Tighten the error payloads before this goes out." },
  });
  await api("POST", `${dlvUrl(id)}/versions`, {
    cookie: cookies.linus,
    form: fileForm({ name: "spec-v2.pdf" }),
  });

  const versionCount = await DeliverableVersion.countDocuments({ deliverableId: id });
  assert.equal(versionCount, 2);

  const removed = await api("DELETE", taskUrl(state.workTaskId), { cookie: cookies.alan });
  assert.equal(removed.status, 200);

  assert.equal(await Deliverable.countDocuments({ _id: id }), 0);
  assert.equal(await DeliverableVersion.countDocuments({ deliverableId: id }), 0);
  assert.equal(await DeliverableReview.countDocuments({ deliverableId: id }), 0);
});
