function jsonTransform(_doc, ret) {
  if (ret._id) {
    ret.id = ret._id.toString();
  }
  if (ret.__v !== undefined) delete ret.__v;
  delete ret._id;
  return ret;
}

function applyTransforms(schema) {
  schema.set("toJSON", { transform: jsonTransform });
  schema.set("toObject", { transform: jsonTransform });
}

module.exports = { applyTransforms };