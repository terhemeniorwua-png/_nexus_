const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const DEFAULT_COLUMNS = [
  { name: "TO DO", position: 0 },
  { name: "IN PROGRESS", position: 1 },
  { name: "REVIEW", position: 2 },
  { name: "DONE", position: 3 },
];

const boardColumnSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Column name is required"],
      trim: true,
      maxlength: [60, "Column name cannot exceed 60 characters"],
    },
    position: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

applyTransforms(boardColumnSchema);

const BoardColumn = mongoose.model("BoardColumn", boardColumnSchema);

module.exports = BoardColumn;
module.exports.DEFAULT_COLUMNS = DEFAULT_COLUMNS;