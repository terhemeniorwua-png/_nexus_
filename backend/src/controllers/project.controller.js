"use strict";

const Project = require("../models/project.model");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const BoardColumn = require("../models/boardColumn.model");
const ProjectMember = require("../models/projectMember.model");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Team = require("../models/team.model");
const User = require("../models/user.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { ensureDefaultColumns } = require("../services/board.service");
const {
  getAccessibleProjectIds,
  attachRolesToProjects,
  getAccessibleProjectsGlobal,
} = require("../services/access.service");
const {
  assertTeamInWorkspace,
  assertEligibleManager,
  assertValidDateRange,
  sanitizeProjectFields,
  enrichProjects,
  getProjectMembers,
} = require("../services/project.service");

// ---------------------------------------------------------------------------
// Global, cross-workspace project list (Phase 8)
// ---------------------------------------------------------------------------

async function listGlobalProjects(req, res, next) {
  try {
    const projects = await getAccessibleProjectsGlobal({
      userId: req.user._id,
      filters: {
        status: req.query.status,
        priority: req.query.priority,
        teamId: req.query.teamId,
      },
    });

    const data = await enrichProjects(projects);
    res.json({ success: true, projects: data });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Create-project metadata (teams + eligible managers per workspace)
// ---------------------------------------------------------------------------

async function getProjectMeta(req, res, next) {
  try {
    const userId = req.user._id;

    const [memberships, owned] = await Promise.all([
      WorkspaceMember.find({ userId }).select("workspaceId role"),
      Workspace.find({ ownerId: userId }).select("_id"),
    ]);

    const ownedIds = new Set(owned.map((w) => String(w._id)));
    const wsRoleById = new Map(memberships.map((m) => [String(m.workspaceId), m.role]));

    // Only workspaces where the user holds `create_project` (owner, Admin,
    // Member — never Viewer) can be used to create projects.
    const workspaceIds = [];
    for (const wsId of new Set([...wsRoleById.keys(), ...ownedIds])) {
      const isOwner = ownedIds.has(wsId);
      const role = wsRoleById.get(wsId);
      if (isOwner || role === "Admin" || role === "Member") workspaceIds.push(wsId);
    }

    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });

    const data = await Promise.all(
      workspaces.map(async (workspace) => {
        const [teams, memberRows] = await Promise.all([
          Team.find({ workspaceId: workspace._id }).sort({ name: 1 }),
          WorkspaceMember.find({
            workspaceId: workspace._id,
            role: { $in: ["Admin", "Member"] },
          }),
        ]);

        const candidateIds = new Set([
          String(workspace.ownerId),
          ...memberRows.map((m) => String(m.userId)),
        ]);
        const users = await User.find({ _id: { $in: [...candidateIds] } }).select(
          "name email avatar"
        );

        return {
          id: workspace.id,
          name: workspace.name,
          teams: teams.map((team) => ({ id: team.id, name: team.name })),
          members: users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar || "",
          })),
        };
      })
    );

    res.json({ success: true, workspaces: data });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Workspace-scoped project list (existing route, Phase 6)
// ---------------------------------------------------------------------------

async function listProjects(req, res, next) {
  try {
    const accessibleIds = await getAccessibleProjectIds({
      userId: req.user._id,
      workspaceId: req.workspace._id,
      isOwner: Boolean(req.isOwner),
      workspaceMemberRole: req.memberRole,
    });

    const projects = await Project.find({
      _id: { $in: accessibleIds },
      workspaceId: req.workspace._id,
    }).sort({ createdAt: -1 });

    await attachRolesToProjects(projects, {
      userId: req.user._id,
      isOwner: Boolean(req.isOwner),
      workspaceMemberRole: req.memberRole,
    });

    const data = await Promise.all(
      projects.map(async (project) => {
        const [taskCount, completedCount, documentCount] = await Promise.all([
          Task.countDocuments({ projectId: project._id }),
          Task.countDocuments({ projectId: project._id, status: "DONE" }),
          Document.countDocuments({ workspaceId: req.workspace._id, projectId: project._id }),
        ]);

        return {
          ...project.toJSON(),
          role: project.role,
          stats: { taskCount, completedCount, documentCount },
        };
      })
    );

    res.json({ success: true, projects: data });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Create project (shared by workspace-scoped + global routes)
// ---------------------------------------------------------------------------

async function createProject(req, res, next) {
  try {
    const requireTeam = Boolean(req.requireProjectDetails);
    const requireManager = Boolean(req.requireProjectDetails);

    const { teamId, managerId } = req.body;

    // Workspace + team context. The global route resolves the workspace from
    // the team (req.team + req.workspace set by projectTeamContext). The
    // workspace-scoped route provides req.workspace directly and may or may
    // not carry a teamId.
    const workspace = req.workspace;
    const team = req.team || (await assertTeamInWorkspace({ teamId, workspaceId: workspace._id, required: requireTeam }));

    // Manager: explicit managerId (validated) or, for the legacy workspace
    // route, the creator.
    let manager = req.user;
    if (managerId !== undefined && managerId !== null && String(managerId).trim() !== "") {
      manager = await assertEligibleManager({ workspaceId: workspace._id, managerId });
    } else if (requireManager) {
      throw new ApiError(400, "A manager is required");
    }

    const fields = sanitizeProjectFields(req.body);
    const startDate = fields.startDate !== undefined ? fields.startDate : null;
    const dueDate = fields.dueDate !== undefined ? fields.dueDate : null;
    assertValidDateRange(startDate, dueDate);

    const project = await Project.create({
      workspaceId: workspace._id,
      teamId: team ? team._id : null,
      name: fields.name,
      description: fields.description || "",
      status: fields.status || "PLANNING",
      priority: fields.priority || "MEDIUM",
      startDate,
      dueDate,
      managerId: manager._id,
      createdBy: req.user._id,
    });

    // Access is explicit: the manager and the creator each get a
    // PROJECT_MANAGER membership row (a creator who is not the manager keeps
    // manage rights on the project they create — Phase 6 behavior).
    await ensureDefaultColumns(project._id);

    const memberUserIds = [...new Set([String(manager._id), String(req.user._id)])];
    await Promise.all(
      memberUserIds.map((userId) =>
        ProjectMember.create({ projectId: project._id, userId, role: "PROJECT_MANAGER" })
      )
    );

    await recordActivity({
      workspaceId: workspace._id,
      userId: req.user._id,
      action: "PROJECT_CREATED",
      targetType: "project",
      targetId: project._id,
      metadata: { name: project.name },
    });

    project.role = "PROJECT_MANAGER";
    const [data] = await enrichProjects([project]);

    res.status(201).json({ success: true, project: data });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Read project (shared; adds team/manager/workspace/members to the payload)
// ---------------------------------------------------------------------------

async function getProject(req, res, next) {
  try {
    const project = req.project;
    if (!project) return next(new ApiError(404, "Project not found"));

    project.role = req.projectRole;
    const [ [data], members ] = await Promise.all([
      enrichProjects([project]),
      getProjectMembers(project._id),
    ]);

    res.json({
      success: true,
      project: { ...data, members },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Update project (validated: team/manager relationships, enums, dates)
// ---------------------------------------------------------------------------

async function updateProject(req, res, next) {
  try {
    const project = req.project;
    if (!project) return next(new ApiError(404, "Project not found"));

    const body = req.body;

    // -- Team relationship: must belong to the project's workspace ----------
    if (body.teamId !== undefined) {
      const team = await assertTeamInWorkspace({
        teamId: body.teamId,
        workspaceId: project.workspaceId,
      });
      body.teamId = team ? team._id : null;
    }

    // -- Manager relationship: must be an eligible workspace member ----------
    if (body.managerId !== undefined) {
      const manager = await assertEligibleManager({
        workspaceId: project.workspaceId,
        managerId: body.managerId,
      });
      body.managerId = manager ? manager._id : null;
    }

    const oldManagerId = project.managerId ? String(project.managerId) : null;

    // -- Scalar fields (name, description, enums, dates) ---------------------
    const fields = sanitizeProjectFields(body);

    const effectiveStartDate = fields.startDate !== undefined ? fields.startDate : project.startDate;
    const effectiveDueDate = fields.dueDate !== undefined ? fields.dueDate : project.dueDate;
    assertValidDateRange(effectiveStartDate, effectiveDueDate);

    Object.assign(project, fields);
    if (body.teamId !== undefined) project.teamId = body.teamId;
    if (body.managerId !== undefined) project.managerId = body.managerId;
    await project.save();

    // -- Manager handoff ------------------------------------------------------
    const newManagerId = body.managerId !== undefined ? (body.managerId ? String(body.managerId) : null) : oldManagerId;
    if (newManagerId && newManagerId !== oldManagerId) {
      const existingRow = await ProjectMember.findOne({ projectId: project._id, userId: newManagerId });
      if (existingRow) {
        if (existingRow.role !== "PROJECT_MANAGER") {
          existingRow.role = "PROJECT_MANAGER";
          await existingRow.save();
        }
      } else {
        await ProjectMember.create({ projectId: project._id, userId: newManagerId, role: "PROJECT_MANAGER" });
      }

      if (oldManagerId && oldManagerId !== newManagerId) {
        const oldRow = await ProjectMember.findOne({ projectId: project._id, userId: oldManagerId, role: "PROJECT_MANAGER" });
        if (oldRow) {
          oldRow.role = "MEMBER";
          await oldRow.save();
        }
      }
    }

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "PROJECT_UPDATED",
      targetType: "project",
      targetId: project._id,
      metadata: { name: project.name },
    });

    const [data] = await enrichProjects([project]);
    res.json({ success: true, project: data });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Delete project
// ---------------------------------------------------------------------------

async function deleteProject(req, res, next) {
  try {
    const project = req.project;
    if (!project) return next(new ApiError(404, "Project not found"));

    await Project.deleteOne({ _id: project._id });
    await Task.deleteMany({ projectId: project._id });
    await BoardColumn.deleteMany({ projectId: project._id });
    await ProjectMember.deleteMany({ projectId: project._id });
    await Document.deleteMany({ workspaceId: req.workspace._id, projectId: project._id });

    res.json({ success: true, message: "Project deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listGlobalProjects,
  getProjectMeta,
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
};