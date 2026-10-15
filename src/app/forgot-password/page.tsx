"use client";

import "../landing.css";
import { GuestRoute } from "@/components/auth/RouteGuards";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <GuestRoute>
      <AuthLayout
        title="Reset your password"
        subtitle="We'll email you a link to get back in"
      >
        <ForgotPasswordForm />
      </AuthLayout>
    </GuestRoute>
  );
}