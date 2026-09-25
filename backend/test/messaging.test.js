"use strict";

// Phase 19 — messaging.
//
// The point of these tests is the *negative* cases. A messaging feature is
// mostly a set of boundaries, and a boundary that is only ever tested from the
// permitted side is not tested. Every rule below has a matching test that
// proves the forbidden side fails:
//
//   • a DM may not be used to reach a user you share no workspace with
//   • a DM may not become a back door into somebody's private project
//   • a project discussion may not be read or written by a workspace member
//     with no role on that project
//   • a channel room may not be joined without workspace membership
//   • a recipient list in the request body is ignored, not obeyed
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_messaging_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-messaging-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
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
const Message = require("../src/models/message.model");
const Conversation = require("../src/models/conversation.model");
const ConversationMember = require("../src/models/conversationMember.model");

const app = require("../src/app");
const { initSocket } = require("../src/sockets");
const { getIO } = require("../src/sockets/store");

const PASSWORD = "Password123!";
const NAMES = ["ada", "alan", "linus", "margaret", "outsider", "stranger"];

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

async function signedIn(name) {
  const socket = connect({ token: `Bearer ${tokens[name]}` });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

function watch(socket, event) {
  const received = [];
  socket.on(event, (payload) => received.push(payload));
  return received;
}

async function until(predicate, { timeout = 4000, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask the server to join a channel room and wait for the outcome.
 *
 * The server answers a `channel:join` with a `channel:joined` or
 * `channel:denied` *event*, not a Socket.IO acknowledgement callback, so
 * `emit(event, payload, cb)` would hang forever. Waiting on the event is also
 * a stronger assertion: it proves the decision was made and announced, rather
 * than merely that a room ended up populated.
 */
function joinChannel(socket, { workspaceId, channelId }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out joining channel ${channelId}`));
    }, 4000);

    const onJoined = (payload) => {
      cleanup();
      resolve({ joined: true, payload });
    };
    const onDenied = (payload) => {
      cleanup();
      resolve({ joined: false, payload });
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("channel:joined", onJoined);
      socket.off("channel:denied", onDenied);
    };

    socket.on("channel:joined", onJoined);
    socket.on("channel:denied", onDenied);
    socket.emit("channel:join", { workspaceId, channelId });
  });
}

/**
 * Whether a client is in a room, read from the *server's* adapter.
 *
 * The client cannot answer this itself: `socket.join()` on the server sends
 * nothing back, so a client-side `socket.rooms` is not evidence of anything.
 * Reading the adapter's room table is the only way to assert that a join
 * actually happened — and therefore that a later "nothing was delivered" result
 * means the room was empty rather than that the test never got in.
 */
async function serverHasRoom(room, socketId) {
  const io = getIO();
  if (!io) return false;
  const members = await io.in(room).fetchSockets();
  return members.some((member) => member.id === socketId);
}

const ws = (id) => `/api/workspaces/${id}`;

// --- Fixtures ----------------------------------------------------------------
/**
 * The shape of the world, chosen so the boundaries are all testable:
 *
 *   Acme workspace   →  ada (owner), alan (Admin), linus, margaret
 *   outsider         →  registered, but in no workspace at all
 *   stranger         →  registered, in a *different* workspace
 *   Platform         →  alan manages, linus is a member
 *   Vault            →  margaret manages; nobody else is a member
 */
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

  const workspace = await Workspace.create({ name: "Acme Messaging", ownerId: users.ada._id });
  state.workspaceId = String(workspace._id);
  state.channels = Object.fromEntries(
    (workspace.channels || []).map((c) => [c.name, String(c._id)])
  );

  await WorkspaceMember.insertMany(
    ["alan", "linus", "margaret"].map((name) => ({
      workspaceId: workspace._id,
      userId: users[name]._id,
      role: "Member",
    }))
  );

  // A completely separate workspace, so `stranger` shares nothing with Acme.
  const otherWorkspace = await Workspace.create({ name: "Other Co", ownerId: users.stranger._id });
  state.otherWorkspaceId = String(otherWorkspace._id);

  const platform = await Project.create({
    workspaceId: workspace._id,
    name: "Platform",
    managerId: users.alan._id,
    createdBy: users.alan._id,
  });
  const vault = await Project.create({
    workspaceId: workspace._id,
    name: "Vault",
    managerId: users.margaret._id,
    createdBy: users.margaret._id,
  });

  state.platformId = String(platform._id);
  state.vaultId = String(vault._id);

  await ProjectMember.insertMany([
    { projectId: platform._id, userId: users.linus._id, role: "MEMBER" },
    { projectId: vault._id, userId: users.margaret._id, role: "PROJECT_MANAGER" },
  ]);
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

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

test("a new workspace is created with the three required channels", async () => {
  const res = await api("GET", `${ws(state.workspaceId)}/channels`, { token: tokens.ada });
  assert.equal(res.status, 200);

  const names = res.json.channels.map((c) => c.name);
  assert.ok(names.includes("general"), "missing #general");
  assert.ok(names.includes("announcements"), "missing #announcements");
  assert.ok(names.includes("project-help"), "missing #project-help");

  // Every channel must be addressable by id and carry a slug, since the socket
  // room and the UI both key off those.
  for (const channel of res.json.channels) {
    assert.ok(channel.id, "a channel has no id");
    assert.equal(channel.slug, channel.name);
  }
});

test("a channel message reaches workspace members watching that channel", async () => {
  const watcher = await signedIn("alan");
  const general = state.channels.general;
  watcher.emit("channel:join", { workspaceId: state.workspaceId, channelId: general });
  await until(() => serverHasRoom(`channel:${general}`, watcher.id), { label: "the channel room" });

  const got = watch(watcher, "message:channel");
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: general, content: "Channel hello" },
  });
  assert.equal(res.status, 201);

  await until(() => got.length > 0, { label: "the channel message" });
  assert.equal(got[0].content, "Channel hello");
  assert.equal(got[0].kind, "CHANNEL");
  // The sender is the authenticated user, whatever the body claims.
  assert.equal(got[0].userId, state.linusId);
});

test("a channel message is stored and read back with the same shape", async () => {
  const general = state.channels.general;
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: general, content: "Persisted channel message" },
  });
  assert.equal(res.status, 201);

  const list = await api("GET", `${ws(state.workspaceId)}/messages?channelId=${general}`, {
    token: tokens.linus,
  });
  assert.equal(list.status, 200);

  const found = list.json.messages.find((m) => m.content === "Persisted channel message");
  assert.ok(found, "the message was not persisted");
  // Deduplication in the UI keys on this, so the socket frame and the REST body
  // must agree on identity as well as content.
  assert.equal(found.id, res.json.message.id);
  assert.equal(found.kind, "CHANNEL");
  assert.equal(found.channelId, general);
  assert.equal(found.userId, state.linusId);
  assert.ok(found.author && found.author.name, "the message must carry its author");
});

test("a channel is addressable by slug as well as by id", async () => {
  const res = await api("GET", `${ws(state.workspaceId)}/messages?channelId=general`, {
    token: tokens.alan,
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.messages));
});

test("a non-member cannot read a workspace's channels", async () => {
  const res = await api("GET", `${ws(state.workspaceId)}/channels`, { token: tokens.outsider });
  assert.equal(res.status, 403);
});

test("a non-member cannot post to a workspace's channels", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.outsider,
    body: { channelId: state.channels.general, content: "Should not exist" },
  });
  assert.equal(res.status, 403);
});

test("a non-member cannot join a channel room", async () => {
  const socket = await signedIn("outsider");
  const joined = watch(socket, "channel:joined");
  const denied = watch(socket, "channel:denied");

  socket.emit("channel:join", { workspaceId: state.workspaceId, channelId: state.channels.general });
  await until(() => denied.length > 0, { label: "the refusal" });

  assert.equal(joined.length, 0, "a non-member joined a channel room");
  assert.equal(await serverHasRoom(`channel:${state.channels.general}`, socket.id), false);
});

test("a user cannot join a channel of a workspace they do not belong to by lying about the workspace", async () => {
  const socket = await signedIn("outsider");
  const denied = watch(socket, "channel:denied");

  // Acme's real channel id, but claimed to live in the stranger's workspace.
  socket.emit("channel:join", {
    workspaceId: state.otherWorkspaceId,
    channelId: state.channels.general,
  });
  await until(() => denied.length > 0, { label: "the refusal" });
  assert.equal(await serverHasRoom(`channel:${state.channels.general}`, socket.id), false);
});

test("a channel message is not delivered to a room the sender did not join for", async () => {
  // Two channels, one watcher. Proves delivery is room-scoped and not simply
  // "everyone in the workspace".
  const announcements = state.channels.announcements;
  const help = state.channels["project-help"];

  const watcher = await signedIn("alan");
  watcher.emit("channel:join", { workspaceId: state.workspaceId, channelId: announcements });
  await until(() => serverHasRoom(`channel:${announcements}`, watcher.id), { label: "announcements" });

  const got = watch(watcher, "message:channel");
  await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: help, content: "Only for project-help" },
  });

  await settle(400);
  assert.equal(got.length, 0, "a message reached a room the user was not in");
});

test("channels cannot be created with a duplicate name", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/channels`, {
    token: tokens.ada,
    body: { name: "general" },
  });
  assert.equal(res.status, 409);
});

test("a new channel gets a slug", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/channels`, {
    token: tokens.ada,
    body: { name: "Release Train" },
  });
  assert.equal(res.status, 201);
  const created = res.json.channels.find((c) => c.name === "Release Train");
  assert.ok(created, "the channel was not created");
  assert.equal(created.slug, "release-train");
});

// ---------------------------------------------------------------------------
// Project discussion
// ---------------------------------------------------------------------------

test("a project member can read and post in the discussion", async () => {
  const res = await api("POST", `/api/projects/${state.platformId}/discussion`, {
    token: tokens.linus,
    body: { content: "Discussion hello" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.message.kind, "PROJECT");
  assert.equal(res.json.message.projectId, state.platformId);

  const list = await api("GET", `/api/projects/${state.platformId}/discussion`, {
    token: tokens.linus,
  });
  assert.equal(list.status, 200);
  assert.ok(list.json.messages.some((m) => m.content === "Discussion hello"));
});

test("a discussion message reaches project members watching the project", async () => {
  const watcher = await signedIn("linus");
  watcher.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await until(() => serverHasRoom(`project:${state.platformId}`, watcher.id), { label: "the project room" });

  const got = watch(watcher, "message:project");
  const res = await api("POST", `/api/projects/${state.platformId}/discussion`, {
    token: tokens.alan,
    body: { content: "Design decision: channels before DMs" },
  });
  assert.equal(res.status, 201);

  await until(() => got.length > 0, { label: "the discussion message" });
  assert.equal(got[0].content, "Design decision: channels before DMs");
  // The Phase 18 envelope adds projectId to every project event.
  assert.equal(got[0].projectId, state.platformId);
});

test("a discussion message does not leak to another project", async () => {
  // margaret manages Vault and shares no room with Platform here.
  const watcher = await signedIn("margaret");
  watcher.emit("project:join", { projectId: state.vaultId, workspaceId: state.workspaceId });
  await until(() => serverHasRoom(`project:${state.vaultId}`, watcher.id), { label: "the vault room" });

  const got = watch(watcher, "message:project");
  await api("POST", `/api/projects/${state.platformId}/discussion`, {
    token: tokens.alan,
    body: { content: "Platform only" },
  });

  await settle(400);
  assert.equal(got.length, 0, "a discussion message reached another project's room");
});

test("a workspace member with no role on the project cannot read the discussion", async () => {
  // ada owns the workspace (so she has administrative access) — margaret is
  // the honest case: a plain Member of the workspace, not of the project.
  const res = await api("GET", `/api/projects/${state.vaultId}/discussion`, {
    token: tokens.linus,
  });
  assert.equal(res.status, 403, "a workspace member read a project discussion without project access");
});

test("a workspace member with no role on the project cannot post in the discussion", async () => {
  const res = await api("POST", `/api/projects/${state.vaultId}/discussion`, {
    token: tokens.linus,
    body: { content: "Should not exist" },
  });
  assert.equal(res.status, 403);
});

test("a discussion message is not created when access is refused", async () => {
  const before = await Message.countDocuments({ projectId: state.vaultId, content: "Should not exist" });
  await api("POST", `/api/projects/${state.vaultId}/discussion`, {
    token: tokens.linus,
    body: { content: "Should not exist" },
  });
  const after = await Message.countDocuments({ projectId: state.vaultId, content: "Should not exist" });
  assert.equal(after, before, "a refused post still wrote a message");
});

test("a non-member cannot join a project room to hear the discussion", async () => {
  const socket = await signedIn("outsider");
  const denied = watch(socket, "project:denied");
  const got = watch(socket, "message:project");

  socket.emit("project:join", { projectId: state.platformId, workspaceId: state.workspaceId });
  await until(() => denied.length > 0, { label: "the refusal" });

  await api("POST", `/api/projects/${state.platformId}/discussion`, {
    token: tokens.alan,
    body: { content: "After the refusal" },
  });

  await settle(400);
  assert.equal(got.length, 0, "a refused socket still received a discussion message");
});

// ---------------------------------------------------------------------------
// Direct messages — who may be contacted
// ---------------------------------------------------------------------------

test("a direct message is delivered to both participants and to nobody else", async () => {
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
  assert.equal(res.json.message.kind, "DIRECT");
  assert.equal(res.json.message.recipientId, state.margaretId);
  assert.equal(res.json.message.userId, state.linusId);

  await until(() => gotPartner.length > 0, { label: "the recipient" });
  await until(() => gotSender.length > 0, { label: "the sender's other tabs" });
  assert.equal(gotBystander.length, 0, "a workspace member received a direct message");
});

test("a direct message reaches the recipient even when they are not in the sender's workspace channels", async () => {
  // Delivery is via the recipient's private user room, which exists from the
  // moment they authenticate — it does not depend on any channel subscription.
  const partner = await signedIn("margaret");
  const got = watch(partner, "message:direct");

  const res = await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: "Ping without a channel" },
  });
  assert.equal(res.status, 201);

  await until(() => got.length > 0, { label: "the direct message" });
  assert.equal(got[0].content, "Ping without a channel");
});

test("a user cannot send a direct message to somebody in no shared workspace", async () => {
  const res = await api("POST", `/api/messages/direct/${state.strangerId}`, {
    token: tokens.linus,
    body: { content: "Should not exist" },
  });
  assert.equal(res.status, 403, "a direct message crossed a workspace boundary");
});

test("a user cannot read a direct-message thread with somebody outside their workspace", async () => {
  const res = await api("GET", `/api/messages/direct/${state.strangerId}`, { token: tokens.linus });
  assert.equal(res.status, 403);
});

test("the old crafted dm:<a>_<b> channel no longer reaches anybody", async () => {
  // The pre-Phase 19 convention let a sender name any user in the system as
  // the other participant. The workspace channel route must no longer treat
  // such a value as a direct-message thread.
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: `dm:${state.linusId}_${state.strangerId}`, content: "Crafted" },
  });
  assert.equal(res.status, 404, "a crafted dm: channel was accepted as a thread");

  const stored = await Message.findOne({ content: "Crafted" });
  assert.equal(stored, null, "a crafted dm: channel still wrote a message");
});

test("a direct message cannot name an extra recipient", async () => {
  // The recipient is the path parameter and the authenticated sender, and
  // nothing else. A body that tries to add a third party must be ignored, not
  // obeyed.
  const bystander = await signedIn("alan");
  const gotBystander = watch(bystander, "message:direct");

  const res = await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: {
      content: "Only Margaret",
      recipientId: state.alanId,
      userId: state.alanId,
      recipientIds: [state.alanId, state.margaretId],
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.message.recipientId, state.margaretId);
  assert.equal(res.json.message.userId, state.linusId);

  await settle(400);
  assert.equal(gotBystander.length, 0, "a body-supplied recipient was honoured");
});

test("a user cannot send a direct message to themselves", async () => {
  const res = await api("POST", `/api/messages/direct/${state.linusId}`, {
    token: tokens.linus,
    body: { content: "Talking to myself" },
  });
  assert.equal(res.status, 400);
});

test("a direct message to a non-existent user is refused", async () => {
  const res = await api("POST", "/api/messages/direct/64b7f0000000000000000000", {
    token: tokens.linus,
    body: { content: "Hello?" },
  });
  assert.equal(res.status, 404);
});

test("a direct message requires authentication", async () => {
  const res = await api("GET", `/api/messages/direct/${state.margaretId}`);
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// The rule that matters most: messaging grants nothing
// ---------------------------------------------------------------------------

test("a direct message does not grant access to the recipient's private project", async () => {
  // margaret manages Vault. linus shares a workspace with her — so he can DM
  // her — but he has no role on Vault. Messaging her must not become a way in.
  const dm = await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: "Can I see the vault project?" },
  });
  assert.equal(dm.status, 201, "the DM itself should be allowed");

  const project = await api("GET", `/api/projects/${state.vaultId}`, { token: tokens.linus });
  assert.equal(project.status, 403, "a direct message granted project access");

  const discussion = await api("GET", `/api/projects/${state.vaultId}/discussion`, {
    token: tokens.linus,
  });
  assert.equal(discussion.status, 403, "a direct message granted discussion access");

  const before = await ProjectMember.countDocuments({ projectId: state.vaultId, userId: state.linusId });
  assert.equal(before, 0, "messaging somebody created a project membership");
});

test("a direct message does not grant the sender access to the recipient's workspace channels", async () => {
  // linus and margaret share Acme, so both can already see it; the assertion
  // that matters is that nothing about the DM record itself is consulted. The
  // outsider case covers the isolation.
  await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: "Channel access is unchanged" },
  });

  const res = await api("GET", `${ws(state.workspaceId)}/channels`, { token: tokens.outsider });
  assert.equal(res.status, 403, "a DM in the system changed somebody's channel access");
});

test("a conversation is only visible to its two participants", async () => {
  await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: "Inbox check" },
  });

  const mine = await api("GET", "/api/messages/conversations", { token: tokens.linus });
  assert.equal(mine.status, 200);
  assert.ok(
    mine.json.conversations.some((c) => c.partner.id === state.margaretId),
    "the sender's inbox is missing the thread"
  );

  const theirs = await api("GET", "/api/messages/conversations", { token: tokens.margaret });
  assert.ok(
    theirs.json.conversations.some((c) => c.partner.id === state.linusId),
    "the recipient's inbox is missing the thread"
  );

  const bystander = await api("GET", "/api/messages/conversations", { token: tokens.alan });
  assert.ok(
    !bystander.json.conversations.some((c) => c.partner.id === state.linusId || c.partner.id === state.margaretId),
    "a third party saw somebody else's conversation"
  );
});

test("a conversation list is built from membership, not from messages", async () => {
  // Fabricate a Conversation + member row for a user who should not be able to
  // see anything, and confirm the list still only ever returns the caller's own
  // threads. This asserts the query is driven by ConversationMember.
  const rogue = await Conversation.create({
    directKey: Conversation.directKeyFor(state.outsiderId, state.strangerId),
    isGroup: false,
  });
  await ConversationMember.insertMany([
    { conversationId: rogue._id, userId: state.outsiderId },
    { conversationId: rogue._id, userId: state.strangerId },
  ]);

  const alan = await api("GET", "/api/messages/conversations", { token: tokens.alan });
  assert.ok(
    !alan.json.conversations.some((c) => c.conversationId === String(rogue._id)),
    "a conversation leaked into somebody else's inbox"
  );
});

test("marking a thread read only affects messages the caller is the recipient of", async () => {
  // A fresh pair (ada ↔ alan) so no earlier case has moved the read state.
  await api("POST", `/api/messages/direct/${state.alanId}`, {
    token: tokens.ada,
    body: { content: "From ada" },
  });
  await api("POST", `/api/messages/direct/${state.adaId}`, {
    token: tokens.alan,
    body: { content: "From alan" },
  });

  const before = await api("GET", "/api/messages/conversations", { token: tokens.alan });
  const thread = before.json.conversations.find((c) => c.partner.id === state.adaId);
  assert.equal(thread.unreadCount, 1, "alan should have exactly one unread message");

  const res = await api("PATCH", `/api/messages/direct/${state.adaId}/read`, { token: tokens.alan });
  assert.equal(res.status, 200);

  const after = await api("GET", "/api/messages/conversations", { token: tokens.alan });
  const cleared = after.json.conversations.find((c) => c.partner.id === state.adaId);
  assert.equal(cleared.unreadCount, 0, "the thread was not cleared");

  const view = await api("GET", `/api/messages/direct/${state.adaId}`, { token: tokens.alan });

  // The message alan received is now read...
  const received = view.json.messages.filter((m) => m.userId === state.adaId);
  assert.equal(received.length, 1);
  assert.ok(received[0].readAt !== null, "a received message was left unread");

  // ...but the message alan sent, which is ada's to read, is untouched. This is
  // the direction that matters: marking a thread read must not let the reader
  // mark somebody else's message as read, or hand out a read receipt for a
  // message that has not been read.
  const sent = view.json.messages.filter((m) => m.userId === state.alanId);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].readAt, null, "a sender's message was marked read by the wrong person");

  // And the sender cannot clear the recipient's unread state. Alan's mark-read
  // above must leave ada's copy of his own message unread.
  const adaInbox = await api("GET", "/api/messages/conversations", { token: tokens.ada });
  const adaThread = adaInbox.json.conversations.find((c) => c.partner.id === state.alanId);
  assert.equal(adaThread.unreadCount, 1, "the sender cleared the recipient's unread message");

  // When ada does read it, it clears — in that direction only.
  await api("PATCH", `/api/messages/direct/${state.alanId}/read`, { token: tokens.ada });
  const adaCleared = await api("GET", "/api/messages/conversations", { token: tokens.ada });
  assert.equal(
    adaCleared.json.conversations.find((c) => c.partner.id === state.alanId).unreadCount,
    0,
    "the recipient could not clear their own unread message"
  );
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("message content must be text", async () => {
  for (const content of [123, { text: "hi" }, ["hi"], true]) {
    const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
      token: tokens.linus,
      body: { channelId: state.channels.general, content },
    });
    assert.equal(res.status, 400, `accepted non-text content: ${JSON.stringify(content)}`);
  }
});

test("an empty or whitespace-only message is refused", async () => {
  for (const content of ["", "   ", "\n\t "]) {
    const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
      token: tokens.linus,
      body: { channelId: state.channels.general, content },
    });
    assert.equal(res.status, 400, `accepted empty content: ${JSON.stringify(content)}`);
  }
});

test("a message longer than the limit is refused", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: state.channels.general, content: "x".repeat(Message.MAX_CONTENT_LENGTH + 1) },
  });
  assert.equal(res.status, 400);
});

test("a message at exactly the limit is accepted and stored trimmed", async () => {
  const content = `  ${"x".repeat(Message.MAX_CONTENT_LENGTH - 4)}  `;
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: state.channels.general, content },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.message.content, "x".repeat(Message.MAX_CONTENT_LENGTH - 4));
});

test("validation applies to every kind of message", async () => {
  const channel = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: state.channels.general, content: "  " },
  });
  assert.equal(channel.status, 400);

  const project = await api("POST", `/api/projects/${state.platformId}/discussion`, {
    token: tokens.alan,
    body: { content: "" },
  });
  assert.equal(project.status, 400);

  const direct = await api("POST", `/api/messages/direct/${state.margaretId}`, {
    token: tokens.linus,
    body: { content: { nope: true } },
  });
  assert.equal(direct.status, 400);
});

test("a missing channel is refused", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { content: "No channel" },
  });
  assert.equal(res.status, 400);
});

test("a message for an unknown channel is refused", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: "64b7f0000000000000000000", content: "Nowhere" },
  });
  assert.equal(res.status, 404);
});

test("message content is stored as plain text, not interpreted", async () => {
  const res = await api("POST", `${ws(state.workspaceId)}/messages`, {
    token: tokens.linus,
    body: { channelId: state.channels.general, content: "<script>alert(1)</script>" },
  });
  assert.equal(res.status, 201);
  // Stored verbatim. The guarantee is that the API does not interpret it and
  // the frontend renders text nodes only — not that the API mangles input.
  assert.equal(res.json.message.content, "<script>alert(1)</script>");
});

// ---------------------------------------------------------------------------
// One thread per pair
// ---------------------------------------------------------------------------

test("two concurrent first messages to the same person share one thread", async () => {
  await Promise.all([
    api("POST", `/api/messages/direct/${state.margaretId}`, {
      token: tokens.linus,
      body: { content: "First" },
    }),
    api("POST", `/api/messages/direct/${state.margaretId}`, {
      token: tokens.linus,
      body: { content: "Second" },
    }),
  ]);

  const list = await api("GET", `/api/messages/direct/${state.margaretId}`, { token: tokens.linus });
  assert.equal(list.status, 200);

  const threads = await Conversation.find({ directKey: Conversation.directKeyFor(state.linusId, state.margaretId) });
  assert.equal(threads.length, 1, `expected one thread, found ${threads.length}`);

  const members = await ConversationMember.find({ conversationId: threads[0]._id });
  assert.equal(members.length, 2, "a thread should have exactly two members");
});

test("the thread key does not depend on who opens it", async () => {
  // The same pair, addressed the other way round, must resolve to the same
  // conversation rather than creating a mirror thread.
  const fromLinus = await api("GET", `/api/messages/direct/${state.margaretId}`, { token: tokens.linus });
  const fromMargaret = await api("GET", `/api/messages/direct/${state.linusId}`, { token: tokens.margaret });
  assert.equal(fromLinus.json.conversationId, fromMargaret.json.conversationId);
});

// ---------------------------------------------------------------------------
// Channel-scoped routes (spec §9)
//
// The frontend uses the workspace-scoped form, but the spec also names
// `/api/channels/:channelId/messages`. These routes carry no workspace at all,
// which is the stronger shape: there is no workspace value in the request that
// could be pointed at the wrong workspace.
// ---------------------------------------------------------------------------

test("channel-scoped routes work without a workspace in the request", async () => {
  const general = state.channels.general;

  const sent = await api("POST", `/api/channels/${general}/messages`, {
    token: tokens.ada,
    body: { content: "Sent through the channel-scoped route" },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.message.kind, "CHANNEL");
  assert.equal(sent.json.message.channelId, general);

  const list = await api("GET", `/api/channels/${general}/messages`, { token: tokens.alan });
  assert.equal(list.status, 200);
  assert.ok(
    list.json.messages.some((m) => m.id === sent.json.message.id),
    "the message written via the channel route should be readable from it"
  );
});

test("the two channel route shapes agree on authorization", async () => {
  // `outsider` is a real user in the database but in no workspace. The
  // workspace-scoped route and the channel-scoped route must both refuse, and
  // must not disagree about it.
  const general = state.channels.general;
  const scoped = await api("GET", `/api/channels/${general}/messages`, { token: tokens.outsider });
  const legacy = await api("GET", `/api/workspaces/${state.workspaceId}/messages?channelId=${general}`, {
    token: tokens.outsider,
  });

  assert.equal(scoped.status, 403, "channel-scoped route should refuse a non-member");
  assert.equal(legacy.status, 403, "workspace-scoped route should refuse a non-member");
  assert.equal(scoped.status, legacy.status, "both shapes must refuse identically");
});

test("the channel-scoped route handles unknown and malformed channels", async () => {
  const unknown = new mongoose.Types.ObjectId();
  const member = await api("GET", `/api/channels/${unknown}/messages`, { token: tokens.ada });
  const malformed = await api("GET", "/api/channels/not-an-id/messages", { token: tokens.ada });
  const outsiderOnReal = await api("GET", `/api/channels/${state.channels.general}/messages`, {
    token: tokens.outsider,
  });

  assert.equal(member.status, 404, "a well-formed but unknown channel is a 404");
  assert.equal(malformed.status, 404, "a malformed id is a 404, not a 500");
  // The one case that must never be readable: a real channel, read by someone
  // outside the workspace.
  assert.equal(outsiderOnReal.status, 403, "a real channel is not readable by a non-member");

  // Known caveat, stated rather than papered over: because the workspace is
  // derived *from* the channel, an unknown id necessarily 404s before any
  // membership check can run, so 403-vs-404 distinguishes "channel exists" from
  // "no such channel" for an outsider. That is a far weaker oracle than leaking
  // messages — it confirms an id is in use, nothing more — and channel ids are
  // unguessable ObjectIds, not sequential. The alternative (403 for everything
  // unknown) would make the frontend unable to distinguish a deleted channel
  // from a forbidden one.
});

test("the channel-scoped route ignores an attempt to name another workspace", async () => {
  // The body carries a workspaceId belonging to a workspace the sender cannot
  // post in. It must be inert: the message lands in the channel's real
  // workspace, not the one the body claims.
  const sent = await api("POST", `/api/channels/${state.channels.general}/messages`, {
    token: tokens.ada,
    body: { content: "workspaceId in the body is ignored", workspaceId: state.otherWorkspaceId },
  });
  assert.equal(sent.status, 201);

  const stored = await Message.findById(sent.json.message.id);
  assert.equal(stored.kind, "CHANNEL");
  assert.equal(String(stored.channelId), state.channels.general);
  assert.equal(
    await Workspace.findById(state.otherWorkspaceId).then((w) => w.channels.some((c) => String(c._id) === String(stored.channelId))),
    false,
    "the message must not have been filed under the body-supplied workspace"
  );
});

// ---------------------------------------------------------------------------
// Reconnection (spec §33)
// ---------------------------------------------------------------------------

test("a reconnecting client resynchronises from REST, and misses nothing", async () => {
  // Phase 19 deliberately has no event replay. A client that was disconnected
  // cannot learn about messages it missed from the socket, so it must be able
  // to close the gap with an ordinary REST read. This is the whole reason the
  // database is the source of truth.
  const general = state.channels.general;
  const alan = await signedIn("alan");
  const join = await joinChannel(alan, { workspaceId: state.workspaceId, channelId: general });
  assert.equal(join.joined, true, "the join should have been allowed");
  await until(async () => serverHasRoom(`channel:${general}`, alan.id), { label: "alan joins #general" });
  const live = watch(alan, "message:channel");

  const beforeMiss = await api("POST", `/api/workspaces/${state.workspaceId}/messages`, {
    token: tokens.ada,
    body: { channelId: general, content: "before the disconnect" },
  });
  assert.equal(beforeMiss.status, 201);
  await until(async () => live.some((m) => m.id === beforeMiss.json.message.id), {
    label: "the pre-disconnect message arrives live",
  });

  // Drop the socket without letting the client auto-reconnect.
  alan.disconnect();
  await until(async () => (await serverHasRoom(`channel:${general}`, alan.id)) === false, {
    label: "alan leaves the channel room",
  });

  // Sent while nobody is listening.
  const duringMiss = await api("POST", `/api/workspaces/${state.workspaceId}/messages`, {
    token: tokens.ada,
    body: { channelId: general, content: "sent while alan was offline" },
  });
  assert.equal(duringMiss.status, 201);

  // Reconnect, exactly as the browser would, and resync over REST.
  const reconnected = await signedIn("alan");
  const resync = await api("GET", `/api/workspaces/${state.workspaceId}/messages?channelId=${general}`, { token: tokens.alan });
  assert.equal(resync.status, 200);

  const ids = resync.json.messages.map((m) => m.id);
  assert.ok(ids.includes(beforeMiss.json.message.id), "resync should include the earlier message");
  assert.ok(
    ids.includes(duringMiss.json.message.id),
    "resync should include the message sent during the outage"
  );

  // And the room is usable again, so subsequent messages arrive live.
  await new Promise((resolve) =>
    reconnected.emit("channel:join", { workspaceId: state.workspaceId, channelId: general }, resolve)
  );
  await until(async () => serverHasRoom(`channel:${general}`, reconnected.id), { label: "rejoin after reconnect" });
});

// ---------------------------------------------------------------------------
// Duplicate delivery (spec §34)
// ---------------------------------------------------------------------------

test("one send produces one event, and REST and the socket agree on the id", async () => {
  // The frontend receives the same message twice by design: once as the REST
  // response to its own POST, once as the socket event. De-duplicating by id
  // is only sound if the two really are the same id and the event is emitted
  // exactly once — both of which this pins down.
  const general = state.channels.general;
  const linus = await signedIn("linus");
  const join = await joinChannel(linus, { workspaceId: state.workspaceId, channelId: general });
  assert.equal(join.joined, true, "the join should have been allowed");
  await until(async () => serverHasRoom(`channel:${general}`, linus.id), { label: "linus joins #general" });

  const seen = watch(linus, "message:channel");
  const sent = await api("POST", `/api/workspaces/${state.workspaceId}/messages`, {
    token: tokens.linus,
    body: { channelId: general, content: "exactly once please" },
  });
  assert.equal(sent.status, 201);
  await settle();

  const mine = seen.filter((m) => m.id === sent.json.message.id);
  assert.equal(mine.length, 1, `the sender should receive exactly one copy, got ${mine.length}`);
  assert.equal(seen.length, 1, `no other channel event should have been emitted, got ${seen.length}`);
  assert.deepEqual(
    mine[0],
    sent.json.message,
    "the socket payload and the REST payload must be identical, or id-based dedup is unsound"
  );
});

test("a failed write emits nothing", async () => {
  // Spec §10: never emit a success event before the database succeeds. A client
  // must never be made to believe a message exists that was not stored.
  const general = state.channels.general;
  const linus = await signedIn("linus");
  const join = await joinChannel(linus, { workspaceId: state.workspaceId, channelId: general });
  assert.equal(join.joined, true, "the join should have been allowed");
  await until(async () => serverHasRoom(`channel:${general}`, linus.id), { label: "linus rejoins #general" });

  const seen = watch(linus, "message:channel");
  const rejected = await api("POST", `/api/workspaces/${state.workspaceId}/messages`, {
    token: tokens.linus,
    body: { channelId: general, content: "   " },
  });
  assert.equal(rejected.status, 400);
  await settle();
  assert.equal(seen.length, 0, "a rejected message must not be broadcast");
});
