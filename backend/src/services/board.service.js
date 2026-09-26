const Task = require("../models/task.model");
const BoardColumn = require("../models/boardColumn.model");
const { DEFAULT_COLUMNS } = require("../models/boardColumn.model");

async function ensureDefaultColumns(projectId) {
  const existing = await BoardColumn.countDocuments({ projectId });
  if (existing > 0) return;

  const inserts = DEFAULT_COLUMNS.map((col) => ({
    projectId,
    name: col.name,
    position: col.position,
  }));

  await BoardColumn.insertMany(inserts);
}

async function reindexColumn(columnId) {
  const tasks = await Task.find({ columnId }).sort({ position: 1, updatedAt: 1 });
  const bulk = tasks.map((task, index) => ({
    updateOne: {
      filter: { _id: task._id },
      update: { $set: { position: index } },
    },
  }));
  if (bulk.length) {
    await Task.bulkWrite(bulk);
  }
}

async function moveTask(taskId, targetColumnId, targetPosition) {
  const task = await Task.findById(taskId);
  if (!task) throw Object.assign(new Error("Task not found"), { statusCode: 404 });

  const previousColumnId = task.columnId;

  if (String(targetColumnId) !== String(previousColumnId)) {
    const targetColumn = await BoardColumn.findById(targetColumnId);
    if (!targetColumn) throw Object.assign(new Error("Column not found"), { statusCode: 404 });

    task.columnId = targetColumn._id;
    task.position = Number.isFinite(targetPosition) ? targetPosition : 999999;
    await task.save();

    await reindexColumn(previousColumnId);
    await reindexColumn(targetColumn._id);
  } else if (Number.isFinite(targetPosition)) {
    task.position = targetPosition;
    await task.save();
    await reindexColumn(task.columnId);
  }

  return task;
}

async function getBoard(projectId) {
  const columns = await BoardColumn.find({ projectId }).sort({ position: 1, name: 1 });

  if (columns.length === 0) {
    await ensureDefaultColumns(projectId);
    return getBoard(projectId);
  }

  const tasks = await Task.find({ projectId })
    .sort({ position: 1, updatedAt: 1 })
    .populate("assignedTo", "name email");

  return { columns, tasks };
}

async function getNextPosition(columnId) {
  const last = await Task.findOne({ columnId }).sort({ position: -1 });
  return last ? last.position + 1 : 0;
}

module.exports = { ensureDefaultColumns, reindexColumn, moveTask, getBoard, getNextPosition };