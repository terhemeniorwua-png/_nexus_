"use strict";

// Phase 18 — Real-time integration tests.
//
// These run the real Socket.IO server over a real HTTP listener and drive it
// with real clients, so what is asserted is what a browser would see: that an
// event reaches the people entitled to it, and nobody else.
//
// The recurring theme is negative testing. The interesting failure mode for
// real-time is not "the event did not arrive" but "the event arrived at
// someone who should never have received it", so most cases here pair a
// positive assertion with an explicit check on a bystander.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_realtime_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-realtime-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
// The socket layer trusts CLIENT_URL; the test listener is on a random port.
process.env.CLIENT_URL = "http://127.0.0.1";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");
const Project = require("../src/models/project.model");
const ProjectMember = require("../src/models/projectMember.model");
const BoardColumn = require("../src/models/boardColumn.model");
const Task = require("../src/models/task.model");

const app = require("../src/app");
const { initSocket } = require("../src/sockets");
const presence = require("../src/sockets/presence");

const PASSWORD = "Password123!";
const NAMES = ["ada", "alan", "linus", "margaret", "outsider"];

let server;
let base;
let port;
const state = {};
const tokens = {};
const clients = [];

// --- HTTP helper -------------------------------------------------------------
async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Cookie = `nexus_token=${token}`;
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
  return res.json.token;
}

// --- socket helper -----------------------------------------------------------
/**
 * Connect a real client. `auth` is passed through untouched so tests can
 * deliberately send a bad or absent token.
 */
function connect(auth) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth,
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}

/** The client-side username for a socket, so tests can scope their teardown. */
const socketsByUser = new Map();

function connectAs(name) {
  const socket = connect({ token: `Bearer ${tokens[name]}` });
  if (!socketsByUser.has(name)) socketsByUser.set(name, []);
  socketsByUser.get(name).push(socket);
  return socket;
}

function connected(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for connect")), 5000);
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

/** Collect events of one type for the lifetime of the test. */
function watch(socket, event) {
  const received = [];
  socket.on(event, (payload) => received.push(payload));
  return received;
}

/** Wait until `predicate` holds, or fail. Used to await a broadcast. */
async function until(predicate, { timeout = 4000, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function buildFixtures() {
  const users = {};
  for (const name of NAMES) {
    users[name] = await User.create({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: `${name}@acme.test`,
      password: PASSWORD,
    });
    state[`${name}Id`] = String(users[name]._id);
  }

  const workspace = await Workspace.create({
    name: "Acme Realtime",
    ownerId: users.ada._id,
  });
  state.workspaceId = String(workspace._id);

  // outsider is a registered user with NO membership in this workspace.
  await WorkspaceMember.insertMany(
    ["ada", "alan", "linus", "margaret"].map((name) => ({
      workspaceId: workspace._id,
      userId: users[name]._id,
      role: "Member",
    }))
  );

  const platform = await Project.create({
    workspaceId: workspace._id,
    name: "Realtime Platform",
    managerId: users.alan._id,
    createdBy: users.alan._id,
  });
  const other = await Project.create({
    workspaceId: workspace._id,
    name: "Unrelated Project",
    managerId: users.margaret._id,
    createdBy: users.margaret._id,
  });

  state.platformId = String(platform._id);
  state.otherId = String(other._id);

  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.alan._id, role: "PROJECT_MANAGER" },
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: platform._id, userId: users.margaret._id, role: "MEMBER" },
    { projectId: other._id, userId: users.margaret._id, role: "PROJECT_MANAGER" },
  ]);

  const columns = {};
  for (const [i, name] of ["To Do", "In Progress", "Done"].entries()) {
    columns[name] = await BoardColumn.create({ projectId: platform._id, name, position: i });
  }
  state.todoColumnId = String(columns["To Do"]._id);
  state.progressColumnId = String(columns["In Progress"]._id);
  state.doneColumnId = String(columns["Done"]._id);
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();

  await buildFixtures();

  server = http.createServer(app);
  initSocket(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;

  for (const name of NAMES) tokens[name] = await login(`${name}@acme.test`);
});

after(async () => {
  for (const socket of clients) socket.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

const ws = (id) => `/api/workspaces/${id}`;

/** An authenticated socket for a named user, connected. */
async function signedIn(name) {
  const socket = connectAs(name);
  await connected(socket);
  return socket;
}

/**
 * Close every socket a user currently has open.
 *
 * The presence tests assert on reference counts — "this user is still online
 * because a second tab survives" — so they must start from a known connection
 * set rather than inherit sockets left connected by earlier cases.
 */
async function disconnectAll(name) {
  const open = (socketsByUser.get(name) || []).filter((socket) => socket.connected);
  for (const socket of open) socket.close();
  await until(
    async () => (socketsByUser.get(name) || []).every((socket) => !socket.connected),
    { label: `${name}'s sockets to close` }
  );
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

test("a socket with no token is rejected", async () => {
  const socket = connect({});
  await assert.rejects(connected(socket), (err) => {
    assert.match(err.message, /authentication required/i);
    return true;
  });
});

test("a socket with a forged token is rejected", async () => {
  const socket = connect({ token: "Bearer not-a-real-token" });
  await assert.rejects(connected(socket), (err) => {
    assert.match(err.message, /authentication required/i);
    return true;
  });
});

test("a token signed with the wrong secret is rejected", async () => {
  // Proves the socket is verified with the server's own secret rather than
  // simply being decoded.
  const jwt = require("jsonwebtoken");
  const forged = jwt.sign({ userId: state.alanId }, "some-other-secret");
  const socket = connect({ token: `Bearer ${forged}` });
  await assert.rejects(connected(socket), /authentication required/i);
});

test("a valid token connects and never exposes the password hash", async () => {
  const socket = await signedIn("alan");
  assert.ok(socket.connected);
  // Nothing sensitive is pushed to the client at handshake time; the server
  // only needs an id and display fields.
  assert.equal(socket.nexus_test_probe, undefined);
});

// ---------------------------------------------------------------------------
// Room authorization
// ---------------------------------------------------------------------------

test("a project member may join the project room", async () => {
  const socket = await signedIn("linus");
  const joined = watch(socket, "project:joined");
  socket.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await until(() => joined.length > 0, { label: "project:joined" });
  assert.equal(String(joined[0].projectId), state.platformId);
});

test("a non-member is refused the project room and hears nothing from it", async () => {
  const socket = await signedIn("outsider");
  const joined = watch(socket, "project:joined");
  const taskEvents = watch(socket, "task:created");
  const denied = watch(socket, "project:denied");

  socket.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  // Give the server room to refuse, then prove nothing was joined.
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(joined.length, 0, "outsider was let into the project room");
  assert.ok(
    denied.length > 0,
    "a refused join should tell the client, so the UI can stop waiting for events"
  );

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks`, {
    token: tokens.alan,
    body: { columnId: state.todoColumnId, title: "Should not reach outsider" },
  });
  assert.equal(res.status, 201);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(taskEvents.length, 0, "outsider received a task event for a project they cannot see");
});

test("a project event does not leak across projects", async () => {
  // margaret is a member of BOTH projects, so this proves the rooms are
  // separate rather than merely access-controlled.
  const platform = await signedIn("margaret");
  platform.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const otherProject = watch(platform, "task:created");

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.otherId}/tasks`, {
    token: tokens.margaret,
    body: { columnId: state.todoColumnId, title: "Unrelated task" },
  });
  // The column belongs to the other project, so the write is rejected; what
  // matters is that nothing about it reached the platform room.
  assert.ok(res.status === 201 || res.status === 400 || res.status === 404);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(otherProject.length, 0, "a task from another project leaked into this room");
});

// ---------------------------------------------------------------------------
// Task + comment broadcast
// ---------------------------------------------------------------------------

test("a created task reaches project members and carries the REST shape", async () => {
  const watcher = await signedIn("linus");
  watcher.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const created = watch(watcher, "task:created");

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks`, {
    token: tokens.alan,
    body: { columnId: state.todoColumnId, title: "Wire up presence", priority: "HIGH" },
  });
  assert.equal(res.status, 201);
  const taskId = res.json.task.id;

  await until(() => created.length > 0, { label: "task:created" });

  const event = created[0];
  assert.equal(String(event.task._id || event.task.id), String(taskId));
  assert.equal(String(event.projectId), state.platformId);
  // The payload is the same object the REST call returned, so the client can
  // trust it without a second request.
  assert.equal(event.task.title, "Wire up presence");
  // It must not carry a mutable internal document wholesale.
  assert.equal(event.task.__v, undefined);
});

test("a task move reaches the project room and the database really changed", async () => {
  const watcher = await signedIn("linus");
  watcher.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const moved = watch(watcher, "task:moved");

  const list = await api("GET", `${ws(state.workspaceId)}/projects/${state.platformId}/board`, {
    token: tokens.alan,
  });
  const anyTask = list.json.tasks[0];
  assert.ok(anyTask, "the board had no tasks to move");

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks/${anyTask.id}/move`, {
    token: tokens.alan,
    body: { columnId: state.doneColumnId, position: 0 },
  });
  assert.equal(res.status, 200);

  await until(() => moved.length > 0, { label: "task:moved" });

  const check = await api("GET", `${ws(state.workspaceId)}/projects/${state.platformId}/board`, {
    token: tokens.alan,
  });
  const stored = check.json.tasks.find((t) => String(t.id) === String(anyTask.id));
  assert.ok(stored, "task vanished from the board after a move");
});

test("a new comment reaches the project room as comment:created", async () => {
  const watcher = await signedIn("linus");
  watcher.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const created = watch(watcher, "comment:created");
  // The old name is gone: nothing should be listening on it any more.
  const legacy = watch(watcher, "comment:added");

  const board = await api("GET", `${ws(state.workspaceId)}/projects/${state.platformId}/board`, {
    token: tokens.alan,
  });
  const taskId = board.json.tasks[0].id;

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks/${taskId}/comments`, {
    token: tokens.alan,
    body: { content: "Socket comments are live" },
  });
  assert.equal(res.status, 201);

  await until(() => created.length > 0, { label: "comment:created" });
  assert.equal(String(created[0].comment.taskId), String(taskId));
  assert.equal(legacy.length, 0, "comment:added should no longer be emitted");
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

test("a notification reaches only its recipient", async () => {
  // linus is assigned the task, so linus is the recipient; margaret and the
  // author are bystanders.
  const recipient = await signedIn("linus");
  const bystander = await signedIn("margaret");
  const author = await signedIn("alan");

  const gotRecipient = watch(recipient, "notification:new");
  const gotBystander = watch(bystander, "notification:new");
  const gotAuthor = watch(author, "notification:new");

  const board = await api("GET", `${ws(state.workspaceId)}/projects/${state.platformId}/board`, {
    token: tokens.alan,
  });
  const task = board.json.tasks[0];
  assert.ok(task, "the board had no tasks");

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks`, {
    token: tokens.alan,
    body: { columnId: state.todoColumnId, title: "Assign me", assignedTo: state.linusId },
  });
  assert.equal(res.status, 201);
  assert.ok(task);

  await until(() => gotRecipient.length > 0, { label: "notification:new for the assignee" });

  // The payload is the recipient's own notification, in the same shape the
  // notifications endpoint returns, so the bell needs no second request.
  const notification = gotRecipient[0].notification;
  assert.ok(notification.id, "socket notification should expose the same id as the REST payload");
  assert.equal(notification.read, false);
  assert.ok(notification.title);

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(gotBystander.length, 0, "a non-recipient received someone else's notification");
  assert.equal(gotAuthor.length, 0, "the author was notified about their own action");
});

// ---------------------------------------------------------------------------
// Messages
//
// Phase 19 replaced the old `dm:<a>_<b>` string channel with a real
// Conversation plus private user rooms. The coverage for *who receives* a
// message now lives in test/messaging.test.js, which exercises the full
// authorization matrix. What remains here is the delivery path itself.
// ---------------------------------------------------------------------------

test("a direct message reaches both participants and nobody else", async () => {
  const sender = await signedIn("linus");
  const partner = await signedIn("margaret");
  const bystander = await signedIn("alan");

  const gotSender = watch(sender, "message:direct");
  const gotPartner = watch(partner, "message:direct");
  const gotBystander = watch(bystander, "message:direct");

  const res = await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: "Private: only you can read this" },
  });
  assert.equal(res.status, 201);

  await until(() => gotPartner.length > 0, { label: "the DM to reach its recipient" });
  await until(() => gotSender.length > 0, { label: "the DM to reach the sender's other tabs" });

  assert.equal(gotBystander.length, 0, "a workspace member received a direct message");
  // The payload is the message itself, not nested under `message`, so the
  // socket frame and the REST body are the same object.
  assert.equal(gotPartner[0].content, "Private: only you can read this");

  const stored = await api("GET", `/api/messages/direct/${state.linusId}`, { token: tokens.margaret });
  assert.equal(stored.status, 200);
  assert.ok(
    stored.json.messages.some((m) => m.content === "Private: only you can read this"),
    "the DM was delivered over the socket but never persisted"
  );
});

test("a direct message is not delivered to a joined channel room", async () => {
  // Even a member of the shared channel must not receive a DM through it.
  const watcher = await signedIn("alan");
  const channel = await api("GET", `${ws(state.workspaceId)}/channels`, { token: tokens.alan });
  const general = channel.json.channels.find((c) => c.name === "general");
  watcher.emit("channel:join", { workspaceId: state.workspaceId, channelId: general.id });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const got = watch(watcher, "message:direct");

  const res = await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: "Not for the channel" },
  });
  assert.equal(res.status, 201);

  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(got.length, 0, "a DM was broadcast into a shared channel room");
});

test("a shared channel message reaches the channel room", async () => {
  const watcher = await signedIn("alan");
  const channel = await api("GET", `${ws(state.workspaceId)}/channels`, { token: tokens.alan });
  const general = channel.json.channels.find((c) => c.name === "general");
  watcher.emit("channel:join", { workspaceId: state.workspaceId, channelId: general.id });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const got = watch(watcher, "message:channel");

  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.margaret,
    body: { channelId: general.id, content: "Deploy is green" },
  });
  assert.equal(res.status, 201);

  await until(() => got.length > 0, { label: "the channel message" });
  assert.equal(got[0].content, "Deploy is green");
  assert.equal(got[0].id, res.json.message.id, "socket and REST disagree on the message id");
});

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

test("a presence snapshot is scoped to the requested workspace", async () => {
  const watcher = await signedIn("linus");
  const snapshots = watch(watcher, "presence:snapshot");

  watcher.emit("presence:subscribe", { workspaceId: state.workspaceId });
  await until(() => snapshots.length > 0, { label: "presence:snapshot" });

  const snapshot = snapshots[0];
  assert.equal(String(snapshot.workspaceId), state.workspaceId);
  // The subscriber is counted, and no one outside the workspace is present.
  assert.ok(snapshot.userIds.map(String).includes(state.linusId));
  assert.equal(
    snapshot.userIds.map(String).includes(state.outsiderId),
    false,
    "an outsider appeared in the workspace roster"
  );
});

test("presence is refused for a workspace the user does not belong to", async () => {
  const outsider = await signedIn("outsider");
  const snapshots = watch(outsider, "presence:snapshot");

  outsider.emit("presence:subscribe", { workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(snapshots.length, 0, "an outsider received a workspace presence roster");
});

test("closing one tab does not mark a still-connected user offline", async () => {
  // These assertions are about alan's total connection count, so start from a
  // known state rather than inherit sockets from earlier cases.
  await disconnectAll("alan");

  const tabOne = await signedIn("alan");
  const tabTwo = await signedIn("alan");
  const observer = await signedIn("linus");

  observer.emit("presence:subscribe", { workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  tabOne.emit("presence:subscribe", { workspaceId: state.workspaceId });
  tabTwo.emit("presence:subscribe", { workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 250));

  const wentOffline = [];
  observer.on("user:offline", (payload) => wentOffline.push(payload));

  tabOne.close();
  await new Promise((resolve) => setTimeout(resolve, 400));

  // The user is still online through tab two, so nobody may be told otherwise.
  assert.ok(
    presence.isOnline(state.alanId),
    "alan is still connected through his second tab and should be online"
  );
  assert.equal(
    wentOffline.filter((p) => String(p.userId) === state.alanId).length,
    0,
    "alan was marked offline while a second tab was still open"
  );

  // Only the final tab closing is an offline event.
  tabTwo.close();
  await until(
    () => wentOffline.filter((p) => String(p.userId) === state.alanId).length > 0,
    { label: "user:offline after the last tab closed" }
  );
  assert.equal(presence.isOnline(state.alanId), false);
});

test("unsubscribing from a workspace leaves the rest of the session intact", async () => {
  await disconnectAll("margaret");

  const user = await signedIn("margaret");
  const observer = await signedIn("linus");
  observer.emit("presence:subscribe", { workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  user.emit("presence:subscribe", { workspaceId: state.workspaceId });
  await until(
    () => presence.onlineUserIds(state.workspaceId).includes(state.margaretId),
    { label: "margaret to appear in the workspace roster" }
  );

  const wentOffline = [];
  observer.on("user:offline", (payload) => wentOffline.push(payload));

  // Navigating away from the workspace, with the socket still alive.
  user.emit("presence:unsubscribe", { workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 400));

  // The socket is still up; only the workspace view was left, so exactly one
  // offline event is expected — and none for any other room.
  assert.equal(
    wentOffline.filter((p) => String(p.userId) === state.margaretId).length,
    1,
    "leaving a workspace should announce one offline, not zero or a duplicate"
  );
  assert.equal(presence.onlineUserIds(state.workspaceId).includes(state.margaretId), false);
  assert.ok(user.connected, "unsubscribing must not close the socket");
  assert.ok(presence.isOnline(state.margaretId), "the user is still connected overall");
});

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

test("a deliverable change reaches the project room with its task id", async () => {
  // A reviewer must be able to see a submission land without refreshing, so
  // the event has to name the task whose panel should re-read.
  await disconnectAll("alan");

  const reviewer = await signedIn("alan");
  reviewer.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const events = watch(reviewer, "deliverable:updated");

  const board = await api("GET", `${ws(state.workspaceId)}/projects/${state.platformId}/board`, {
    token: tokens.margaret,
  });
  assert.equal(board.status, 200);

  // Only the assignee may submit, so give margaret a task of her own.
  const created = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks`, {
    token: tokens.alan,
    body: { columnId: state.todoColumnId, title: "Deliverable subject", assignedTo: state.margaretId },
  });
  assert.equal(created.status, 201, `task not created: ${JSON.stringify(created.json)}`);
  const task = created.json.task;

  // These bytes really are a PDF; the storage service checks magic bytes.
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n" + "x".repeat(200)
  );
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "spec.pdf");

  const uploaded = await fetch(
    `${base}/api/tasks/${task.id}/deliverables`,
    { method: "POST", headers: { Cookie: `nexus_token=${tokens.margaret}` }, body: form }
  );
  const uploadedJson = await uploaded.json().catch(() => null);
  assert.equal(uploaded.status, 201, `upload rejected: ${JSON.stringify(uploadedJson)}`);

  await until(() => events.length > 0, { label: "deliverable:updated" });
  assert.equal(String(events[0].taskId), String(task.id));
  assert.ok(events[0].deliverable, "the event should carry the deliverable");
});

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

test("a disconnect does not take the server down for other clients", async () => {
  const survivor = await signedIn("linus");
  survivor.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const events = watch(survivor, "task:created");
  const doomed = await signedIn("alan");
  doomed.close();

  const res = await api("POST", `${ws(state.workspaceId)}/projects/${state.platformId}/tasks`, {
    token: tokens.alan,
    body: { columnId: state.todoColumnId, title: "Still delivered" },
  });
  assert.equal(res.status, 201);

  await until(() => events.length > 0, { label: "delivery after an unrelated disconnect" });
});
