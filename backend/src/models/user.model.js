const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const ROLES = ["OWNER", "ADMIN", "PROJECT_MANAGER", "MEMBER", "VIEWER", "COLLABORATOR"];
const DEFAULT_ROLE = "MEMBER";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    avatar: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Avatar URL cannot exceed 500 characters"],
    },
    role: {
      type: String,
      enum: ROLES,
      default: DEFAULT_ROLE,
    },
    // Phase 23 — when the password last changed, so a session that was issued
    // before it can be refused. Null means "never changed since signup", which
    // is the same as the account's creation time for this purpose.
    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();

  const saltRounds = Number(process.env.SALT_ROUNDS) || 10;
  this.password = await bcrypt.hash(this.password, saltRounds);
  // Truncated to whole seconds so it can be compared against a JWT's `iat`,
  // which has second resolution. Without this a token minted in the same second
  // as a password change could be read as older than the change and refused.
  this.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    // Session bookkeeping, not profile data — it is compared against a token's
    // `iat` in the authenticate middleware and has no business in any payload.
    delete ret.passwordChangedAt;
    return ret;
  },
});

userSchema.set("toObject", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.passwordChangedAt;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
module.exports.ROLES = ROLES;
module.exports.DEFAULT_ROLE = DEFAULT_ROLE;