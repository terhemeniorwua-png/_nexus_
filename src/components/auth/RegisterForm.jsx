"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useAuth } from "@/context/AuthContext";
import { validateRegister } from "@/lib/validation";
import { AuthInput } from "@/components/auth/AuthInput";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { UserIcon, MailIcon, LockIcon, CheckIcon } from "@/components/auth/AuthIcons";
import { Button } from "@/components/ui/Button";

function PasswordRules({ rules }) {
  const visible = rules.some((rule) => rule.passed);
  if (!visible) return null;

  return (
    <ul className="mt-3 space-y-1.5" aria-label="Password requirements">
      {rules.map((rule) => (
        <li
          key={rule.key}
          className={`flex items-center gap-2 text-[13px] transition-colors ${
            rule.passed ? "text-emerald-300" : "text-zinc-500"
          }`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
              rule.passed ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/20"
            }`}
            aria-hidden="true"
          >
            {rule.passed && <CheckIcon size={10} className="text-emerald-300" />}
          </span>
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState({});
  const [passwordRules, setPasswordRules] = useState([]);
  const [termsError, setTermsError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePasswordChange(value) {
    setPassword(value);
    const { passwordRules: rules } = validateRegister({ name, email, password: value, confirmPassword });
    setPasswordRules(rules);
    if (password.length === 0 && value.length > 0) setErrors((prev) => ({ ...prev, password: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError(null);
    setTermsError(null);

    const { errors: fieldErrors, passwordRules: rules, valid } = validateRegister({
      name,
      email,
      password,
      confirmPassword,
    });
    setErrors(fieldErrors);
    setPasswordRules(rules);

    let termsValid = true;
    if (!termsAccepted) {
      termsValid = false;
      setTermsError("Please accept the terms to continue");
    }

    if (!valid || !termsValid) return;

    setSubmitting(true);
    try {
      await register({ name, email, password, confirmPassword });
      router.replace("/dashboard");
    } catch (error) {
      setSubmitError(error.message || "Unable to create your account right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {submitError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}

      <GoogleAuthButton onClick={() => signIn("google")} />
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-zinc-500">or sign up with email</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="space-y-5">
        <AuthInput
          id="register-name"
          label="Full name"
          type="text"
          autoComplete="name"
          placeholder="Jane Doe"
          leadingIcon={<UserIcon />}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          disabled={submitting}
        />

        <AuthInput
          id="register-email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          leadingIcon={<MailIcon />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={submitting}
        />

        <div>
          <AuthInput
            id="register-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            leadingIcon={<LockIcon />}
            value={password}
            onChange={(event) => handlePasswordChange(event.target.value)}
            error={errors.password}
            disabled={submitting}
          />
          <PasswordRules rules={passwordRules} />
        </div>

        <AuthInput
          id="register-confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          leadingIcon={<LockIcon />}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
          disabled={submitting}
        />
      </div>

      <div className="mt-5">
        <label className="flex cursor-pointer items-start gap-2.5 select-none">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            className="peer sr-only"
          />
          <span
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-transparent transition-colors peer-checked:text-white ${
              termsError
                ? "border-red-400/60"
                : "border-white/20"
            } peer-checked:border-indigo-400 peer-checked:bg-indigo-500`}
          >
            <CheckIcon size={10} />
          </span>
          <span className="text-sm leading-relaxed text-zinc-400">
            I agree to the{" "}
            <span className="font-medium text-zinc-300 underline decoration-white/20 underline-offset-2">
              Terms of Service
            </span>{" "}
            and{" "}
            <span className="font-medium text-zinc-300 underline decoration-white/20 underline-offset-2">
              Privacy Policy
            </span>
          </span>
        </label>
        {termsError && (
          <p className="mt-1.5 text-sm text-red-400" role="alert">
            {termsError}
          </p>
        )}
      </div>

      <div className="mt-7 transition-transform duration-300 hover:-translate-y-0.5">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={submitting}
        >
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}

export function RegisterFooter() {
  return (
    <>
      Already have an account?{" "}
      <Link
        href="/login"
        className="rounded font-medium text-indigo-300 transition-colors hover:text-indigo-200 focus-ring"
      >
        Sign in
      </Link>
    </>
  );
}