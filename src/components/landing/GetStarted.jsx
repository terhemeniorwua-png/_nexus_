"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TiltCard } from "./TiltCard";
import { UserTypeSelector } from "./UserTypeSelector";
import { PersonaAuthView } from "./PersonaAuthView";
import { resolvePersona } from "@/components/auth/personas";

const STEP = {
  WELCOME: "welcome",
  PERSONA_SELECTION: "persona_selection",
  AUTH_FORM: "auth_form",
};

export function GetStarted({
  children = "Get Started",
  className = "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-white shadow-[0_8px_30px_rgba(37,99,235,0.45)] transition-[background-color,transform] hover:bg-blue-700 hover:scale-y-95 focus-ring",
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(STEP.WELCOME);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [dismissed, setDismissed] = useState(false);

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

  function handleSelect(type) {
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
      <TiltCard maxTilt={0} magnetic scale={1.05}>
        <button type="button" onClick={openSelector} className={className}>
          {children}
        </button>
      </TiltCard>

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