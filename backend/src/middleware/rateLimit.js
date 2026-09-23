require("dotenv").config()

const WINDOW_MS = 2 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = process.env.MAX_FAILED_ATTEMPTS;
const LOCK_MS = 2 * 60 * 1000;

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

module.exports = { authRateLimit };
