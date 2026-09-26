"use strict";

// Phase 9 — Project access control integration tests.
//
// Verifies that project access is decided by explicit project membership and
// project roles — NOT by workspace or team membership — and that the explicit
// membership API is secure (401/403, duplicate rejection, invalid users/roles,
// cross-workspace rejection, IDOR protection, and cross-team collaboration).
//
// Runs against a dedicated MongoDB database (nexus_projectaccess_test) using
// only Node's built-in test runner (node:test) and global fetch.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_projectaccess_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-projectaccess-test-secret";
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
const USER_NAMES = ["ada", "alan", "linus", "margaret", "katherine", "outsider", "grace", "ghost"];

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
  const wsA = await Workspace.create({ name: "Nexus Workspace", description: "The primary workspace", ownerId: users.ada._id });
  state.workspaceA = String(wsA._id);

  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.margaret._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.katherine._id, role: "Member" },
  ]);

  // Team A (Engineering) and Team B (Research).
  const engineeringA = await Team.create({ workspaceId: wsA._id, name: "Team A - Engineering", description: "Builds" });
  const researchA = await Team.create({ workspaceId: wsA._id, name: "Team B - Research", description: "Researches" });
  state.engineeringA = String(engineeringA._id);
  state.researchA = String(researchA._id);

  // margaret belongs to Team B (Research) — she is NOT on Team A (Engineering).
  await TeamMember.insertMany([
    { teamId: engineeringA._id, userId: users.alan._id, role: "TEAM_LEAD" },
    { teamId: engineeringA._id, userId: users.linus._id, role: "MEMBER" },
    { teamId: researchA._id, userId: users.katherine._id, role: "TEAM_LEAD" },
    { teamId: researchA._id, userId: users.margaret._id, role: "MEMBER" },
  ]);

  // --- Team A project ------------------------------------------------
  const platform = await Project.create({
    workspaceId: wsA._id,
    teamId: engineeringA._id,
    name: "Project A - Platform",
    description: "Belongs to Team A",
    status: "ACTIVE",
    priority: "HIGH",
    managerId: users.alan._id,
    createdBy: users.ada._id,
  });
  state.platformId = String(platform._id);
  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
  ]);

  // --- Team B projects ------------------------------------------------
  const researchAlpha = await Project.create({
    workspaceId: wsA._id,
    teamId: researchA._id,
    name: "Project B - Research Alpha",
    description: "Belongs to Team B",
    status: "PLANNING",
    priority: "MEDIUM",
    managerId: users.katherine._id,
    createdBy: users.ada._id,
  });
  state.researchAlphaId = String(researchAlpha._id);

  const researchGamma = await Project.create({
    workspaceId: wsA._id,
    teamId: researchA._id,
    name: "Project C - Research Gamma",
    description: "Another Team B project",
    status: "PLANNING",
    priority: "LOW",
    managerId: users.katherine._id,
    createdBy: users.ada._id,
  });
  state.researchGammaId = String(researchGamma._id);

  await ProjectMember.insertMany([
    { projectId: researchAlpha._id, userId: users.katherine._id, role: "PROJECT_MANAGER" },
    { projectId: researchGamma._id, userId: users.katherine._id, role: "PROJECT_MANAGER" },
  ]);

  // --- Workspace B (owned by outsider; grace is a member) -------------------
  const wsB = await Workspace.create({ name: "Other Workspace", description: "Unrelated", ownerId: users.outsider._id });
  state.workspaceB = String(wsB._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsB._id, userId: users.outsider._id, role: "Admin" },
    { workspaceId: wsB._id, userId: users.grace._id, role: "Member" },
  ]);
  const engineeringB = await Team.create({ workspaceId: wsB._id, name: "Workspace B Team", description: "Other team" });
  state.engineeringB = String(engineeringB._id);
  const otherProject = await Project.create({
    workspaceId: wsB._id,
    teamId: engineeringB._id,
    name: "Workspace B Project",
    description: "Belongs to the other workspace",
    status: "PLANNING",
    priority: "LOW",
    managerId: users.grace._id,
    createdBy: users.outsider._id,
  });
  state.otherProjectId = String(otherProject._id);
  await ProjectMember.create({ projectId: otherProject._id, userId: users.grace._id, role: "PROJECT_MANAGER" });
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
    "katherine@acme.test",
    "outsider@acme.test",
    "grace@acme.test",
    "ghost@acme.test",
  ];
  const names = ["ada", "alan", "linus", "margaret", "katherine", "outsider", "grace", "ghost"];
  for (let i = 0; i < names.length; i += 1) {
    cookies[names[i]] = await login(emails[i]);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Test 10 — unauthenticated access → 401
// ---------------------------------------------------------------------------

test("unauthenticated requests to project member endpoints are 401", async () => {
  for (const [method, path, body] of [
    ["GET", `/api/projects/${state.researchAlphaId}/members`, undefined],
    ["POST", `/api/projects/${state.researchAlphaId}/members`, { userId: state.linusId, role: "MEMBER" }],
    ["PATCH", `/api/projects/${state.researchAlphaId}/members/${state.linusId}`, { role: "VIEWER" }],
    ["DELETE", `/api/projects/${state.researchAlphaId}/members/${state.linusId}`, undefined],
  ]) {
    const res = await api(method, path, body ? { body } : {});
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.json.success, false);
  }
});

// ---------------------------------------------------------------------------
// Test 1 — team member without project access → 403
// ---------------------------------------------------------------------------

test("a Team B member (margaret) cannot access a Team B project she was not added to", async () => {
  // margaret IS a Team B (Research) member, but Research Gamma has no row for
  // her. Team membership must not equal project access.
  const res = await api("GET", `/api/projects/${state.researchGammaId}`, { cookie: cookies.margaret });
  assert.equal(res.status, 403);
  assert.match(res.json.message, /permission/);
});

// ---------------------------------------------------------------------------
// Test 2 — explicit collaborator gains access
// ---------------------------------------------------------------------------

test("an explicitly added collaborator can access the project", async () => {
  const invite = await api("POST", `/api/projects/${state.researchAlphaId}/members`, {
    cookie: cookies.alan,
    body: { userId: state.margaretId, role: "COLLABORATOR" },
  });
  assert.equal(invite.status, 201, JSON.stringify(invite.json));
  assert.equal(invite.json.member.role, "COLLABORATOR");
  assert.equal(invite.json.member.user.id, state.margaretId);

  const res = await api("GET", `/api/projects/${state.researchAlphaId}`, { cookie: cookies.margaret });
  assert.equal(res.status, 200);
  assert.equal(res.json.project.id, state.researchAlphaId);
});

// ---------------------------------------------------------------------------
// Tests 3 & 4 — cross-team collaboration without Team B membership
// ---------------------------------------------------------------------------

test("a Team A member can collaborate on a Team B project without joining Team B", async () => {
  // linus is on Team A (Engineering); invite him to the Team B project.
  const invite = await api("POST", `/api/projects/${state.researchAlphaId}/members`, {
    cookie: cookies.alan,
    body: { userId: state.linusId, role: "COLLABORATOR" },
  });
  assert.equal(invite.status, 201, JSON.stringify(invite.json));

  const res = await api("GET", `/api/projects/${state.researchAlphaId}`, { cookie: cookies.linus });
  assert.equal(res.status, 200);

  // linus stays out of Team B: no teammembers row for Research.
  const teamRow = await TeamMember.exists({ teamId: state.researchA, userId: state.linusId });
  assert.equal(teamRow, null);
});

// ---------------------------------------------------------------------------
// Test 5 — project isolation
// ---------------------------------------------------------------------------

test("access to one project does not leak to another project", async () => {
  // linus can see Research Alpha (explicit collaborator) but not Research Gamma.
  const alpha = await api("GET", `/api/projects/${state.researchAlphaId}`, { cookie: cookies.linus });
  assert.equal(alpha.status, 200);

  const gamma = await api("GET", `/api/projects/${state.researchGammaId}`, { cookie: cookies.linus });
  assert.equal(gamma.status, 403);

  // The global list must not expose Research Gamma to linus either.
  const list = await api("GET", "/api/projects", { cookie: cookies.linus });
  assert.equal(list.status, 200);
  const ids = list.json.projects.map((p) => p.id);
  assert.ok(ids.includes(state.researchAlphaId));
  assert.ok(ids.includes(state.platformId));
  assert.ok(!ids.includes(state.researchGammaId));
});

// ---------------------------------------------------------------------------
// Test 6 — duplicate membership → 409
// ---------------------------------------------------------------------------

test("adding the same user twice is rejected", async () => {
  const res = await api("POST", `/api/projects/${state.researchAlphaId}/members`, {
    cookie: cookies.alan,
    body: { userId: state.linusId, role: "COLLABORATOR" },
  });
  assert.equal(res.status, 409);
  assert.match(res.json.message, /already a project member/);
});

// ---------------------------------------------------------------------------
// Test 7 — unauthorized invitation → 403
// ---------------------------------------------------------------------------

test("project members without invite permission cannot add or manage members", async () => {
  // margaret is a COLLABORATOR (has view_project_members, not invite).
  const add = await api("POST", `/api/projects/${state.researchAlphaId}/members`, {
    cookie: cookies.margaret,
    body: { userId: state.linusId, role: "VIEWER" },
  });
  assert.equal(add.status, 403);

  const update = await api("PATCH", `/api/projects/${state.researchAlphaId}/members/${state.linusId}`, {
    cookie: cookies.margaret,
    body: { role: "VIEWER" },
  });
  assert.equal(update.status, 403);

  const remove = await api("DELETE", `/api/projects/${state.researchAlphaId}/members/${state.linusId}`, {
    cookie: cookies.margaret,
  });
  assert.equal(remove.status, 403);
});

// ---------------------------------------------------------------------------
// Test 8 — invalid user
// ---------------------------------------------------------------------------

test("inviting a nonexistent user is 404 and a cross-workspace user is 400", async () => {
  const missing = await api("POST", `/api/projects/${state.platformId}/members`, {
    cookie: cookies.alan,
    body: { userId: new mongoose.Types.ObjectId().toString(), role: "MEMBER" },
  });
  assert.equal(missing.status, 404);

  // grace belongs to Workspace B, not Workspace A → rejected even though she
  // exists and is a user.
  const crossWs = await api("POST", `/api/projects/${state.platformId}/members`, {
    cookie: cookies.alan,
    body: { userId: state.graceId, role: "COLLABORATOR" },
  });
  assert.equal(crossWs.status, 400);
  assert.match(crossWs.json.message, /does not belong to this workspace/);

  // ... and grace still cannot see the project.
  const graceView = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.grace });
  assert.equal(graceView.status, 403);
});

// ---------------------------------------------------------------------------
// Test 9 — invalid role
// ---------------------------------------------------------------------------

test("unsupported project roles are rejected", async () => {
  const invite = await api("POST", `/api/projects/${state.platformId}/members`, {
    cookie: cookies.alan,
    body: { userId: state.katherineId, role: "SUPER_ADMIN" },
  });
  assert.equal(invite.status, 400);
  assert.match(invite.json.message, /Invalid project member role/);

  const update = await api("PATCH", `/api/projects/${state.platformId}/members/${state.linusId}`, {
    cookie: cookies.alan,
    body: { role: "OWNER" },
  });
  assert.equal(update.status, 400);
});

// ---------------------------------------------------------------------------
// Role changes and removal (authorized)
// ---------------------------------------------------------------------------

test("an authorized manager can change a member's role and remove them", async () => {
  // Promote margaret on Research Alpha.
  const downgrade = await api("PATCH", `/api/projects/${state.researchAlphaId}/members/${state.margaretId}`, {
    cookie: cookies.alan,
    body: { role: "VIEWER" },
  });
  assert.equal(downgrade.status, 200);
  assert.equal(downgrade.json.member.role, "VIEWER");

  const afterUpdate = await api("GET", `/api/projects/${state.researchAlphaId}/members`, { cookie: cookies.margaret });
  assert.equal(afterUpdate.status, 200);
  const margaretRow = afterUpdate.json.members.find((m) => m.user.id === state.margaretId);
  assert.equal(margaretRow.role, "VIEWER");

  // Workspace admins (and owner) can grant PROJECT_MANAGER via the global route.
  const grantPm = await api("PATCH", `/api/projects/${state.researchAlphaId}/members/${state.linusId}`, {
    cookie: cookies.alan,
    body: { role: "PROJECT_MANAGER" },
  });
  assert.equal(grantPm.status, 200);

  // Remove margaret; she loses access immediately.
  const remove = await api("DELETE", `/api/projects/${state.researchAlphaId}/members/${state.margaretId}`, {
    cookie: cookies.alan,
  });
  assert.equal(remove.status, 200);

  const afterRemove = await api("GET", `/api/projects/${state.researchAlphaId}`, { cookie: cookies.margaret });
  assert.equal(afterRemove.status, 403);
});

test("only workspace owners/admins may grant the PROJECT_MANAGER role", async () => {
  // katherine is the PM of Research Gamma but is NOT a workspace admin/owner.
  const tryGrant = await api("PATCH", `/api/projects/${state.researchGammaId}/members/${state.margaretId}`, {
    cookie: cookies.katherine,
    body: { role: "PROJECT_MANAGER" },
  });
  assert.equal(tryGrant.status, 403);

  // katherine cannot add margaret with the PM role either.
  const invitePm = await api("POST", `/api/projects/${state.researchGammaId}/members`, {
    cookie: cookies.katherine,
    body: { userId: state.margaretId, role: "PROJECT_MANAGER" },
  });
  assert.equal(invitePm.status, 403);
});

// ---------------------------------------------------------------------------
// Test 11 — IDOR / horizontal privilege escalation
// ---------------------------------------------------------------------------

test("knowing a project id is not enough — non-members get 403 (IDOR protection)", async () => {
  // Workspace B owner with a valid token: no relationship to the A project.
  const crossOwner = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.outsider });
  assert.equal(crossOwner.status, 403);

  // A user with no memberships anywhere.
  const ghost = await api("GET", `/api/projects/${state.platformId}`, { cookie: cookies.ghost });
  assert.equal(ghost.status, 403);

  // Member-management endpoints behave the same way.
  const members = await api("GET", `/api/projects/${state.platformId}/members`, { cookie: cookies.outsider });
  assert.equal(members.status, 403);

  const invite = await api("POST", `/api/projects/${state.platformId}/members`, {
    cookie: cookies.outsider,
    body: { userId: state.graceId, role: "MEMBER" },
  });
  assert.equal(invite.status, 403);
});