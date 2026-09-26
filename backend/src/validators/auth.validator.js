const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordChecks = [
  { label: "at least 6 characters", test: (pw) => pw.length >= 6 }
  // ,
  // { label: "one uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  // { label: "one lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  // { label: "one number", test: (pw) => /\d/.test(pw) },
];

function describePasswordRequirement(pw) {
  const failed = passwordChecks.filter((check) => !check.test(pw));
  if (failed.length === 0) return null;
  const parts = failed.map((check) => check.label);
  return `Password must include ${parts.join(", ")}`;
}

function validateRegisterInput({ name, email, password, confirmPassword }) {
  if (!name || typeof name !== "string" || !name.trim()) {
    return { message: "Full name is required" };
  }
  if (name.trim().length < 2) {
    return { message: "Full name must be at least 2 characters" };
  }

  if (!email || typeof email !== "string" || !email.trim()) {
    return { message: "Email is required" };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { message: "Please enter a valid email address" };
  }

  if (!password && !confirmPassword) {
    return { message: "Password is required" };
  }
  if (typeof password !== "string" || password.length === 0) {
    return { message: "Password is required" };
  }
  const requirementMessage = describePasswordRequirement(password);
  if (requirementMessage) {
    return { message: requirementMessage };
  }

  if (!confirmPassword) {
    return { message: "Please confirm your password" };
  }
  if (password !== confirmPassword) {
    return { message: "Passwords do not match" };
  }

  return null;
}

function validateLoginInput({ email, password }) {
  if (!email || typeof email !== "string" || !email.trim()) {
    return { message: "Email is required" };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { message: "Please enter a valid email address" };
  }

  if (!password || typeof password !== "string" || password.length === 0) {
    return { message: "Password is required" };
  }

  return null;
}

module.exports = {
  validateRegisterInput,
  validateLoginInput,
};