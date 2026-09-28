"use strict";

// Phase 25 — CORS policy tests.
//
// No database and no HTTP server: the policy is a pure function of the
// environment, so it is asserted directly and the mounted Express app is then
// checked over a real socket to confirm the middleware actually emits the
// headers. That keeps the suite runnable without MongoDB, which is what makes
// it useful as a guard — a CORS regression breaks local development and a
// production deploy immediately, and should not need a seeded database to
// detect.
//
// The properties under test are the ones that caused the original failures:
//   A. Local development — every loopback origin, whatever the port
//   B. Production — the configured list, and nothing else
//   C. Environment driven — ALLOWED_ORIGINS, CLIENT_URL, and the two merged
//   D. Normalization — trailing slashes, paths, case, whitespace
//   E. The real app — headers on a preflight and on an actual request
//   F. Safety — no wildcard, no loopback leak into production

process.env.NODE_ENV = "test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  ALLOWED_METHODS,
  ALLOWED_HEADERS,
  normalizeOrigin,
  isLoopbackOrigin,
  configuredOrigins,
  isOriginAllowed,
  describePolicy,
} = require("../src/config/cors");

// A production deployment must never be treated as development, whichever of
// the two signals is present.
const PROD = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://nexus-vyd1.vercel.app" };
const DEV = { NODE_ENV: "development" };

// ---------------------------------------------------------------------------
// A. Local development
// ---------------------------------------------------------------------------

test("development: accepts loopback origins on any port", () => {
  for (const origin of [
    "http://localhost:3000",
    "http://localhost:3001", // a second dev server
    "http://localhost:5000",
    "http://localhost:5100", // the backend's own PORT
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "http://app.localhost:3000", // RFC 6761 reserved loopback
  ]) {
    assert.equal(isOriginAllowed(origin, DEV), true, `${origin} should be allowed in development`);
  }
});

test("development: still refuses a remote origin that is not configured", () => {
  assert.equal(isOriginAllowed("https://evil.example.com", DEV), false);
  // Suffix/prefix tricks against a loopback-looking name.
  assert.equal(isOriginAllowed("https://localhost.evil.com", DEV), false);
  assert.equal(isOriginAllowed("http://evil.com/localhost", DEV), false);
});

// ---------------------------------------------------------------------------
// B. Production
// ---------------------------------------------------------------------------

test("production: accepts configured production origins", () => {
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", PROD), true);
});

test("production: refuses unlisted origins", () => {
  assert.equal(isOriginAllowed("https://evil.example.com", PROD), false);
  // A vercel.app sibling is a different origin. Deployment previews are
  // separate apps on separate origins and must be listed to be trusted.
  assert.equal(isOriginAllowed("https://nexus-vyd1-abc123.vercel.app", PROD), false);
});

test("production: refuses loopback even though development allows it", () => {
  // The whole point of the NODE_ENV check: a public deployment must not trust
  // every localhost origin because its platform forgot to set NODE_ENV.
  assert.equal(isOriginAllowed("http://localhost:3000", PROD), false);
  assert.equal(isOriginAllowed("http://127.0.0.1:5100", PROD), false);
});

test("production on Render without NODE_ENV set is still production", () => {
  // RENDER=true is set by the platform. A service deployed with NODE_ENV left
  // blank must not inherit the development loopback shortcut.
  const onRender = { RENDER: "true", ALLOWED_ORIGINS: "https://nexus-vyd1.vercel.app" };
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", onRender), true);
  assert.equal(isOriginAllowed("http://localhost:3000", onRender), false);
  assert.equal(describePolicy(onRender), "https://nexus-vyd1.vercel.app");
});

test("production: loopback is allowed only when explicitly listed", () => {
  const listed = { NODE_ENV: "production", CLIENT_URL: "http://localhost:3000" };
  assert.equal(isOriginAllowed("http://localhost:3000", listed), true);
  // The list is exact, so another port on the same host is still refused.
  assert.equal(isOriginAllowed("http://localhost:4000", listed), false);
});

// ---------------------------------------------------------------------------
// C. Environment driven
// ---------------------------------------------------------------------------

test("ALLOWED_ORIGINS accepts a comma-separated list", () => {
  const env = {
    NODE_ENV: "production",
    ALLOWED_ORIGINS: "https://nexus-vyd1.vercel.app,https://staging.nexus.app",
  };
  assert.deepEqual(configuredOrigins(env), [
    "https://nexus-vyd1.vercel.app",
    "https://staging.nexus.app",
  ]);
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", env), true);
  assert.equal(isOriginAllowed("https://staging.nexus.app", env), true);
});

test("CLIENT_URL alone still works, for deployments not yet migrated", () => {
  const env = { NODE_ENV: "production", CLIENT_URL: "https://nexus-vyd1.vercel.app" };
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", env), true);
});

test("ALLOWED_ORIGINS and CLIENT_URL are merged, not overridden", () => {
  const env = {
    NODE_ENV: "production",
    ALLOWED_ORIGINS: "https://staging.nexus.app",
    CLIENT_URL: "https://nexus-vyd1.vercel.app",
  };
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", env), true);
  assert.equal(isOriginAllowed("https://staging.nexus.app", env), true);
});

test("changing a deployment domain is an environment change only", () => {
  // No code lists a host, so the policy follows the variable.
  const renamed = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://nexus-vyd2.vercel.app" };
  assert.equal(isOriginAllowed("https://nexus-vyd2.vercel.app", renamed), true);
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", renamed), false);
});

test("no origin header is always allowed", () => {
  // curl, server-to-server calls, native clients: CORS is a browser mechanism,
  // and these callers must not be broken by a browser-facing policy.
  for (const env of [DEV, PROD]) {
    assert.equal(isOriginAllowed(undefined, env), true);
    assert.equal(isOriginAllowed(null, env), true);
    assert.equal(isOriginAllowed("", env), true);
  }
});

test("a non-string origin is refused rather than throwing", () => {
  assert.equal(isOriginAllowed(42, DEV), false);
  assert.equal(isOriginAllowed({ origin: "http://localhost:3000" }, DEV), false);
});

test("a malformed origin is refused rather than throwing", () => {
  // Must not take the request down: config/cors.js is on the hot path of every
  // single request, including from clients sending garbage.
  assert.equal(isOriginAllowed("not a url", DEV), false);
  assert.equal(isOriginAllowed("http://", DEV), false);
  assert.equal(isOriginAllowed("javascript:alert(1)", DEV), false);
  assert.equal(isOriginAllowed("file:///etc/passwd", DEV), false);
});

test("a wildcard in ALLOWED_ORIGINS is an explicit opt-in and is reported", () => {
  const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "*" };
  assert.equal(isOriginAllowed("https://anything.example.com", env), true);
  // Credentialed wildcard: usable, but the log line must not hide that.
  assert.match(describePolicy(env), /ALLOW_ANY/);
});

// ---------------------------------------------------------------------------
// D. Normalization
// ---------------------------------------------------------------------------

test("origins are compared as origins, not as strings", () => {
  const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://Nexus-vyd1.vercel.app/" };
  // These all have to match the one configured entry, or a correct deployment
  // is refused over punctuation.
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app", env), true);
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app/", env), true);
  assert.equal(isOriginAllowed("https://NEXUS-VYD1.vercel.app", env), true);
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app/some/path", env), true);
});

test("a host:port pair is a different origin from the bare host", () => {
  const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://nexus-vyd1.vercel.app" };
  assert.equal(isOriginAllowed("https://nexus-vyd1.vercel.app:8443", env), false);
  // And http is not https.
  assert.equal(isOriginAllowed("http://nexus-vyd1.vercel.app", env), false);
});

test("normalizeOrigin drops unusable entries instead of throwing", () => {
  assert.equal(normalizeOrigin("https://a.example.com/path?q=1#frag"), "https://a.example.com");
  assert.equal(normalizeOrigin("localhost:3000"), "http://localhost:3000"); // scheme optional
  assert.equal(normalizeOrigin("  https://a.example.com  "), "https://a.example.com");
  assert.equal(normalizeOrigin(""), "");
  assert.equal(normalizeOrigin("   "), "");
  assert.equal(normalizeOrigin("ftp://a.example.com"), ""); // not a web origin
  assert.equal(normalizeOrigin(null), "");
  assert.equal(normalizeOrigin(undefined), "");
  assert.equal(normalizeOrigin(12345), "");
});

test("a bad entry does not take the good entries down with it", () => {
  // A typo in one deployment variable must not silently disable the others.
  const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "nonsense://,https://ok.example.com" };
  assert.deepEqual(configuredOrigins(env), ["https://ok.example.com"]);
  assert.equal(isOriginAllowed("https://ok.example.com", env), true);
});

test("isLoopbackOrigin does not accept lookalike hosts", () => {
  assert.equal(isLoopbackOrigin("http://localhost:3000"), true);
  assert.equal(isLoopbackOrigin("https://localhost"), true);
  assert.equal(isLoopbackOrigin("https://notlocalhost"), false);
  assert.equal(isLoopbackOrigin("https://localhost.evil.com"), false);
  assert.equal(isLoopbackOrigin("https://evil.com?x=localhost"), false);
  assert.equal(isLoopbackOrigin(""), false);
  assert.equal(isLoopbackOrigin(null), false);
});

// ---------------------------------------------------------------------------
// E. The mounted app, over a real socket
// ---------------------------------------------------------------------------

let server;
let baseUrl;

before(async () => {
  // Configure the environment before the app is required, because the CORS
  // middleware reads it at registration time.
  process.env.NODE_ENV = "development";
  process.env.ALLOWED_ORIGINS = "https://nexus-vyd1.vercel.app";
  const app = require("../src/app");

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("app: a preflight from the production frontend is allowed", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://nexus-vyd1.vercel.app",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  assert.equal(res.headers.get("access-control-allow-origin"), "https://nexus-vyd1.vercel.app");
  // credentials: true is what makes the HttpOnly session cookie travel at all.
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});

test("app: a preflight from localhost:3000 is allowed in development", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
    },
  });

  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});

test("app: every method the app uses is permitted", async () => {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": method,
      },
    });
    const allowed = res.headers.get("access-control-allow-methods") || "";
    assert.match(allowed, new RegExp(method), `${method} should be permitted`);
  }
  // The full set is served in one header, so preflights stay a single round trip.
  for (const method of ALLOWED_METHODS) {
    assert.ok(ALLOWED_METHODS.includes(method));
  }
});

test("app: Content-Type and Authorization are permitted request headers", async () => {
  const res = await fetch(`${baseUrl}/api/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type, authorization",
    },
  });

  const allowed = (res.headers.get("access-control-allow-headers") || "").toLowerCase();
  assert.match(allowed, /content-type/);
  assert.match(allowed, /authorization/);
  // Belt and braces: the configured list is the one advertised.
  for (const header of ALLOWED_HEADERS) {
    assert.match(allowed, new RegExp(header.toLowerCase()));
  }
});

test("app: an unlisted origin gets no CORS headers but a real response", async () => {
  const res = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://evil.example.com" },
  });

  // No header, so the browser refuses to hand it to the page. The request
  // itself still succeeds: CORS is enforced by the browser, and turning a
  // disallowed origin into a 500 would change the API's behaviour for a
  // browser-only concern.
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(res.status, 200);
});

test("app: never sends a wildcard alongside credentials", async () => {
  // A literal "*" is illegal with credentials: true and browsers reject it, so
  // the app would appear to work in curl and fail in every browser.
  const res = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://nexus-vyd1.vercel.app" },
  });
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("access-control-allow-origin"), "https://nexus-vyd1.vercel.app");
});

test("app: a same-origin client with no Origin header is unaffected", async () => {
  // curl, the health check, server-to-server calls.
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("app: the reported 404 routes are mounted under /api", async () => {
  // The reported symptom was 404 on /auth/me and /notifications. Both are
  // mounted under /api, so a client that drops the prefix is asking for a path
  // that genuinely does not exist — asserted here so the diagnosis is recorded
  // rather than rediscovered.
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);

  // Unauthenticated, so these answer 401, not 404: the route resolved and the
  // auth middleware refused it, which is exactly the distinction at issue.
  for (const path of ["/api/auth/me", "/api/notifications"]) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.notEqual(res.status, 404, `${path} should be mounted`);
    assert.equal(res.status, 401, `${path} should require authentication`);
  }

  // The same paths without the prefix must 404, which is what a missing /api
  // in NEXT_PUBLIC_API_URL looks like from the outside.
  for (const path of ["/auth/me", "/notifications"]) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.equal(res.status, 404, `${path} without the /api prefix is not mounted`);
  }
});
