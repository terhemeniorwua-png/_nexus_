"use client";

import { Suspense } from "react";
import "../landing.css";
import { GuestRoute } from "@/components/auth/RouteGuards";
import { PersonaAuthWrapper } from "@/components/auth/PersonaAuthWrapper";

export default function LoginPage() {
  return (
    <GuestRoute>
      <Suspense fallback={null}>
        <PersonaAuthWrapper />
      </Suspense>
    </GuestRoute>
  );
}