"use strict";

/**
 * CORS — one origin policy, shared by both transports.
 *
 * The HTTP layer (`app.js`) and the Socket.IO handshake (`sockets/index.js`)
 * used to resolve their trusted origins independently. That is how the two
 * drift apart: a deployment could add a host for the REST API and forget the
 * socket, or the reverse, and the symptom is a working app whose realtime
 * features quietly never connect. Both read from here now.
 *
 * Where the list comes from, in order of precedence:
 *
 *   ALLOWED_ORIGINS   Comma/space separated list of trusted frontend origins.
 *                     The variable to set on Render or any other host.
 *   CLIENT_URL        The original single-origin variable. Still read, and
 *                     MERGED rather than overridden, so an existing deployment
 *                     that only sets CLIENT_URL keeps working untouched.
 *
 * Both are unioned, so a deployment may keep CLIENT_URL for its main host and
 * add preview/staging domains in ALLOWED_ORIGINS without either overwriting
 * the other. Nothing is hardcoded: a new deployment domain is an environment
 * change, not a code change.
 *
 * Local development is the one case that gets a rule rather than a list. A
 * developer runs the frontend on a port chosen at random — 3000 today, 3001
 * after a second copy, 5000 or 5100 depending on which half of the repo you
 * read the default from. Enumerating those in an env var is a treadmill nobody
 * keeps up with, so when NODE_ENV !== "production" every loopback origin is
 * accepted regardless of port. This cannot leak into production: the branch is
 * keyed on NODE_ENV, and production takes the configured list only.
 *
 * `*` is never produced here. It is accepted as an explicit opt-in value
 * because `credentials: true` forbids a literal wildcard, so it means "reflect
 * whatever origin asked" rather than "send *" — and it warns, because a
 * credentialed wildcard is effectively a public API.
 */

// The wildcard, as an explicit and deliberate choice. Not a default.
const WILDCARD = "*";

// Hosts that resolve to this machine. A request from one of these can only
// have come from the developer's own browser, which is what makes the
// development shortcut safe.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

// Schemes an origin may use. Anything else (file:, data:, chrome-extension:)
// is never a trusted frontend.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Reduce a configured entry to a bare origin, so that the same host matches
 * whether it was written with a trailing slash, a path, or mixed case.
 *
 * `https://App.example.com/` and `https://app.example.com` must be the same
 * entry, or a valid frontend is refused over punctuation. Returns "" for
 * anything unparseable, which silently drops the entry rather than throwing at
 * boot: a typo in a deployment variable should not take the API down.
 */
function normalizeOrigin(value) {
  if (typeof value !== "string") return "";

  let candidate = value.trim();
  if (!candidate) return "";

  // Tolerate `localhost:3000` as well as `http://localhost:3000` — the bare
  // form is what people actually type, and without this `new URL` reads
  // "localhost" as a scheme and the port as a path.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return "";
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return "";
  if (!parsed.hostname) return "";

  // `.origin` discards any path/query and drops a default port for the
  // scheme, so http://x:80 and http://x compare equal.
  return parsed.origin.toLowerCase();
}

/**
 * Split a configured list. Accepts a real array as well as a string, and
 * commas, semicolons or whitespace as separators, because all three turn up
 * in copy-pasted environment values.
 */
function splitOrigins(value) {
  if (Array.isArray(value)) return value.flatMap(splitOrigins);
  if (typeof value !== "string") return [];
  return value.split(/[\s,;]+/).filter(Boolean);
}

/**
 * True for an origin served by this machine: http://localhost:3000,
 * http://127.0.0.1:5100, http://[::1]:8080, http://app.localhost:3000.
 */
function isLoopbackOrigin(origin) {
  if (typeof origin !== "string" || !origin) return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  // *.localhost is reserved by RFC 6761 to resolve to loopback.
  return hostname.endsWith(".localhost");
}

/**
 * Is this a production deployment?
 *
 * NODE_ENV is the intended signal, but it is set by whoever deploys, and
 * Render does not set it on its own — a service deployed with the variable
 * left blank serves the public internet with NODE_ENV undefined. Reading that
 * as "development" would hand every live deployment the loopback shortcut
 * below, so a platform-provided marker counts too. RENDER=true is set by
 * Render itself and cannot be spoofed by a request.
 *
 * Set NODE_ENV=production in the Render service's environment regardless; the
 * NODE_ENV check is the one that applies everywhere else.
 */
function isProduction(env = process.env) {
  if (env.NODE_ENV === "production") return true;
  return env.RENDER === "true";
}

/**
 * Read the configured origins. Both variables are unioned, see the file
 * header. Normalized and de-duplicated, first occurrence winning, so the
 * resulting order is stable and the log line is readable.
 */
function configuredOrigins(env = process.env) {
  const configured = [
    ...splitOrigins(env.ALLOWED_ORIGINS),
    ...splitOrigins(env.CLIENT_URL),
  ];

  const seen = new Set();
  for (const entry of configured) {
    const origin = normalizeOrigin(entry);
    if (origin) seen.add(origin);
  }
  return [...seen];
}

/**
 * The full decision for one request: is this origin allowed right now?
 *
 * Kept separate from the Express callback so the policy can be tested, and
 * reused by the socket handshake, without going through a request.
 */
function isOriginAllowed(origin, env = process.env) {
  // No Origin header: a same-origin navigation, curl, a server-to-server call
  // or a native client. CORS is a browser mechanism, so there is nothing to
  // enforce, and these callers must not be broken by a policy meant for
  // browsers. The `cors` package calls this with undefined.
  if (origin === undefined || origin === null || origin === "") return true;

  if (typeof origin !== "string") return false;

  if (splitOrigins(env.ALLOWED_ORIGINS).includes(WILDCARD)) return true;

  if (isLoopbackOrigin(origin)) {
    // Loopback is accepted in development only, and only as an addition to
    // whatever is configured — a production deployment still trusts nothing
    // beyond its own list, and gains no localhost shortcut from this branch.
    if (!isProduction(env)) return true;
    return configuredOrigins(env).includes(normalizeOrigin(origin));
  }

  return configuredOrigins(env).includes(normalizeOrigin(origin));
}

/**
 * `origin` callback for the cors package. The list cannot be a static array
 * because loopback acceptance and the wildcard depend on the environment and
 * the request; this is where both are decided, per request.
 *
 * A rejected origin calls back with `false`, not with an Error. The browser is
 * the enforcement point for CORS, so the response still goes out — it simply
 * carries no Access-Control-Allow-Origin header, and the browser refuses to
 * hand it to the calling page. Throwing here would instead turn every
 * disallowed request into a 500 and leak the policy into the API's own
 * behaviour, which is not what CORS is for.
 */
function originCallback(origin, callback) {
  if (isOriginAllowed(origin)) return callback(null, true);
  return callback(null, false);
}

/**
 * One-line summary for the boot log. Logging the policy makes a bad origin
 * diagnosable from the Render log without a reproduction.
 */
function describePolicy(env = process.env) {
  const origins = configuredOrigins(env);
  if (splitOrigins(env.ALLOWED_ORIGINS).includes(WILDCARD)) {
    return "ALLOW_ANY (ALLOWED_ORIGINS contains '*') — credentialed and public";
  }

  const parts = [];
  if (origins.length) parts.push(origins.join(", "));
  if (!isProduction(env)) parts.push("+ any loopback origin (development)");
  return parts.length ? parts.join(" | ") : "(none configured)";
}

module.exports = {
  ALLOWED_METHODS: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  ALLOWED_HEADERS: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  // Deliverable downloads are served from this origin, and the browser hides
  // Content-Disposition from a cross-origin read unless it is exposed.
  EXPOSED_HEADERS: ["Content-Disposition"],
  normalizeOrigin,
  splitOrigins,
  isLoopbackOrigin,
  configuredOrigins,
  isOriginAllowed,
  isProduction,
  originCallback,
  describePolicy,
};
