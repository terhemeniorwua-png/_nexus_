"use strict";

// Manual two-user smoke test. Not part of `npm test` — it drives a real
// running server with two real logged-in users and prints what each one sees.
//
//   MONGO_URI=... JWT_SECRET=... CLIENT_URL=http://localhost:3000 \
//     node scripts/smoke-messaging.js [baseUrl]

const { io } = require("socket.io-client");

const BASE = process.argv[2] || "http://127.0.0.1:5000";
const PASSWORD = "Password123!";

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Cookie = `nexus_token=${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json };
}

const login = async (email) => {
  const res = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status} ${res.text}`);
  return res.json.token;
};

const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};

async function main() {
  const ada = await login("ada@example.com").catch(() => null);
  if (!ada) {
    console.error("Could not log in. Is the server running with the seeded database?");
    process.exit(1);
  }
  const alan = await login("alan@example.com");
  const margaret = await login("margaret@example.com");
  // A plain workspace MEMBER — unlike alan (a workspace Admin), he has no
  // automatic access to every project, which is what makes him the right user
  // for the isolation check in step 4.
  const linus = await login("linus@example.com");

  // A brand-new account in no workspace at all. Every seeded user shares the
  // one workspace, so without this there is no way to check the boundary from
  // the outside against a real server.
  const outsiderEmail = `smoke-outsider-${Date.now()}@example.com`;
  const registered = await api("POST", "/api/auth/register", {
    body: {
      name: "Smoke Outsider",
      email: outsiderEmail,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
  if (registered.status !== 201 && registered.status !== 200) {
    throw new Error(`register outsider: ${registered.status} ${JSON.stringify(registered.json)}`);
  }
  const outsider = await login(outsiderEmail);

  const workspaces = await api("GET", "/api/workspaces", { token: ada });
  const workspaceId = workspaces.json.workspaces[0].id;
  const workspace = await api("GET", `/api/workspaces/${workspaceId}`, { token: ada });
  log(`workspace: ${workspaceId}  channels: ${workspace.json.workspace.channels.map((c) => c.name).join(", ")}`);

  const general = workspace.json.workspace.channels.find((c) => c.name === "general");
  const help = workspace.json.workspace.channels.find((c) => c.name === "project-help");

  const projects = await api("GET", "/api/projects", { token: ada });
  const allProjects = projects.json.projects || [];
  // A project alan is a member of, and one he is not — found by role rather
  // than by name so the script does not depend on seed naming.
  const linusProjects = await api("GET", "/api/projects", { token: linus });
  const linusIds = new Set((linusProjects.json.projects || []).map((p) => p.id));
  const platform = allProjects.find((p) => linusIds.has(p.id)) || allProjects[0];
  const privateProject = allProjects.find((p) => !linusIds.has(p.id));
  log(`projects visible to ada: ${allProjects.length}; plain member linus can see ${linusIds.size}`);

  // --- sockets for three different users -----------------------------------
  const sockets = {};
  const seen = {};
  for (const [name, token] of [
    ["ada", ada],
    ["alan", alan],
    ["margaret", margaret],
  ]) {
    sockets[name] = io(BASE, {
      auth: { token: `Bearer ${token}` },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    seen[name] = { channel: [], project: [], direct: [] };
    await new Promise((resolve, reject) => {
      sockets[name].once("connect", resolve);
      sockets[name].once("connect_error", reject);
    });
    sockets[name].on("message:channel", (m) => seen[name].channel.push(m));
    sockets[name].on("message:project", (m) => seen[name].project.push(m));
    sockets[name].on("message:direct", (m) => seen[name].direct.push(m));
  }
  log("\nthree users connected over real sockets\n");

  const join = async (socket, payload) => {
    socket.emit("channel:join", payload);
    await new Promise((r) => setTimeout(r, 200));
  };

  // --- 1. channel messages ---------------------------------------------------
  log("1. CHANNEL — ada and alan in #general, margaret in #project-help");
  await join(sockets.alan, { workspaceId, channelId: general._id });
  await join(sockets.margaret, { workspaceId, channelId: help._id });
  await join(sockets.ada, { workspaceId, channelId: general._id });

  await api("POST", `/api/workspaces/${workspaceId}/messages`, {
    token: ada,
    body: { channelId: general._id, content: "Live channel smoke test" },
  });
  await waitFor(() => seen.alan.channel.length > 0);

  log(`   alan (#general)      received: ${seen.alan.channel.length}`);
  log(`   ada  (#general)      received: ${seen.ada.channel.length}`);
  log(`   margaret (#help)     received: ${seen.margaret.channel.length}  <- must be 0`);

  // The channel-scoped route (spec §9) carries no workspace at all, so the
  // server has to derive it. Check it both works and refuses an outsider.
  const scoped = await api("POST", `/api/channels/${general._id}/messages`, {
    token: ada,
    body: { content: "via the channel-scoped route" },
  });
  const scopedBack = await api("GET", `/api/channels/${general._id}/messages`, { token: alan });
  const scopedOutsider = await api("GET", `/api/channels/${general._id}/messages`, { token: outsider });
  log(`   channel-scoped POST ${scoped.status}, GET ${scopedBack.status}, non-member GET ${scopedOutsider.status}  <- must be 201, 200, 403`);

  // --- 2. project discussion ------------------------------------------------
  log("\n2. PROJECT DISCUSSION — Platform");
  sockets.linus = io(BASE, {
    auth: { token: `Bearer ${linus}` },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  seen.linus = { channel: [], project: [], direct: [] };
  await new Promise((resolve, reject) => {
    sockets.linus.once("connect", resolve);
    sockets.linus.once("connect_error", reject);
  });
  sockets.linus.on("message:project", (m) => seen.linus.project.push(m));

  sockets.linus.emit("project:join", { projectId: platform.id, workspaceId });
  await new Promise((r) => setTimeout(r, 200));
  seen.linus.project.length = 0;
  seen.margaret.project.length = 0;

  // Post as linus, who is a project MEMBER. Note the role matters: the
  // discussion reuses the same `comment` permission as task comments, so a
  // Collaborator or Viewer can read the discussion but cannot post to it —
  // exactly as they cannot comment on a task.
  const posted = await api("POST", `/api/projects/${platform.id}/discussion`, {
    token: linus,
    body: { content: "Live project discussion smoke test" },
  });
  await waitFor(() => seen.linus.project.length > 0);
  log(`   linus POST             status: ${posted.status}`);

  // ada's role on this project varies by seed, so derive the expectation from
  // the role the API reports rather than assuming one. The rule being checked
  // is the shared one: `comment` governs posting, and a role without it (a
  // Collaborator or Viewer) is refused exactly as it would be on a task.
  const asAda = await api("GET", `/api/projects/${platform.id}`, { token: ada });
  const adaRole = asAda.json?.project?.role;
  const canComment = ["WORKSPACE_OWNER", "ADMIN", "PROJECT_MANAGER", "MEMBER"].includes(adaRole);
  const adaPost = await api("POST", `/api/projects/${platform.id}/discussion`, {
    token: ada,
    body: { content: "Role check" },
  });
  const expected = canComment ? 201 : 403;
  log(`   ada role=${adaRole} POST: ${adaPost.status}  <- expected ${expected}`);

  log(`   linus (project member)  received: ${seen.linus.project.length}`);
  log(`   margaret (not a member) received: ${seen.margaret.project.length}  <- must be 0`);

  const forbidden = await api("POST", `/api/projects/${privateProject ? privateProject.id : platform.id}/discussion`, {
    token: linus,
    body: { content: "Should be refused" },
  });
  log(`   linus POST to a project he has no role on: ${forbidden.status}  <- must be 403`);

  // --- 3. direct messages ---------------------------------------------------
  log("\n3. DIRECT MESSAGE — ada -> margaret");
  seen.ada.direct.length = 0;
  seen.margaret.direct.length = 0;
  seen.alan.direct.length = 0;

  const dm = await api("POST", `/api/messages/direct/${workspace.json.members.find((m) => m.user.email === "margaret@example.com").user.id}`, {
    token: ada,
    body: { content: "Live DM smoke test" },
  });
  log(`   POST status: ${dm.status}`);
  await waitFor(() => seen.margaret.direct.length > 0);

  log(`   margaret (recipient) received: ${seen.margaret.direct.length}`);
  log(`   ada (sender, other tab) received: ${seen.ada.direct.length}`);
  log(`   alan (bystander)      received: ${seen.alan.direct.length}  <- must be 0`);

  const margaretId = workspace.json.members.find((m) => m.user.email === "margaret@example.com").user.id;
  const alanId = workspace.json.members.find((m) => m.user.email === "alan@example.com").user.id;

  const adaId = workspace.json.members.find((m) => m.user.email === "ada@example.com").user.id;
  const inbox = await api("GET", "/api/messages/conversations", { token: margaret });
  const thread = inbox.json.conversations.find((c) => c.partner.id === adaId);
  log(`   margaret's inbox: ${inbox.json.conversations.length} thread(s); unread on the ada thread: ${thread ? thread.unreadCount : "?"}`);

  const readIt = await api("PATCH", `/api/messages/direct/${adaId}/read`, { token: margaret });
  const afterRead = await api("GET", "/api/messages/conversations", { token: margaret });
  const cleared = afterRead.json.conversations.find((c) => c.partner.id === adaId);
  log(`   margaret marks it read: ${readIt.status}, unread now: ${cleared ? cleared.unreadCount : "?"}`);

  // --- 4. the critical rule -------------------------------------------------
  log("\n4. ISOLATION — messaging must not grant project access");
  if (privateProject) {
    log(`   target project: "${privateProject.name}" (linus has no role on it)`);
    const before = await api("GET", `/api/projects/${privateProject.id}`, { token: linus });
    log(`   linus GET it before DM: ${before.status}  <- must be 403`);

    const dm = await api("POST", `/api/messages/direct/${privateProject.managerId}`, {
      token: linus,
      body: { content: "Can I see your project?" },
    });
    log(`   linus DMs its manager:   ${dm.status} (the message itself is allowed)`);

    const after = await api("GET", `/api/projects/${privateProject.id}`, { token: linus });
    log(`   linus GET it after DM:  ${after.status}  <- must still be 403`);

    const discussion = await api("GET", `/api/projects/${privateProject.id}/discussion`, {
      token: linus,
    });
    log(`   linus GET discussion:   ${discussion.status}  <- must still be 403`);
  } else {
    log("   (no private project available to test against)");
  }
  log(`   (margaretId for reference: ${margaretId})`);

  for (const s of Object.values(sockets)) s.close();
}

main().catch((err) => {
  console.error("smoke test failed:", err);
  process.exit(1);
});
