const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const User = require("../models/user.model");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Team = require("../models/team.model");
const TeamMember = require("../models/teamMember.model");
const Project = require("../models/project.model");
const ProjectMember = require("../models/projectMember.model");
const ProjectResource = require("../models/projectResource.model");
const BoardColumn = require("../models/boardColumn.model");
const Task = require("../models/task.model");
const Deliverable = require("../models/deliverable.model");
const DeliverableVersion = require("../models/deliverableVersion.model");
const DeliverableReview = require("../models/deliverableReview.model");
const storage = require("../services/storage.service");
const Comment = require("../models/comment.model");
const Notification = require("../models/notification.model");
const Activity = require("../models/activity.model");
const Conversation = require("../models/conversation.model");
const ConversationMember = require("../models/conversationMember.model");
const Message = require("../models/message.model");
const ProfileView = require("../models/profileView.model");
const ProjectView = require("../models/projectView.model");

const MODELS = [
  User,
  Workspace,
  WorkspaceMember,
  Team,
  TeamMember,
  Project,
  ProjectMember,
  ProjectResource,
  BoardColumn,
  Task,
  Deliverable,
  DeliverableVersion,
  DeliverableReview,
  Comment,
  Notification,
  Activity,
  Conversation,
  ConversationMember,
  Message,
  ProfileView,
  ProjectView,
];

async function ensureIndexes() {
  for (const model of MODELS) {
    await model.init();
    const indexes = model.schema.indexes();
    const custom = indexes.filter(([fields]) => !(fields._id && Object.keys(fields).length === 1));
    if (custom.length) {
      await model.createIndexes();
      console.log(`[indexes] ${model.collection.name} — ${custom.length} index(es) ensured`);
    } else {
      console.log(`[indexes] ${model.collection.name} — no custom indexes`);
    }
  }
}

async function runSeed() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  console.log(`[seed] Connected to ${uri}`);

  // Fresh start — drop every collection this schema owns so the seed is reproducible.
  for (const model of MODELS) {
    try {
      await model.collection.drop();
    } catch {
      // Collection may not exist yet — that's fine.
    }
  }
  await ensureIndexes();

  const saltRounds = Number(process.env.SALT_ROUNDS) || 10;
  const password = await bcrypt.hash("Password123!", saltRounds);

  // ------------------------------------------------------------------ USERS
  const users = await User.insertMany([
    { name: "Ada Lovelace", email: "ada@example.com", password },
    { name: "Alan Turing", email: "alan@example.com", password },
    { name: "Grace Hopper", email: "grace@example.com", password },
    { name: "Katherine Johnson", email: "katherine@example.com", password },
    { name: "Linus Torvalds", email: "linus@example.com", password },
    { name: "Barbara Liskov", email: "barbara@example.com", password },
    { name: "Margaret Hamilton", email: "margaret@example.com", password },
  ]);

  const [ada, alan, grace, katherine, linus, barbara, margaret] = users.map((u) => u._id);

  // ----------------------------------------------------------- WORKSPACE
  const workspace = await Workspace.create({
    name: "Acme Research Workspace",
    description: "Development workspace for the Nexus demo",
    ownerId: ada,
  });

  // Workspace memberships mirror the requested hierarchy.
  await WorkspaceMember.insertMany([
    { workspaceId: workspace._id, userId: ada, role: "Admin" },
    { workspaceId: workspace._id, userId: alan, role: "Admin" },
    { workspaceId: workspace._id, userId: grace, role: "Member" },
    { workspaceId: workspace._id, userId: katherine, role: "Member" },
    { workspaceId: workspace._id, userId: linus, role: "Member" },
    { workspaceId: workspace._id, userId: barbara, role: "Viewer" },
    { workspaceId: workspace._id, userId: margaret, role: "Member" },
  ]);

  // ----------------------------------------------------------------- TEAMS
  const teams = await Team.insertMany([
    { workspaceId: workspace._id, name: "Research", description: "Core research and data gathering" },
    { workspaceId: workspace._id, name: "Engineering", description: "Builds the platform" },
    { workspaceId: workspace._id, name: "Design", description: "Product and UX design" },
    { workspaceId: workspace._id, name: "Product", description: "Product strategy and delivery" },
  ]);

  const [researchTeam, engineeringTeam, designTeam, productTeam] = teams.map((t) => t._id);

  await TeamMember.insertMany([
    { teamId: researchTeam, userId: ada, role: "TEAM_LEAD" },
    { teamId: researchTeam, userId: katherine, role: "MEMBER" },
    { teamId: engineeringTeam, userId: alan, role: "TEAM_LEAD" },
    { teamId: engineeringTeam, userId: linus, role: "MEMBER" },
    { teamId: engineeringTeam, userId: margaret, role: "MEMBER" },
    { teamId: designTeam, userId: grace, role: "TEAM_LEAD" },
    { teamId: designTeam, userId: barbara, role: "MEMBER" },
    { teamId: productTeam, userId: grace, role: "TEAM_LEAD" },
    { teamId: productTeam, userId: katherine, role: "MEMBER" },
    { teamId: productTeam, userId: linus, role: "MEMBER" },
  ]);

  // --------------------------------------------------------------- PROJECTS
  const projects = await Project.insertMany([
    {
      workspaceId: workspace._id,
      teamId: engineeringTeam,
      name: "Nexus Platform Build",
      description: "Core platform implementation for the Nexus demo",
      status: "ACTIVE",
      priority: "HIGH",
      managerId: alan,
      startDate: new Date("2026-01-01"),
      dueDate: new Date("2026-12-31"),
      createdBy: ada,
    },
    {
      workspaceId: workspace._id,
      teamId: researchTeam,
      name: "LLM Benchmarking Study",
      description: "Research project benchmarking large language models",
      status: "PLANNING",
      priority: "MEDIUM",
      managerId: katherine,
      startDate: new Date("2026-03-01"),
      dueDate: null,
      createdBy: ada,
    },
    {
      workspaceId: workspace._id,
      teamId: designTeam,
      name: "Design System Refresh",
      description: "Redesign of the Nexus component library",
      status: "ACTIVE",
      priority: "LOW",
      managerId: grace,
      startDate: new Date("2026-02-01"),
      dueDate: new Date("2026-06-30"),
      createdBy: ada,
    },
    {
      workspaceId: workspace._id,
      teamId: researchTeam,
      name: "Nexus Research Platform",
      description: "Open-science portal for sharing team research and datasets",
      status: "ACTIVE",
      priority: "HIGH",
      managerId: katherine,
      startDate: new Date("2026-09-01"),
      dueDate: new Date("2026-12-20"),
      createdBy: ada,
    },
    {
      workspaceId: workspace._id,
      teamId: engineeringTeam,
      name: "Mobile Banking API",
      description: "Public API for the partner mobile banking product",
      status: "COMPLETED",
      priority: "URGENT",
      managerId: linus,
      startDate: new Date("2026-01-15"),
      dueDate: new Date("2026-06-30"),
      createdBy: ada,
    },
    {
      workspaceId: workspace._id,
      teamId: engineeringTeam,
      name: "Healthcare Management System",
      description: "Patient record management rollout for the health division",
      status: "ACTIVE",
      priority: "URGENT",
      managerId: alan,
      startDate: new Date("2026-04-01"),
      dueDate: new Date("2026-11-30"),
      createdBy: ada,
    },
    {
      workspaceId: workspace._id,
      teamId: productTeam,
      name: "Developer Learning Platform",
      description: "Guided onboarding courses for the Nexus developer API",
      status: "PLANNING",
      priority: "MEDIUM",
      managerId: grace,
      startDate: new Date("2026-10-01"),
      dueDate: new Date("2027-03-31"),
      createdBy: ada,
    },
  ]);

  const [platformProject, benchmarkProject, designSystemProject, researchProject, bankingProject, healthProject, learningProject] = projects.map(
    (p) => p._id,
  );

  // -------------------------------------------------------- PROJECT MEMBERS
  // Project membership is the source of truth for project access.
  //
  // Personas (used by docs/authorization.md and the authz test suite):
  //   ada       — Workspace Owner; Research team lead; COLLABORATOR on the
  //               Engineering-owned "Nexus Platform Build" project (cross-team).
  //   alan      — Workspace Admin + Engineering lead; PROJECT_MANAGER on platform.
  //   linus     — Engineering member; MEMBER on platform.
  //   margaret  — Engineering member; MEMBER on platform; submits a deliverable.
  //   katherine — Research member; PROJECT_MANAGER on the benchmark project.
  //   grace     — Design lead; PROJECT_MANAGER on the design system project.
  //   barbara   — Workspace Viewer; VIEWER on the design system project.
  await ProjectMember.insertMany([
    { projectId: platformProject, userId: alan, role: "PROJECT_MANAGER" },
    { projectId: platformProject, userId: linus, role: "MEMBER" },
    { projectId: platformProject, userId: margaret, role: "MEMBER" },
    { projectId: platformProject, userId: ada, role: "COLLABORATOR" },
    { projectId: benchmarkProject, userId: katherine, role: "PROJECT_MANAGER" },
    { projectId: benchmarkProject, userId: ada, role: "COLLABORATOR" },
    { projectId: designSystemProject, userId: grace, role: "PROJECT_MANAGER" },
    { projectId: designSystemProject, userId: margaret, role: "COLLABORATOR" },
    { projectId: designSystemProject, userId: barbara, role: "VIEWER" },
    { projectId: researchProject, userId: katherine, role: "PROJECT_MANAGER" },
    { projectId: bankingProject, userId: linus, role: "PROJECT_MANAGER" },
    { projectId: healthProject, userId: alan, role: "PROJECT_MANAGER" },
    { projectId: learningProject, userId: grace, role: "PROJECT_MANAGER" },
  ]);

  // ------------------------------------------------------- PROJECT RESOURCES
  await ProjectResource.insertMany([
    { projectId: platformProject, name: "MDN", url: "https://developer.mozilla.org", category: "DEVELOPMENT", description: "Web platform reference", createdBy: alan },
    { projectId: platformProject, name: "GitHub", url: "https://github.com", category: "DEVELOPMENT", description: "Source control", createdBy: alan },
    { projectId: benchmarkProject, name: "ChatGPT", url: "https://chatgpt.com", category: "AI", description: "LLM playground", createdBy: katherine },
    { projectId: benchmarkProject, name: "Google Scholar", url: "https://scholar.google.com", category: "RESEARCH", description: "Academic search", createdBy: katherine },
    { projectId: designSystemProject, name: "Figma", url: "https://figma.com", category: "DESIGN", description: "Design collaboration", createdBy: grace },
  ]);

  // ------------------------------------------------------------ BOARD COLUMNS
  const columns = await BoardColumn.insertMany([
    { projectId: platformProject, name: "TO DO", position: 0 },
    { projectId: platformProject, name: "IN PROGRESS", position: 1 },
    { projectId: platformProject, name: "REVIEW", position: 2 },
    { projectId: platformProject, name: "DONE", position: 3 },
    { projectId: benchmarkProject, name: "TO DO", position: 0 },
    { projectId: benchmarkProject, name: "IN PROGRESS", position: 1 },
    { projectId: benchmarkProject, name: "REVIEW", position: 2 },
    { projectId: benchmarkProject, name: "DONE", position: 3 },
    { projectId: designSystemProject, name: "TO DO", position: 0 },
    { projectId: designSystemProject, name: "IN PROGRESS", position: 1 },
    { projectId: designSystemProject, name: "REVIEW", position: 2 },
    { projectId: designSystemProject, name: "DONE", position: 3 },
  ]);

  const [
    todoPlat,
    inprogressPlat,
    reviewPlat,
    donePlat,
    todoBench,
    inprogressBench,
    reviewBench,
    doneBench,
    todoDesign,
    inprogressDesign,
    reviewDesign,
    doneDesign,
  ] = columns.map((c) => c._id);

  // ------------------------------------------------------------------ TASKS
  const tasks = await Task.insertMany([
    {
      projectId: platformProject,
      columnId: inprogressPlat,
      title: "Design authentication flow",
      description: "Document and spec the login/register flows",
      assignedTo: margaret,
      // Mirrors the deliverable seeded below: v2 is with the reviewer.
      status: "SUBMITTED",
      priority: "High",
      dueDate: new Date("2026-04-01"),
      position: 0,
      subtasks: [
        { title: "Research options", status: "COMPLETED", completed: true, weight: 20 },
        { title: "Draft flows", status: "COMPLETED", completed: true, weight: 50 },
        { title: "Write spec", status: "TODO", completed: false, weight: 30 },
      ],
      createdBy: alan,
    },
    {
      projectId: platformProject,
      columnId: inprogressPlat,
      title: "Implement Socket.IO auth",
      description: "Wire JWT auth into the socket handshake",
      assignedTo: linus,
      // Canonical vocabulary — this task hosts the seeded DRAFT deliverable, so
      // its status must equal TASK_STATUS_FOR_DELIVERABLE.DRAFT exactly.
      status: "IN_PROGRESS",
      priority: "Urgent",
      dueDate: new Date("2026-04-15"),
      position: 1,
      subtasks: [
        { title: "Middleware", status: "COMPLETED", completed: true, weight: 40 },
        { title: "Client auth payload", status: "COMPLETED", completed: true, weight: 40 },
        { title: "Reconnect handling", status: "TODO", completed: false, weight: 20 },
      ],
      createdBy: alan,
    },
    {
      projectId: benchmarkProject,
      columnId: todoBench,
      title: "Collect benchmark datasets",
      description: "Gather public datasets for the study",
      assignedTo: katherine,
      status: "TO DO",
      priority: "Medium",
      dueDate: null,
      position: 2,
      subtasks: [],
      createdBy: ada,
    },
    {
      projectId: designSystemProject,
      columnId: inprogressDesign,
      title: "Refresh button tokens",
      description: "Update color and spacing tokens for buttons",
      assignedTo: grace,
      status: "REVIEW",
      priority: "Low",
      dueDate: new Date("2026-05-01"),
      position: 3,
      subtasks: [],
      createdBy: barbara,
    },
    // Phase 10 — workflow statuses (ASSIGNED → IN_PROGRESS → SUBMITTED →
    // UNDER_REVIEW → APPROVED; UNDER_REVIEW ⇄ CHANGES_REQUESTED) together with
    // the legacy board columns they map to. Deliberately cover every state.
    {
      projectId: platformProject,
      columnId: todoPlat,
      title: "Write onboarding migration guide",
      description: "Document how teams move from the legacy board to the task workflow",
      assignedTo: ada,
      status: "ASSIGNED",
      priority: "HIGH",
      dueDate: new Date("2026-09-30"),
      position: 4,
      subtasks: [
        { title: "Outline sections", status: "TODO", completed: false, weight: 25 },
        { title: "Map legacy statuses", status: "TODO", completed: false, weight: 45 },
        { title: "Publish draft", status: "TODO", completed: false, weight: 30 },
      ],
      createdBy: alan,
    },
    {
      projectId: platformProject,
      columnId: inprogressPlat,
      title: "Refactor module router",
      description: "Split the monolithic router into feature-based modules",
      assignedTo: linus,
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      dueDate: new Date("2026-10-15"),
      position: 2,
      subtasks: [
        { title: "Split routes", status: "COMPLETED", completed: true, weight: 40 },
        { title: "Extract auth middleware", status: "COMPLETED", completed: true, weight: 35 },
        { title: "Add permission guards", status: "TODO", completed: false, weight: 25 },
      ],
      createdBy: alan,
    },
    {
      projectId: platformProject,
      columnId: reviewPlat,
      title: "Package v1 release notes",
      description: "Compile the changelog for the v1 launch",
      assignedTo: margaret,
      status: "SUBMITTED",
      priority: "LOW",
      dueDate: new Date("2026-10-01"),
      position: 5,
      subtasks: [],
      createdBy: alan,
    },
    {
      projectId: platformProject,
      columnId: reviewPlat,
      title: "Draft deprecation policy",
      description: "Define how deprecated APIs are announced and phased out",
      assignedTo: margaret,
      status: "UNDER_REVIEW",
      priority: "HIGH",
      dueDate: new Date("2026-10-20"),
      position: 6,
      subtasks: [
        { title: "Research precedent", status: "COMPLETED", completed: true, weight: 20 },
        { title: "Write policy draft", status: "COMPLETED", completed: true, weight: 50 },
        { title: "Legal review", status: "TODO", completed: false, weight: 30 },
      ],
      createdBy: alan,
    },
    {
      projectId: platformProject,
      columnId: reviewPlat,
      title: "Update README quickstart",
      description: "Fix outdated install commands in the quickstart",
      assignedTo: linus,
      status: "CHANGES_REQUESTED",
      priority: "MEDIUM",
      dueDate: new Date("2026-10-08"),
      position: 7,
      subtasks: [],
      createdBy: alan,
    },
    {
      projectId: platformProject,
      columnId: donePlat,
      title: "Ship login form UI",
      description: "Land the redesigned login form",
      assignedTo: margaret,
      status: "APPROVED",
      priority: "URGENT",
      dueDate: new Date("2026-09-01"),
      position: 8,
      subtasks: [
        { title: "Build fields", status: "COMPLETED", completed: true, weight: 30 },
        { title: "Wire validation", status: "COMPLETED", completed: true, weight: 40 },
        { title: "E2E tests", status: "COMPLETED", completed: true, weight: 30 },
      ],
      createdBy: alan,
    },
    {
      projectId: benchmarkProject,
      columnId: todoBench,
      title: "Literature review",
      description: "Survey recent LLM evaluation studies",
      assignedTo: katherine,
      status: "ASSIGNED",
      priority: "MEDIUM",
      dueDate: new Date("2026-11-15"),
      position: 3,
      subtasks: [
        { title: "Collect papers", status: "TODO", completed: false, weight: 50 },
        { title: "Tag findings", status: "TODO", completed: false, weight: 50 },
      ],
      createdBy: ada,
    },
    {
      projectId: benchmarkProject,
      columnId: reviewBench,
      title: "Data preprocessing report",
      description: "Summarize dataset cleaning decisions",
      assignedTo: katherine,
      status: "SUBMITTED",
      priority: "HIGH",
      dueDate: new Date("2026-11-01"),
      position: 4,
      subtasks: [],
      createdBy: ada,
    },
    {
      projectId: benchmarkProject,
      columnId: doneBench,
      title: "Sampling methodology",
      description: "Finalize the stratified sampling plan",
      assignedTo: katherine,
      status: "APPROVED",
      priority: "MEDIUM",
      dueDate: new Date("2026-08-15"),
      position: 5,
      subtasks: [
        { title: "Pick strata", status: "COMPLETED", completed: true, weight: 50 },
        { title: "Size each stratum", status: "COMPLETED", completed: true, weight: 50 },
      ],
      createdBy: ada,
    },
    {
      projectId: benchmarkProject,
      columnId: inprogressBench,
      title: "Run pilot evals",
      description: "Exercise the harness on a small subset",
      assignedTo: ada,
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: new Date("2026-10-30"),
      position: 6,
      subtasks: [
        { title: "Configure harness", status: "COMPLETED", completed: true, weight: 30 },
        { title: "Run 10 models", status: "TODO", completed: false, weight: 70 },
      ],
      createdBy: katherine,
    },
    {
      projectId: designSystemProject,
      columnId: todoDesign,
      title: "Inventory Figma components",
      description: "Audit the existing component library",
      assignedTo: margaret,
      status: "ASSIGNED",
      priority: "MEDIUM",
      dueDate: new Date("2026-09-25"),
      position: 4,
      subtasks: [
        { title: "Export list", status: "TODO", completed: false, weight: 60 },
        { title: "Note duplicates", status: "TODO", completed: false, weight: 40 },
      ],
      createdBy: grace,
    },
    {
      projectId: designSystemProject,
      columnId: reviewDesign,
      title: "Type scale proposal",
      description: "Propose a new spacing-aware type scale",
      assignedTo: grace,
      status: "UNDER_REVIEW",
      priority: "LOW",
      dueDate: new Date("2026-10-10"),
      position: 5,
      subtasks: [],
      createdBy: barbara,
    },
    {
      projectId: designSystemProject,
      columnId: reviewDesign,
      title: "Color ramp tokens",
      description: "Define neutral and accent token ramps",
      assignedTo: margaret,
      status: "CHANGES_REQUESTED",
      priority: "HIGH",
      dueDate: new Date("2026-10-05"),
      position: 6,
      subtasks: [],
      createdBy: grace,
    },
  ]);

  const [
    authTask,
    socketTask,
    dataTask,
    buttonTask,
    onbTask,
    routerTask,
    deprecTask,
    readmeTask,
    loginTask,
  ] = tasks.map((t) => t._id);

  // Tasks that host a deliverable are looked up by title so adding a task
  // elsewhere in the array cannot silently repoint a seeded deliverable.
  const typeScaleTask = tasks.find((t) => t.title === "Type scale proposal")._id;
  const loginUiTask = tasks.find((t) => t.title === "Ship login form UI")._id;

  // Subtask weights are embedded per the existing board model and each task
  // allocates exactly 100 points across its subtasks. Phase 11 derives progress
  // from these records (nothing is stored), so the seeded data demonstrates
  // every branch of the formula:
  //
  //   "Design authentication flow"  20 + 50 done of 100  ->  70%
  //   "Refactor module router"      40 + 35 done of 100  ->  75%
  //   "Ship login form UI"          30 + 40 + 30        ->  100% (APPROVED)
  //   "Write onboarding ..."        none done           ->    0%
  //   "Collect benchmark datasets"  no subtasks at all   ->    0%
  //
  // Project progress is then the average of its tasks' figures, e.g. the
  // Platform project reports its own weighted mix rather than a hand-typed
  // number. Weights are validated in the service layer (≤ 100 combined); see
  // docs/database.md for the full rule.

  // ----------------------------------------------------------- DELIVERABLES
  //
  // Phase 12 stores deliverables as an aggregate: one Deliverable per task,
  // an append-only list of versions, and a review row per decision. Files are
  // written through the storage service so a seeded demo can actually download
  // them (the keys are generated, never hand-written).
  //
  // The seeded stories cover every interesting state:
  //
  //   "Design authentication flow"  v1 changes requested → v2 submitted
  //                                 (task SUBMITTED, submitter margaret)
  //   "Implement Socket.IO auth"    v1 draft, never submitted (task IN PROGRESS)
  //   "Ship login form UI"          v1 changes requested → v2 approved
  //                                 (task APPROVED, approvedVersion 2)
  //   "Type scale proposal"         v1 under review, decision pending
  //                                 (task UNDER_REVIEW)
  //
  // Task status always mirrors the deliverable's, exactly as the service keeps
  // them: DRAFT → IN PROGRESS, SUBMITTED → SUBMITTED, UNDER_REVIEW → UNDER
  // REVIEW, CHANGES_REQUESTED → CHANGES REQUESTED, APPROVED → APPROVED.

  const fileFor = (deliverable, versionNumber, { name, mimeType, body }) =>
    storage.saveUpload(
      {
        buffer: Buffer.from(body),
        originalname: name,
        mimetype: mimeType,
      },
      {
        workspaceId: workspace._id,
        projectId: deliverable.projectId,
        deliverableId: deliverable._id,
        versionNumber,
      }
    );

  const versionDoc = (deliverable, versionNumber, upload, { status, description, submittedBy, submittedAt, reviewedAt }) => ({
    deliverableId: deliverable._id,
    versionNumber,
    status,
    description,
    fileName: upload.fileName,
    storageKey: upload.storageKey,
    fileUrl: upload.fileUrl,
    fileSize: upload.fileSize,
    mimeType: upload.mimeType,
    checksum: upload.checksum,
    submittedBy,
    submittedAt,
    reviewedAt,
  });

  // --- Story 1: rework after requested changes ---------------------------
  const authDeliverable = await Deliverable.create({
    taskId: authTask,
    workspaceId: workspace._id,
    projectId: platformProject,
    createdBy: margaret,
    title: "Auth flow specification",
    status: "SUBMITTED",
    currentVersion: 2,
  });

  const authV1 = versionDoc(
    authDeliverable,
    1,
    await fileFor(authDeliverable, 1, {
      name: "auth-spec-v1.pdf",
      mimeType: "application/pdf",
      body: "%PDF-1.4\n% Auth flow specification, first draft\n",
    }),
    {
      status: "CHANGES_REQUESTED",
      description: "First draft of the authentication specification",
      submittedBy: margaret,
      submittedAt: new Date("2026-02-10"),
      reviewedAt: new Date("2026-02-12"),
    }
  );
  const authV2 = versionDoc(
    authDeliverable,
    2,
    await fileFor(authDeliverable, 2, {
      name: "auth-spec-v2.pdf",
      mimeType: "application/pdf",
      body: "%PDF-1.4\n% Auth flow specification, token rotation added\n",
    }),
    {
      status: "SUBMITTED",
      description: "Adds the refresh-token rotation flow requested in review",
      submittedBy: margaret,
      submittedAt: new Date("2026-02-14"),
      reviewedAt: null,
    }
  );
  const [authVersion1, authVersion2] = await DeliverableVersion.insertMany([authV1, authV2]);

  // --- Story 2: a draft that was never submitted -------------------------
  const routerDeliverable = await Deliverable.create({
    taskId: socketTask,
    workspaceId: workspace._id,
    projectId: platformProject,
    createdBy: linus,
    title: "Module router refactor notes",
    status: "DRAFT",
    currentVersion: 1,
  });
  const [routerVersion1] = await DeliverableVersion.insertMany([
    versionDoc(
      routerDeliverable,
      1,
      await fileFor(routerDeliverable, 1, {
        name: "router-refactor-notes.md",
        mimeType: "text/markdown",
        body: "# Module router refactor\n\nSplit plan, still in progress.\n",
      }),
      {
        status: "DRAFT",
        description: "Working notes — not ready to submit yet",
        submittedBy: null,
        submittedAt: null,
        reviewedAt: null,
      }
    ),
  ]);

  // --- Story 3: changes requested, then approved -------------------------
  const buttonDeliverable = await Deliverable.create({
    taskId: loginUiTask,
    workspaceId: workspace._id,
    projectId: platformProject,
    createdBy: margaret,
    title: "Login form UI",
    status: "APPROVED",
    currentVersion: 2,
    approvedVersion: 2,
  });

  const buttonV1 = versionDoc(
    buttonDeliverable,
    1,
    await fileFor(buttonDeliverable, 1, {
      name: "login-form-v1.zip",
      mimeType: "application/zip",
      body: "PK\u0003\u0004button tokens, first pass\n",
    }),
    {
      status: "CHANGES_REQUESTED",
      description: "Rebuilt login form with the refreshed design tokens",
      submittedBy: margaret,
      submittedAt: new Date("2026-02-16"),
      reviewedAt: new Date("2026-02-17"),
    }
  );
  const buttonV2 = versionDoc(
    buttonDeliverable,
    2,
    await fileFor(buttonDeliverable, 2, {
      name: "login-form-v2.zip",
      mimeType: "application/zip",
      body: "PK\u0003\u0004button tokens, contrast fixed\n",
    }),
    {
      status: "APPROVED",
      description: "Contrast ratios corrected for every interactive state",
      submittedBy: margaret,
      submittedAt: new Date("2026-02-18"),
      reviewedAt: new Date("2026-02-20"),
    }
  );
  const [buttonVersion1, buttonVersion2] = await DeliverableVersion.insertMany([buttonV1, buttonV2]);

  // --- Story 4: waiting on a decision ------------------------------------
  const typeScaleDeliverable = await Deliverable.create({
    taskId: typeScaleTask,
    workspaceId: workspace._id,
    projectId: benchmarkProject,
    createdBy: grace,
    title: "Type scale proposal",
    status: "UNDER_REVIEW",
    currentVersion: 1,
  });
  const [typeScaleVersion1] = await DeliverableVersion.insertMany([
    versionDoc(
      typeScaleDeliverable,
      1,
      await fileFor(typeScaleDeliverable, 1, {
        name: "type-scale.pdf",
        mimeType: "application/pdf",
        body: "%PDF-1.4\n% Spacing-aware type scale proposal\n",
      }),
      {
        status: "UNDER_REVIEW",
        description: "Modular scale tuned for the 4px spacing grid",
        submittedBy: grace,
        submittedAt: new Date("2026-02-21"),
        reviewedAt: null,
      }
    ),
  ]);

  // ----------------------------------------------------------------- REVIEWS
  //
  // Reviews are append-only and always name the version they judged — that is
  // what makes the history auditable after a v2 arrives.
  await DeliverableReview.insertMany([
    {
      deliverableId: authDeliverable._id,
      deliverableVersionId: authVersion1._id,
      versionNumber: 1,
      reviewerId: alan,
      decision: "CHANGES_REQUESTED",
      feedback: "Clarify the token refresh flow before v2 — the client needs a rotation diagram.",
      reviewedAt: new Date("2026-02-12"),
    },
    {
      deliverableId: buttonDeliverable._id,
      deliverableVersionId: buttonVersion1._id,
      versionNumber: 1,
      reviewerId: alan,
      decision: "CHANGES_REQUESTED",
      feedback: "Disabled-state contrast is 2.8:1. Bring it to at least 4.5:1.",
      reviewedAt: new Date("2026-02-17"),
    },
    {
      deliverableId: buttonDeliverable._id,
      deliverableVersionId: buttonVersion2._id,
      versionNumber: 2,
      reviewerId: alan,
      decision: "APPROVED",
      feedback: "Contrast fixed across every state. Approved — nice turnaround.",
      reviewedAt: new Date("2026-02-20"),
    },
  ]);

  // ---------------------------------------------------------------- COMMENTS
  await Comment.insertMany([
    { taskId: authTask, projectId: null, userId: margaret, content: "Should tokens rotate on refresh?" },
    { taskId: socketTask, projectId: null, userId: linus, content: "Reconnection is handled by socket.io-client." },
    { taskId: dataTask, projectId: null, userId: katherine, content: "Waiting on dataset access approval." },
  ]);

  // ---------------------------------------------------------- NOTIFICATIONS
  await Notification.insertMany([
    { userId: margaret, actorId: alan, workspaceId: workspace._id, type: "TASK_ASSIGNED", title: "You were assigned a task", body: "Design authentication flow", link: `/workspaces/${workspace._id}`, entityType: "task", entityId: authTask },
    { userId: linus, actorId: alan, workspaceId: workspace._id, type: "TASK_ASSIGNED", title: "You were assigned a task", body: "Implement Socket.IO auth", link: `/workspaces/${workspace._id}`, entityType: "task", entityId: socketTask },
    { userId: margaret, actorId: alan, workspaceId: workspace._id, type: "DELIVERABLE_REVIEWED", title: "Your deliverable was reviewed", body: "Clarify the token refresh flow", link: `/workspaces/${workspace._id}`, entityType: "deliverable", entityId: authDeliverable._id, read: false },
    { userId: ada, actorId: alan, workspaceId: workspace._id, type: "TASK_ASSIGNED", title: "You were assigned a task", body: "Write onboarding migration guide", link: `/workspaces/${workspace._id}`, entityType: "task", entityId: onbTask, read: false },
    { userId: margaret, actorId: alan, workspaceId: workspace._id, type: "TASK_ASSIGNED", title: "You were assigned a task", body: "Ship login form UI", link: `/workspaces/${workspace._id}`, entityType: "task", entityId: loginTask, read: false },
    { userId: margaret, actorId: alan, workspaceId: workspace._id, type: "TASK_STATUS_CHANGED", title: "Task status changed", body: "Draft deprecation policy is under review", link: `/workspaces/${workspace._id}`, entityType: "task", entityId: deprecTask, read: false },
    { userId: linus, actorId: katherine, workspaceId: workspace._id, type: "TASK_STATUS_CHANGED", title: "Task status changed", body: "Update README quickstart needs changes", link: `/workspaces/${workspace._id}`, entityType: "task", entityId: readmeTask, read: false },
  ]);

  // ---------------------------------------------------------- ACTIVITY LOG
  await Activity.insertMany([
    { workspaceId: workspace._id, projectId: platformProject, userId: alan, action: "TASK_CREATED", targetType: "task", targetId: authTask, metadata: { taskTitle: "Design authentication flow" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: alan, action: "TASK_STARTED", targetType: "task", targetId: socketTask, metadata: { taskTitle: "Implement Socket.IO auth" } },
    { workspaceId: workspace._id, projectId: benchmarkProject, userId: ada, action: "PROJECT_CREATED", targetType: "project", targetId: benchmarkProject, metadata: { projectName: "LLM Benchmarking Study" } },
    // Deliverable activity hangs off the deliverable, not the version, so one
    // timeline tells the whole story of a submission and its revisions.
    { workspaceId: workspace._id, projectId: platformProject, userId: margaret, action: "DELIVERABLE_CREATED", targetType: "deliverable", targetId: authDeliverable._id, metadata: { deliverableId: String(authDeliverable._id), taskId: String(authTask), versionNumber: 1, taskTitle: "Design authentication flow" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: margaret, action: "DELIVERABLE_SUBMITTED", targetType: "deliverable", targetId: authDeliverable._id, metadata: { deliverableId: String(authDeliverable._id), taskId: String(authTask), versionNumber: 1, taskTitle: "Design authentication flow" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: alan, action: "DELIVERABLE_CHANGES_REQUESTED", targetType: "deliverable", targetId: authDeliverable._id, metadata: { deliverableId: String(authDeliverable._id), taskId: String(authTask), versionNumber: 1, taskTitle: "Design authentication flow" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: margaret, action: "DELIVERABLE_VERSION_CREATED", targetType: "deliverable", targetId: authDeliverable._id, metadata: { deliverableId: String(authDeliverable._id), taskId: String(authTask), versionNumber: 2, taskTitle: "Design authentication flow" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: margaret, action: "DELIVERABLE_SUBMITTED", targetType: "deliverable", targetId: authDeliverable._id, metadata: { deliverableId: String(authDeliverable._id), taskId: String(authTask), versionNumber: 2, taskTitle: "Design authentication flow" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: alan, action: "DELIVERABLE_APPROVED", targetType: "deliverable", targetId: buttonDeliverable._id, metadata: { deliverableId: String(buttonDeliverable._id), taskId: String(loginUiTask), versionNumber: 2, taskTitle: "Ship login form UI" } },
    { workspaceId: workspace._id, projectId: benchmarkProject, userId: grace, action: "DELIVERABLE_SUBMITTED", targetType: "deliverable", targetId: typeScaleDeliverable._id, metadata: { deliverableId: String(typeScaleDeliverable._id), taskId: String(typeScaleTask), versionNumber: 1, taskTitle: "Type scale proposal" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: linus, action: "TASK_STARTED", targetType: "task", targetId: routerTask, metadata: { taskTitle: "Refactor module router" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: margaret, action: "TASK_COMPLETED", targetType: "task", targetId: loginTask, metadata: { taskTitle: "Ship login form UI" } },
    { workspaceId: workspace._id, projectId: platformProject, userId: margaret, action: "TASK_UPDATED", targetType: "task", targetId: deprecTask, metadata: { taskTitle: "Draft deprecation policy" } },
  ]);

  // ------------------------------------------------------------- CONVERSATIONS
  const conversation = await Conversation.create({
    name: "Platform — direct",
    isGroup: false,
    createdBy: alan,
  });

  await ConversationMember.insertMany([
    { conversationId: conversation._id, userId: alan },
    { conversationId: conversation._id, userId: linus },
  ]);

  // ----------------------------------------------------------------- MESSAGES
  await Message.insertMany([
    { workspaceId: workspace._id, channelId: "general", conversationId: null, userId: alan, content: "Welcome to the Acme workspace!" },
    { workspaceId: workspace._id, channelId: "general", conversationId: null, userId: grace, content: "Thanks! Excited to get started." },
    { workspaceId: workspace._id, channelId: null, conversationId: conversation._id, userId: alan, content: "Let's pair on the socket auth." },
  ]);

  // ------------------------------------------------------------------- VIEWS
  await ProjectView.insertMany([
    { viewerId: alan, projectId: platformProject, lastViewedAt: new Date("2026-03-01") },
    { viewerId: alan, projectId: benchmarkProject, lastViewedAt: new Date("2026-03-02") },
    { viewerId: margaret, projectId: platformProject, lastViewedAt: new Date("2026-03-03") },
  ]);

  await ProfileView.insertMany([
    { viewerId: alan, viewedUserId: margaret, lastViewedAt: new Date("2026-03-04") },
    { viewerId: grace, viewedUserId: ada, lastViewedAt: new Date("2026-03-05") },
    { viewerId: linus, viewedUserId: alan, lastViewedAt: new Date("2026-03-06") },
  ]);

  const counts = {};
  for (const model of MODELS) {
    counts[model.collection.name] = await model.estimatedDocumentCount();
  }

  await mongoose.disconnect();
  console.log("[seed] Done. Collections:", counts);
  process.exit(0);
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  });
}

module.exports = { runSeed, ensureIndexes, MODELS };