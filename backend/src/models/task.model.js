const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

// Phase 10 — canonical task workflow (enforced by services/task.service.js):
//   ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED
//   UNDER_REVIEW → CHANGES_REQUESTED → IN_PROGRESS
const WORKFLOW_STATUSES = ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED"];
// Legacy board statuses are retained so pre-existing documents remain valid on
// save. They have no transition rules (read-only labels for old board data).
const LEGACY_BOARD_STATUSES = ["TO DO", "IN PROGRESS", "REVIEW", "DONE", "BLOCKED"];
const STATUSES = [...WORKFLOW_STATUSES, ...LEGACY_BOARD_STATUSES];

const PRIORITY_MAP = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
};
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT", "Low", "Medium", "High", "Urgent"];

const SUBTASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED"];

const subtaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Subtask title is required"],
      trim: true,
      maxlength: [300, "Subtask title cannot exceed 300 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [4000, "Subtask description cannot exceed 4000 characters"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: SUBTASK_STATUSES,
      default: "TODO",
    },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
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
subtaskSchema.pre("save", function setSubtaskCompleted(next) {
  if (this.isModified("status")) {
    this.completed = this.status === "COMPLETED";
  }
  next();
});

const taskSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
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
      default: "ASSIGNED",
      validate: {
        validator: (v) => STATUSES.includes(v),
        message: (props) => `\`${props.value}\` is not a valid status`,
      },
    },
    priority: {
      type: String,
      default: "MEDIUM",
      validate: {
        validator: (v) => PRIORITIES.includes(v),
        message: (props) => `\`${props.value}\` is not a valid priority`,
      },
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
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ projectId: 1, assignedTo: 1 });
taskSchema.index({ projectId: 1, dueDate: 1 });

applyTransforms(taskSchema);

const Task = mongoose.model("Task", taskSchema);

module.exports = Task;
module.exports.WORKFLOW_STATUSES = WORKFLOW_STATUSES;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.PRIORITY_MAP = PRIORITY_MAP;
module.exports.SUBTASK_STATUSES = SUBTASK_STATUSES;