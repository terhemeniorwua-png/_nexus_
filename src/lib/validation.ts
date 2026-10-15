const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PasswordRule {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

export interface PasswordRuleState extends Omit<PasswordRule, "test"> {
  passed: boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: "length", label: "At least 6 characters", test: (pw) => pw.length >= 6 },
  { key: "uppercase", label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lowercase", label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "number", label: "One number", test: (pw) => /\d/.test(pw) },
  { key: "special", label: "One special character", test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

function passwordRuleState(pw: string): PasswordRuleState[] {
  return PASSWORD_RULES.map(({ key, label, test }) => ({ key, label, passed: test(pw) }));
}

function passwordErrorMessage(pw: string): string | null {
  const failed = PASSWORD_RULES.filter((rule) => !rule.test(pw));
  if (failed.length === 0) return null;
  return `Password must include ${failed.map((rule) => rule.label.toLowerCase()).join(", ")}`;
}

export function validateEmail(email?: string | null): string | null {
  if (!email) return "Email is required";
  if (!EMAIL_REGEX.test(email)) return "Please enter a valid email address";
  return null;
}

export interface LoginErrors {
  email: string | null;
  password?: string | null;
}

export function validateLogin(
  email?: string | null,
  password?: string | null
): { errors: LoginErrors; valid: boolean } {
  const errors: LoginErrors = { email: validateEmail(email) };
  if (!password) errors.password = "Password is required";
  return {
    errors,
    valid: Object.values(errors).every((err) => !err),
  };
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterErrors {
  name?: string;
  email?: string | null;
  password?: string;
  confirmPassword?: string;
}

export function validateRegister({
  name,
  email,
  password,
  confirmPassword,
}: RegisterInput): {
  errors: RegisterErrors;
  passwordRules: PasswordRuleState[];
  valid: boolean;
} {
  const errors: RegisterErrors = {};

  if (!name.trim()) errors.name = "Full name is required";
  else if (name.trim().length < 2) errors.name = "Full name must be at least 2 characters";

  errors.email = validateEmail(email);

  if (!password) {
    errors.password = "Password is required";
  } else {
    const requirementError = passwordErrorMessage(password);
    if (requirementError) errors.password = requirementError;
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return {
    errors,
    passwordRules: password ? passwordRuleState(password) : PASSWORD_RULES.map(({ key, label }) => ({ key, label, passed: false })),
    valid: Object.values(errors).every((err) => !err),
  };
}

export { PASSWORD_RULES };
