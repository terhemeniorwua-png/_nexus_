"use strict";

/**
 * Shared task socket events.
 *
 * A task's state can change from more than one place — the Phase 10 status
 * endpoint, the board controller and the Phase 12 deliverable workflow all
 * move it — and every connected project member has to hear about it. Keeping
 * the emit in one tiny service means those paths cannot drift on payload
 * shape, and it avoids a controller → controller import cycle.
 *
 * Called only after the database write succeeded, so a failed mutation can
 * never produce a `task:updated`.
 */

const Task = require("../models/task.model");
const { toProject } = require("../sockets/emit");
const { SOCKET_EVENTS } = require("../sockets/events");
const { serializeTask } = require("./task.service");

/**
 * Reload a task with the same safe projection the REST API returns, then
 * broadcast it to the project room. Using `serializeTask` here is what keeps
 * the socket payload byte-for-byte consistent with `GET /api/tasks/...` — a
 * client can apply an event without a second shape to handle.
 */
async function populatedTask(task) {
  const found = await Task.findById(task._id).populate("assignedTo", "name email avatar");
  return found ? serializeTask(found) : null;
}

async function publishTaskCreated(req, task) {
  if (!req?.project || !task) return null;
  const payload = await populatedTask(task);
  if (payload) toProject(req.project._id, SOCKET_EVENTS.TASK_CREATED, { task: payload });
  return payload;
}

async function publishTaskUpdate(req, task) {
  if (!req?.project || !task) return null;
  const payload = await populatedTask(task);
  if (payload) toProject(req.project._id, SOCKET_EVENTS.TASK_UPDATED, { task: payload });
  return payload;
}

async function publishTaskMoved(req, task, actorId = null) {
  if (!req?.project || !task) return null;
  const payload = await populatedTask(task);
  if (payload) toProject(req.project._id, SOCKET_EVENTS.TASK_MOVED, { task: payload, actorId });
  return payload;
}

function publishTaskDeleted(req, taskId) {
  if (!req?.project || !taskId) return;
  toProject(req.project._id, SOCKET_EVENTS.TASK_DELETED, { taskId: String(taskId) });
}

module.exports = {
  publishTaskCreated,
  publishTaskUpdate,
  publishTaskMoved,
  publishTaskDeleted,
};
