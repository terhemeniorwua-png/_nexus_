"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useAuth } from "@/context/AuthContext";
import { validateLogin } from "@/lib/validation";
import { AuthInput } from "@/components/auth/AuthInput";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { resolvePersona } from "@/components/auth/personas";
import { MailIcon, LockIcon, GlobeIcon, CheckIcon } from "@/components/auth/AuthIcons";
import { Button } from "@/components/ui/Button";

const SIGNIN_ERROR_MESSAGES = {
  CredentialsSignin: "Invalid email or password",
  OAuthSignin: "Could not start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in did not complete. Please try again.",
  AccessDenied: "You do not have access to this account.",
  default: "Unable to sign you in. Please try again.",
};

const INSTITUTE_DOMAINS = (process.env.NEXT_PUBLIC_INSTITUTE_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().replace(/^\./, "").toLowerCase())
  .filter(Boolean);

const INSTITUTE_HINT = INSTITUTE_DOMAINS.length
  ? `Use an email ending in ${INSTITUTE_DOMAINS.map((d) => `@${d}`).join(" or ")}`
  : null;

export function LoginForm({ persona: personaProp }) {
  const persona = personaProp || resolvePersona(null);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const queryError = searchParams.get("error");
  const queryErrorMessage = queryError
    ? SIGNIN_ERROR_MESSAGES[queryError] || SIGNIN_ERROR_MESSAGES.default
    : null;

  function hasValidInstituteDomain(value) {
    if (INSTITUTE_DOMAINS.length === 0) return true;
    const domain = value.split("@")[1]?.toLowerCase() || "";
    return INSTITUTE_DOMAINS.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError(null);

    const { errors: fieldErrors, valid } = validateLogin(email, password);
    if (persona.type === "institute" && !hasValidInstituteDomain(email)) {
      fieldErrors.email =
        INSTITUTE_DOMAINS.length === 1
          ? `Use your institutional email (…@${INSTITUTE_DOMAINS[0]})`
          : "Use your institutional email";
    }
    setErrors(fieldErrors);
    if (!valid || fieldErrors.email) return;

    setSubmitting(true);
    try {
      // The real-time connection is opened by AuthProvider as soon as the
      // session exists, so it is not started here.
      await login(email, password);
      try {
        await signIn("credentials", {
          email,
          password,
          ...(persona.type === "team" && workspace ? { workspace } : {}),
          redirect: false,
        });
      } catch {
        /* NextAuth session is secondary — the backend cookie is already set */
      }
      router.replace("/dashboard");
    } catch (error) {
      setSubmitError(
        error?.status
          ? error.message
          : "Unable to sign in right now. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {queryErrorMessage && !submitError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
        >
          {queryErrorMessage}
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}

      <div className="space-y-5">
        <AuthInput
          id={`${persona.type}-email`}
          label={persona.emailLabel}
          type="email"
          autoComplete="email"
          placeholder={persona.emailPlaceholder}
          hint={persona.type === "institute" ? INSTITUTE_HINT : undefined}
          leadingIcon={<MailIcon />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={submitting}
        />

        {persona.showWorkspace && (
          <AuthInput
            id="login-workspace"
            label={persona.workspaceLabel}
            type="text"
            autoComplete="url"
            placeholder={persona.workspacePlaceholder}
            leadingIcon={<GlobeIcon />}
            value={workspace}
            onChange={(event) => setWorkspace(event.target.value)}
            disabled={submitting}
          />
        )}

        <div>
          <AuthInput
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            leadingIcon={<LockIcon />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            disabled={submitting}
          />

          <div className="mt-3 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="peer sr-only"
              />
              <span className="flex h-4 w-4 items-center justify-center rounded border border-white/20 bg-white/5 text-transparent transition-colors peer-checked:border-indigo-400 peer-checked:bg-indigo-500 peer-checked:text-oncolor">
                <CheckIcon size={10} />
              </span>
              <span className="text-sm text-zinc-400">Remember me</span>
            </label>

            <Link
              href="/forgot-password"
              className="rounded text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 focus-ring"
            >
              Forgot password?
            </Link>
          </div>
        </div>
      </div>

      {persona.type !== "institute" && (
        <div className="mt-7">
          <GoogleAuthButton onClick={() => signIn("google")} />
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-zinc-500">or continue with</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      )}

      <div className="transition-transform duration-300 hover:-translate-y-0.5">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </div>

      {persona.type === "institute" && (
        <div className="mt-5">
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-zinc-500">or use single sign-on</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <GoogleAuthButton
            label="Continue with SSO"
            onClick={() => signIn("google")}
          />
        </div>
      )}

      {persona.type === "team" && persona.showJoinTeam && (
        <button
          type="button"
          onClick={() => router.push("/register?type=team")}
          className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 focus-ring"
        >
          Join team workspace
        </button>
      )}
    </form>
  );
}

export function LoginFooter() {
  return (
    <>
      Don&apos;t have an account?{" "}
      <Link
        href="/register"
        className="rounded font-medium text-indigo-300 transition-colors hover:text-indigo-200 focus-ring"
      >
        Create an account
      </Link>
    </>
  );
}