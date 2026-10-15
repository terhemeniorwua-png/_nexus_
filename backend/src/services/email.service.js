"use strict";

/**
 * Transactional email over Brevo's REST API (https://developers.brevo.com).
 *
 * No SDK is pulled in: Node 20 ships a global `fetch`, so one POST to
 * /v3/smtp/email is all a send needs. Sending is deliberately best-effort — an
 * email provider outage must never fail a sign-up or an invitation — so
 * `sendEmail` resolves to a boolean and logs the reason instead of throwing.
 *
 * Credentials come from the environment only (see config below), never from
 * source, so the same build works locally and on the deploy target.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10000;

function getConfig() {
  return {
    // The transactional REST key. The SMTP key is accepted as a fallback so a
    // deployment that only sets one of the two still sends.
    apiKey: process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || "",
    senderEmail: process.env.MAIL_FROM_EMAIL || process.env.BREVO_SMTP_LOGIN || "",
    senderName: process.env.MAIL_FROM_NAME || "Nexus",
  };
}

function isConfigured() {
  const { apiKey, senderEmail } = getConfig();
  return Boolean(apiKey && senderEmail);
}

function normalizeRecipients(to) {
  return (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map((entry) =>
      typeof entry === "string"
        ? { email: entry }
        : { email: entry.email, ...(entry.name ? { name: entry.name } : {}) }
    )
    .filter((entry) => entry.email);
}

/**
 * Send one transactional email.
 *
 * @param {object} message
 * @param {string|{email:string,name?:string}|Array} message.to
 * @param {string} message.subject
 * @param {string} message.html
 * @param {string} [message.text]     Plain-text alternative.
 * @param {string} [message.replyTo]
 * @param {string[]} [message.tags]
 * @returns {Promise<boolean>} true when Brevo accepted the send.
 */
async function sendEmail({ to, subject, html, text, replyTo, tags } = {}) {
  // Never hit the provider from the test suite: the tests register users and
  // invite members on purpose, and those flows would otherwise send real mail.
  if (process.env.NODE_ENV === "test") return false;

  if (!isConfigured()) {
    console.warn(
      "[nexus] Email skipped — set BREVO_API_KEY and MAIL_FROM_EMAIL to enable sending."
    );
    return false;
  }

  const recipients = normalizeRecipients(to);
  if (!recipients.length) {
    console.warn("[nexus] Email skipped — no recipient address was provided.");
    return false;
  }

  const { apiKey, senderEmail, senderName } = getConfig();

  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: recipients,
    subject,
    htmlContent: html,
  };
  if (text) payload.textContent = text;
  if (replyTo) payload.replyTo = { email: replyTo };
  if (tags) payload.tags = tags;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[nexus] Brevo rejected email (${response.status}): ${detail}`);
      return false;
    }

    return true;
  } catch (error) {
    const reason = error.name === "AbortError" ? "request timed out" : error.message;
    console.error(`[nexus] Failed to send email: ${reason}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendEmail, isConfigured, getConfig };
