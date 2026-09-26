"use strict";

// Phase 20 — dashboard tests.
//
// The dashboard's whole value is that its numbers are real, so these tests are
// mostly about the ways a dashboard can lie:
//
//   • counts that include projects or tasks the user cannot open
//   • a progress percentage that is hardcoded, NaN, or out of range
//   • a task total that disagrees with the list shown next to it
//   • recently viewed entries for projects the user has since lost access to
//   • one user's dashboard readable by another, or by anyone unauthenticated
//   • stale figures after a task is completed, reassigned or deleted
//
// Every assertion compares the API against the database directly, so a test
// passing means the response matched the records — not that a constant was
// returned.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_dashboard_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-dashboard-test-secret";
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
const ProjectView = require("../src/models/projectView.model");
const Notification = require("../src/models/notification.model");

const app = require("../src/app");

const PASSWORD = "Password123!";
const NAMES = ["ada", "alan", "linus", "margaret", "outsider", "fresh"];

let server;
let base;
const state = {};
const cookies = {};

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

const dashboardFor = (who) => api("GET", "/api/me/dashboard", { cookie: cookies[who] });

// --- Fixtures ----------------------------------------------------------------
//
//   Workspace A (ada owns it)
//     Platform  — alan manages, linus + margaret are members
//     Sidecar   — linus manages
//   Workspace B (outsider owns it)
//     Foreign   — nobody in workspace A may see this
//
//   `fresh` is a real user in no workspace at all: the empty-dashboard case.
async function buildFixtures() {
  const users = {};
  for (const name of NAMES) {
    users[name] = await User.create({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: `${name}@acme.test`,
      password: PASSWORD,
    });
    state[`${name}Id`] = String(users[name]._id);
    state[`${name}UserId`] = users[name]._id;
  }

  const wsA = await Workspace.create({ name: "Acme", ownerId: users.ada._id });
  state.workspaceA = String(wsA._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
  ]);

  const platform = await Project.create({
    workspaceId: wsA._id,
    name: "Platform",
    status: "ACTIVE",
    managerId: users.alan._id,
    createdBy: users.alan._id,
  });
  state.platformId = String(platform._id);
  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.margaret._id, role: "MEMBER" },
  ]);

  // linus manages this one but is only a plain workspace Member, so it proves
  // the scope follows project reach rather than workspace membership.
  const sidecar = await Project.create({
    workspaceId: wsA._id,
    name: "Sidecar",
    status: "PLANNING",
    managerId: users.linus._id,
    createdBy: users.linus._id,
  });
  state.sidecarId = String(sidecar._id);
  await ProjectMember.create({
    projectId: sidecar._id,
    userId: users.linus._id,
    role: "PROJECT_MANAGER",
  });

  // margaret is in the workspace but in neither project: her dashboard must be
  // empty even though her workspace is not.
  const wsB = await Workspace.create({ name: "Other Co", ownerId: users.outsider._id });
  const foreign = await Project.create({
    workspaceId: wsB._id,
    name: "Foreign",
    status: "ACTIVE",
    managerId: users.outsider._id,
    createdBy: users.outsider._id,
  });
  state.foreignId = String(foreign._id);
  await ProjectMember.create({
    projectId: foreign._id,
    userId: users.outsider._id,
    role: "PROJECT_MANAGER",
  });

  const cols = {
    platform: await BoardColumn.create({ projectId: platform._id, name: "To Do", position: 0 }),
    sidecar: await BoardColumn.create({ projectId: sidecar._id, name: "To Do", position: 0 }),
    foreign: await BoardColumn.create({ projectId: foreign._id, name: "To Do", position: 0 }),
  };
  state.cols = cols;

  // linus: 4 tasks — 1 APPROVED, 3 open. Progress must be 25%, not 100%.
  await Task.insertMany([
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: cols.platform._id,
      title: "Linus approved task",
      status: "APPROVED",
      assignedTo: users.linus._id,
      createdBy: users.alan._id,
    },
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: cols.platform._id,
      title: "Linus open one",
      status: "IN_PROGRESS",
      assignedTo: users.linus._id,
      createdBy: users.alan._id,
    },
    {
      projectId: sidecar._id,
      workspaceId: wsA._id,
      columnId: cols.sidecar._id,
      title: "Linus open two",
      status: "ASSIGNED",
      assignedTo: users.linus._id,
      createdBy: users.linus._id,
    },
    {
      projectId: sidecar._id,
      workspaceId: wsA._id,
      columnId: cols.sidecar._id,
      title: "Linus open three",
      status: "UNDER_REVIEW",
      assignedTo: users.linus._id,
      createdBy: users.linus._id,
    },
    // Assigned to somebody else: it must not inflate linus's task count.
    {
      projectId: platform._id,
      workspaceId: wsA._id,
      columnId: cols.platform._id,
      title: "Alan task",
      status: "ASSIGNED",
      assignedTo: users.alan._id,
      createdBy: users.alan._id,
    },
  ]);

  await Notification.insertMany([
    {
      userId: users.linus._id,
      type: "TASK_ASSIGNED",
      title: "You were assigned a task",
      read: false,
    },
    {
      userId: users.linus._id,
      type: "COMMENT_MENTION",
      title: "You were mentioned",
      read: false,
    },
    {
      userId: users.linus._id,
      type: "TASK_COMPLETED",
      title: "An older, already read notification",
      read: true,
    },
  ]);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await buildFixtures();

  // The server must be listening before login: the helper talks HTTP.
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;

  await login("ada@acme.test");
  await login("alan@acme.test");
  await login("linus@acme.test");
  await login("margaret@acme.test");
  await login("outsider@acme.test");
  await login("fresh@acme.test");
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test("the dashboard refuses an unauthenticated request", async () => {
  const res = await api("GET", "/api/me/dashboard");
  assert.equal(res.status, 401, "an unauthenticated caller must not get dashboard data");
});

test("the dashboard cannot be asked for another user's id", async () => {
  // There is no user selector in the API at all, and adding one to the query
  // string must not change whose dashboard comes back.
  const res = await api("GET", `/api/me/dashboard?userId=${state.margaretId}`, {
    cookie: cookies.linus,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.dashboard.user.id, state.linusId, "the userId in the query must be ignored");
  assert.equal(res.json.dashboard.user.email, "linus@acme.test");
});

test("the greeting name is the authenticated user's own name", async () => {
  const res = await dashboardFor("margaret");
  assert.equal(res.status, 200);
  assert.equal(res.json.dashboard.user.id, state.margaretId);
  assert.equal(res.json.dashboard.user.name, "Margaret");
});

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

test("the task card counts only tasks assigned to the caller", async () => {
  const res = await dashboardFor("linus");
  const { stats } = res.json.dashboard;

  // Straight from the database, not from the response.
  const expected = await Task.countDocuments({ assignedTo: state.linusUserId });
  assert.equal(stats.tasks, expected, "the card must match the tasks actually assigned");

  // alan has one task of his own; it is linus's workspace but not linus's work.
  assert.equal(stats.tasks, 4);
});

test("progress is completed over total, rounded, and never hardcoded", async () => {
  const res = await dashboardFor("linus");
  const { stats } = res.json.dashboard;

  // linus: 1 APPROVED of 4.
  assert.equal(stats.completedTasks, 1);
  assert.equal(stats.tasks, 4);
  assert.equal(stats.progress, 25, "1 of 4 is 25%");
});

test("the legacy DONE label counts as complete, like the rest of the app", async () => {
  // Phase 11 treats APPROVED and the legacy DONE as terminal; the dashboard must
  // agree, or a migrated board would show 0% forever.
  await Task.create({
    projectId: state.platformId,
    workspaceId: state.workspaceA,
    columnId: state.cols.platform._id,
    title: "Legacy done task",
    status: "DONE",
    assignedTo: state.margaretUserId,
    createdBy: state.alanUserId,
  });

  const res = await dashboardFor("margaret");
  assert.equal(res.json.dashboard.stats.completedTasks, 1);
  assert.equal(res.json.dashboard.stats.progress, 100);

  await Task.deleteOne({ title: "Legacy done task" });
});

test("a user with no tasks reports 0% instead of NaN", async () => {
  // Division by zero is a real case: a brand new account has no tasks.
  const res = await dashboardFor("fresh");
  const { stats } = res.json.dashboard;

  assert.equal(stats.tasks, 0);
  assert.equal(stats.completedTasks, 0);
  assert.equal(stats.progress, 0);
  assert.ok(Number.isFinite(stats.progress), "progress must never be NaN");
});

test("the project count follows project reach, not workspace membership", async () => {
  // ada owns the workspace, so she reaches all three of its projects.
  const ada = await dashboardFor("ada");
  assert.equal(ada.json.dashboard.stats.projects, 2, "ada reaches Platform and Sidecar");

  // linus is only a member of one and manages the other.
  const linus = await dashboardFor("linus");
  assert.equal(linus.json.dashboard.stats.projects, 2, "linus reaches both by membership/management");

  // margaret is a workspace Member but in neither project, so she reaches none.
  const margaret = await dashboardFor("margaret");
  assert.equal(
    margaret.json.dashboard.stats.projects,
    0,
    "workspace membership alone must not put a project on the dashboard"
  );
});

test("a project is never counted twice for someone who both owns and manages it", async () => {
  // ada is the workspace owner *and* creates projects; alan is a workspace
  // Admin *and* the Platform manager. Both reach projects by two paths at once.
  const alan = await dashboardFor("alan");
  const distinct = new Set(alan.json.dashboard.recentlyViewed.map((p) => p.id));
  assert.equal(distinct.size, alan.json.dashboard.recentlyViewed.length);
  assert.equal(alan.json.dashboard.stats.projects, 2);
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

test("one user's dashboard never contains another user's project", async () => {
  const res = await dashboardFor("linus");
  const ids = [
    ...res.json.dashboard.myTasks.map((t) => t.projectId),
    ...res.json.dashboard.recentlyViewed.map((p) => p.id),
  ].filter(Boolean);

  assert.ok(!ids.includes(state.foreignId), "the foreign project must not appear anywhere");
  assert.equal(
    ids.includes(state.foreignId),
    false
  );
});

test("a user in no workspace sees an empty dashboard, not someone else's", async () => {
  const res = await dashboardFor("fresh");
  const { stats, myTasks, recentlyViewed } = res.json.dashboard;

  assert.equal(stats.projects, 0);
  assert.equal(stats.tasks, 0);
  assert.equal(stats.progress, 0);
  assert.deepEqual(myTasks, []);
  assert.deepEqual(recentlyViewed, []);
});

// ---------------------------------------------------------------------------
// My Tasks
// ---------------------------------------------------------------------------

test("My Tasks agrees with the task card and carries real project names", async () => {
  const res = await dashboardFor("linus");
  const { stats, myTasks } = res.json.dashboard;

  // The card counts every assigned task; the list is a capped preview of the
  // same set. They must not describe different populations.
  const fromDb = await Task.find({ assignedTo: state.linusUserId }).select("title projectId");
  assert.equal(stats.tasks, fromDb.length);
  assert.ok(myTasks.length <= fromDb.length, "the list is a preview, never larger than the set");
  assert.equal(myTasks.length, 4, "4 assigned tasks, all within the preview cap");

  for (const task of myTasks) {
    const real = fromDb.find((t) => String(t._id) === task.id);
    assert.ok(real, `task ${task.id} came from the database`);
    assert.equal(task.title, real.title, "titles are not invented or reformatted");
    assert.ok(task.projectName && task.projectName !== "Unknown project");
  }
  assert.ok(
    myTasks.some((t) => t.projectName === "Platform"),
    "a project name must be resolved, not left blank"
  );
});

test("My Tasks carries the task's real status, not a guess", async () => {
  const res = await dashboardFor("linus");
  for (const task of res.json.dashboard.myTasks) {
    const real = await Task.findById(task.id).select("status");
    assert.equal(task.status, real.status);
  }
  assert.deepEqual(
    res.json.dashboard.myTasks.map((t) => t.status).sort(),
    ["APPROVED", "ASSIGNED", "IN_PROGRESS", "UNDER_REVIEW"]
  );
});

// ---------------------------------------------------------------------------
// Reactivity to database changes (§13.6, §13.7)
// ---------------------------------------------------------------------------

test("completing a task changes the progress percentage on the next load", async () => {
  const before = await dashboardFor("linus");
  assert.equal(before.json.dashboard.stats.progress, 25);

  await Task.updateOne(
    { assignedTo: state.linusUserId, status: "IN_PROGRESS" },
    { $set: { status: "APPROVED" } }
  );

  const after = await dashboardFor("linus");
  assert.equal(after.json.dashboard.stats.completedTasks, 2, "the completion must be counted");
  assert.equal(after.json.dashboard.stats.progress, 50, "2 of 4 is 50%");

  // Put it back so later tests see the original fixture.
  await Task.updateOne({ assignedTo: state.linusUserId, status: "APPROVED", title: "Linus open one" }, {
    $set: { status: "IN_PROGRESS" },
  });
});

test("reassigning a task moves it off one dashboard and onto another", async () => {
  const beforeLinus = await dashboardFor("linus");
  const beforeAlan = await dashboardFor("alan");
  assert.equal(beforeLinus.json.dashboard.stats.tasks, 4);
  assert.equal(beforeAlan.json.dashboard.stats.tasks, 1);

  await Task.updateOne({ title: "Linus open two" }, { $set: { assignedTo: state.alanUserId } });

  const afterLinus = await dashboardFor("linus");
  const afterAlan = await dashboardFor("alan");
  assert.equal(afterLinus.json.dashboard.stats.tasks, 3, "linus lost the task");
  assert.equal(
    afterLinus.json.dashboard.myTasks.some((t) => t.title === "Linus open two"),
    false,
    "and it left his list"
  );
  assert.equal(afterAlan.json.dashboard.stats.tasks, 2, "alan gained the task");
  assert.ok(afterAlan.json.dashboard.myTasks.some((t) => t.title === "Linus open two"));

  await Task.updateOne({ title: "Linus open two" }, { $set: { assignedTo: state.linusUserId } });
});

test("deleting a task removes it from the card and the list", async () => {
  const created = await Task.create({
    projectId: state.sidecarId,
    workspaceId: state.workspaceA,
    columnId: state.cols.sidecar._id,
    title: "Temporary task",
    status: "ASSIGNED",
    assignedTo: state.linusUserId,
    createdBy: state.linusUserId,
  });

  const withTask = await dashboardFor("linus");
  assert.equal(withTask.json.dashboard.stats.tasks, 5);
  assert.ok(withTask.json.dashboard.myTasks.some((t) => t.id === String(created._id)));

  await Task.deleteOne({ _id: created._id });

  const withoutTask = await dashboardFor("linus");
  assert.equal(withoutTask.json.dashboard.stats.tasks, 4, "the count follows the delete");
  assert.equal(
    withoutTask.json.dashboard.myTasks.some((t) => t.id === String(created._id)),
    false
  );
});

// ---------------------------------------------------------------------------
// Recently viewed
// ---------------------------------------------------------------------------

test("opening a project records a view, and repeat visits do not duplicate it", async () => {
  const first = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.linus });
  assert.equal(first.status, 200);

  let views = await ProjectView.find({ viewerId: state.linusUserId, projectId: state.platformId });
  assert.equal(views.length, 1, "opening a project records exactly one view row");

  // Open it twice more: the unique (viewerId, projectId) index means the row is
  // updated, never appended.
  await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.linus });
  await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.linus });

  views = await ProjectView.find({ viewerId: state.linusUserId, projectId: state.platformId });
  assert.equal(views.length, 1, "repeat visits must update, not accumulate");
});

test("the dashboard itself does not mark projects as viewed", async () => {
  // A dashboard load reads many projects. If it recorded views, every project
  // the user can see would look "recently viewed" and the list would be
  // meaningless.
  await ProjectView.deleteMany({ viewerId: state.margaretUserId });

  await dashboardFor("margaret");
  await dashboardFor("margaret");

  const views = await ProjectView.find({ viewerId: state.margaretUserId });
  assert.equal(views.length, 0, "loading the dashboard must not create view records");
});

test("recently viewed is ordered most recent first", async () => {
  await ProjectView.deleteMany({ viewerId: state.linusUserId });

  const now = Date.now();
  // Oldest first, so insertion order is the opposite of the expected output.
  await ProjectView.insertMany([
    { viewerId: state.linusUserId, projectId: state.platformId, lastViewedAt: new Date(now - 60000) },
    { viewerId: state.linusUserId, projectId: state.sidecarId, lastViewedAt: new Date(now - 1000) },
  ]);

  const res = await dashboardFor("linus");
  const ids = res.json.dashboard.recentlyViewed.map((p) => p.id);

  assert.equal(ids[0], state.sidecarId, "the most recent view comes first");
  assert.equal(ids[1], state.platformId);
});

test("recently viewed never includes a project the user cannot open", async () => {
  // Seed a view for the foreign project directly. The dashboard must not surface
  // it just because the row exists — the list is intersected with what the user
  // can actually reach.
  await ProjectView.create({
    viewerId: state.linusUserId,
    projectId: state.foreignId,
    lastViewedAt: new Date(),
  });

  const res = await dashboardFor("linus");
  const ids = res.json.dashboard.recentlyViewed.map((p) => p.id);
  assert.equal(
    ids.includes(state.foreignId),
    false,
    "a view row must not become a back door to a project"
  );

  await ProjectView.deleteMany({ viewerId: state.linusUserId, projectId: state.foreignId });
});

test("recently viewed excludes a project that has been deleted", async () => {
  const doomed = await Project.create({
    workspaceId: state.workspaceA,
    name: "Doomed",
    status: "ACTIVE",
    managerId: state.linusUserId,
    createdBy: state.linusUserId,
  });
  await ProjectMember.create({
    projectId: doomed._id,
    userId: state.linusUserId,
    role: "PROJECT_MANAGER",
  });
  await ProjectView.create({
    viewerId: state.linusUserId,
    projectId: doomed._id,
    lastViewedAt: new Date(),
  });

  const before = await dashboardFor("linus");
  assert.ok(
    before.json.dashboard.recentlyViewed.some((p) => p.id === String(doomed._id)),
    "a reachable, viewed project should be listed"
  );

  await Project.deleteOne({ _id: doomed._id });

  const after = await dashboardFor("linus");
  assert.equal(
    after.json.dashboard.recentlyViewed.some((p) => p.id === String(doomed._id)),
    false,
    "a deleted project must disappear from recently viewed"
  );
});

test("recently viewed is capped and never returns duplicates", async () => {
  await ProjectView.deleteMany({ viewerId: state.alanUserId });

  const bulk = [];
  for (let i = 0; i < 8; i += 1) {
    const p = await Project.create({
      workspaceId: state.workspaceA,
      name: `Bulk ${i}`,
      status: "ACTIVE",
      managerId: state.alanUserId,
      createdBy: state.alanUserId,
    });
    bulk.push(p._id);
  }
  await ProjectView.insertMany(
    bulk.map((projectId, i) => ({
      viewerId: state.alanUserId,
      projectId,
      lastViewedAt: new Date(Date.now() - i * 1000),
    }))
  );

  const res = await dashboardFor("alan");
  const list = res.json.dashboard.recentlyViewed;

  assert.ok(list.length <= 5, `expected at most 5 entries, got ${list.length}`);
  assert.equal(new Set(list.map((p) => p.id)).size, list.length, "no duplicate entries");
  // Newest first, so the most recently created bulk project leads.
  assert.equal(list[0].id, String(bulk[0]));

  await ProjectView.deleteMany({ viewerId: state.alanUserId });
  await Project.deleteMany({ _id: { $in: bulk } });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

test("a user only ever sees their own notifications", async () => {
  await Notification.create({
    userId: state.margaretUserId,
    type: "TASK_ASSIGNED",
    title: "Margaret's private notification",
    read: false,
  });

  const linus = await dashboardFor("linus");
  assert.equal(
    linus.json.dashboard.notifications,
    undefined,
    "the dashboard endpoint does not serve notifications; that is the hook's job"
  );

  // The existing notifications endpoint must still be per-user.
  const res = await api("GET", "/api/notifications", { cookie: cookies.linus });
  const titles = res.json.notifications.map((n) => n.title);
  assert.equal(titles.includes("Margaret's private notification"), false);
  assert.equal(res.json.unreadCount, 2, "linus has exactly two unread");

  await Notification.deleteMany({ userId: state.margaretUserId });
});

test("marking a notification read changes the unread count", async () => {
  const before = await api("GET", "/api/notifications", { cookie: cookies.linus });
  assert.equal(before.json.unreadCount, 2);

  const target = before.json.notifications.find((n) => !n.read);
  const patched = await api("PATCH", `/api/notifications/${target.id}`, {
    cookie: cookies.linus,
    body: { read: true },
  });
  assert.equal(patched.status, 200);

  const after = await api("GET", "/api/notifications", { cookie: cookies.linus });
  assert.equal(after.json.unreadCount, 1, "the count follows the read");

  // Restore.
  await Notification.updateOne({ _id: target.id }, { $set: { read: false } });
});

// ---------------------------------------------------------------------------
// Payload hygiene
// ---------------------------------------------------------------------------

test("the dashboard payload leaks no credentials", async () => {
  const res = await dashboardFor("linus");
  const text = JSON.stringify(res.json);

  assert.equal(text.includes("password"), false);
  assert.equal(text.includes("$2"), false, "no bcrypt hash");
  assert.equal(text.includes("nexus_token"), false, "no token");
  assert.equal(res.json.dashboard.user.password, undefined);
  assert.equal(res.json.dashboard.user.passwordHash, undefined);

  // And nothing from the other workspace appears anywhere in the body.
  assert.equal(text.includes("Foreign"), false);
});
