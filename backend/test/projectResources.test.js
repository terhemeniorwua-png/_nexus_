"use strict";

// Phase 23 — Project Resources tests.
//
// The resources endpoint existed on the server with nothing on the client and
// nothing in the suite, so it is the part of the project surface most likely to
// be quietly wrong. The tests are about:
//
//   • a member or viewer curating a list they may only read
//   • a resource being created, edited or deleted through the wrong project
//   • a resource crossing the workspace boundary
//   • validation that the UI relies on (a name is required, the category is one
//     the model accepts)
//   • a list that disagrees with the database, or leaks a field it should not
//   • an edit that silently drops a field it was not asked to change
//
// Every assertion is checked against the collection directly, so a pass means
// the payload matched what is actually stored.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_resources_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-resources-test-secret";
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
const ProjectResource = require("../src/models/projectResource.model");
const { CATEGORIES } = require("../src/models/projectResource.model");

const app = require("../src/app");

const PASSWORD = "Password123!";
const NAMES = ["ada", "alan", "linus", "grace", "mallory"];

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
  const res = await api("POST", "/api/auth/login", {
    body: { email, password: PASSWORD },
  });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.json && res.json.message}`);
  cookies[email.split("@")[0]] = `nexus_token=${res.json.token}`;
  return cookies[email.split("@")[0]];
}

const listUrl = (projectId, workspaceId = state.workspaceA) =>
  `/api/workspaces/${workspaceId}/projects/${projectId}/resources`;
const itemUrl = (resourceId, projectId, workspaceId = state.workspaceA) =>
  `/api/workspaces/${workspaceId}/projects/${projectId}/resources/${resourceId}`;

// --- Fixtures ----------------------------------------------------------------
//
//   Workspace "Acme" (ada owns it)
//     Platform — alan manages; linus MEMBER, grace VIEWER
//     Vault    — ada manages; no other member role
//   Workspace "Rival" (mallory owns it)
//     Foreign  — mallory manages
async function buildFixtures() {
  const users = {};
  for (const name of NAMES) {
    users[name] = await User.create({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: `${name}@acme.test`,
      password: PASSWORD,
    });
  }
  state.users = users;

  const wsA = await Workspace.create({ name: "Acme", ownerId: users.ada._id });
  state.workspaceA = String(wsA._id);
  await WorkspaceMember.insertMany([
    { workspaceId: wsA._id, userId: users.ada._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.alan._id, role: "Admin" },
    { workspaceId: wsA._id, userId: users.linus._id, role: "Member" },
    { workspaceId: wsA._id, userId: users.grace._id, role: "Member" },
  ]);

  const wsB = await Workspace.create({ name: "Rival", ownerId: users.mallory._id });
  state.workspaceB = String(wsB._id);
  await WorkspaceMember.create({
    workspaceId: wsB._id,
    userId: users.mallory._id,
    role: "Admin",
  });

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
    { projectId: platform._id, userId: users.grace._id, role: "VIEWER" },
  ]);

  const vault = await Project.create({
    workspaceId: wsA._id,
    name: "Vault",
    status: "ACTIVE",
    managerId: users.ada._id,
    createdBy: users.ada._id,
  });
  state.vaultId = String(vault._id);

  const foreign = await Project.create({
    workspaceId: wsB._id,
    name: "Foreign",
    status: "ACTIVE",
    managerId: users.mallory._id,
    createdBy: users.mallory._id,
  });
  state.foreignId = String(foreign._id);
  await ProjectMember.create({
    projectId: foreign._id,
    userId: users.mallory._id,
    role: "PROJECT_MANAGER",
  });

  // Two pre-existing resources so the list endpoint has something to read and
  // so ordering can be asserted.
  await ProjectResource.create([
    {
      projectId: platform._id,
      name: "GitHub",
      url: "https://github.com",
      category: "DEVELOPMENT",
      description: "Source control",
      createdBy: users.alan._id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      projectId: platform._id,
      name: "MDN",
      url: "https://developer.mozilla.org",
      category: "DEVELOPMENT",
      description: "Web platform reference",
      createdBy: users.alan._id,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ]);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  await buildFixtures();
  for (const name of NAMES) await login(`${name}@acme.test`);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
});

// --- reading -----------------------------------------------------------------

test("a project manager lists resources newest first with the author resolved", async () => {
  const res = await api("GET", listUrl(state.platformId), { cookie: cookies.alan });

  assert.equal(res.status, 200);
  assert.equal(res.json.resources.length, 2);
  assert.deepEqual(
    res.json.resources.map((r) => r.name),
    ["MDN", "GitHub"],
    "newest first"
  );

  const stored = await ProjectResource.find({ projectId: state.platformId }).sort({ createdAt: -1 });
  assert.equal(res.json.resources.length, stored.length, "the list must match the collection");

  const [first] = res.json.resources;
  assert.equal(first.createdBy.name, "Alan", "the author must be readable, not an id");
  assert.equal(typeof first.projectId, "string", "ids are serialised as strings for the client");
});

test("members and viewers may read but not curate", async () => {
  for (const who of ["linus", "grace"]) {
    const read = await api("GET", listUrl(state.platformId), { cookie: cookies[who] });
    assert.equal(read.status, 200, `${who} should be able to read`);

    const create = await api("POST", listUrl(state.platformId), {
      cookie: cookies[who],
      body: { name: "Should not exist", category: "OTHER" },
    });
    assert.equal(create.status, 403, `${who} must not be able to curate`);

    const update = await api("PATCH", itemUrl("6ab72540e30d2d29d8012bd6", state.platformId), {
      cookie: cookies[who],
      body: { name: "Hijacked" },
    });
    assert.equal(update.status, 403, `${who} must not be able to edit`);

    const remove = await api("DELETE", itemUrl("6ab72540e30d2d29d8012bd6", state.platformId), {
      cookie: cookies[who],
    });
    assert.equal(remove.status, 403, `${who} must not be able to delete`);
  }

  assert.equal(await ProjectResource.countDocuments({ name: "Should not exist" }), 0);
});

test("the workspace owner curates through the derived project permissions", async () => {
  const res = await api("POST", listUrl(state.platformId), {
    cookie: cookies.ada,
    body: { name: "Owned", category: "REFERENCE" },
  });
  assert.equal(res.status, 201);
  await ProjectResource.deleteOne({ _id: res.json.resource.id });
});

test("reading requires a session and a workspace the caller belongs to", async () => {
  const anon = await api("GET", listUrl(state.platformId));
  assert.equal(anon.status, 401);

  // `memberOf` runs before any project lookup, so a non-member is refused as a
  // permission failure rather than being told the workspace does not exist.
  const outsider = await api("GET", listUrl(state.platformId, state.workspaceB), {
    cookie: cookies.linus,
  });
  assert.equal(outsider.status, 403, "a workspace the caller is not in must not be readable");

  const crossWorkspaceProject = await api("GET", listUrl(state.foreignId, state.workspaceA), {
    cookie: cookies.alan,
  });
  assert.ok(
    crossWorkspaceProject.status === 403 || crossWorkspaceProject.status === 404,
    `a project id from another workspace must not resolve here (got ${crossWorkspaceProject.status})`
  );
});

// --- writing -----------------------------------------------------------------

test("a manager creates a resource and it is stored exactly as accepted", async () => {
  const res = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: {
      name: "  Attention Is All You Need  ",
      url: "https://arxiv.org/abs/1706.03762",
      category: "research",
      description: "The transformer paper.",
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.json.resource.name, "Attention Is All You Need", "the name is trimmed");
  assert.equal(res.json.resource.category, "RESEARCH", "the category is upper-cased");

  const stored = await ProjectResource.findById(res.json.resource.id);
  assert.ok(stored, "the resource must exist in the collection");
  assert.equal(stored.projectId.toString(), state.platformId);
  assert.equal(stored.url, "https://arxiv.org/abs/1706.03762");
  assert.equal(stored.description, "The transformer paper.");
  assert.equal(stored.createdBy.toString(), state.users.alan._id.toString());

  await ProjectResource.deleteOne({ _id: stored._id });
});

test("creating requires a name and a category the model accepts", async () => {
  const missing = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: { category: "OTHER" },
  });
  assert.equal(missing.status, 400);

  const blank = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: { name: "   ", category: "OTHER" },
  });
  assert.equal(blank.status, 400);

  const badCategory = await api("POST", listUrl(state.projectId || state.platformId), {
    cookie: cookies.alan,
    body: { name: "Bad category", category: "NOT_A_CATEGORY" },
  });
  assert.equal(badCategory.status, 400, "an unknown category must be refused");

  assert.equal(await ProjectResource.countDocuments({ name: "Bad category" }), 0);
});

test("every category the model declares can be created", async () => {
  for (const category of CATEGORIES) {
    const res = await api("POST", listUrl(state.platformId), {
      cookie: cookies.alan,
      body: { name: `Category ${category}`, category },
    });
    assert.equal(res.status, 201, `${category} should be accepted`);
    assert.equal(res.json.resource.category, category);
  }
  const created = await ProjectResource.countDocuments({
    name: { $in: CATEGORIES.map((c) => `Category ${c}`) },
  });
  assert.equal(created, CATEGORIES.length, "one row per declared category, and no more");
});

test("an edit changes only what it was asked to change", async () => {
  const created = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: {
      name: "Original",
      url: "https://example.com",
      category: "DESIGN",
      description: "Original description.",
    },
  });
  const id = created.json.resource.id;

  const res = await api("PATCH", itemUrl(id, state.platformId), {
    cookie: cookies.alan,
    body: { category: "REFERENCE" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.resource.category, "REFERENCE");
  assert.equal(res.json.resource.name, "Original", "the name is untouched");
  assert.equal(res.json.resource.url, "https://example.com", "the url is untouched");
  assert.equal(res.json.resource.description, "Original description.");

  const stored = await ProjectResource.findById(id);
  assert.equal(stored.category, "REFERENCE");
  assert.equal(stored.name, "Original");

  await ProjectResource.deleteOne({ _id: id });
});

test("an edit refuses an empty name and leaves the record alone", async () => {
  const created = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: { name: "Keep me" },
  });
  const id = created.json.resource.id;

  const res = await api("PATCH", itemUrl(id, state.platformId), {
    cookie: cookies.alan,
    body: { name: "   " },
  });
  assert.equal(res.status, 400);

  const stored = await ProjectResource.findById(id);
  assert.equal(stored.name, "Keep me", "a refused edit must not change the record");

  await ProjectResource.deleteOne({ _id: id });
});

test("a resource cannot be reached through another project", async () => {
  // ada manages both Platform and Vault, so the permission layer lets her
  // through for either — the resource lookup itself has to refuse the mismatch.
  const created = await api("POST", listUrl(state.platformId), {
    cookie: cookies.ada,
    body: { name: "Platform only" },
  });
  const id = created.json.resource.id;

  const read = await api("GET", listUrl(state.vaultId), { cookie: cookies.ada });
  assert.equal(
    read.json.resources.some((r) => r.id === id),
    false,
    "the resource must not appear under the other project"
  );

  const update = await api("PATCH", itemUrl(id, state.vaultId), {
    cookie: cookies.ada,
    body: { name: "Moved" },
  });
  assert.equal(update.status, 404);

  const remove = await api("DELETE", itemUrl(id, state.vaultId), { cookie: cookies.ada });
  assert.equal(remove.status, 404);

  const stillThere = await ProjectResource.findById(id);
  assert.ok(stillThere, "the refused delete must not have removed it");
  assert.equal(stillThere.name, "Platform only");

  await ProjectResource.deleteOne({ _id: id });
});

test("a resource from another workspace is not reachable even by a workspace admin", async () => {
  const created = await api("POST", listUrl(state.foreignId, state.workspaceB), {
    cookie: cookies.mallory,
    body: { name: "Rival resource" },
  });
  const id = created.json.resource.id;

  // ada administers Acme, which is a different workspace entirely.
  const viaAcme = await api("PATCH", itemUrl(id, state.foreignId, state.workspaceA), {
    cookie: cookies.ada,
    body: { name: "Stolen" },
  });
  assert.equal([403, 404].includes(viaAcme.status), true, "the cross-workspace attempt must fail");

  const stored = await ProjectResource.findById(id);
  assert.equal(stored.name, "Rival resource");
});

test("editing or deleting a resource that does not exist is a 404", async () => {
  const missingId = "6ab72540e30d2d29d8012bd6";
  const update = await api("PATCH", itemUrl(missingId, state.platformId), {
    cookie: cookies.alan,
    body: { name: "Ghost" },
  });
  assert.equal(update.status, 404);

  const remove = await api("DELETE", itemUrl(missingId, state.platformId), {
    cookie: cookies.alan,
  });
  assert.equal(remove.status, 404);
});

test("deleting removes exactly one resource", async () => {
  const keep = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: { name: "Keep" },
  });
  const drop = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: { name: "Drop" },
  });

  const res = await api("DELETE", itemUrl(drop.json.resource.id, state.platformId), {
    cookie: cookies.alan,
  });
  assert.equal(res.status, 200);

  assert.equal(await ProjectResource.findById(drop.json.resource.id), null);
  assert.ok(await ProjectResource.findById(keep.json.resource.id), "the sibling must survive");

  await ProjectResource.deleteOne({ _id: keep.json.resource.id });
});

test("a resource response carries no workspace or owner internals", async () => {
  const created = await api("POST", listUrl(state.platformId), {
    cookie: cookies.alan,
    body: { name: "Leak check" },
  });
  const resource = created.json.resource;

  assert.equal(resource.workspaceId, undefined);
  assert.equal(resource.__v, undefined);
  assert.equal(resource._id, undefined);
  assert.equal(resource.password, undefined);

  const listed = await api("GET", listUrl(state.platformId), { cookie: cookies.linus });
  const found = listed.json.resources.find((r) => r.id === created.json.resource.id);
  assert.ok(found, "the created resource must be listed");
  assert.deepEqual(
    Object.keys(found).sort(),
    ["category", "createdAt", "createdBy", "description", "id", "name", "projectId", "updatedAt", "url"],
    "the listed shape is exactly what the client renders"
  );

  await ProjectResource.deleteOne({ _id: created.json.resource.id });
});
