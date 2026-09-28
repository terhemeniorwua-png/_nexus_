const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const authRoutes = require("./routes/auth.route");
const workspaceRoutes = require("./routes/workspace.route");
const teamRoutes = require("./routes/team.route");
const projectRoutes = require("./routes/project.route");
const projectGlobalRoutes = require("./routes/projectGlobal.route");
const boardRoutes = require("./routes/board.route");
const { authenticate } = require("./middleware/authenticate");
const { reorderTask } = require("./controllers/board.controller");
const documentRoutes = require("./routes/document.route");
const messageRoutes = require("./routes/message.route");
const channelMessageRoutes = require("./routes/channelMessage.route");
const conversationRoutes = require("./routes/conversation.route");
const notificationRoutes = require("./routes/notification.route");
const activityRoutes = require("./routes/activity.route");
const overviewRoutes = require("./routes/overview.route");
const projectMemberRoutes = require("./routes/projectMember.route");
const deliverableRoutes = require("./routes/deliverable.route");
const deliverableGlobalRoutes = require("./routes/deliverableGlobal.route");
const projectResourceRoutes = require("./routes/projectResource.route");
const knowledgeRoutes = require("./routes/knowledge.route");
const taskRoutes = require("./routes/task.route");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { securityHeaders } = require("./middleware/securityHeaders");
require("dotenv").config()

const {
  ALLOWED_METHODS,
  ALLOWED_HEADERS,
  EXPOSED_HEADERS,
  originCallback,
} = require("./config/cors");


const app = express();

app.disable("x-powered-by");
app.use(securityHeaders);
// Phase 25 — CORS. The origin is decided per request from the environment
// (see config/cors.js) rather than from a hardcoded host, so the same build
// serves localhost during development and the deployed frontend in
// production, and a new deployment domain is an environment change only.
app.use(
  cors({
    origin: originCallback,
    // Required: the session is an HttpOnly cookie, which the browser refuses
    // to send on a cross-origin request unless this is set. It is also why
    // `origin` can never be the literal "*" — that combination is rejected by
    // the browser, so an unlisted origin has to be omitted from the response
    // headers instead (which is what originCallback does).
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    // Preflight results are stable for a day; the policy only changes on
    // deploy, and without this every request pays for an extra OPTIONS round
    // trip.
    maxAge: 86400,
    // 204 rather than the default 200, so a preflight carries no body.
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "Nexus API is healthy", uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/projects", projectGlobalRoutes);
app.use("/api/workspaces/:workspaceId/projects", projectRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId", boardRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId/members", projectMemberRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId/deliverables", deliverableRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId/resources", projectResourceRoutes);
// Phase 22 knowledge base: approved work promoted into the project's record.
app.use("/api/workspaces/:workspaceId/projects/:projectId/knowledge", knowledgeRoutes);
app.use("/api/workspaces/:workspaceId/documents", documentRoutes);
app.use("/api/workspaces/:workspaceId/messages", messageRoutes);
// Phase 19 channel-scoped alias (spec §9). The workspace comes from the
// channel document, so this route takes no workspace parameter.
app.use("/api/channels", channelMessageRoutes);
// Phase 19 direct messages. Mounted at the top level, not under a workspace:
// a DM is a private thread between two people, and its readability is decided
// by those two people — not by a workspace route.
app.use("/api/messages", conversationRoutes);
app.use("/api/workspaces/:workspaceId/activity", activityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/me", overviewRoutes);

// Phase 12 deliverable lifecycle. Registered before the generic /api task
// routes so `/api/deliverables/...` is not swallowed by them.
app.use("/api/deliverables", deliverableGlobalRoutes);

app.patch("/api/tasks/reorder", authenticate, reorderTask);

// Phase 10 task/subtask routes. Registered AFTER /api/tasks/reorder so the
// specific reorder endpoint wins over the generic /tasks/:taskId routes.
app.use("/api", taskRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;