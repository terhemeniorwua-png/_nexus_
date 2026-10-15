"use strict";

/**
 * HTML email templates.
 *
 * Every builder returns the exact shape `email.service.sendEmail` expects —
 * `{ subject, html, text }` — so a controller only has to pick a template and
 * spread it into the send call.
 *
 * The markup is table-based with inline styles on purpose: email clients strip
 * <style> blocks and have no modern layout engine, so anything smarter than a
 * single centred column collapses somewhere. All interpolated user data is
 * escaped — a name or workspace title is free text and must never be trusted
 * as HTML.
 */

const BRAND = {
  name: "Nexus",
  accent: "#6d5efc",
  ink: "#18181b",
  body: "#3f3f46",
  muted: "#71717a",
  page: "#f4f4f5",
  card: "#ffffff",
  border: "#e4e4e7",
  detailBg: "#fafafa",
};

function clientUrl() {
  return String(process.env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(name) {
  const trimmed = String(name == null ? "" : name).trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function detailRows(details) {
  if (!details.length) return "";
  const rows = details
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;line-height:20px;color:${BRAND.muted};">${escapeHtml(item.label)}</td>
          <td align="right" style="padding:8px 0;font-size:13px;line-height:20px;color:${BRAND.ink};font-weight:600;">${escapeHtml(item.value)}</td>
        </tr>`
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
      <tr>
        <td style="background:${BRAND.detailBg};border:1px solid ${BRAND.border};border-radius:12px;padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td>
      </tr>
    </table>`;
}

function ctaBlock(cta) {
  if (!cta) return "";
  const href = escapeHtml(cta.href);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
      <tr>
        <td align="center" bgcolor="${BRAND.accent}" style="border-radius:10px;">
          <a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:${BRAND.muted};word-break:break-all;">
      If the button doesn&rsquo;t work, copy this link into your browser:<br />
      <a href="${href}" target="_blank" rel="noopener" style="color:${BRAND.accent};">${href}</a>
    </p>`;
}

function layout({ preheader = "", heading, paragraphs = [], details = [], cta = null, footnote = "" }) {
  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:${BRAND.body};">${text}</p>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.page};">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(
      preheader
    )}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0;">
                <span style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">${escapeHtml(
                  BRAND.name
                )}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px;">
                <h1 style="margin:0 0 16px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">${heading}</h1>
                ${body}
                ${detailRows(details)}
                ${ctaBlock(cta)}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid ${BRAND.border};">
                <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${BRAND.muted};">
                  ${escapeHtml(footnote || `You are receiving this email from ${BRAND.name}.`)}
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:${BRAND.muted};">
            &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND.name)}. All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sent when someone creates an account.
 */
function welcomeEmail({ name } = {}) {
  const first = firstName(name);
  const url = `${clientUrl()}/workspaces`;

  return {
    subject: "Welcome to Nexus",
    html: layout({
      preheader: "Your Nexus account is ready — create a workspace to get started.",
      heading: `Welcome to Nexus, ${escapeHtml(first)}`,
      paragraphs: [
        `Thanks for signing up. Nexus is where your team keeps projects, tasks, documents and conversations in one place.`,
        `Your workspace is the home for everything you do next — create one, invite your team, and start your first project whenever you&rsquo;re ready.`,
      ],
      cta: { href: url, label: "Go to your workspace" },
      footnote: "You received this email because an account was created with this address on Nexus.",
    }),
    text: [
      `Welcome to Nexus, ${first}!`,
      "",
      "Your account is ready. Create a workspace, invite your team, and start your first project.",
      "",
      `Open Nexus: ${url}`,
      "",
      "You received this email because an account was created with this address on Nexus.",
    ].join("\n"),
  };
}

/**
 * Sent when a user is added to a workspace (the "organisation" in product
 * terms). The workspace is already attached to their account — this is a
 * heads-up, not an accept/decline request.
 */
function workspaceInvitationEmail({
  recipientName,
  inviterName,
  workspaceName,
  role,
  workspaceId,
} = {}) {
  const url = `${clientUrl()}/workspaces/${workspaceId}`;
  const inviter = inviterName ? escapeHtml(inviterName) : "A teammate";

  return {
    subject: `${inviterName || "A teammate"} invited you to ${workspaceName} on Nexus`,
    html: layout({
      preheader: `You now have access to ${workspaceName} on Nexus.`,
      heading: `You&rsquo;ve been added to ${escapeHtml(workspaceName)}`,
      paragraphs: [
        `${inviter} added you to the <strong style="color:${BRAND.ink};">${escapeHtml(
          workspaceName
        )}</strong> workspace on Nexus as a <strong style="color:${BRAND.ink};">${escapeHtml(
          role || "Member"
        )}</strong>.`,
        `You can pick up right where the team is — browse projects, tasks and conversations, and start collaborating.`,
      ],
      details: [
        ...(inviterName ? [{ label: "Invited by", value: inviterName }] : []),
        { label: "Workspace", value: workspaceName },
        { label: "Your role", value: role || "Member" },
      ],
      cta: { href: url, label: "Open the workspace" },
      footnote: `You received this because ${inviterName || "a teammate"} added your account to a workspace on Nexus.`,
    }),
    text: [
      `You've been added to the ${workspaceName} workspace on Nexus.`,
      "",
      inviterName ? `Invited by: ${inviterName}` : "",
      `Your role: ${role || "Member"}`,
      "",
      `Open the workspace: ${url}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Sent when a user is invited to a project inside a workspace.
 */
function projectInvitationEmail({
  recipientName,
  inviterName,
  projectName,
  workspaceName,
  role,
  projectId,
  workspaceId,
} = {}) {
  const url = `${clientUrl()}/workspaces/${workspaceId}/projects/${projectId}/board`;
  const inviter = inviterName ? escapeHtml(inviterName) : "A teammate";
  const readableRole = String(role || "Member")
    .toLowerCase()
    .replace(/_/g, " ");

  return {
    subject: `${inviterName || "A teammate"} invited you to ${projectName} on Nexus`,
    html: layout({
      preheader: `You&rsquo;ve been added to the project ${projectName}.`,
      heading: `You&rsquo;ve been added to ${escapeHtml(projectName)}`,
      paragraphs: [
        `${inviter} added you to the <strong style="color:${BRAND.ink};">${escapeHtml(
          projectName
        )}</strong> project as a <strong style="color:${BRAND.ink};">${escapeHtml(
          readableRole
        )}</strong>.`,
        `Jump into the board to see what the team is working on and where you fit in.`,
      ],
      details: [
        ...(inviterName ? [{ label: "Invited by", value: inviterName }] : []),
        { label: "Project", value: projectName },
        ...(workspaceName ? [{ label: "Workspace", value: workspaceName }] : []),
        { label: "Your role", value: readableRole },
      ],
      cta: { href: url, label: "Open the project board" },
      footnote: `You received this because ${inviterName || "a teammate"} added your account to a project on Nexus.`,
    }),
    text: [
      `You've been added to the ${projectName} project on Nexus.`,
      "",
      inviterName ? `Invited by: ${inviterName}` : "",
      workspaceName ? `Workspace: ${workspaceName}` : "",
      `Your role: ${readableRole}`,
      "",
      `Open the project board: ${url}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

module.exports = {
  welcomeEmail,
  workspaceInvitationEmail,
  projectInvitationEmail,
};
