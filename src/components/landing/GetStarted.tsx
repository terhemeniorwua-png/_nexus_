"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserTypeSelector } from "./UserTypeSelector";
import { PersonaAuthView } from "./PersonaAuthView";
import { resolvePersona } from "@/components/auth/personas";

const STEP = {
  WELCOME: "welcome",
  PERSONA_SELECTION: "persona_selection",
  AUTH_FORM: "auth_form",
};

export interface GetStartedProps {
  children?: string;
  className?: string;
}

export function GetStarted({
  children = "Get Started",
  className = "inline-flex h-11 items-center justify-center rounded md:rounded-lg bg-primary px-10 md:px-6 text-2xl md:text-sm font-medium text-oncolor transition-colors hover:bg-blue-700 focus-ring",
}: GetStartedProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<string>(STEP.WELCOME);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  const autoOpen = !dismissed && searchParams.get("open") === "onboarding";
  const currentStep =
    step === STEP.AUTH_FORM
      ? STEP.AUTH_FORM
      : step === STEP.PERSONA_SELECTION || autoOpen
        ? STEP.PERSONA_SELECTION
        : STEP.WELCOME;

  const persona = resolvePersona(selectedPersona);

  function openSelector() {
    if (currentStep !== STEP.WELCOME) return;
    setDismissed(false);
    setStep(STEP.PERSONA_SELECTION);
  }

  function handleSelect(type: string) {
    if (currentStep !== STEP.PERSONA_SELECTION) return;
    setSelectedPersona(type);
    setStep(STEP.AUTH_FORM);
  }

  function handleBackToWelcome() {
    if (currentStep !== STEP.PERSONA_SELECTION) return;
    setSelectedPersona(null);
    setDismissed(true);
    setStep(STEP.WELCOME);
    router.replace("/", { scroll: false });
  }

  function handleChangeAccountType() {
    if (currentStep !== STEP.AUTH_FORM) return;
    setSelectedPersona(null);
    setStep(STEP.PERSONA_SELECTION);
  }

  function handleClose() {
    setSelectedPersona(null);
    setDismissed(true);
    setStep(STEP.WELCOME);
    router.replace("/", { scroll: false });
  }

  return (
    <>
      <button type="button" onClick={openSelector} className={className}>
        {children}
      </button>

      {currentStep === STEP.PERSONA_SELECTION && (
        <UserTypeSelector
          onSelect={handleSelect}
          onBack={handleBackToWelcome}
          onClose={handleClose}
        />
      )}

      {currentStep === STEP.AUTH_FORM && (
        <PersonaAuthView
          persona={persona}
          onChangeType={handleChangeAccountType}
          onClose={handleClose}
        />
      )}
    </>
  );
}