require("dotenv").config()

const WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const MAX_FAILED_ATTEMPTS = (() => {
  const raw = Number(process.env.MAX_FAILED_ATTEMPTS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_FAILED_ATTEMPTS;
})();
const LOCK_MS = 2 * 60 * 1000;

// Phase 24 — request-rate ceilings for the credential endpoints. The lockout
// below only counts *failed* attempts, so a burst of valid-looking traffic
// (password spraying, or just hammering the endpoint) was never bounded. These
// count every request in the window and answer 429, which is what the API
// contract promises. Limits are per-IP and configurable; the in-memory store is
// documented in the Phase 24 report as per-process only.
const DEFAULT_RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, max: 20 },
  register: { windowMs: 60 * 60 * 1000, max: 10 },
  forgotPassword: { windowMs: 60 * 60 * 1000, max: 10 },
};

const store = new Map();

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now && entry.lockedUntil <= now) store.delete(key);
  }
}, 60 * 1000);
if (typeof sweepTimer.unref === "function") sweepTimer.unref();

function keysFor(req) {
  const keys = [`ip:${req.ip || req.socket?.remoteAddress || "unknown"}`];
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (email) keys.push(`email:${email}`);
  return keys;
}

function authRateLimit(req, res, next) {
  const keys = keysFor(req);
  const now = Date.now();

  for (const key of keys) {
    const entry = store.get(key);
    if (entry && entry.lockedUntil > now) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please wait 2 minutes before trying again.",
        retryAfter,
      });
    }
  }

  function onFinish() {
    res.removeListener("finish", onFinish);
    const status = res.statusCode;
    const at = Date.now();

    if (status >= 400 && status < 500 && status !== 429) {
      for (const key of keys) {
        let entry = store.get(key);
        if (!entry || (entry.resetAt <= at && entry.lockedUntil <= at)) {
          entry = { failures: 0, resetAt: at + WINDOW_MS, lockedUntil: 0 };
          store.set(key, entry);
        }
        entry.failures += 1;
        if (entry.failures >= MAX_FAILED_ATTEMPTS) {
          entry.lockedUntil = at + LOCK_MS;
          entry.resetAt = entry.lockedUntil;
        }
      }
    } else if (status < 400) {
      for (const key of keys) store.delete(key);
    }
  }

  res.on("finish", onFinish);
  next();
}

/**
 * Phase 24 — bounded request rate for a named sensitive endpoint.
 *
 * Counts every request (successful or not) per client IP inside a fixed window
 * and answers 429 once the ceiling is passed, so the expensive work — bcrypt on
 * login, a JWT sign on register, a DB lookup on forgot-password — is never
 * reached by a flood. `req.ip` is used deliberately: the app does not set
 * `trust proxy`, so a forwarded header cannot be used to spoof a source address.
 * Behind a real proxy every client shares one address, which is called out as
 * a deployment caveat in the Phase 24 report.
 *
 * @param {"login"|"register"|"forgotPassword"} name
 */
function authRequestLimit(name) {
  const preset = DEFAULT_RATE_LIMITS[name];
  if (!preset) {
    throw new Error(`authRequestLimit: unknown limit "${name}"`);
  }

  const envMax = Number(process.env[`RATE_LIMIT_${name.toUpperCase()}_MAX`]);
  const max = Number.isFinite(envMax) && envMax > 0 ? envMax : preset.max;
  const windowMs = preset.windowMs;

  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();

  return function rateLimitRequest(req, res, next) {
    const key = `rl:${name}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(remaining));
    res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        retryAfter,
      });
    }

    next();
  };
}

module.exports = { authRateLimit, authRequestLimit };
