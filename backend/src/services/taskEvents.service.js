"use strict";

/**
 * Shared task socket events.
 *
 * A task's status can change from more than one place — the Phase 10 status
 * endpoint and the Phase 12 deliverable workflow both move it — and the board
 * has to hear about either. Keeping the emit in one tiny service means the two
 * paths cannot drift on payload shape, and avoids a controller → controller
 * import cycle.
 */

const Task = require("../models/task.model");
const { getIO, boardRoom } = require("../sockets/store");

async function publishTaskUpdate(req, task) {
  const io = getIO();
  if (!io || !req.project) return;
  const populated = await Task.findById(task._id).populate("assignedTo", "name email avatar");
  io.to(boardRoom(req.project._id)).emit("task:updated", { task: populated });
}

module.exports = { publishTaskUpdate };
