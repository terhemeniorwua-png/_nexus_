"use strict";

/**
 * Phase 18 — socket authorization.
 *
 * Authentication answers "who is this?"; this module answers "what may they
 * receive?". Room joins go through the exact same access model the REST layer
 * uses (`middleware/authorize.js` → `services/access.service.js`), so a socket
 * can never widen what the API already refuses.
 *
 * Nothing here trusts an id that arrived from the client: a project id is
 * resolved through the database, and a workspace id supplied alongside a
 * project is checked against the project's real workspace.
 */

const mongoose = require("mongoose");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const { resolveProjectRole } = require("../services/access.service");

/**
 * Resolve a workspace the user can actually see. Mirrors
 * `attachWorkspaceContext`: the owner counts as an Admin member, anyone else
 * needs a WorkspaceMember row.
 *
 * @returns {Promise<{workspace: object, isOwner: boolean, memberRole: string}|null>}
 */
async function resolveWorkspaceAccess({ userId, workspaceId }) {
  if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) return null;

  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) return null;

  const isOwner = String(workspace.ownerId) === String(userId);
  const member = isOwner
    ? null
    : await WorkspaceMember.findOne({ workspaceId, userId }).select("role").lean();

  if (!member && !isOwner) return null;

  return { workspace, isOwner, memberRole: member ? member.role : "Admin" };
}

/**
 * Resolve a project the user may receive real-time events for.
 *
 * @returns {Promise<{project: object, workspaceId: string, role: string}|null>}
 */
async function resolveProjectAccess({ userId, projectId, workspaceId = null }) {
  if (!projectId || !mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId).select("_id workspaceId managerId").lean();
  if (!project) return null;

  // A workspace id from the client is only ever a consistency hint; the
  // project's own workspace is the authorization source.
  if (workspaceId && String(project.workspaceId) !== String(workspaceId)) return null;

  const access = await resolveWorkspaceAccess({ userId, workspaceId: project.workspaceId });
  if (!access) return null;

  const resolved = await resolveProjectRole({
    user: { _id: userId },
    project,
    isOwner: access.isOwner,
    workspaceMemberRole: access.memberRole,
  });
  if (!resolved) return null;

  return { project, workspaceId: String(project.workspaceId), role: resolved.role };
}

/**
 * Resolve a message channel the user may read.
 *
 * A channel is only real if it exists on the workspace the caller named, and
 * the caller must be a member of that workspace. Direct messages are not
 * channels at all: they are delivered to the two participants' private
 * `user:<id>` rooms, so there is no room to join and nothing to authorize
 * here beyond confirming both people share a workspace.
 */
async function resolveChannelAccess({ userId, workspaceId, channelId }) {
  if (!channelId || !workspaceId) return null;

  const access = await resolveWorkspaceAccess({ userId, workspaceId });
  if (!access) return null;

  const { workspace } = access;
  const wanted = String(channelId);

  const known = (workspace.channels || []).some(
    (c) => String(c._id) === wanted || c.name === wanted || c.slug === wanted
  );
  if (!known) return null;

  return { ...access, channelId: wanted, isDirect: false };
}

/**
 * Resolve a direct-message peer.
 *
 * The peer must exist and must share a workspace with the caller — the same
 * rule the REST layer enforces, reached through the messaging service so the
 * socket and the API can never disagree about who is allowed to talk to whom.
 *
 * There is no "join the room" step for a DM: the socket is already in its own
 * private `user:<id>` room from authentication, and a DM is emitted to the two
 * participants' rooms directly.
 */
async function resolveDirectAccess({ userId, targetUserId }) {
  if (!mongoose.isValidObjectId(targetUserId)) return null;
  if (String(targetUserId) === String(userId)) return null;

  try {
    const { canMessage } = require("../services/messaging.service");
    const { target, workspaceId } = await canMessage({ userId, targetUserId });
    return { target, workspaceId, isDirect: true };
  } catch {
    return null;
  }
}

module.exports = {
  resolveWorkspaceAccess,
  resolveProjectAccess,
  resolveChannelAccess,
  resolveDirectAccess,
};
