const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const STATUSES = ["TO DO", "IN PROGRESS", "REVIEW", "DONE", "ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "BLOCKED"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent", "LOW", "MEDIUM", "HIGH", "URGENT"];

const subtaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Subtask title is required"],
      trim: true,
      maxlength: [300, "Subtask title cannot exceed 300 characters"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    weight: {
      type: Number,
      default: 0,
      min: [0, "Weight cannot be negative"],
      max: [100, "Weight cannot exceed 100"],
    },
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    columnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BoardColumn",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [300, "Task title cannot exceed 300 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [10000, "Description cannot exceed 10000 characters"],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "TO DO",
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      default: "Medium",
    },
    position: {
      type: Number,
      default: 0,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    subtasks: {
      type: [subtaskSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

taskSchema.index({ projectId: 1, columnId: 1, position: 1 });

applyTransforms(taskSchema);

const Task = mongoose.model("Task", taskSchema);

module.exports = Task;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;