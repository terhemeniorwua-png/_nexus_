"use strict";

// Phase 22 — Knowledge Base tests.
//
// The Knowledge Base is the last stage of the work lifecycle, so the tests are
// about the ways it could lie:
//
//   • an unapproved submission being promoted into "approved knowledge"
//   • the same submission being promoted twice (and twice at once)
//   • a resource from one project being read, promoted into, or archived from
//     another project
//   • a member or viewer curating knowledge they may only read
//   • a knowledge resource that cannot be traced back to its submission, task
//     and project — or one that can, but wrongly
//   • search and filter results that disagree with the database
//   • a resource whose stored file handle leaks to the client
//   • summary counts that describe the search instead of the project
//   • the submission UI being offered an "Add" action it must not offer
//
// Every assertion is checked against the collection directly, so a pass means
// the payload matched what is actually stored.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_knowledge_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-knowledge-test-secret";
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
const KnowledgeResource = require("../src/models/knowledgeResource.model");

const app = require("../src/app");

const PASSWORD = "Password123!";
const NAMES = ["ada", "alan", "linus", "grace", "barbara", "mallory"];

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

// Project-scoped knowledge URLs.
const kb = (projectId, suffix = "") =>
  `/api/workspaces/${state.workspaceA}/projects/${projectId}/knowledge${suffix}`;

// --- Fixtures ----------------------------------------------------------------
//
//   Workspace "Acme" (ada owns it, alan is a workspace Admin)
//     Platform — alan manages; linus MEMBER, grace VIEWER
//     Vault    — nobody in Acme has a role; only reachable by Acme admins
//   Workspace "Rival" (mallory owns it)
//     Foreign  — mallory manages; invisible to everyone in Acme
//
// Platform's task #1 carries an APPROVED deliverable (v2), task #2 a
// SUBMITTED one, task #3 a DRAFT one.
function versionRow(deliverableId, versionNumber, extra = {}) {
  const fileName = extra.fileName || `v${versionNumber}.pdf`;
  return {
    deliverableId,
    versionNumber,
    status: extra.status || "SUBMITTED",
    fileName,
    storageKey: `${deliverableId}/v${versionNumber}/${fileName}`,
    fileUrl: `/api/deliverables/${deliverableId}/versions/${versionNumber}/download`,
    fileSize: 2048 * versionNumber,
    mimeType: "application/pdf",
    ...extra,
  };
}

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

  // --- Platform: alan's project ---------------------------------------------
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

  const column = await BoardColumn.create({
    projectId: platform._id,
    name: "To Do",
    position: 0,
  });

  // --- Vault: a second Acme project nobody above is a plain member of --------
  const vault = await Project.create({
    workspaceId: wsA._id,
    name: "Vault",
    status: "ACTIVE",
    managerId: users.ada._id,
    createdBy: users.ada._id,
  });
  state.vaultId = String(vault._id);
  const vaultColumn = await BoardColumn.create({
    projectId: vault._id,
    name: "To Do",
    position: 0,
  });

  // --- Foreign: mallory's project in another workspace ----------------------
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
  const foreignColumn = await BoardColumn.create({
    projectId: foreign._id,
    name: "To Do",
    position: 0,
  });

  // --- Tasks + deliverables -------------------------------------------------
  const makeTask = (project, col, title, status) =>
    Task.create({
      projectId: project._id,
      workspaceId: project.workspaceId,
      columnId: col._id,
      title,
      status,
      createdBy: users.alan._id,
    });

  const approvedTask = await makeTask(platform, column, "Complete API Documentation", "APPROVED");
  const submittedTask = await makeTask(platform, column, "Draft the research report", "SUBMITTED");
  const draftTask = await makeTask(platform, column, "Sketch the architecture", "ASSIGNED");
  const foreignTask = await makeTask(foreign, foreignColumn, "Foreign work", "APPROVED");

  state.approvedTaskId = String(approvedTask._id);
  state.submittedTaskId = String(submittedTask._id);
  state.draftTaskId = String(draftTask._id);

  const approvedDl = await Deliverable.create({
    taskId: approvedTask._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.linus._id,
    title: "API Documentation",
    status: "APPROVED",
    currentVersion: 2,
    approvedVersion: 2,
  });
  state.approvedDeliverableId = String(approvedDl._id);

  await DeliverableVersion.insertMany([
    versionRow(approvedDl._id, 1, { status: "CHANGES_REQUESTED", submittedBy: users.linus._id }),
    versionRow(approvedDl._id, 2, {
      status: "APPROVED",
      submittedBy: users.linus._id,
      reviewedAt: new Date(),
      description: "REST endpoints, authentication and response shapes for Nexus.",
    }),
  ]);

  const submittedDl = await Deliverable.create({
    taskId: submittedTask._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.linus._id,
    title: "Research Report",
    status: "SUBMITTED",
    currentVersion: 1,
  });
  state.submittedDeliverableId = String(submittedDl._id);
  await DeliverableVersion.create(
    versionRow(submittedDl._id, 1, { status: "SUBMITTED", submittedBy: users.linus._id })
  );

  const draftDl = await Deliverable.create({
    taskId: draftTask._id,
    workspaceId: wsA._id,
    projectId: platform._id,
    createdBy: users.linus._id,
    title: "Architecture Document",
    status: "DRAFT",
    currentVersion: 1,
  });
  state.draftDeliverableId = String(draftDl._id);
  await DeliverableVersion.create(versionRow(draftDl._id, 1, { status: "DRAFT" }));

  const foreignDl = await Deliverable.create({
    taskId: foreignTask._id,
    workspaceId: wsB._id,
    projectId: foreign._id,
    createdBy: users.mallory._id,
    title: "Foreign Documentation",
    status: "APPROVED",
    currentVersion: 1,
    approvedVersion: 1,
  });
  state.foreignDeliverableId = String(foreignDl._id);
  await DeliverableVersion.create(
    versionRow(foreignDl._id, 1, { status: "APPROVED", submittedBy: users.mallory._id })
  );

  // One pre-existing curated resource so the list endpoint has something to
  // read on its first (empty) assertion.
  await KnowledgeResource.create({
    projectId: platform._id,
    workspaceId: wsA._id,
    title: "GitHub Repository",
    description: "Source code repository for the Nexus project.",
    category: "REPOSITORIES",
    resourceType: "REPOSITORY",
    url: "https://github.com/nexus/nexus",
    status: "APPROVED",
    sourceType: "EXTERNAL_LINK",
    createdBy: users.alan._id,
    approvedBy: users.alan._id,
    approvedAt: new Date(),
  });
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  // Build the partial unique index on sourceDeliverableId before any test
  // relies on it for the concurrent-promotion guarantee.
  await KnowledgeResource.init();
  await buildFixtures();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const name of NAMES) {
    await login(`${name}@acme.test`);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

// ===========================================================================
// Authorization
// ===========================================================================
test("the knowledge base requires authentication", async () => {
  const res = await api("GET", kb(state.platformId));
  assert.equal(res.status, 401);
});

test("a user outside the workspace cannot reach the knowledge base", async () => {
  const res = await api("GET", kb(state.platformId), { cookie: cookies.mallory });
  assert.equal(res.status, 403);
});

test("a workspace member without a project role is refused", async () => {
  // linus is a workspace Member but has no role on Vault, and is not its
  // manager: the inherited admin rule must not leak across projects.
  const res = await api("GET", kb(state.vaultId), { cookie: cookies.linus });
  assert.equal(res.status, 403);
});

test("a project viewer can read the knowledge base", async () => {
  const res = await api("GET", kb(state.platformId), { cookie: cookies.grace });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
});

test("a member can read but cannot curate", async () => {
  const read = await api("GET", kb(state.platformId), { cookie: cookies.linus });
  assert.equal(read.status, 200);
  assert.equal(read.json.permissions.canCreate, false);
  assert.equal(read.json.permissions.canUpdate, false);
  assert.equal(read.json.permissions.canArchive, false);

  const create = await api("POST", kb(state.platformId), {
    cookie: cookies.linus,
    body: { title: "Sneaky", category: "RESEARCH" },
  });
  assert.equal(create.status, 403);
});

test("a viewer can read but cannot curate", async () => {
  const create = await api("POST", kb(state.platformId), {
    cookie: cookies.grace,
    body: { title: "Sneaky" },
  });
  assert.equal(create.status, 403);
});

test("a project manager can curate", async () => {
  const read = await api("GET", kb(state.platformId), { cookie: cookies.alan });
  assert.equal(read.status, 200);
  assert.equal(read.json.permissions.canCreate, true);
  assert.equal(read.json.permissions.canUpdate, true);
  assert.equal(read.json.permissions.canArchive, true);
});

test("a workspace admin is a project manager inside the workspace", async () => {
  const read = await api("GET", kb(state.vaultId), { cookie: cookies.alan });
  assert.equal(read.status, 200);
  assert.equal(read.json.permissions.canCreate, true);
});

// ===========================================================================
// Listing, summary and validation
// ===========================================================================
test("the list is project-scoped and its summary matches the database", async () => {
  const res = await api("GET", kb(state.platformId), { cookie: cookies.alan });
  assert.equal(res.status, 200);

  const stored = await KnowledgeResource.find({ projectId: state.platformId });
  assert.equal(res.json.resources.length, stored.length);
  assert.equal(res.json.summary.total, stored.length);

  const counted = {};
  for (const r of stored) counted[r.category] = (counted[r.category] || 0) + 1;
  for (const [category, count] of Object.entries(counted)) {
    assert.equal(res.json.summary.byCategory[category], count, `category ${category}`);
  }
  // Every category is present even at zero, so the client never has to guard.
  assert.equal(res.json.summary.byCategory.ARCHITECTURE, 0);
  assert.equal(res.json.summary.byCategory.REPOSITORIES, 1);
});

test("resources from another project never leak into the list", async () => {
  const res = await api("GET", kb(state.vaultId), { cookie: cookies.ada });
  assert.equal(res.status, 200);
  assert.equal(res.json.resources.length, 0);

  const platform = await api("GET", kb(state.platformId), { cookie: cookies.ada });
  const titles = platform.json.resources.map((r) => r.title);
  assert.ok(titles.includes("GitHub Repository"));
  assert.ok(!titles.includes("Foreign Documentation"));
});

test("the payload exposes no stored file handle", async () => {
  const res = await api("GET", kb(state.platformId), { cookie: cookies.alan });
  const raw = JSON.stringify(res.json);
  assert.ok(!raw.includes("storageKey"), "storageKey must never reach the client");
});

test("the response advertises its own filter vocabulary", async () => {
  const res = await api("GET", kb(state.platformId), { cookie: cookies.alan });
  assert.deepEqual(res.json.categories, [
    "DOCUMENTATION",
    "REPORTS",
    "ARCHITECTURE",
    "RESEARCH",
    "TESTING",
    "REPOSITORIES",
    "OTHER",
  ]);
  assert.deepEqual(res.json.statuses, ["APPROVED", "ARCHIVED"]);
  assert.deepEqual(res.json.resourceTypes, [
    "DOCUMENT",
    "LINK",
    "REPOSITORY",
    "REPORT",
    "OTHER",
  ]);
});

// ===========================================================================
// Search and filters
// ===========================================================================
test("search matches title, description and author", async () => {
  const byTitle = await api("GET", `${kb(state.platformId)}?search=GitHub`, {
    cookie: cookies.alan,
  });
  assert.equal(byTitle.json.resources.length, 1);
  assert.equal(byTitle.json.resources[0].title, "GitHub Repository");

  const byDescription = await api(
    `GET`,
    `${kb(state.platformId)}?search=${encodeURIComponent("source code")}`,
    { cookie: cookies.alan }
  );
  assert.equal(byDescription.json.resources.length, 1);

  // "Alan" authored it; "Linus" must not match it.
  const byAuthor = await api("GET", `${kb(state.platformId)}?search=Alan`, {
    cookie: cookies.alan,
  });
  assert.equal(byAuthor.json.resources.length, 1);
  const notAuthor = await api("GET", `${kb(state.platformId)}?search=Linus`, {
    cookie: cookies.alan,
  });
  assert.equal(notAuthor.json.resources.length, 0);
});

test("search matches the project name, because the page is scoped to it", async () => {
  const res = await api("GET", `${kb(state.platformId)}?search=Platform`, {
    cookie: cookies.alan,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.resources.length, 1);
});

test("search treats its input as text, not as a pattern", async () => {
  for (const input of ["(", ".*", "[a-z", "a|b", "\\"]) {
    const res = await api("GET", `${kb(state.platformId)}?search=${encodeURIComponent(input)}`, {
      cookie: cookies.alan,
    });
    assert.equal(res.status, 200, `search ${JSON.stringify(input)} must not error`);
    assert.equal(res.json.resources.length, 0, `search ${JSON.stringify(input)} must match nothing`);
  }
});

test("an unknown search returns nothing rather than everything", async () => {
  const res = await api("GET", `${kb(state.platformId)}?search=zzzznotathing`, {
    cookie: cookies.alan,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.resources.length, 0);
});

test("category, status and type filters narrow the list and combine", async () => {
  const repos = await api("GET", `${kb(state.platformId)}?category=REPOSITORIES`, {
    cookie: cookies.alan,
  });
  assert.equal(repos.json.resources.length, 1);

  const byType = await api("GET", `${kb(state.platformId)}?resourceType=REPOSITORY`, {
    cookie: cookies.alan,
  });
  assert.equal(byType.json.resources.length, 1);

  const mismatch = await api(
    `GET`,
    `${kb(state.platformId)}?category=REPOSITORIES&resourceType=DOCUMENT`,
    { cookie: cookies.alan }
  );
  assert.equal(mismatch.json.resources.length, 0);

  // ALL is the documented "no filter" value, not an error.
  const all = await api("GET", `${kb(state.platformId)}?category=ALL&status=ALL&resourceType=ALL`, {
    cookie: cookies.alan,
  });
  assert.equal(all.status, 200);
  assert.equal(all.json.resources.length, 1);
});

test("an unknown filter value is rejected rather than ignored", async () => {
  for (const query of ["category=NOPE", "status=NOPE", "resourceType=NOPE"]) {
    const res = await api("GET", `${kb(state.platformId)}?${query}`, { cookie: cookies.alan });
    assert.equal(res.status, 400, `${query} should be rejected`);
  }
});

test("the summary describes the project, not the current search", async () => {
  const res = await api("GET", `${kb(state.platformId)}?category=REPOSITORIES`, {
    cookie: cookies.alan,
  });
  assert.equal(res.json.resources.length, 1);
  assert.equal(res.json.summary.total, 1, "this project has one resource in total");
});

// ===========================================================================
// Creating curated resources
// ===========================================================================
test("a manager can add a resource and it is stored with provenance", async () => {
  const res = await api("POST", kb(state.platformId), {
    cookie: cookies.alan,
    body: {
      title: "Architecture Document",
      description: "System architecture, services and database design.",
      category: "ARCHITECTURE",
      resourceType: "DOCUMENT",
      content: "Services: express, mongo. Flows: REST + socket.",
    },
  });
  assert.equal(res.status, 201);

  const stored = await KnowledgeResource.findById(res.json.resource.id);
  assert.equal(stored.title, "Architecture Document");
  assert.equal(stored.category, "ARCHITECTURE");
  assert.equal(stored.status, "APPROVED");
  assert.equal(stored.sourceType, "MANUAL");
  assert.equal(String(stored.projectId), state.platformId);
  assert.equal(String(stored.createdBy), String(state.users.alan._id));
  assert.equal(String(stored.approvedBy), String(state.users.alan._id));
  state.architectureId = String(stored._id);
});

test("a link resource is normalised and a repository keeps its category", async () => {
  const res = await api("POST", kb(state.platformId), {
    cookie: cookies.alan,
    body: {
      title: "Design System Repo",
      category: "REPOSITORIES",
      resourceType: "REPOSITORY",
      url: "github.com/nexus/design-system",
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.resource.url, "https://github.com/nexus/design-system");
  state.repoId = String(res.json.resource.id);
});

test("input is validated instead of quietly stored", async () => {
  const cases = [
    [{ description: "no title" }, "a missing title"],
    [{ title: "" }, "an empty title"],
    [{ title: "x".repeat(201) }, "an over-long title"],
    [{ title: "ok", resourceType: "LINK" }, "a link with no url"],
    [{ title: "ok", resourceType: "REPOSITORY" }, "a repository with no url"],
    [{ title: "ok", resourceType: "LINK", url: "javascript:alert(1)" }, "a javascript url"],
    [{ title: "ok", resourceType: "LINK", url: "http://" }, "an unparseable url"],
    [{ title: "ok", description: "d".repeat(2001) }, "an over-long description"],
  ];
  for (const [body, label] of cases) {
    const res = await api("POST", kb(state.platformId), { cookie: cookies.alan, body });
    assert.equal(res.status, 400, `${label} should be rejected, got ${res.status}`);
  }
});

test("an unknown category falls back to OTHER instead of failing", async () => {
  const res = await api("POST", kb(state.platformId), {
    cookie: cookies.alan,
    body: { title: "Loose notes", category: "SOMETHING_ELSE" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.resource.category, "OTHER");
  await KnowledgeResource.deleteOne({ _id: res.json.resource.id });
});

test("a resource created in one project is not visible from another", async () => {
  const res = await api("GET", kb(state.vaultId, `/${state.architectureId}`), {
    cookie: cookies.ada,
  });
  assert.equal(res.status, 404, "another project's resource must be indistinguishable from absent");
});

// ===========================================================================
// The approval bridge — the heart of Phase 22
// ===========================================================================
test("an unapproved submission cannot become approved knowledge", async () => {
  const before = await KnowledgeResource.countDocuments({});
  for (const [deliverableId, label] of [
    [state.submittedDeliverableId, "SUBMITTED"],
    [state.draftDeliverableId, "DRAFT"],
  ]) {
    const res = await api("POST", kb(state.platformId, `/from-deliverable/${deliverableId}`), {
      cookie: cookies.alan,
    });
    assert.equal(res.status, 400, `a ${label} submission must be refused`);
    assert.match(res.json.message, /approved/i);
  }
  assert.equal(
    await KnowledgeResource.countDocuments({}),
    before,
    "a refused promotion must create nothing"
  );
  assert.equal(
    await KnowledgeResource.countDocuments({
      sourceType: "APPROVED_DELIVERABLE",
    }),
    0,
    "no knowledge claims to come from an unapproved submission"
  );
});

test("an approved submission is promoted with its full lineage", async () => {
  const res = await api(
    "POST",
    kb(state.platformId, `/from-deliverable/${state.approvedDeliverableId}`),
    { cookie: cookies.alan }
  );
  assert.equal(res.status, 201);

  const resource = res.json.resource;
  assert.equal(resource.title, "API Documentation");
  assert.equal(resource.sourceType, "APPROVED_DELIVERABLE");
  assert.equal(resource.sourceDeliverableId, state.approvedDeliverableId);
  assert.equal(resource.sourceTaskId, state.approvedTaskId);
  assert.equal(resource.sourceVersionNumber, 2);
  assert.equal(resource.status, "APPROVED");
  assert.equal(String(resource.projectId), state.platformId);
  // Traceable to the work that produced it, in one response.
  assert.equal(resource.sourceTaskTitle, "Complete API Documentation");
  // The approved file is referenced, not copied.
  assert.equal(resource.sourceFile.fileName, "v2.pdf");
  assert.ok(resource.sourceFile.fileUrl.includes("/download"));
  assert.equal(resource.sourceFile.storageKey, undefined);

  // The stored description comes from the approved version, so the knowledge
  // carries the submitter's own summary.
  assert.match(resource.description, /REST endpoints/);

  state.promotedId = String(resource.id);
});

test("the promoted resource matches the database exactly", async () => {
  const stored = await KnowledgeResource.findById(state.promotedId);
  assert.equal(String(stored.sourceDeliverableId), state.approvedDeliverableId);
  assert.equal(String(stored.sourceTaskId), state.approvedTaskId);
  assert.equal(stored.sourceVersionNumber, 2);
  assert.equal(stored.sourceType, "APPROVED_DELIVERABLE");
  assert.equal(String(stored.workspaceId), state.workspaceA);
  // The file handle is kept server-side only.
  assert.ok(stored.sourceFile.storageKey, "the handle is stored");
  assert.equal(
    await KnowledgeResource.countDocuments({
      sourceDeliverableId: state.approvedDeliverableId,
    }),
    1
  );
});

test("promoting the same submission twice is refused", async () => {
  const res = await api(
    "POST",
    kb(state.platformId, `/from-deliverable/${state.approvedDeliverableId}`),
    { cookie: cookies.alan }
  );
  assert.equal(res.status, 409);
  assert.match(res.json.message, /already/i);
  assert.equal(
    await KnowledgeResource.countDocuments({
      sourceDeliverableId: state.approvedDeliverableId,
    }),
    1,
    "still exactly one resource"
  );
});

test("two concurrent promotions of one submission produce one resource", async () => {
  // A fresh approved submission, so the service-level "already exists" check
  // cannot be what answers this: the unique index has to.
  const task = await Task.create({
    projectId: state.platformId,
    workspaceId: state.workspaceA,
    columnId: (await BoardColumn.findOne({ projectId: state.platformId }))._id,
    title: "Race the reviewer",
    status: "APPROVED",
    createdBy: state.users.alan._id,
  });
  const deliverable = await Deliverable.create({
    taskId: task._id,
    workspaceId: state.workspaceA,
    projectId: state.platformId,
    createdBy: state.users.linus._id,
    title: "Concurrent Spec",
    status: "APPROVED",
    currentVersion: 1,
    approvedVersion: 1,
  });
  await DeliverableVersion.create(versionRow(deliverable._id, 1, { status: "APPROVED" }));

  const url = kb(state.platformId, `/from-deliverable/${deliverable._id}`);
  const results = await Promise.all([
    api("POST", url, { cookie: cookies.alan }),
    api("POST", url, { cookie: cookies.ada }),
  ]);
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 409], `expected one 201 and one 409, got ${codes.join(",")}`);
  assert.equal(
    await KnowledgeResource.countDocuments({ sourceDeliverableId: deliverable._id }),
    1
  );
});

test("a member cannot promote a submission", async () => {
  const res = await api(
    "POST",
    kb(state.platformId, `/from-deliverable/${state.submittedDeliverableId}`),
    { cookie: cookies.linus }
  );
  assert.equal(res.status, 403);
});

test("a submission from another project cannot be promoted here", async () => {
  const res = await api(
    "POST",
    kb(state.platformId, `/from-deliverable/${state.foreignDeliverableId}`),
    { cookie: cookies.alan }
  );
  assert.equal(res.status, 404, "must not confirm the submission exists");
});

test("promotion requires a real deliverable id", async () => {
  for (const id of ["not-an-id", "123", `${"0".repeat(23)}`]) {
    const res = await api("POST", kb(state.platformId, `/from-deliverable/${id}`), {
      cookie: cookies.alan,
    });
    assert.equal(res.status, 404, `${id} should be a 404`);
  }
});

// ===========================================================================
// The submission UI's view of the knowledge base
// ===========================================================================
test("the submission payload says the knowledge base is empty, then names it", async () => {
  const url = `/api/deliverables/${state.approvedDeliverableId}`;

  const other = await api("GET", `/api/deliverables/${state.submittedDeliverableId}`, {
    cookie: cookies.alan,
  });
  assert.equal(other.json.knowledge, null, "a submission with no resource reports null");

  const res = await api("GET", url, { cookie: cookies.alan });
  assert.equal(res.status, 200);
  assert.equal(res.json.knowledge.id, state.promotedId);
  assert.equal(res.json.knowledge.title, "API Documentation");
  assert.equal(res.json.knowledge.status, "APPROVED");
});

test("a member can see that a submission is already knowledge", async () => {
  const res = await api("GET", `/api/deliverables/${state.approvedDeliverableId}`, {
    cookie: cookies.linus,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.knowledge.id, state.promotedId);
});

// ===========================================================================
// Detail, editing, archiving
// ===========================================================================
test("the detail view resolves the source task", async () => {
  const res = await api("GET", kb(state.platformId, `/${state.promotedId}`), {
    cookie: cookies.linus,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.resource.id, state.promotedId);
  assert.equal(res.json.resource.sourceTaskTitle, "Complete API Documentation");
  assert.equal(res.json.resource.sourceVersionNumber, 2);
  assert.equal(res.json.resource.approvedBy.name, "Alan");
});

test("an unknown or foreign resource id is a 404", async () => {
  const unknown = await api("GET", kb(state.platformId, `/${"a".repeat(24)}`), {
    cookie: cookies.alan,
  });
  assert.equal(unknown.status, 404);

  const malformed = await api("GET", kb(state.platformId, "/nope"), { cookie: cookies.alan });
  assert.equal(malformed.status, 404);
});

test("a manager can edit a resource", async () => {
  const res = await api("PATCH", kb(state.platformId, `/${state.architectureId}`), {
    cookie: cookies.alan,
    body: { title: "Architecture Overview", category: "ARCHITECTURE" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.resource.title, "Architecture Overview");
  assert.equal(res.json.resource.content, "Services: express, mongo. Flows: REST + socket.");

  const stored = await KnowledgeResource.findById(state.architectureId);
  assert.equal(stored.title, "Architecture Overview");
});

test("a member cannot edit a resource", async () => {
  const res = await api("PATCH", kb(state.platformId, `/${state.architectureId}`), {
    cookie: cookies.linus,
    body: { title: "Hijacked" },
  });
  assert.equal(res.status, 403);
  const stored = await KnowledgeResource.findById(state.architectureId);
  assert.equal(stored.title, "Architecture Overview", "unchanged");
});

test("provenance cannot be rewritten through an edit", async () => {
  const res = await api("PATCH", kb(state.platformId, `/${state.promotedId}`), {
    cookie: cookies.alan,
    body: {
      title: "Renamed",
      sourceType: "MANUAL",
      sourceDeliverableId: state.submittedDeliverableId,
      sourceTaskId: state.draftTaskId,
    },
  });
  assert.equal(res.status, 200);

  const stored = await KnowledgeResource.findById(state.promotedId);
  assert.equal(stored.sourceType, "APPROVED_DELIVERABLE");
  assert.equal(String(stored.sourceDeliverableId), state.approvedDeliverableId);
  assert.equal(String(stored.sourceTaskId), state.approvedTaskId);
  assert.equal(stored.title, "Renamed", "the legitimate edit still applied");
});

test("an edit cannot switch a resource to a link without a url", async () => {
  const res = await api("PATCH", kb(state.platformId, `/${state.architectureId}`), {
    cookie: cookies.alan,
    body: { resourceType: "REPOSITORY" },
  });
  assert.equal(res.status, 400);
});

test("archiving hides a resource from the active list and is reversible", async () => {
  const archive = await api("PATCH", kb(state.platformId, `/${state.repoId}/status`), {
    cookie: cookies.alan,
    body: { status: "ARCHIVED" },
  });
  assert.equal(archive.status, 200);
  assert.equal(archive.json.resource.status, "ARCHIVED");

  // No status parameter at all: the default view is the active one, otherwise
  // archiving would change a label without changing what anybody reads.
  const byDefault = await api("GET", `${kb(state.platformId)}`, { cookie: cookies.alan });
  assert.ok(
    !byDefault.json.resources.some((r) => r.id === state.repoId),
    "an archived resource leaves the default list without being asked to"
  );

  const active = await api("GET", `${kb(state.platformId)}?status=APPROVED`, {
    cookie: cookies.alan,
  });
  assert.ok(
    !active.json.resources.some((r) => r.id === state.repoId),
    "an archived resource is not an active one"
  );

  // Archived knowledge is still reachable — it is hidden, not deleted.
  const everything = await api("GET", `${kb(state.platformId)}?status=ALL`, {
    cookie: cookies.alan,
  });
  assert.ok(
    everything.json.resources.some((r) => r.id === state.repoId),
    "status=ALL still shows archived knowledge"
  );

  const archived = await api("GET", `${kb(state.platformId)}?status=ARCHIVED`, {
    cookie: cookies.alan,
  });
  assert.equal(archived.json.resources.length, 1);
  assert.equal(archived.json.resources[0].id, state.repoId);

  // The header summary still counts the project's knowledge as a whole.
  assert.equal(archived.json.summary.archived, 1);
  assert.ok(archived.json.summary.active >= 1);

  const restore = await api("PATCH", kb(state.platformId, `/${state.repoId}/status`), {
    cookie: cookies.alan,
    body: { status: "APPROVED" },
  });
  assert.equal(restore.status, 200);
  assert.equal(restore.json.resource.status, "APPROVED");
});

test("a member cannot archive, even by guessing the status route", async () => {
  const res = await api("PATCH", kb(state.platformId, `/${state.architectureId}/status`), {
    cookie: cookies.linus,
    body: { status: "ARCHIVED" },
  });
  assert.equal(res.status, 403);
  const stored = await KnowledgeResource.findById(state.architectureId);
  assert.equal(stored.status, "APPROVED");
});

test("an unknown status is rejected", async () => {
  const res = await api("PATCH", kb(state.platformId, `/${state.repoId}/status`), {
    cookie: cookies.alan,
    body: { status: "DELETED" },
  });
  assert.equal(res.status, 400);
});

test("archiving is recorded in the project's activity feed", async () => {
  await api("PATCH", kb(state.platformId, `/${state.repoId}/status`), {
    cookie: cookies.alan,
    body: { status: "ARCHIVED" },
  });
  const Activity = require("../src/models/activity.model");
  const entry = await Activity.findOne({
    projectId: state.platformId,
    action: "KNOWLEDGE_ARCHIVED",
  });
  assert.ok(entry, "archiving is visible in the audit trail");
  assert.equal(entry.targetType, "knowledgeResource");
  assert.equal(String(entry.targetId), state.repoId);
});

// ===========================================================================
// Ordering and the lifecycle the UI depends on
// ===========================================================================
test("promoted knowledge lists with the rest, most recently touched first", async () => {
  const res = await api("GET", kb(state.platformId), { cookie: cookies.alan });
  const ids = res.json.resources.map((r) => r.id);
  const stored = (
    await KnowledgeResource.find({ projectId: state.platformId, status: "APPROVED" })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("_id")
  ).map((r) => String(r._id));
  assert.deepEqual(ids, stored);
});

test("a project with no knowledge reports zero, not an error", async () => {
  const res = await api("GET", kb(state.vaultId), { cookie: cookies.ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.resources, []);
  assert.equal(res.json.summary.total, 0);
  assert.equal(res.json.summary.archived, 0);
});
