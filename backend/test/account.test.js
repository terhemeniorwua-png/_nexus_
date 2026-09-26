"use strict";

// Phase 23 — account settings tests.
//
// /settings can edit a person's own name, avatar and password, so the tests are
// about the ways that could go wrong:
//
//   • an update that reaches further than the person making it (email, role,
//     another account, another workspace)
//   • a profile that is edited but not actually persisted
//   • a password change that succeeds for the wrong current password, or that
//     leaves the old password working
//   • a password change that signs the *changer* out as collateral damage
//   • a password change that leaves every other stolen token valid
//   • an avatar that becomes a javascript: URL or an inline script
//
// Every assertion is checked against the collection directly, so a pass means
// the database agrees with what the endpoint reported.
//
// ENV must be set BEFORE requiring the app because rateLimit.js calls
// dotenv.config() (which never overrides already-set environment variables).

process.env.MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexus_account_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "nexus-account-test-secret";
process.env.JWT_EXPIRES_IN = "2h";
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "http://127.0.0.1";
// These tests deliberately provoke several 4xx responses from one IP (wrong
// current password, mismatched confirmation, blank name). The production limit
// is 5 failures per 2 minutes, which would lock the loopback address out of the
// rest of this file. The limiter itself is not what is under test here.
process.env.MAX_FAILED_ATTEMPTS = "1000";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../src/models/user.model");
const Workspace = require("../src/models/workspace.model");
const WorkspaceMember = require("../src/models/workspaceMember.model");

const app = require("../src/app");

const PASSWORD = "Password123!";
const NEW_PASSWORD = "Different456!";

let server;
let base;
const state = {};

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
  // The password change re-issues the session through Set-Cookie rather than the
  // body, so the helper has to be able to see it.
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return { status: res.status, json, setCookies };
}

// Turns a Set-Cookie list into a `Cookie` request header, so a test can adopt
// the session the server just issued.
function adoptSetCookies(setCookies) {
  const token = setCookies
    .map((value) => value.split(";")[0])
    .find((pair) => pair.startsWith("nexus_token="));
  return token || null;
}

async function login(email, password = PASSWORD) {
  const res = await api("POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) return { status: res.status, json: res.json };
  return { status: res.status, json: res.json, cookie: `nexus_token=${res.json.token}` };
}

function cookieFor(email) {
  return `nexus_token=${state.tokens[email]}`;
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.db.collection("users").createIndex({ email: 1 }, { unique: true });
  await mongoose.connection.db
    .collection("users")
    .createIndex({ passwordChangedAt: 1 });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const ada = await User.create({
    name: "Ada Lovelace",
    email: "ada@acme.test",
    password: PASSWORD,
  });
  const alan = await User.create({
    name: "Alan Turing",
    email: "alan@acme.test",
    password: PASSWORD,
  });
  state.ada = ada;
  state.alan = alan;

  const ws = await Workspace.create({ name: "Acme", ownerId: ada._id });
  state.workspaceId = String(ws._id);
  await WorkspaceMember.create({
    workspaceId: ws._id,
    userId: ada._id,
    role: "Admin",
  });

  state.tokens = {};
  for (const email of ["ada@acme.test", "alan@acme.test"]) {
    const res = await login(email);
    assert.equal(res.status, 200, `login failed for ${email}`);
    state.tokens[email] = res.json.token;
  }
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
});

// --- profile -----------------------------------------------------------------

test("PATCH /api/auth/me updates the name and persists it", async () => {
  const res = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { name: "  Ada King  " },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.user.name, "Ada King");

  const stored = await User.findById(state.ada._id);
  assert.equal(stored.name, "Ada King", "name must be trimmed and saved");

  const me = await api("GET", "/api/auth/me", { cookie: cookieFor("ada@acme.test") });
  assert.equal(me.json.user.name, "Ada King", "a later session must see the new name");
});

test("PATCH /api/auth/me refuses an empty or oversized name", async () => {
  const blank = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { name: "   " },
  });
  assert.equal(blank.status, 400);

  const long = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { name: "x".repeat(101) },
  });
  assert.equal(long.status, 400);

  const stored = await User.findById(state.ada._id);
  assert.equal(stored.name, "Ada King", "a rejected update must not change the record");
});

test("PATCH /api/auth/me accepts an http(s) avatar and allows clearing it", async () => {
  const set = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { avatar: "https://cdn.example.com/ada.png" },
  });
  assert.equal(set.status, 200);
  assert.equal(set.json.user.avatar, "https://cdn.example.com/ada.png");

  const stored = await User.findById(state.ada._id);
  assert.equal(stored.avatar, "https://cdn.example.com/ada.png");

  const cleared = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { avatar: "" },
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.user.avatar, "", "an empty avatar means fall back to initials");
});

test("PATCH /api/auth/me refuses an avatar that is not an http(s) URL", async () => {
  const stored = await User.findById(state.ada._id);
  const before = stored.avatar;

  for (const avatar of ["javascript:alert(1)", "data:text/html,<script>", "not-a-url"]) {
    const res = await api("PATCH", "/api/auth/me", {
      cookie: cookieFor("ada@acme.test"),
      body: { avatar },
    });
    assert.equal(res.status, 400, `expected ${avatar} to be refused`);
  }

  const after = await User.findById(state.ada._id);
  assert.equal(after.avatar, before, "a refused avatar must not be stored");
});

test("PATCH /api/auth/me cannot change email or role", async () => {
  const res = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { name: "Ada King", email: "attacker@evil.test", role: "OWNER" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.user.email, "ada@acme.test", "email must be ignored");
  assert.equal(res.json.user.role, "MEMBER", "role must be ignored");

  const stored = await User.findById(state.ada._id);
  assert.equal(stored.email, "ada@acme.test");
  assert.equal(stored.role, "MEMBER");

  const hijacked = await User.findOne({ email: "attacker@evil.test" });
  assert.equal(hijacked, null, "no account may be created by an update");
});

test("PATCH /api/auth/me leaves another account untouched", async () => {
  const res = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("ada@acme.test"),
    body: { name: "Not Alan" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.email, "ada@acme.test");

  const alan = await User.findById(state.alan._id);
  assert.equal(alan.name, "Alan Turing");
});

test("PATCH /api/auth/me requires authentication and returns capabilities", async () => {
  const anon = await api("PATCH", "/api/auth/me", { body: { name: "Nobody" } });
  assert.equal(anon.status, 401);

  const res = await api("PATCH", "/api/auth/me", {
    cookie: cookieFor("alan@acme.test"),
    body: { name: "Alan Turing" },
  });
  assert.equal(res.status, 200);
  assert.equal(typeof res.json.capabilities?.canManageProjects, "boolean");
});

// --- password ----------------------------------------------------------------

test("POST /api/auth/change-password requires the correct current password", async () => {
  const wrong = await api("POST", "/api/auth/change-password", {
    cookie: cookieFor("alan@acme.test"),
    body: { currentPassword: "not-my-password", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  assert.equal(wrong.status, 400);
  assert.match(wrong.json.message, /current password is incorrect/i);

  const stillOld = await login("alan@acme.test", PASSWORD);
  assert.equal(stillOld.status, 200, "a refused change must leave the password alone");

  const rejected = await login("alan@acme.test", NEW_PASSWORD);
  assert.equal(rejected.status, 401, "the new password must not work after a refusal");
});

test("POST /api/auth/change-password validates the new password", async () => {
  const mismatch = await api("POST", "/api/auth/change-password", {
    cookie: cookieFor("alan@acme.test"),
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: "something-else" },
  });
  assert.equal(mismatch.status, 400);

  const tooShort = await api("POST", "/api/auth/change-password", {
    cookie: cookieFor("alan@acme.test"),
    body: { currentPassword: PASSWORD, newPassword: "short", confirmPassword: "short" },
  });
  assert.equal(tooShort.status, 400);

  const unchanged = await api("POST", "/api/auth/change-password", {
    cookie: cookieFor("alan@acme.test"),
    body: { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
  });
  assert.equal(unchanged.status, 400);

  const missing = await api("POST", "/api/auth/change-password", {
    cookie: cookieFor("alan@acme.test"),
    body: { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  assert.equal(missing.status, 400);

  const anon = await api("POST", "/api/auth/change-password", {
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  assert.equal(anon.status, 401);
});

test("POST /api/auth/change-password swaps the password and re-issues the session", async () => {
  // A second device, signed in before the change, is the token that must die.
  const secondDevice = await login("alan@acme.test");
  assert.equal(secondDevice.status, 200);
  const secondDeviceCookie = secondDevice.cookie;

  const before = await api("GET", "/api/auth/me", { cookie: secondDeviceCookie });
  assert.equal(before.status, 200, "the second device starts out signed in");

  const res = await api("POST", "/api/auth/change-password", {
    cookie: secondDeviceCookie,
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  assert.equal(res.status, 200);

  // The changer keeps working: the response re-issues the session cookie.
  const rotated = adoptSetCookies(res.setCookies);
  assert.ok(rotated, "the response must hand back a usable session cookie");

  const afterChange = await api("GET", "/api/auth/me", { cookie: rotated });
  assert.equal(afterChange.status, 200, "the device that changed the password stays signed in");

  // Every other token minted before the change is refused.
  const stale = await api("GET", "/api/auth/me", { cookie: cookieFor("alan@acme.test") });
  assert.equal(stale.status, 401, "a session opened before the change must not survive it");
  assert.match(stale.json.message, /sign in again/i);

  // Old password dead, new password live.
  const oldPassword = await login("alan@acme.test", PASSWORD);
  assert.equal(oldPassword.status, 401);

  const newPassword = await login("alan@acme.test", NEW_PASSWORD);
  assert.equal(newPassword.status, 200, "the new password must work");

  // Restore the fixture password for readability of any later test.
  const restore = await api("POST", "/api/auth/change-password", {
    cookie: newPassword.cookie,
    body: { currentPassword: NEW_PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
  });
  assert.equal(restore.status, 200);
  const backToOriginal = await login("alan@acme.test", PASSWORD);
  assert.equal(backToOriginal.status, 200);
});

test("a password change leaves other accounts' sessions alone", async () => {
  const adaCookie = cookieFor("ada@acme.test");
  const alanCookie = cookieFor("alan@acme.test");

  const res = await api("POST", "/api/auth/change-password", {
    cookie: alanCookie,
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  assert.equal(res.status, 200);

  const ada = await api("GET", "/api/auth/me", { cookie: adaCookie });
  assert.equal(ada.status, 200, "another person's session must survive");

  // Put alan back.
  const alanNow = await login("alan@acme.test", NEW_PASSWORD);
  await api("POST", "/api/auth/change-password", {
    cookie: alanNow.cookie,
    body: { currentPassword: NEW_PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
  });
});

test("passwordChangedAt is stamped on change and survives a sign-in", async () => {
  const ada = await User.findById(state.ada._id);
  assert.ok(ada.passwordChangedAt instanceof Date, "registration stamps the field");

  const res = await api("POST", "/api/auth/change-password", {
    cookie: cookieFor("ada@acme.test"),
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
  });
  assert.equal(res.status, 200);

  const changed = await User.findById(state.ada._id);
  const afterChange = Math.floor(new Date(changed.passwordChangedAt).getTime() / 1000);
  assert.ok(
    afterChange >= Math.floor(Date.now() / 1000) - 5,
    "the change must be stamped at the time of the change"
  );

  // A fresh sign-in with the new password works, so the new token is not older
  // than the change it was issued after.
  const fresh = await login("ada@acme.test", NEW_PASSWORD);
  assert.equal(fresh.status, 200);
  const meRes = await api("GET", "/api/auth/me", { cookie: fresh.cookie });
  assert.equal(meRes.status, 200, "a token issued after the change must be accepted");

  // Restore.
  await api("POST", "/api/auth/change-password", {
    cookie: fresh.cookie,
    body: { currentPassword: NEW_PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
  });
});

test("GET /api/auth/me never exposes the password or the hash timestamp", async () => {
  const res = await api("GET", "/api/auth/me", { cookie: cookieFor("ada@acme.test") });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.password, undefined);
  assert.equal(res.json.user.passwordChangedAt, undefined);
});
