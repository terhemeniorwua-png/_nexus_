"use strict";

// Phase 8 — Project management integration tests.
//
// Covers the global /api/projects routes: create, list (authorized filtering),
// get (relation enrichment + project-level authorization), update (relationship
// + enum + date validation) and delete (permission-gated), plus the
// create-project metadata endpoint and cross-workspace isolation.
//
// Runs against a dedicated MongoDB database (nexus_projects_test) using only
// Node's built-in test runner (node:test) and global fetch.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_projects_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-projects-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");
const Team = require("../src/models/team.model");
const TeamMember = require("../src/models/teamMember.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const app = require("../src/app");

const PASSWORD = "Password123!";
const USER_NAMES = ["ada", "alan", "linus", "margaret", "grace", "outsider", "ghost"];

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
    // non-JSON response body
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
  const wsA = await Workspace.create({ name: "Workspace A", description: "The real one", ownerId: users.ada._id });
  state.workspaceA = String(wsA._id);

  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
  ]);

  // barbara: the viewer — created on the fly so she is NOT in USER_NAMES loop
  const barbara = await User.create({
    name: "Barbara",
    email: "barbara@acme.test",
    password: PASSWORD,
  });
  state.barbaraId = String(barbara._id);
  state.barbaraEmail = "barbara@acme.test";
  await WorkspaceMember.create({ workspaceId: wsA._id, userId: barbara._id, role: "Viewer" });

  const engineeringA = await Team.create({ workspaceId: wsA._id, name: "Engineering A", description: "Builds things" });
  const researchA = await Team.create({ workspaceId: wsA._id, name: "Research A", description: "Researches things" });
  state.engineeringA = String(engineeringA._id);
  state.researchA = String(researchA._id);

  await TeamMember.insertMany([
    { teamId: engineeringA._id, userId: users.alan._id, role: "TEAM_LEAD" },
    { teamId: engineeringA._id, userId: users.linus._id, role: "MEMBER" },
    { teamId: researchA._id, userId: users.margaret._id, role: "TEAM_LEAD" },
  ]);

  const platform = await Project.create({
    workspaceId: wsA._id,
    teamId: engineeringA._id,
    name: "Nexus Platform Build",
    description: "Core platform",
    status: "ACTIVE",
    priority: "HIGH",
    managerId: users.alan._id,
    startDate: new Date("2026-01-01"),
    dueDate: new Date("2026-12-31"),
    createdBy: users.ada._id,
  });
  state.platformId = String(platform._id);
  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.ada._id, role: "COLLABORATOR" },
  ]);

  // --- Workspace B (owned by outsider) ---------------------------------------
  const wsB = await Workspace.create({ name: "Workspace B", description: "The other one", ownerId: users.outsider._id });
  state.workspaceB = String(wsB._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsB._id, userId: users.outsider._id, role: "Admin" },
    { workspaceId: wsB._id, userId: users.grace._id, role: "Member" },
    // ada is a member of B too, so cross-workspace attempts from ada reach the
    // relationship checks instead of failing on membership.
    { workspaceId: wsB._id, userId: users.ada._id, role: "Member" },
  ]);
  const engineeringB = await Team.create({ workspaceId: wsB._id, name: "Engineering B", description: "Other build team" });
  state.engineeringB = String(engineeringB._id);

  const otherProject = await Project.create({
    workspaceId: wsB._id,
    teamId: engineeringB._id,
    name: "Other Project",
    description: "Belongs to workspace B",
    status: "PLANNING",
    priority: "LOW",
    managerId: users.grace._id,
    createdBy: users.outsider._id,
  });
  state.otherProjectId = String(otherProject._id);
  await ProjectMember.create({ projectId: otherProject._id, userId: users.grace._id, role: "PROJECT_MANAGER" });

  // ghosts (no memberships anywhere)
  state.ghostId = String(users.ghost._id);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();

  await buildFixtures();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const emails = [
    "ada@acme.test",
    "alan@acme.test",
    "linus@acme.test",
    "margaret@acme.test",
    "grace@acme.test",
    "outsider@acme.test",
    "ghost@acme.test",
    "barbara@acme.test",
  ];
  const names = ["ada", "alan", "linus", "margaret", "grace", "outsider", "ghost", "barbara"];
  for (let i = 0; i < names.length; i += 1) {
    cookies[names[i]] = await login(emails[i]);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test("unauthenticated requests to /api/projects are rejected with 401", async () => {
  const res = await api("GET", "/api/projects");
  assert.equal(res.status, 401);
  assert.equal(res.json.success, false);
});

test("invalid tokens are rejected with 401", async () => {
  const res = await api("GET", "/api/projects", { cookie: "nexus_token=not.a.jwt" });
  assert.equal(res.status, 401);
});

test("unauthenticated POST /api/projects is rejected with 401", async () => {
  const res = await api("POST", "/api/projects", { body: { name: "X" } });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Create project
// ---------------------------------------------------------------------------

test("owner/admin can create a project and the manager/creator become PROJECT_MANAGER", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: {
      name: "Nexus Research Platform",
      description: "Build a collaborative research management platform",
      teamId: state.researchA,
      managerId: state.margaretId,
      startDate: "2026-09-24",
      dueDate: "2026-12-20",
      priority: "HIGH",
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));

  const project = res.json.project;
  assert.equal(project.name, "Nexus Research Platform");
  assert.equal(project.status, "PLANNING");
  assert.equal(project.priority, "HIGH");
  assert.equal(project.team.id, state.researchA);
  assert.equal(project.team.workspaceId, state.workspaceA);
  assert.equal(project.manager.id, state.margaretId);
  assert.equal(project.workspace.id, state.workspaceA);

  const managerRow = await ProjectMember.findOne({ projectId: project.id, userId: state.margaretId });
  assert.equal(managerRow.role, "PROJECT_MANAGER");
  const creatorRow = await ProjectMember.findOne({ projectId: project.id, userId: state.alanId });
  assert.equal(creatorRow.role, "PROJECT_MANAGER");
});

test("workspace member can create a project they have create_project for", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.margaret,
    body: {
      name: "Margaret Project",
      description: "A member-created project",
      teamId: state.researchA,
      managerId: state.margaretId,
      startDate: "2026-09-24",
      dueDate: "2026-10-30",
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.project.manager.id, state.margaretId);
});

test("viewer cannot create a project (403)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.barbara,
    body: { name: "Nope", teamId: state.engineeringA, managerId: state.barbaraId },
  });
  assert.equal(res.status, 403);
});

test("user with no workspace access cannot create a project (403)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.ghost,
    body: { name: "Nope", teamId: state.engineeringA, managerId: state.linusId },
  });
  assert.equal(res.status, 403);
});

test("create without a team is rejected (400)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: { name: "No team", managerId: state.linusId },
  });
  assert.equal(res.status, 400);
});

test("create with an unknown team is 404", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: { name: "Bad team", teamId: new mongoose.Types.ObjectId().toString(), managerId: state.linusId },
  });
  assert.equal(res.status, 404);
});

test("create without a manager is rejected (400)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: { name: "No manager", teamId: state.researchA },
  });
  assert.equal(res.status, 400);
});

test("a manager from another workspace cannot manage a project here (400)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: {
      name: "Wrong manager",
      teamId: state.researchA,
      managerId: state.outsiderId,
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /member of this workspace/);
});

test("body.workspaceId is never trusted — project is attached to the team's workspace", async () => {
  // ada is a member of workspace B, so she may create in B's team despite
  // claiming workspace A in the body. The manager must be a B member, so we
  // assign grace (a workspace-B member).
  const res = await api("POST", "/api/projects", {
    cookie: cookies.ada,
    body: {
      name: "Team rules",
      teamId: state.engineeringB,
      managerId: state.graceId,
      workspaceId: state.workspaceA,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(res.json.project.workspace.id, state.workspaceB);
  assert.notEqual(res.json.project.workspace.id, state.workspaceA);
});

test("invalid priority is rejected (400)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: { name: "P", teamId: state.researchA, managerId: state.linusId, priority: "SUPERHIGH" },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /Priority must be/);
});

test("invalid status is rejected (400)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: { name: "S", teamId: state.researchA, managerId: state.linusId, status: "DOING" },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /Status must be/);
});

test("invalid dates are rejected (400)", async () => {
  const badDate = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: { name: "D", teamId: state.researchA, managerId: state.linusId, startDate: "not-a-date" },
  });
  assert.equal(badDate.status, 400);
  assert.match(badDate.json.message, /Invalid start date/);
});

test("due date before start date is rejected (400)", async () => {
  const res = await api("POST", "/api/projects", {
    cookie: cookies.alan,
    body: {
      name: "Backwards",
      teamId: state.researchA,
      managerId: state.linusId,
      startDate: "2026-12-20",
      dueDate: "2026-09-24",
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /Due date cannot be before the start date/);
});

// ---------------------------------------------------------------------------
// List projects (authorized filtering)
// ---------------------------------------------------------------------------

test("owner sees all projects in their accessible workspaces", async () => {
  const res = await api("GET", "/api/projects", { cookie: cookies.ada });
  assert.equal(res.status, 200);
  const names = res.json.projects.map((p) => p.name).sort();
  assert.ok(names.includes("Nexus Platform Build"));
  assert.ok(names.includes("Nexus Research Platform"));
  assert.ok(names.includes("Margaret Project"));
});

test("a member only sees projects they are a member of or manage", async () => {
  // linus: MEMBER on platform, no other rows. Must NOT see WS-A projects he
  // is not a member of, and nothing from workspace B.
  const res = await api("GET", "/api/projects", { cookie: cookies.linus });
  assert.equal(res.status, 200);
  const projects = res.json.projects;
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "Nexus Platform Build");
  assert.equal(projects[0].role, "MEMBER");
});

test("a user with no workspace access sees an empty list (200)", async () => {
  const res = await api("GET", "/api/projects", { cookie: cookies.ghost });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.projects, []);
});

test("status/priority filters return only authorized matches", async () => {
  const active = await api("GET", "/api/projects?status=ACTIVE", { cookie: cookies.linus });
  assert.equal(active.status, 200);
  assert.equal(active.json.projects.length, 1);

  const planning = await api("GET", "/api/projects?status=PLANNING", { cookie: cookies.ada });
  assert.ok(planning.json.projects.length >= 1);
  planning.json.projects.forEach((p) => assert.equal(p.status, "PLANNING"));

  const high = await api("GET", "/api/projects?priority=HIGH", { cookie: cookies.linus });
  assert.equal(high.json.projects.length, 1);
  high.json.projects.forEach((p) => assert.equal(p.priority, "HIGH"));
});

test("team filter respects authorization — unauthorized team returns nothing", async () => {
  // grace (a member of workspace B who manages a B project) asks for B's
  // engineering team and sees B's project; margaret (workspace-A only) asks
  // for the same team and gets an empty list.
  const grace = await api("GET", `/api/projects?teamId=${state.engineeringB}`, { cookie: cookies.grace });
  assert.equal(grace.status, 200);
  assert.ok(grace.json.projects.some((p) => p.id === state.otherProjectId));

  const margaret = await api("GET", `/api/projects?teamId=${state.engineeringB}`, { cookie: cookies.margaret });
  assert.equal(margaret.status, 200);
  assert.deepEqual(margaret.json.projects, []);
});

test("invalid filter values are rejected (400)", async () => {
  const res = await api("GET", "/api/projects?status=BOGUS", { cookie: cookies.ada });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Get project
// ---------------------------------------------------------------------------

test("authorized user gets project detail with team/manager/workspace/members", async () => {
  const res = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.ada });
  assert.equal(res.status, 200);
  const project = res.json.project;
  assert.equal(project.team.name, "Engineering A");
  assert.equal(project.workspace.name, "Workspace A");
  assert.equal(project.manager.id, state.alanId);
  assert.equal(project.manager.name, "Alan");
  assert.ok(Array.isArray(project.members));
  assert.ok(project.members.some((m) => m.role === "PROJECT_MANAGER"));
  assert.ok(project.stats.taskCount >= 0);
});

test("project member sees the project at their role", async () => {
  const res = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.linus });
  assert.equal(res.status, 200);
  assert.equal(res.json.project.role, "MEMBER");
});

test("id manipulation: user from another workspace cannot view the project (403)", async () => {
  const res = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.margaret });
  assert.equal(res.status, 403);
  assert.match(res.json.message, /view this project/);
});

test("GET unknown project id is 404", async () => {
  const res = await api("GET", `/api/projects/${new mongoose.Types.ObjectId().toString()}`, { cookie: cookies.ada });
  assert.equal(res.status, 404);
  assert.match(res.json.message, /Project not found/);
});

// ---------------------------------------------------------------------------
// Update project
// ---------------------------------------------------------------------------

test("viewer cannot update a project (403)", async () => {
  const res = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.barbara,
    body: { name: "Hacked" },
  });
  assert.equal(res.status, 403);
});

test("member cannot update a project (403)", async () => {
  const res = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.linus,
    body: { name: "Hacked" },
  });
  assert.equal(res.status, 403);
});

test("manager/admin can update fields, and status transitions are gated by update_project", async () => {
  const res = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.alan,
    body: {
      description: "Updated description",
      priority: "URGENT",
      status: "COMPLETED",
      dueDate: "2026-11-30",
    },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const project = res.json.project;
  assert.equal(project.description, "Updated description");
  assert.equal(project.priority, "URGENT");
  assert.equal(project.status, "COMPLETED");
  assert.ok(project.dueDate);
});

test("update to a team from a different workspace is rejected (400)", async () => {
  const res = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.alan,
    body: { teamId: state.engineeringB },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /does not belong to this workspace/);
});

test("update manager to a user from another workspace is rejected (400)", async () => {
  const res = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.alan,
    body: { managerId: state.outsiderId },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /member of this workspace/);
});

test("manager handoff promotes the new manager and demotes the old one", async () => {
  const project = await Project.create({
    workspaceId: state.workspaceA,
    teamId: state.researchA,
    name: "Handoff Project",
    managerId: state.adaId,
    createdBy: state.adaId,
  });
  await ProjectMember.create({ projectId: project._id, userId: state.adaId, role: "PROJECT_MANAGER" });

  const res = await api("PATCH", `/api/projects/${project._id}`, {
    cookie: cookies.alan,
    body: { managerId: state.linusId },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.project.manager.id, state.linusId);

  const newRow = await ProjectMember.findOne({ projectId: project._id, userId: state.linusId });
  assert.equal(newRow.role, "PROJECT_MANAGER");
  const oldRow = await ProjectMember.findOne({ projectId: project._id, userId: state.adaId });
  assert.equal(oldRow.role, "MEMBER");
});

test("update with invalid priority/date ranges is rejected (400)", async () => {
  const badPrio = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.alan,
    body: { priority: "NOPE" },
  });
  assert.equal(badPrio.status, 400);

  const badDates = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.alan,
    body: { startDate: "2026-12-20", dueDate: "2026-09-24" },
  });
  assert.equal(badDates.status, 400);
  assert.match(badDates.json.message, /Due date cannot be before the start date/);
});

test("empty project name on update is rejected (400)", async () => {
  const res = await api("PATCH", `/api/projects/${state.platformId}`, {
    cookie: cookies.alan,
    body: { name: "   " },
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Delete project
// ---------------------------------------------------------------------------

test("member cannot delete a project (403)", async () => {
  const res = await api("DELETE", `/api/projects/${state.platformId}`, { cookie: cookies.linus });
  assert.equal(res.status, 403);
});

test("manager role alone cannot delete (403) — only workspace admin/owner", async () => {
  // grace is PROJECT_MANAGER (member role in workspace B — not admin). She may
  // update but not delete.
  const res = await api("DELETE", `/api/projects/${state.otherProjectId}`, { cookie: cookies.grace });
  assert.equal(res.status, 403);
});

test("owner can delete a project and it disappears (404 afterwards)", async () => {
  const res = await api("DELETE", `/api/projects/${state.otherProjectId}`, { cookie: cookies.outsider });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);

  const members = await ProjectMember.countDocuments({ projectId: state.otherProjectId });
  assert.equal(members, 0);

  const after = await api("GET", `/api/projects/${state.otherProjectId}`, { cookie: cookies.outsider });
  assert.equal(after.status, 404);
});

// ---------------------------------------------------------------------------
// Create-project metadata
// ---------------------------------------------------------------------------

test("project meta exposes create-eligible workspaces, teams, and eligible managers", async () => {
  const res = await api("GET", "/api/projects/meta", { cookie: cookies.ada });
  assert.equal(res.status, 200);
  const workspaces = res.json.workspaces;
  assert.ok(workspaces.some((w) => w.id === state.workspaceA));

  const wsA = workspaces.find((w) => w.id === state.workspaceA);
  assert.ok(wsA.teams.some((t) => t.id === state.engineeringA));
  assert.ok(wsA.teams.some((t) => t.id === state.researchA));

  const emails = wsA.members.map((m) => m.email);
  assert.ok(emails.includes("alan@acme.test"), "admins are eligible managers");
  assert.ok(emails.includes("linus@acme.test"), "members are eligible managers");
  assert.ok(!emails.includes("barbara@acme.test"), "viewers are not eligible managers");
  assert.ok(!emails.includes("ghost@acme.test"), "non-members are not eligible managers");
});

test("a viewer gets no create-eligible workspaces from meta", async () => {
  const res = await api("GET", "/api/projects/meta", { cookie: cookies.barbara });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.workspaces, []);
});