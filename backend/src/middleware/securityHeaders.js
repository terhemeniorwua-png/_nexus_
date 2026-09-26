"use strict";

/**
 * Phase 24 — baseline HTTP security headers.
 *
 * Hand-rolled rather than pulled from helmet so the dependency set stays as it
 * is. Deliberately NOT setting Content-Security-Policy: this API serves JSON to
 * a Next.js frontend on a different origin, and a CSP here would not govern the
 * app's own documents while risking breakage. The headers below are the ones
 * that are safe and meaningful for a JSON API.
 */

function securityHeaders(_req, res, next) {
  // Do not advertise the framework and its version.
  res.removeHeader("X-Powered-By");

  // Never let a browser second-guess a response we chose the type of: this is
  // what stops a file we stored being re-interpreted as script/HTML.
  res.setHeader("X-Content-Type-Options", "nosniff");

  // The API is not a document surface; framing it buys an attacker nothing.
  res.setHeader("X-Frame-Options", "DENY");

  // Do not leak internal paths through outbound links.
  res.setHeader("Referrer-Policy", "no-referrer");

  // Resolve hostnames early; avoids a latency leak on first navigation.
  res.setHeader("X-DNS-Prefetch-Control", "off");

  // HSTS only means something over TLS, and asserting it in local http
  // development would pin browsers to a broken origin.
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}

module.exports = { securityHeaders };
