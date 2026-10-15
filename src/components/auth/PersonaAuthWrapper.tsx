"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm, LoginFooter } from "@/components/auth/LoginForm";
import { resolvePersona } from "@/components/auth/personas";
import { ArrowLeftIcon } from "@/components/auth/AuthIcons";

export function PersonaAuthWrapper() {
  const searchParams = useSearchParams();
  const persona = resolvePersona(searchParams.get("type"));

  return (
    <AuthLayout
      title={persona.title}
      subtitle={persona.subtitle}
      footer={<LoginFooter />}
    >
      <Link
        href="/?open=onboarding"
        className="mb-5 inline-flex items-center gap-1.5 rounded text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200 focus-ring"
      >
        <ArrowLeftIcon size={13} />
        Change account type
      </Link>

      <LoginForm persona={persona} />
    </AuthLayout>
  );
}