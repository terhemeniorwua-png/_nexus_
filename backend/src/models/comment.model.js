const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const commentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
      maxlength: [5000, "Comment cannot exceed 5000 characters"],
    },
  },
  { timestamps: true }
);

commentSchema.index({ taskId: 1, createdAt: 1 });
commentSchema.index({ projectId: 1, createdAt: 1 });
commentSchema.index({ userId: 1 });

commentSchema.pre("validate", function ensureParent(next) {
  if (!this.projectId && !this.taskId) {
    const error = new Error(
      "A comment must belong to either a project or a task"
    );
    error.name = "ValidationError";
    return next(error);
  }
  next();
});

applyTransforms(commentSchema);

const Comment = mongoose.model("Comment", commentSchema);

module.exports = Comment;