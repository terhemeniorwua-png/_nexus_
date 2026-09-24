const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const { validateRegisterInput, validateLoginInput } = require("../validators/auth.validator");
const { COOKIE_NAME } = require("../middleware/authenticate");

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "3d",
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
}

async function register(req, res, next) {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    const validationError = validateRegisterInput({ name, email, password, confirmPassword });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError.message });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    let user;
    try {
      user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }
      throw err;
    }

    const token = signToken(user._id);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    const validationError = validateLoginInput({ email, password });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError.message });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = signToken(user._id);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      message: "Signed in successfully",
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  clearAuthCookie(res);
  return res.json({
    success: true,
    message: "Signed out successfully",
  });
}

async function forgotPassword(req, res, next) {
  const genericMessage =
    "If an account exists for that email, password reset instructions have been sent.";
  const RESET_LINK_TTL_MINUTES = 30;

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Never reveal whether an account exists.
    if (!looksValid) {
      return res.json({ success: true, message: genericMessage });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: true, message: genericMessage });
    }

    const token = jwt.sign({ purpose: "password-reset", userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: `${RESET_LINK_TTL_MINUTES}m`,
    });

    // No mailer is configured in this build — surface the link in development
    // and silently no-op in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[nexus] Password reset for ${email} (expires in ${RESET_LINK_TTL_MINUTES} min): ` +
          `${process.env.CLIENT_URL || "http://localhost:3000"}/reset-password?token=${token}`
      );
    }

    return res.json({ success: true, message: genericMessage });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    return res.json({ success: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  me,
};