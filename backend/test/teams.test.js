"use strict";

// Phase 7 — Workspace & Teams integration tests.
//
// Runs against a dedicated MongoDB database (nexus_teams_test) using only
// Node's built-in test runner (node:test) and global fetch.

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_teams_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-teams-test-secret";
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
const app = require("../src/app");

const PASSWORD = "Password123!";
const USER_NAMES = ["ada", "alan", "linus", "margaret", "barbara", "nate", "ghost", "outsider"];

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
    barbara: "Viewer",
    nate: "Member",
    // ghost and outsider deliberately have NO workspace membership.
  };
  await WorkspaceMember.insertMany(
    Object.entries(roleMap).map(([name, role]) => ({
      workspaceId: workspace._id,
      userId: users[name]._id,
      role,
    }))
  );

  // --- Teams ---------------------------------------------------------------
  const engineering = await Team.create({
    workspaceId: workspace._id,
    name: "Engineering",
    description: "Builds the platform",
  });
  const design = await Team.create({
    workspaceId: workspace._id,
    name: "Design",
    description: "Product and UX design",
  });
  state.engineeringTeamId = String(engineering._id);
  state.designTeamId = String(design._id);

  await TeamMember.insertMany([
    { teamId: engineering._id, userId: users.alan._id, role: "TEAM_LEAD" },
    { teamId: engineering._id, userId: users.linus._id, role: "MEMBER" },
    { teamId: design._id, userId: users.margaret._id, role: "TEAM_LEAD" },
    { teamId: design._id, userId: users.barbara._id, role: "MEMBER" },
  ]);

  // --- Project owned by the engineering team --------------------------------
  const platform = await Project.create({
    workspaceId: workspace._id,
    teamId: engineering._id,
    name: "Nexus Platform Build",
    description: "Core platform",
    managerId: users.alan._id,
    createdBy: users.ada._id,
  });
  state.platformId = String(platform._id);
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

const ws = (id) => `/api/workspaces/${id}`;
const teamUrl = (id) => `/api/teams/${id}`;

// ---------------------------------------------------------------------------
// Workspace endpoints
// ---------------------------------------------------------------------------

test("creating a workspace assigns the creator as admin and owner", async () => {
  const res = await api("POST", "/api/workspaces", {
    cookie: cookies.ada,
    body: { name: "Foundry", description: "A new workspace" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.role, "Admin");
  assert.equal(res.json.members.length, 1);
  assert.equal(res.json.members[0].user.id, state.adaId);
  assert.equal(String(res.json.workspace.ownerId), state.adaId);
  state.foundryId = String(res.json.workspace.id);
});

test("workspace create rejects a missing name", async () => {
  const res = await api("POST", "/api/workspaces", {
    cookie: cookies.ada,
    body: { description: "no name" },
  });
  assert.equal(res.status, 400);
});

test("workspace get returns members and stats", async () => {
  const res = await api("GET", ws(state.workspaceId), { cookie: cookies.margaret });
  assert.equal(res.status, 200);
  assert.equal(res.json.workspace.name, "Acme Research");
  assert.equal(res.json.role, "Member");
  assert.ok(res.json.stats.memberCount >= 6);
});

test("only owners/admins can update a workspace; members get 403", async () => {
  const denied = await api("PATCH", ws(state.workspaceId), {
    cookie: cookies.margaret,
    body: { name: "Nope" },
  });
  assert.equal(denied.status, 403);

  const allowed = await api("PATCH", ws(state.workspaceId), {
    cookie: cookies.alan,
    body: { description: "Updated by admin" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.workspace.description, "Updated by admin");
});

test("workspace members list omits sensitive fields", async () => {
  const res = await api("GET", `${ws(state.workspaceId)}/members`, { cookie: cookies.barbara });
  assert.equal(res.status, 200);
  for (const member of res.json.members) {
    assert.equal(member.user.password, undefined);
    assert.equal(member.user.hash, undefined);
  }
});

// ---------------------------------------------------------------------------
// Team creation
// ---------------------------------------------------------------------------

test("owners and admins can create teams", async () => {
  const owner = await api("POST", "/api/teams", {
    cookie: cookies.ada,
    body: { workspaceId: state.workspaceId, name: "Research" },
  });
  assert.equal(owner.status, 201);
  assert.equal(owner.json.team.name, "Research");
  assert.equal(owner.json.team.stats.memberCount, 1);
  assert.equal(owner.json.team.stats.projectCount, 0);
  assert.equal(owner.json.role, "WORKSPACE_OWNER");
  assert.equal(owner.json.isTeamLead, true);
  assert.equal(owner.json.members[0].role, "TEAM_LEAD");
  state.researchTeamId = String(owner.json.team.id);

  const admin = await api("POST", "/api/teams", {
    cookie: cookies.alan,
    body: { workspaceId: state.workspaceId, name: "Operations" },
  });
  assert.equal(admin.status, 201);
  assert.equal(admin.json.team.members, undefined); // no raw member rows leaked
});

test("members and viewers cannot create teams", async () => {
  for (const who of ["margaret", "barbara"]) {
    const res = await api("POST", "/api/teams", {
      cookie: cookies[who],
      body: { workspaceId: state.workspaceId, name: "Rogue team" },
    });
    assert.equal(res.status, 403, `${who} should be denied`);
  }
});

test("team creation validates name and workspace", async () => {
  const missingName = await api("POST", "/api/teams", {
    cookie: cookies.ada,
    body: { workspaceId: state.workspaceId },
  });
  assert.equal(missingName.status, 400);
  assert.match(missingName.json.message, /name is required/i);

  const missingWorkspace = await api("POST", "/api/teams", {
    cookie: cookies.ada,
    body: { name: "Homeless" },
  });
  assert.equal(missingWorkspace.status, 404);

  const badWorkspace = await api("POST", "/api/teams", {
    cookie: cookies.ada,
    body: { workspaceId: "not-an-id", name: "Homeless" },
  });
  assert.equal(badWorkspace.status, 404);
});

test("duplicate team names within a workspace return 409", async () => {
  const dup = await api("POST", "/api/teams", {
    cookie: cookies.ada,
    body: { workspaceId: state.workspaceId, name: "Engineering" },
  });
  assert.equal(dup.status, 409);
  assert.match(dup.json.message, /already exists/i);
});

test("a non-member cannot create a team in a foreign workspace", async () => {
  const res = await api("POST", "/api/teams", {
    cookie: cookies.outsider,
    body: { workspaceId: state.workspaceId, name: "Intruder" },
  });
  assert.equal(res.status, 403);
});

test("unauthenticated team requests return 401", async () => {
  const res = await api("POST", "/api/teams", {
    body: { workspaceId: state.workspaceId, name: "Anon" },
  });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Listing / reading teams
// ---------------------------------------------------------------------------

test("workspace teams are listed with stats for all members", async () => {
  const res = await api("GET", `${ws(state.workspaceId)}/teams`, { cookie: cookies.margaret });
  assert.equal(res.status, 200);
  const names = res.json.teams.map((t) => t.name).sort();
  assert.deepEqual(names, ["Design", "Engineering", "Operations", "Research"]);
  const engineering = res.json.teams.find((t) => t.id === state.engineeringTeamId);
  assert.equal(engineering.stats.memberCount, 2);
  assert.equal(engineering.stats.projectCount, 1);
});

test("viewers can list teams but outsiders cannot", async () => {
  const viewer = await api("GET", `${ws(state.workspaceId)}/teams`, { cookie: cookies.barbara });
  assert.equal(viewer.status, 200);

  const outsider = await api("GET", `${ws(state.workspaceId)}/teams`, { cookie: cookies.outsider });
  assert.equal(outsider.status, 403);
});

test("team detail returns team, workspace, projects and role", async () => {
  const res = await api("GET", teamUrl(state.engineeringTeamId), { cookie: cookies.linus });
  assert.equal(res.status, 200);
  assert.equal(res.json.team.name, "Engineering");
  assert.equal(res.json.workspace.id, state.workspaceId);
  assert.equal(res.json.role, "MEMBER");
  assert.equal(res.json.isTeamLead, false);
  assert.equal(res.json.team.stats.memberCount, 2);
  assert.equal(res.json.team.stats.projectCount, 1);
  assert.equal(res.json.projects[0].id, state.platformId);
});

test("outsiders cannot view a team", async () => {
  const res = await api("GET", teamUrl(state.engineeringTeamId), { cookie: cookies.outsider });
  assert.equal(res.status, 403);
});

test("nonexistent teams return 404", async () => {
  const res = await api("GET", teamUrl("000000000000000000000000"), { cookie: cookies.ada });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Team update / delete
// ---------------------------------------------------------------------------

test("only owners/admins may update a team", async () => {
  const denied = await api("PATCH", teamUrl(state.engineeringTeamId), {
    cookie: cookies.linus,
    body: { description: "nope" },
  });
  assert.equal(denied.status, 403);

  const allowed = await api("PATCH", teamUrl(state.engineeringTeamId), {
    cookie: cookies.ada,
    body: { description: "Builds and ships the platform" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.team.description, "Builds and ships the platform");

  const emptyName = await api("PATCH", teamUrl(state.engineeringTeamId), {
    cookie: cookies.ada,
    body: { name: "   " },
  });
  assert.equal(emptyName.status, 400);

  const duplicateName = await api("PATCH", teamUrl(state.engineeringTeamId), {
    cookie: cookies.ada,
    body: { name: "Design" },
  });
  assert.equal(duplicateName.status, 409);
});

test("deleting a team removes memberships but keeps projects", async () => {
  const team = await Team.create({
    workspaceId: state.workspaceId,
    name: "Delete Me",
  });
  await TeamMember.create({ teamId: team._id, userId: state.adaId, role: "TEAM_LEAD" });
  const project = await Project.create({
    workspaceId: state.workspaceId,
    teamId: team._id,
    name: "Bound project",
    managerId: state.adaId,
    createdBy: state.adaId,
  });

  const res = await api("DELETE", teamUrl(String(team._id)), { cookie: cookies.alan });
  assert.equal(res.status, 200);
  assert.equal(res.json.message, "Team deleted");

  const gone = await Team.findById(team._id);
  assert.equal(gone, null);
  assert.equal(await TeamMember.countDocuments({ teamId: team._id }), 0);

  const stillThere = await Project.findById(project._id);
  assert.ok(stillThere, "project must NOT be deleted");
  assert.equal(String(stillThere.teamId), "null");
});

test("only owners/admins may delete a team", async () => {
  const res = await api("DELETE", teamUrl(state.designTeamId), { cookie: cookies.barbara });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Team member management
// ---------------------------------------------------------------------------

test("owners/admin/team leads can add members; members cannot", async () => {
  const byOwner = await api("POST", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.ada,
    body: { userId: state.linusId },
  });
  assert.equal(byOwner.status, 201);
  assert.equal(byOwner.json.member.role, "MEMBER");
  assert.equal(byOwner.json.member.user.id, state.linusId);

  const duplicate = await api("POST", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.ada,
    body: { userId: state.linusId },
  });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.json.message, /already on this team/i);

  // nate (workspace member, not a team member) is added by the design TEAM_LEAD.
  const byLead = await api("POST", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.margaret,
    body: { userId: state.nateId },
  });
  assert.equal(byLead.status, 201);

  // A plain member (linus, now on design but not a lead) cannot add anyone.
  const byMember = await api("POST", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.linus,
    body: { userId: state.barbaraId },
  });
  assert.equal(byMember.status, 403);
});

test("cannot add a user who is not a workspace member", async () => {
  const res = await api("POST", `${teamUrl(state.engineeringTeamId)}/members`, {
    cookie: cookies.alan,
    body: { userId: state.ghostId },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /member of this workspace/i);
});

test("adding a nonexistent user returns 404", async () => {
  const res = await api("POST", `${teamUrl(state.engineeringTeamId)}/members`, {
    cookie: cookies.alan,
    body: { userId: "000000000000000000000000" },
  });
  assert.equal(res.status, 404);
});

test("only workspace admins may assign the team lead role", async () => {
  const byLead = await api("POST", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.margaret,
    body: { userId: state.alanId, role: "TEAM_LEAD" },
  });
  assert.equal(byLead.status, 403);

  const byAdmin = await api("POST", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.ada,
    body: { userId: state.alanId, role: "TEAM_LEAD" },
  });
  assert.equal(byAdmin.status, 201);
  assert.equal(byAdmin.json.member.role, "TEAM_LEAD");
});

test("member listing is safe and complete", async () => {
  const res = await api("GET", `${teamUrl(state.designTeamId)}/members`, {
    cookie: cookies.barbara,
  });
  assert.equal(res.status, 200);
  const names = res.json.members.map((m) => m.user.name).sort();
  assert.deepEqual(names, ["Alan", "Barbara", "Linus", "Margaret", "Nate"]);
  for (const m of res.json.members) {
    assert.equal(m.user.password, undefined);
    assert.equal(m.user.hash, undefined);
  }
});

test("role changes are gated to workspace admins", async () => {
  const denied = await api("PATCH", `${teamUrl(state.designTeamId)}/members/${state.linusId}`, {
    cookie: cookies.margaret,
    body: { role: "TEAM_LEAD" },
  });
  assert.equal(denied.status, 403);

  const allowed = await api("PATCH", `${teamUrl(state.designTeamId)}/members/${state.linusId}`, {
    cookie: cookies.ada,
    body: { role: "TEAM_LEAD" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.member.role, "TEAM_LEAD");

  const invalid = await api("PATCH", `${teamUrl(state.designTeamId)}/members/${state.linusId}`, {
    cookie: cookies.ada,
    body: { role: "SUPERADMIN" },
  });
  assert.equal(invalid.status, 400);
});

test("members can be removed by admins and team leads, not by members", async () => {
  // barbara is a plain member of design (workspace Viewer, not a team lead).
  const denied = await api("DELETE", `${teamUrl(state.designTeamId)}/members/${state.linusId}`, {
    cookie: cookies.barbara,
  });
  assert.equal(denied.status, 403);

  // linus is a TEAM_LEAD of design now (promoted above) → allowed to remove.
  const byLead = await api("DELETE", `${teamUrl(state.designTeamId)}/members/${state.nateId}`, {
    cookie: cookies.linus,
  });
  assert.equal(byLead.status, 200);
  assert.equal(byLead.json.message, "Member removed");

  const missing = await api("DELETE", `${teamUrl(state.designTeamId)}/members/${state.nateId}`, {
    cookie: cookies.ada,
  });
  assert.equal(missing.status, 404);
});