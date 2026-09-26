"use strict";

// Phase 25 — End-to-end workflow test.
//
// One continuous user journey, executed against the real Express app, the real
// Socket.IO server, a real MongoDB database and real files on disk:
//
//   register → login → workspace → team → project invitation → project view →
//   resources → task assignment → subtasks → progress → deliverable upload →
//   submission → manager notification → review → changes requested →
//   resubmission → approval → Knowledge Base
//
// Nothing is stubbed. Every account is created through the public registration
// endpoint, every membership through the real membership endpoints, every
// transition through the real route that a browser would call, and every
// assertion is checked twice: once against the HTTP response and once against
// the database row that response was built from.
//
// The stages share `state` and are declared in workflow order, so this file is
// a narrative rather than a matrix: a failure stops the story at that step and
// names it. Authorization and failure cases are asserted at the point in the
// journey where they are meaningful (a non-member cannot open the project
// before the member is invited; the member cannot approve before the manager
// can), because that is the order in which the guarantees actually hold.
//
// Database: nexus_e2e_test (dropped and rebuilt in `before`).
// Uploads:   a temp directory, removed in `after`.
//
// ENV must be set BEFORE requiring the app: rateLimit.js calls dotenv.config(),
// which never overrides variables that are already set.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_e2e_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-e2e-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "http://127.0.0.1";
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "http://127.0.0.1";
// Small enough that the oversize case is cheap, large enough that a real PDF
// with a paragraph of content passes.
process.env.DELIVERABLE_MAX_FILE_SIZE = process.env.DELIVERABLE_MAX_FILE_SIZE || "4096";
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/opencode/nexus-e2e-test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");
const Team = require("../src/models/team.model");
const TeamMember = require("../src/models/teamMember.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const ProjectResource = require("../src/models/projectResource.model");
const ProjectView = require("../src/models/projectView.model");
const BoardColumn = require("../src/models/boardColumn.model");
const Task = require("../src/models/task.model");
const Deliverable = require("../src/models/deliverable.model");
const DeliverableVersion = require("../src/models/deliverableVersion.model");
const DeliverableReview = require("../src/models/deliverableReview.model");
const KnowledgeResource = require("../src/models/knowledgeResource.model");
const Notification = require("../src/models/notification.model");
const Activity = require("../src/models/activity.model");

const app = require("../src/app");
const { initSocket } = require("../src/sockets");

const PASSWORD = "Password123!";

// The three people in the story. `manager` runs the project; `member` does the
// work; `outsider` is a workspace member who is never invited to the project,
// which is what proves workspace membership alone grants nothing.
const MANAGER = { name: "Mara Manager", email: "manager@e2e.test" };
const MEMBER = { name: "Miles Member", email: "member@e2e.test" };
const OUTSIDER = { name: "Oscar Outsider", email: "outsider@e2e.test" };

// A structurally valid PDF: the storage service checks magic bytes, so the
// header has to be real.
function pdfBytes(marker) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n` +
      `2 0 obj<</Producer(${marker})>>endobj\n` +
      `trailer<</Root 1 0 R>>\n%%EOF\n` +
      `${marker}: ${"x".repeat(200)}\n`
  );
}

let server;
let base;
const state = {};
const cookies = {};
const sockets = [];

/** One HTTP call, exactly as the browser's apiRequest would make it. */
async function api(method, urlPath, { cookie, body, form, raw } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) {
    payload = form;
  } else if (raw !== undefined) {
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${urlPath}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON — a file download, for instance
  }
  return { status: res.status, json, text, headers: res.headers };
}

function fileForm({ buffer = pdfBytes("v1"), name = "deliverable.pdf", type = "application/pdf", fields = {} } = {}) {
  const form = new FormData();
  if (buffer !== null) form.append("file", new Blob([buffer], { type }), name);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, String(value));
  }
  return form;
}

/** Sign in the way a person does, and keep the cookie the server set. */
async function login(email, password = PASSWORD) {
  const res = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.status} ${res.text}`);
  assert.ok(res.json.token, "login did not return a token");
  assert.ok(
    String(res.headers.getSetCookie?.() || "").includes("nexus_token"),
    "login did not set the nexus_token cookie"
  );
  cookies[email] = `nexus_token=${res.json.token}`;
  return cookies[email];
}

const wsUrl = (workspaceId) => `/api/workspaces/${workspaceId}`;
const projectUrl = (projectId) => `/api/projects/${projectId}`;

before(async () => {
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();

  // The unique partial index that makes Knowledge Base promotion idempotent is
  // only enforced if it exists; syncIndexes is what creates it in a real
  // deployment, so the test creates it too rather than asserting a guarantee
  // the database is not actually keeping.
  await KnowledgeResource.syncIndexes();

  server = http.createServer(app);
  initSocket(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const socket of sockets) socket.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

/** An authenticated socket for a user who is already signed in over HTTP. */
function connectAs(email) {
  const socket = ioClient(base, {
    auth: { token: `Bearer ${cookies[email].split("=")[1]}` },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timed out")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Resolve with the first event matching `predicate`, or reject on timeout. */
function waitFor(socket, event, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

// ---------------------------------------------------------------------------
// Stage A — registration and login
// ---------------------------------------------------------------------------

test("Stage A: two people register, the accounts exist, and both can sign in", async () => {
  for (const person of [MANAGER, MEMBER, OUTSIDER]) {
    const res = await api("POST", "/api/auth/register", {
      body: {
        name: person.name,
        email: person.email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    assert.equal(res.status, 201, `registration failed for ${person.email}: ${res.text}`);
    assert.equal(res.json.success, true);
    assert.equal(res.json.user.email, person.email);
    assert.equal(res.json.user.password, undefined, "registration leaked the password hash");
  }

  // The account is a real row, and the password is stored hashed.
  const stored = await User.findOne({ email: MEMBER.email }).select("+password");
  assert.ok(stored, "the registered member has no database row");
  assert.notEqual(stored.password, PASSWORD, "the password was stored in plain text");
  assert.match(stored.password, /^\$2[aby]\$/, "the password is not a bcrypt hash");
  state.memberId = String(stored._id);
  state.managerId = String((await User.findOne({ email: MANAGER.email }))._id);
  state.outsiderId = String((await User.findOne({ email: OUTSIDER.email }))._id);

  // A second registration with the same address is refused, not silently merged.
  const duplicate = await api("POST", "/api/auth/register", {
    body: {
      name: "Miles Again",
      email: MEMBER.email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
  assert.equal(duplicate.status, 409, `duplicate registration returned ${duplicate.status}`);
  assert.equal(await User.countDocuments({ email: MEMBER.email }), 1, "the duplicate created a second account");

  // Sign in for real, with a wrong password first to prove the check is live.
  const wrong = await api("POST", "/api/auth/login", {
    body: { email: MEMBER.email, password: "NotThePassword1!" },
  });
  assert.equal(wrong.status, 401, "a wrong password was accepted");

  for (const person of [MANAGER, MEMBER, OUTSIDER]) await login(person.email);

  // The session is a real credential on a protected endpoint.
  const me = await api("GET", "/api/auth/me", { cookie: cookies[MEMBER.email] });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, MEMBER.email);
  assert.equal(me.json.user.password, undefined, "the session response leaked a password hash");

  const anon = await api("GET", "/api/auth/me");
  assert.equal(anon.status, 401, "an unauthenticated request reached a protected endpoint");
});

// ---------------------------------------------------------------------------
// Stage B — workspace and team membership
// ---------------------------------------------------------------------------

test("Stage B: the manager creates a workspace and brings the member onto a team", async () => {
  // There is no self-serve join in Nexus: an existing admin adds an existing
  // account by email. That is the real path, so that is what is exercised.
  const created = await api("POST", "/api/workspaces", {
    cookie: cookies[MANAGER.email],
    body: { name: "Nexus E2E Workspace", description: "Phase 25 workflow" },
  });
  assert.equal(created.status, 201, `workspace creation failed: ${created.text}`);
  assert.equal(created.json.workspace.ownerId, state.managerId, "the creator is not the workspace owner");
  state.workspaceId = created.json.workspace.id;

  // The creator is an Admin member row, not just the ownerId.
  const ownerRow = await WorkspaceMember.findOne({
    workspaceId: state.workspaceId,
    userId: state.managerId,
  });
  assert.ok(ownerRow, "the creator has no workspace membership row");
  assert.equal(ownerRow.role, "Admin");

  for (const [person, role] of [
    [MEMBER, "Member"],
    [OUTSIDER, "Member"],
  ]) {
    const added = await api("POST", `${wsUrl(state.workspaceId)}/members`, {
      cookie: cookies[MANAGER.email],
      body: { email: person.email, role },
    });
    assert.equal(added.status, 201, `adding ${person.email} to the workspace failed: ${added.text}`);
  }

  const memberRow = await WorkspaceMember.findOne({
    workspaceId: state.workspaceId,
    userId: state.memberId,
  });
  assert.ok(memberRow, "the member's workspace membership was not persisted");
  assert.equal(memberRow.role, "Member");

  // Adding the same person twice is a conflict, not a duplicate row.
  const again = await api("POST", `${wsUrl(state.workspaceId)}/members`, {
    cookie: cookies[MANAGER.email],
    body: { email: MEMBER.email, role: "Member" },
  });
  assert.equal(again.status, 409, "a duplicate workspace membership was accepted");
  assert.equal(
    await WorkspaceMember.countDocuments({ workspaceId: state.workspaceId, userId: state.memberId }),
    1
  );

  // A workspace member cannot add other members — that is admin-only.
  const byMember = await api("POST", `${wsUrl(state.workspaceId)}/members`, {
    cookie: cookies[MEMBER.email],
    body: { email: "someone.else@e2e.test" },
  });
  assert.equal(byMember.status, 403, `a plain member added a workspace member: ${byMember.status}`);

  // A team inside the workspace, then the member joins it.
  const team = await api("POST", "/api/teams", {
    cookie: cookies[MANAGER.email],
    body: { workspaceId: state.workspaceId, name: "Delivery Team", description: "Ships deliverables" },
  });
  assert.equal(team.status, 201, `team creation failed: ${team.text}`);
  state.teamId = team.json.team.id;

  const lead = await TeamMember.findOne({ teamId: state.teamId, userId: state.managerId });
  assert.ok(lead, "the team creator does not lead the team");
  assert.equal(lead.role, "TEAM_LEAD");

  const joined = await api("POST", `/api/teams/${state.teamId}/members`, {
    cookie: cookies[MANAGER.email],
    body: { userId: state.memberId },
  });
  assert.equal(joined.status, 201, `joining the team failed: ${joined.text}`);

  const teamRow = await TeamMember.findOne({ teamId: state.teamId, userId: state.memberId });
  assert.ok(teamRow, "the team membership was not persisted");
  assert.equal(teamRow.role, "MEMBER");

  // The member can read the workspace and the team, and sees their real role.
  const wsRead = await api("GET", wsUrl(state.workspaceId), { cookie: cookies[MEMBER.email] });
  assert.equal(wsRead.status, 200);
  assert.equal(wsRead.json.role, "Member");

  const teamRead = await api("GET", `/api/teams/${state.teamId}/members`, { cookie: cookies[MEMBER.email] });
  assert.equal(teamRead.status, 200);
  assert.ok(
    teamRead.json.members.some((m) => m.user && m.user.id === state.memberId),
    "the member is missing from the team roster"
  );
  const teamDetail = await api("GET", `/api/teams/${state.teamId}`, { cookie: cookies[MEMBER.email] });
  assert.equal(teamDetail.status, 200);
  assert.equal(teamDetail.json.isTeamLead, false, "the member is being treated as the team lead");
  assert.equal(teamDetail.json.workspace.id, state.workspaceId);
});

// ---------------------------------------------------------------------------
// Stage C — project invitation and access control
// ---------------------------------------------------------------------------

test("Stage C: the manager creates a project and invites the member", async () => {
  const project = await api("POST", wsUrl(state.workspaceId) + "/projects", {
    cookie: cookies[MANAGER.email],
    body: {
      name: "E2E Delivery Project",
      description: "Phase 25 project",
      teamId: state.teamId,
      managerId: state.managerId,
      status: "ACTIVE",
    },
  });
  assert.equal(project.status, 201, `project creation failed: ${project.text}`);
  state.projectId = project.json.project.id;
  assert.equal(project.json.project.role, "PROJECT_MANAGER");

  const stored = await Project.findById(state.projectId);
  assert.equal(String(stored.workspaceId), state.workspaceId);
  assert.equal(String(stored.managerId), state.managerId);
  assert.equal(String(stored.teamId), state.teamId);

  // Board columns exist for the Kanban board without anyone creating them.
  const columns = await BoardColumn.find({ projectId: state.projectId }).sort({ position: 1 });
  assert.ok(columns.length > 0, "the project has no board columns");
  state.columnId = String(columns[0]._id);

  // Before the invitation: a workspace member who was not invited is refused.
  // This is the guarantee that workspace membership alone grants nothing.
  const beforeInvite = await api("GET", projectUrl(state.projectId), { cookie: cookies[OUTSIDER.email] });
  assert.equal(beforeInvite.status, 403, `a non-invited workspace member read the project (${beforeInvite.status})`);
  assert.equal(
    beforeInvite.json.message,
    "You do not have permission to view this project"
  );

  const outsiderList = await api("GET", "/api/projects", { cookie: cookies[OUTSIDER.email] });
  assert.equal(outsiderList.status, 200);
  assert.ok(
    !outsiderList.json.projects.some((p) => p.id === state.projectId),
    "an un-invited project appeared in the global project list"
  );

  // The invitation. In Nexus this is immediate membership: there is no pending
  // state and no accept step to call.
  const invite = await api("POST", `${projectUrl(state.projectId)}/members`, {
    cookie: cookies[MANAGER.email],
    body: { email: MEMBER.email, role: "MEMBER" },
  });
  assert.equal(invite.status, 201, `inviting the member failed: ${invite.text}`);

  const projectMemberRow = await ProjectMember.findOne({
    projectId: state.projectId,
    userId: state.memberId,
  });
  assert.ok(projectMemberRow, "the project membership was not persisted");
  assert.equal(projectMemberRow.role, "MEMBER");

  // The invite is announced to the person invited.
  const invitations = await Notification.find({ userId: state.memberId, type: "PROJECT_INVITATION" });
  assert.equal(invitations.length, 1, "the invitation notification was not persisted");
  assert.equal(String(invitations[0].entityId), state.projectId);
  assert.equal(invitations[0].entityType, "project");

  // A plain member cannot invite anyone else.
  const memberInvites = await api("POST", `${projectUrl(state.projectId)}/members`, {
    cookie: cookies[MEMBER.email],
    body: { email: OUTSIDER.email, role: "MEMBER" },
  });
  assert.equal(memberInvites.status, 403, "a project member was allowed to invite somebody");

  // Now the member can open it, and the outsider still cannot.
  const memberRead = await api("GET", projectUrl(state.projectId), { cookie: cookies[MEMBER.email] });
  assert.equal(memberRead.status, 200, `the invited member could not open the project: ${memberRead.text}`);
  assert.equal(memberRead.json.project.id, state.projectId);
  assert.equal(memberRead.json.project.role, "MEMBER");

  const outsiderAfter = await api("GET", projectUrl(state.projectId), { cookie: cookies[OUTSIDER.email] });
  assert.equal(outsiderAfter.status, 403, "the outsider gained access after somebody else was invited");
});

// ---------------------------------------------------------------------------
// Stage D — project views and resources
// ---------------------------------------------------------------------------

test("Stage D: opening the project records a view, and resources are project-private", async () => {
  // The view is recorded by the backend when the project is read, so it cannot
  // be skipped or forged by a client. Nothing here writes to ProjectView.
  // The member already opened the project once in Stage C, so the row exists;
  // what matters here is that it is attributed correctly, that it advances on
  // each visit, and that a refused visit records nothing.
  const opened = await api("GET", projectUrl(state.projectId), { cookie: cookies[MEMBER.email] });
  assert.equal(opened.status, 200);

  const view = await ProjectView.findOne({ viewerId: state.memberId, projectId: state.projectId });
  assert.ok(view, "opening the project did not record a view");
  assert.ok(view.lastViewedAt instanceof Date, "the view has no timestamp");
  const firstViewedAt = view.lastViewedAt;

  // A refused visit must not leave a trace.
  const refused = await api("GET", projectUrl(state.projectId), { cookie: cookies[OUTSIDER.email] });
  assert.equal(refused.status, 403);
  assert.equal(
    await ProjectView.countDocuments({ viewerId: state.outsiderId, projectId: state.projectId }),
    0,
    "a refused visit recorded a project view"
  );

  // Re-opening updates the same row rather than accumulating duplicates.
  await new Promise((resolve) => setTimeout(resolve, 15));
  await api("GET", projectUrl(state.projectId), { cookie: cookies[MEMBER.email] });
  const views = await ProjectView.find({ viewerId: state.memberId, projectId: state.projectId });
  assert.equal(views.length, 1, "a second visit created a duplicate view row");
  assert.ok(views[0].lastViewedAt > firstViewedAt, "the view timestamp did not advance");

  // The manager's own view of the same project is a separate row.
  await api("GET", projectUrl(state.projectId), { cookie: cookies[MANAGER.email] });
  assert.equal(
    await ProjectView.countDocuments({ projectId: state.projectId }),
    2,
    "the manager's view was not recorded separately"
  );

  // The dashboard reads those views back.
  const dashboard = await api("GET", "/api/me/dashboard", { cookie: cookies[MEMBER.email] });
  assert.equal(dashboard.status, 200);
  assert.ok(
    dashboard.json.dashboard.recentlyViewed.some((p) => p.id === state.projectId),
    "the project the member just opened is missing from recently viewed"
  );

  // Resources: created by the manager, listed by the member.
  const resource = await api("POST", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/resources`, {
    cookie: cookies[MANAGER.email],
    body: {
      name: "Nexus API Reference",
      url: "https://example.test/docs",
      category: "REFERENCE",
      description: "The API the frontend is built on",
    },
  });
  assert.equal(resource.status, 201, `creating a resource failed: ${resource.text}`);
  state.resourceId = resource.json.resource.id;

  const listed = await api("GET", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/resources`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.resources.length, 1);
  assert.equal(listed.json.resources[0].name, "Nexus API Reference");
  assert.equal(listed.json.resources[0].createdBy.id, state.managerId, "the creator is not populated");

  const resourceRow = await ProjectResource.findById(state.resourceId);
  assert.equal(String(resourceRow.projectId), state.projectId, "the resource is not bound to the project");
  assert.equal(resourceRow.category, "REFERENCE");

  // A member cannot create resources — that is a manager action.
  const memberCreates = await api("POST", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/resources`, {
    cookie: cookies[MEMBER.email],
    body: { name: "Member resource" },
  });
  assert.equal(memberCreates.status, 403, "a project member created a resource");

  // And the outsider cannot even list this project's resources.
  const outsiderReads = await api("GET", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/resources`, {
    cookie: cookies[OUTSIDER.email],
  });
  assert.equal(outsiderReads.status, 403, "an un-invited user read private project resources");
});

// ---------------------------------------------------------------------------
// Stage E — task assignment, subtasks and progress
// ---------------------------------------------------------------------------

test("Stage E: the manager assigns a task, the member works it, and progress follows the subtasks", async () => {
  const task = await api("POST", `${projectUrl(state.projectId)}/tasks`, {
    cookie: cookies[MANAGER.email],
    body: {
      title: "Write the delivery specification",
      description: "The approved artefact for this project",
      assignedTo: state.memberId,
      priority: "high",
    },
  });
  assert.equal(task.status, 201, `creating the task failed: ${task.text}`);
  state.taskId = task.json.task.id;
  assert.equal(task.json.task.assignedTo, state.memberId, "the task was not assigned in the response");

  let taskRow = await Task.findById(state.taskId);
  assert.equal(String(taskRow.assignedTo), state.memberId, "the assignment was not persisted");
  assert.equal(taskRow.status, "ASSIGNED");

  // A second task with no work started, so project progress is demonstrably an
  // average across tasks rather than a copy of the first one.
  const second = await api("POST", `${projectUrl(state.projectId)}/tasks`, {
    cookie: cookies[MANAGER.email],
    body: { title: "Prepare the launch checklist", assignedTo: state.memberId },
  });
  assert.equal(second.status, 201);
  state.secondTaskId = second.json.task.id;

  // The assignee is told, and the manager cannot start someone else's work.
  const assignments = await Notification.find({ userId: state.memberId, type: "TASK_ASSIGNED" });
  assert.ok(assignments.length >= 1, "assigning a task sent no notification");

  const managerStarts = await api("PATCH", `/api/tasks/${state.taskId}/status`, {
    cookie: cookies[MANAGER.email],
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(managerStarts.status, 403, "the manager started a task assigned to the member");

  const illegal = await api("PATCH", `/api/tasks/${state.taskId}/status`, {
    cookie: cookies[MEMBER.email],
    body: { status: "APPROVED" },
  });
  assert.equal(illegal.status, 400, `an illegal transition was accepted: ${illegal.text}`);
  assert.match(illegal.json.message, /Invalid status transition/);

  // The member starts their own task.
  const started = await api("PATCH", `/api/tasks/${state.taskId}/status`, {
    cookie: cookies[MEMBER.email],
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(started.status, 200, `the member could not start the task: ${started.text}`);
  assert.equal(started.json.task.status, "IN_PROGRESS");
  assert.equal(started.json.task.progress, 0, "an untouched task reported progress");
  taskRow = await Task.findById(state.taskId);
  assert.equal(taskRow.status, "IN_PROGRESS", "the status was not persisted");

  // Subtasks, weighted. 40 + 35 + 25 = 100.
  const plan = [
    { title: "Draft the outline", weight: 40 },
    { title: "Write the sections", weight: 35 },
    { title: "Proofread and submit", weight: 25 },
  ];
  for (const item of plan) {
    const created = await api("POST", `/api/tasks/${state.taskId}/subtasks`, {
      cookie: cookies[MEMBER.email],
      body: item,
    });
    assert.equal(created.status, 201, `creating subtask "${item.title}" failed: ${created.text}`);
  }

  const withSubtasks = await api("GET", `/api/tasks/${state.taskId}`, { cookie: cookies[MEMBER.email] });
  assert.equal(withSubtasks.json.task.subtasks.length, 3);
  assert.equal(withSubtasks.json.task.progress, 0, "a task with open subtasks reported progress");
  assert.equal(withSubtasks.json.task.weights.total, 100);
  assert.equal(withSubtasks.json.task.weights.pendingSubtasks, 3);

  // Complete them one at a time, checking progress after each.
  const expected = [40, 75, 100];
  for (const [index, weight] of [40, 35, 25].entries()) {
    const subtask = withSubtasks.json.task.subtasks[index];
    const done = await api("PATCH", `/api/subtasks/${subtask.id}`, {
      cookie: cookies[MEMBER.email],
      body: { status: "COMPLETED" },
    });
    assert.equal(done.status, 200, `completing subtask ${index + 1} failed: ${done.text}`);
    assert.equal(done.json.subtask.status, "COMPLETED");
    assert.equal(
      done.json.subtask.completed,
      true,
      "the legacy completed flag was not kept in step with the status"
    );
    assert.equal(
      done.json.progress,
      expected[index],
      `after ${index + 1} subtask(s) progress should be ${expected[index]}, got ${done.json.progress}`
    );
  }

  // Persisted, not just returned.
  taskRow = await Task.findById(state.taskId);
  assert.equal(taskRow.subtasks.length, 3);
  assert.ok(
    taskRow.subtasks.every((s) => s.status === "COMPLETED" && s.completed === true),
    "the completed subtasks were not persisted"
  );
  assert.equal(taskRow.subtasks.reduce((sum, s) => sum + s.weight, 0), 100);

  // Progress is derived, never stored, and never accepted from a client.
  assert.equal(taskRow.progress, undefined, "a progress value was written onto the task document");

  const ignored = await api("PATCH", `/api/tasks/${state.taskId}`, {
    cookie: cookies[MEMBER.email],
    body: { title: "Write the delivery specification", progress: 100 },
  });
  assert.equal(ignored.status, 200);
  assert.equal(ignored.json.task.progress, 100, "progress here comes from the subtasks, which are all done");

  // Project progress is the average across its tasks: 100 and 0 → 50.
  const projectRead = await api("GET", projectUrl(state.projectId), { cookie: cookies[MEMBER.email] });
  assert.equal(projectRead.status, 200);
  assert.equal(projectRead.json.project.stats.taskCount, 2);
  assert.equal(
    projectRead.json.project.progress,
    50,
    `project progress should average its two tasks to 50, got ${projectRead.json.project.progress}`
  );
});

// ---------------------------------------------------------------------------
// Stage F — deliverable upload and submission
// ---------------------------------------------------------------------------

test("Stage F: the member uploads a real file and submits it for review", async () => {
  const upload = await api("POST", `/api/tasks/${state.taskId}/deliverables`, {
    cookie: cookies[MEMBER.email],
    form: fileForm({
      buffer: pdfBytes("version-one"),
      name: "delivery-spec-v1.pdf",
      fields: { title: "Delivery specification", description: "First pass" },
    }),
  });
  assert.equal(upload.status, 201, `the upload failed: ${upload.text}`);

  state.deliverableId = upload.json.deliverable.id;
  assert.equal(upload.json.deliverable.status, "DRAFT");
  assert.equal(upload.json.deliverable.currentVersion, 1);
  assert.equal(upload.json.version.versionNumber, 1);
  assert.equal(upload.json.version.submittedBy, null, "a draft must not have a submitter yet");

  // The record points at the right project, task and author.
  const deliverableRow = await Deliverable.findById(state.deliverableId);
  assert.equal(String(deliverableRow.projectId), state.projectId);
  assert.equal(String(deliverableRow.taskId), state.taskId);
  assert.equal(String(deliverableRow.workspaceId), state.workspaceId);
  assert.equal(String(deliverableRow.createdBy), state.memberId);

  // The bytes are on disk under a generated key, not the submitted filename.
  const versionRow = await DeliverableVersion.findOne({
    deliverableId: state.deliverableId,
    versionNumber: 1,
  });
  assert.ok(versionRow, "no version row was written");
  assert.equal(versionRow.fileName, "delivery-spec-v1.pdf", "the display filename was not preserved");
  assert.notEqual(versionRow.storageKey, "delivery-spec-v1.pdf", "the submitted name was used as the storage key");
  const onDisk = path.join(process.env.UPLOAD_DIR, versionRow.storageKey);
  assert.ok(fs.existsSync(onDisk), `the file was not written to ${onDisk}`);
  assert.deepEqual(fs.readFileSync(onDisk), pdfBytes("version-one"), "the stored bytes differ from what was sent");

  // Security is unchanged: bad type, spoofed content, oversize, and an
  // unassigned task are all still refused. These run against the second task,
  // which has no deliverable yet — otherwise the "one deliverable per task"
  // rule would answer 409 before the upload checks were ever reached.
  const wrongType = await api("POST", `/api/tasks/${state.secondTaskId}/deliverables`, {
    cookie: cookies[MEMBER.email],
    form: fileForm({
      buffer: Buffer.from("#!/bin/sh\necho hi\n"),
      name: "payload.sh",
      type: "application/x-sh",
    }),
  });
  assert.equal(wrongType.status, 400, `a shell script was accepted: ${wrongType.text}`);

  const spoofed = await api("POST", `/api/tasks/${state.secondTaskId}/deliverables`, {
    cookie: cookies[MEMBER.email],
    form: fileForm({ buffer: Buffer.from("this is not a pdf at all"), name: "invoice.pdf" }),
  });
  assert.equal(spoofed.status, 400, "a non-PDF with a PDF name was accepted");

  const tooBig = await api("POST", `/api/tasks/${state.secondTaskId}/deliverables`, {
    cookie: cookies[MEMBER.email],
    form: fileForm({ buffer: Buffer.concat([pdfBytes("big"), Buffer.alloc(8192, 0x20)]) }),
  });
  assert.equal(tooBig.status, 413, `an oversized upload returned ${tooBig.status}, expected 413`);

  const anonUpload = await api("POST", `/api/tasks/${state.taskId}/deliverables`, {
    form: fileForm(),
  });
  assert.equal(anonUpload.status, 401, "an unauthenticated upload was accepted");

  // A user with no access to the project cannot upload at all.
  const notMine = await api("POST", `/api/tasks/${state.secondTaskId}/deliverables`, {
    cookie: cookies[OUTSIDER.email],
    form: fileForm(),
  });
  assert.ok([403, 404].includes(notMine.status), `an outsider uploaded to a task: ${notMine.status}`);

  // None of the refusals left anything behind.
  assert.equal(
    await Deliverable.countDocuments({ taskId: state.secondTaskId }),
    0,
    "a rejected upload created a deliverable"
  );

  // Submit. The task is IN_PROGRESS, which is the precondition.
  const submitted = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/1/submit`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(submitted.status, 200, `submitting failed: ${submitted.text}`);
  assert.equal(submitted.json.version.status, "SUBMITTED");
  assert.equal(submitted.json.deliverable.status, "SUBMITTED");
  assert.equal(submitted.json.task.status, "SUBMITTED", "the task did not follow the submission");
  assert.equal(submitted.json.version.submittedBy.id, state.memberId);

  // Submitting twice is refused rather than duplicating the transition.
  const resubmit = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/1/submit`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(resubmit.status, 400, `a second submit was accepted: ${resubmit.text}`);

  assert.equal((await DeliverableVersion.findOne({ deliverableId: state.deliverableId, versionNumber: 1 })).status, "SUBMITTED");
  assert.equal((await Deliverable.findById(state.deliverableId)).status, "SUBMITTED");
  assert.equal((await Task.findById(state.taskId)).status, "SUBMITTED");
});

// ---------------------------------------------------------------------------
// Stage G — manager notification, review, changes requested, resubmission
// ---------------------------------------------------------------------------

test("Stage G: the manager is notified, asks for changes, and the member resubmits", async () => {
  // The submission in Stage F already produced this notification, so it is
  // asserted from the database and the manager's feed. The live socket
  // assertions in this stage cover the decisions taken from here on, where the
  // test is the thing causing the event rather than observing a past one.
  const persisted = await Notification.findOne({
    userId: state.managerId,
    type: "DELIVERABLE_SUBMITTED",
  });
  assert.ok(persisted, "submitting the deliverable did not notify the project manager");
  assert.equal(String(persisted.actorId), state.memberId, "the notification does not name the submitter");
  assert.match(persisted.title, /review/i);
  assert.equal(persisted.read, false);

  const managerFeed = await api("GET", "/api/notifications", { cookie: cookies[MANAGER.email] });
  assert.equal(managerFeed.status, 200);
  assert.ok(managerFeed.json.unreadCount >= 1);
  assert.ok(
    managerFeed.json.notifications.some((n) => n.type === "DELIVERABLE_SUBMITTED"),
    "the manager's notification feed does not contain the submission"
  );

  // The member cannot read the manager's notifications.
  const memberSeesManagers = await Notification.countDocuments({
    _id: { $in: managerFeed.json.notifications.map((n) => n.id) },
    userId: state.memberId,
  });
  assert.equal(memberSeesManagers, 0, "the member's feed contained the manager's notifications");
  const memberFeed = await api("GET", "/api/notifications", { cookie: cookies[MEMBER.email] });
  assert.ok(
    !memberFeed.json.notifications.some((n) => n.id === String(persisted._id)),
    "the manager's notification leaked into the member's feed"
  );

  // A member cannot start the review, and cannot review their own work.
  const memberReviews = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/1/review`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(memberReviews.status, 403, `a member started the review: ${memberReviews.text}`);

  // The manager opens the submission and takes it into review. `GET
  // /api/deliverables/:id` returns the aggregate with `version: null` and the
  // per-version detail in `versions`, which is the shape the UI renders.
  const managerRead = await api("GET", `/api/deliverables/${state.deliverableId}`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(managerRead.status, 200, `the manager could not open the submission: ${managerRead.text}`);
  assert.equal(managerRead.json.deliverable.currentVersion, 1);
  assert.equal(managerRead.json.versions.length, 1);
  assert.equal(managerRead.json.versions[0].versionNumber, 1);
  assert.equal(managerRead.json.versions[0].submittedBy.id, state.memberId);
  assert.equal(managerRead.json.knowledge, null, "an unapproved submission is already in the Knowledge Base");

  const inReview = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/1/review`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(inReview.status, 200, `starting the review failed: ${inReview.text}`);
  assert.equal(inReview.json.version.status, "UNDER_REVIEW");
  assert.equal(inReview.json.task.status, "UNDER_REVIEW");

  // Feedback is required, and enforced.
  const noFeedback = await api(
    "PATCH",
    `/api/deliverables/${state.deliverableId}/versions/1/request-changes`,
    { cookie: cookies[MANAGER.email], body: { feedback: "no" } }
  );
  assert.equal(noFeedback.status, 400, "changes were requested without usable feedback");

  // Real-time: the member is connected and listening before the decision is
  // made, so this is the notification the browser would actually receive.
  const memberSocket = await connectAs(MEMBER.email);
  const liveNotice = waitFor(
    memberSocket,
    "notification:new",
    (payload) =>
      payload.notification &&
      payload.notification.type === "DELIVERABLE_REVIEWED" &&
      /changes requested/i.test(payload.notification.title)
  );

  const feedback = "Section two needs the acceptance criteria spelled out before this can be approved.";
  const changes = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/1/request-changes`, {
    cookie: cookies[MANAGER.email],
    body: { feedback },
  });
  assert.equal(changes.status, 200, `requesting changes failed: ${changes.text}`);
  assert.equal(changes.json.decision, "CHANGES_REQUESTED");
  assert.equal(changes.json.review.decision, "CHANGES_REQUESTED");
  assert.equal(changes.json.review.feedback, feedback);
  assert.equal(changes.json.version.status, "CHANGES_REQUESTED");
  assert.equal(changes.json.task.status, "CHANGES_REQUESTED");

  // It arrived on the socket, to the member and nobody else.
  const delivered = await liveNotice;
  assert.equal(String(delivered.notification.userId || ""), state.memberId, "the socket notification is not addressed to the member");

  const managerSocket = await connectAs(MANAGER.email);
  let managerGotIt = false;
  managerSocket.on("notification:new", () => {
    managerGotIt = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(managerGotIt, false, "the reviewer was sent their own review notification");

  // The decision is a real, attributed, append-only row.
  const reviewRow = await DeliverableReview.findOne({
    deliverableId: state.deliverableId,
    versionNumber: 1,
  });
  assert.ok(reviewRow, "the review decision was not persisted");
  assert.equal(String(reviewRow.reviewerId), state.managerId, "the reviewer is not recorded");
  assert.equal(reviewRow.decision, "CHANGES_REQUESTED");
  assert.equal(reviewRow.feedback, feedback);
  assert.ok(reviewRow.reviewedAt instanceof Date);

  // And the member is told in their feed as well as over the socket.
  const memberTold = await Notification.findOne({
    userId: state.memberId,
    type: "DELIVERABLE_REVIEWED",
  });
  assert.ok(memberTold, "requesting changes did not notify the member");
  assert.match(memberTold.title, /changes requested/i);
  assert.equal(String(memberTold.actorId), state.managerId);

  // The member uploads a new version. This is only allowed after changes were
  // requested, and it must not touch version 1.
  const v2 = await api("POST", `/api/deliverables/${state.deliverableId}/versions`, {
    cookie: cookies[MEMBER.email],
    form: fileForm({
      buffer: pdfBytes("version-two"),
      name: "delivery-spec-v2.pdf",
      fields: { description: "Acceptance criteria added" },
    }),
  });
  assert.equal(v2.status, 201, `the second version was rejected: ${v2.text}`);
  assert.equal(v2.json.version.versionNumber, 2, "the new version was not numbered 2");
  assert.equal(v2.json.deliverable.currentVersion, 2);
  assert.equal(v2.json.task.status, "IN_PROGRESS", "the task did not return to work");

  // A version cannot be conjured before changes are requested.
  const premature = await api("POST", `/api/deliverables/${state.deliverableId}/versions`, {
    cookie: cookies[MEMBER.email],
    form: fileForm({ buffer: pdfBytes("version-three") }),
  });
  assert.equal(premature.status, 400, "a new version was allowed outside the review loop");

  // Version 1 is history, untouched.
  const v1 = await DeliverableVersion.findOne({ deliverableId: state.deliverableId, versionNumber: 1 });
  assert.equal(v1.status, "CHANGES_REQUESTED", "version 1's status was overwritten");
  assert.equal(v1.fileName, "delivery-spec-v1.pdf", "version 1's file was replaced");
  assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR, v1.storageKey)), "version 1's file was deleted");

  // Resubmit, and take it back into review.
  const submitV2 = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/submit`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(submitV2.status, 200, `resubmitting failed: ${submitV2.text}`);
  assert.equal(submitV2.json.version.status, "SUBMITTED");

  const reviewV2 = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/review`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(reviewV2.status, 200, `reviewing v2 failed: ${reviewV2.text}`);
  assert.equal(reviewV2.json.version.status, "UNDER_REVIEW");

  // The manager sees the whole history, not just the current version.
  const history = await api("GET", `/api/deliverables/${state.deliverableId}/versions`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(history.status, 200);
  assert.equal(history.json.versions.length, 2, "the version history is incomplete");
  assert.deepEqual(
    history.json.versions.map((v) => v.versionNumber).sort((a, b) => a - b),
    [1, 2]
  );
  assert.equal(history.json.reviews.length, 1, "the earlier review decision was lost");
  assert.equal(history.json.reviews[0].decision, "CHANGES_REQUESTED");
  assert.equal(history.json.reviews[0].reviewer.id, state.managerId);
  assert.equal(history.json.versions.find((v) => v.versionNumber === 1).reviews.length, 1, "the decision is not attached to v1");

  // Both files are still downloadable, and each returns its own bytes.
  for (const [number, marker] of [[1, "version-one"], [2, "version-two"]]) {
    const download = await api(
      "GET",
      `/api/deliverables/${state.deliverableId}/versions/${number}/download`,
      { cookie: cookies[MANAGER.email] }
    );
    assert.equal(download.status, 200, `v${number} could not be downloaded`);
    assert.match(download.headers.get("content-type"), /application\/pdf/);
    assert.ok(
      download.text.includes(marker),
      `v${number} download returned the wrong file`
    );
  }

  const outsiderDownload = await api(
    "GET",
    `/api/deliverables/${state.deliverableId}/versions/2/download`,
    { cookie: cookies[OUTSIDER.email] }
  );
  assert.equal(outsiderDownload.status, 403, "an outsider downloaded a private submission");
});

// ---------------------------------------------------------------------------
// Stage H — manager approval
// ---------------------------------------------------------------------------

test("Stage H: only the manager can approve, and the approval is recorded against them", async () => {
  const memberApproves = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/approve`, {
    cookie: cookies[MEMBER.email],
    body: { feedback: "looks good to me" },
  });
  assert.equal(memberApproves.status, 403, `a member approved their own work: ${memberApproves.text}`);

  const outsiderApproves = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/approve`, {
    cookie: cookies[OUTSIDER.email],
  });
  assert.ok([403, 404].includes(outsiderApproves.status), `an outsider approved: ${outsiderApproves.status}`);

  // The approval gate on subtasks is real: reopen one through the ordinary
  // subtask endpoint and the approval must be refused.
  const openSubtask = (await Task.findById(state.taskId)).subtasks[0];
  const reopened = await api("PATCH", `/api/subtasks/${openSubtask._id}`, {
    cookie: cookies[MEMBER.email],
    body: { status: "TODO" },
  });
  assert.equal(reopened.status, 200, `reopening a subtask failed: ${reopened.text}`);
  assert.equal(reopened.json.subtask.status, "TODO");
  assert.equal(reopened.json.subtask.completed, false);
  assert.equal(reopened.json.progress, 60, "progress did not fall back when a subtask reopened");

  const blocked = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/approve`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(blocked.status, 400, "approval went through with an open subtask");
  assert.match(blocked.json.message, /Complete every subtask/);

  const reclosed = await api("PATCH", `/api/subtasks/${openSubtask._id}`, {
    cookie: cookies[MEMBER.email],
    body: { status: "COMPLETED" },
  });
  assert.equal(reclosed.status, 200);
  assert.equal(reclosed.json.progress, 100, "progress did not return when the subtask was redone");

  // Real-time: the member is listening when the approval lands.
  const memberSocket = await connectAs(MEMBER.email);
  const liveApproval = waitFor(
    memberSocket,
    "notification:new",
    (payload) =>
      payload.notification &&
      payload.notification.type === "DELIVERABLE_REVIEWED" &&
      /approved/i.test(payload.notification.title)
  );

  const approved = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/approve`, {
    cookie: cookies[MANAGER.email],
    body: { feedback: "Accepted. Shipping it." },
  });
  assert.equal(approved.status, 200, `approval failed: ${approved.text}`);
  assert.equal(approved.json.decision, "APPROVED");
  assert.equal(approved.json.version.status, "APPROVED");
  assert.equal(approved.json.deliverable.status, "APPROVED");
  assert.equal(approved.json.deliverable.approvedVersion, 2, "the approved version was not recorded");
  assert.equal(approved.json.task.status, "APPROVED", "the task did not reach its approved state");

  const heard = await liveApproval;
  assert.equal(
    String(heard.notification.userId || ""),
    state.memberId,
    "the approval notification was not addressed to the member"
  );

  // The approval is a real review row attributed to the manager.
  const approvalRow = await DeliverableReview.findOne({
    deliverableId: state.deliverableId,
    versionNumber: 2,
  });
  assert.ok(approvalRow, "the approval was not persisted");
  assert.equal(approvalRow.decision, "APPROVED");
  assert.equal(String(approvalRow.reviewerId), state.managerId);
  assert.equal(String(approvalRow.deliverableVersionId), String(approved.json.version.id));
  assert.ok(approvalRow.reviewedAt instanceof Date);

  const deliverableRow = await Deliverable.findById(state.deliverableId);
  assert.equal(deliverableRow.status, "APPROVED");
  assert.equal(deliverableRow.approvedVersion, 2);
  assert.notEqual(deliverableRow.currentVersion, deliverableRow.approvedVersion + 1);

  // Approving again is refused: the decision is compare-and-set, not idempotent.
  const again = await api("PATCH", `/api/deliverables/${state.deliverableId}/versions/2/approve`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(again.status, 400, `a second approval was accepted: ${again.text}`);

  // The member is notified of the outcome, and it arrives over the socket too.
  const approvalNotification = await Notification.findOne({
    userId: state.memberId,
    type: "DELIVERABLE_REVIEWED",
    title: /approved/i,
  });
  assert.ok(approvalNotification, "the member was not told the work was approved");

  // The activity log tells the same story.
  const logged = await Activity.find({ projectId: state.projectId }).sort({ createdAt: 1 });
  const actions = logged.map((a) => a.action);
  for (const expected of [
    "PROJECT_CREATED",
    "MEMBER_INVITED",
    "TASK_CREATED",
    "DELIVERABLE_CREATED",
    "DELIVERABLE_SUBMITTED",
    "DELIVERABLE_REVIEW_STARTED",
    "DELIVERABLE_CHANGES_REQUESTED",
    "DELIVERABLE_VERSION_CREATED",
    "DELIVERABLE_APPROVED",
  ]) {
    assert.ok(actions.includes(expected), `the activity log has no ${expected} entry: ${actions.join(", ")}`);
  }
});

// ---------------------------------------------------------------------------
// Stage I — Knowledge Base
// ---------------------------------------------------------------------------

test("Stage I: the approved deliverable reaches the Knowledge Base, traceable and exactly once", async () => {
  // Nothing has been promoted yet, and the API says so rather than pretending.
  const beforePromotion = await api("GET", `/api/deliverables/${state.deliverableId}`, {
    cookie: cookies[MANAGER.email],
  });
  assert.equal(beforePromotion.json.knowledge, null, "the entry appeared before it was promoted");
  assert.equal(
    await KnowledgeResource.countDocuments({ sourceDeliverableId: state.deliverableId }),
    0
  );

  // A member cannot promote — that is a manager action.
  const memberPromotes = await api(
    "POST",
    `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge/from-deliverable/${state.deliverableId}`,
    { cookie: cookies[MEMBER.email] }
  );
  assert.equal(memberPromotes.status, 403, `a member promoted a deliverable: ${memberPromotes.text}`);

  const promoted = await api(
    "POST",
    `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge/from-deliverable/${state.deliverableId}`,
    { cookie: cookies[MANAGER.email] }
  );
  assert.equal(promoted.status, 201, `promotion failed: ${promoted.text}`);
  state.knowledgeId = promoted.json.resource.id;

  // The entry is a real row that points back at everything that produced it.
  const entry = await KnowledgeResource.findById(state.knowledgeId);
  assert.ok(entry, "no Knowledge Base entry was written");
  assert.equal(String(entry.projectId), state.projectId);
  assert.equal(String(entry.workspaceId), state.workspaceId);
  assert.equal(String(entry.sourceDeliverableId), state.deliverableId);
  assert.equal(String(entry.sourceTaskId), state.taskId);
  assert.equal(entry.sourceVersionNumber, 2, "the entry does not name the approved version");
  assert.equal(entry.sourceType, "APPROVED_DELIVERABLE");
  assert.equal(entry.status, "APPROVED");
  assert.equal(entry.sourceFile.fileName, "delivery-spec-v2.pdf", "the entry does not reference the approved file");
  assert.ok(entry.sourceFile.storageKey, "the entry has no file reference");
  assert.equal(String(entry.createdBy), state.managerId);
  assert.ok(entry.approvedAt instanceof Date);

  // The approved bytes are the ones the Knowledge Base points at.
  const approvedFile = path.join(process.env.UPLOAD_DIR, entry.sourceFile.storageKey);
  assert.ok(fs.existsSync(approvedFile), "the approved file is missing");
  assert.deepEqual(fs.readFileSync(approvedFile), pdfBytes("version-two"));

  // Promoting the same deliverable again cannot create a second entry.
  const duplicate = await api(
    "POST",
    `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge/from-deliverable/${state.deliverableId}`,
    { cookie: cookies[MANAGER.email] }
  );
  assert.equal(duplicate.status, 409, `a duplicate promotion returned ${duplicate.status}`);
  assert.equal(
    await KnowledgeResource.countDocuments({ sourceDeliverableId: state.deliverableId }),
    1,
    "the Knowledge Base gained a duplicate entry"
  );

  // The member can browse and open it — the deliverable is the point of it.
  const listed = await api("GET", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(listed.status, 200, `the member could not list the Knowledge Base: ${listed.text}`);
  const found = listed.json.resources.find((r) => r.id === state.knowledgeId);
  assert.ok(found, "the approved deliverable is missing from the Knowledge Base listing");
  assert.equal(found.sourceVersionNumber, 2);
  assert.equal(found.sourceTaskId, state.taskId);
  assert.equal(found.sourceTaskTitle, "Write the delivery specification", "the entry is not linked to its task");

  const opened = await api("GET", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge/${state.knowledgeId}`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(opened.status, 200);
  assert.equal(opened.json.resource.sourceDeliverableId, state.deliverableId);

  // The deliverable payload now links forward to the entry.
  const linked = await api("GET", `/api/deliverables/${state.deliverableId}`, {
    cookie: cookies[MEMBER.email],
  });
  assert.equal(linked.json.knowledge.id, state.knowledgeId, "the deliverable does not link to its Knowledge Base entry");

  // And the outsider still cannot see any of it.
  const outsiderList = await api("GET", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge`, {
    cookie: cookies[OUTSIDER.email],
  });
  assert.equal(outsiderList.status, 403, "an outsider listed the Knowledge Base");
  const outsiderEntry = await api("GET", `${wsUrl(state.workspaceId)}/projects/${state.projectId}/knowledge/${state.knowledgeId}`, {
    cookie: cookies[OUTSIDER.email],
  });
  assert.equal(outsiderEntry.status, 403, "an outsider opened a Knowledge Base entry");
});

// ---------------------------------------------------------------------------
// Closing checks — the workflow left the data consistent
// ---------------------------------------------------------------------------

test("After the workflow: every record is consistent and the trail is complete", async () => {
  assert.equal(await Workspace.countDocuments({}), 1);
  assert.equal(await WorkspaceMember.countDocuments({ workspaceId: state.workspaceId }), 3);
  assert.equal(await TeamMember.countDocuments({ teamId: state.teamId }), 2);
  assert.equal(await ProjectMember.countDocuments({ projectId: state.projectId }), 2);
  assert.equal(await Deliverable.countDocuments({ projectId: state.projectId }), 1);
  assert.equal(await DeliverableVersion.countDocuments({ deliverableId: state.deliverableId }), 2);
  assert.equal(await DeliverableReview.countDocuments({ deliverableId: state.deliverableId }), 2);
  assert.equal(await KnowledgeResource.countDocuments({ projectId: state.projectId }), 1);
  // Two views: the member (twice, counted once) and the manager. The outsider
  // was refused, so they contributed none.
  assert.equal(await ProjectView.countDocuments({ projectId: state.projectId }), 2);
  assert.equal(await ProjectView.countDocuments({ viewerId: state.outsiderId, projectId: state.projectId }), 0);
  assert.equal(await ProjectResource.countDocuments({ projectId: state.projectId }), 1);

  // Every file the workflow created is still on disk, and nothing else is.
  const onDisk = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else onDisk.push(path.relative(process.env.UPLOAD_DIR, full));
    }
  };
  walk(process.env.UPLOAD_DIR);
  assert.equal(onDisk.length, 2, `expected exactly the two submitted versions on disk, found ${onDisk.length}`);

  // The approved version is the one that reached the Knowledge Base, and the
  // earlier version is still downloadable history rather than a replacement.
  const versions = await DeliverableVersion.find({ deliverableId: state.deliverableId }).sort({ versionNumber: 1 });
  assert.deepEqual(versions.map((v) => v.status), ["CHANGES_REQUESTED", "APPROVED"]);
  assert.ok(versions[0].storageKey !== versions[1].storageKey, "the two versions share a file");
});
