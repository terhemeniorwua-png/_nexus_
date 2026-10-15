"use client";

import { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import Link from "next/link";
import apiRequest from "@/lib/api";
import { validateEmail } from "@/lib/validation";
import { AuthInput } from "@/components/auth/AuthInput";
import { MailIcon, CheckIcon, ArrowLeftIcon } from "@/components/auth/AuthIcons";
import { Button } from "@/components/ui/Button";

interface BackToLoginLinkProps {
  className?: string;
}

function BackToLoginLink({ className = "" }: BackToLoginLinkProps) {
  return (
    <Link
      href="/login"
      className={`inline-flex items-center gap-1.5 rounded text-sm text-zinc-400 transition-colors hover:text-zinc-100 focus-ring ${className}`}
    >
      <ArrowLeftIcon size={15} />
      Back to login
    </Link>
  );
}

interface SuccessViewProps {
  email: string;
}

function SuccessView({ email }: SuccessViewProps) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
        <CheckIcon size={24} />
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-50">
        Check your inbox
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
        If an account exists for{" "}
        <span className="font-medium text-zinc-200">{email}</span>, a reset link
        has been sent. If you don&apos;t see it, check your spam folder.
      </p>
      <div className="mt-7">
        <BackToLoginLink />
      </div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailError = validateEmail(email);
    setError(emailError);
    if (emailError) return;

    setSubmitting(true);
    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
    } catch {
      // Never reveal whether an account exists.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return <SuccessView email={email} />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="mb-5 text-sm leading-relaxed text-zinc-400">
        Enter the email address associated with your account and we&apos;ll send
        you a link to reset your password.
      </p>

      <AuthInput
        id="forgot-email"
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        leadingIcon={<MailIcon />}
        value={email}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        error={error}
        disabled={submitting}
      />

      <div className="mt-7 transition-transform duration-300 hover:-translate-y-0.5">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={submitting}
        >
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </div>

      <div className="mt-6 flex justify-center">
        <BackToLoginLink />
      </div>
    </form>
  );
}