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
const notificationRoutes = require("./routes/notification.route");
const activityRoutes = require("./routes/activity.route");
const overviewRoutes = require("./routes/overview.route");
const projectMemberRoutes = require("./routes/projectMember.route");
const deliverableRoutes = require("./routes/deliverable.route");
const projectResourceRoutes = require("./routes/projectResource.route");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

const clientOrigin = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
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
app.use("/api/workspaces/:workspaceId/documents", documentRoutes);
app.use("/api/workspaces/:workspaceId/messages", messageRoutes);
app.use("/api/workspaces/:workspaceId/activity", activityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/me", overviewRoutes);

app.patch("/api/tasks/reorder", authenticate, reorderTask);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;