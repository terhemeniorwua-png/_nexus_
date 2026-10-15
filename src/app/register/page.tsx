"use client";

import "../landing.css";
import { GuestRoute } from "@/components/auth/RouteGuards";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { RegisterForm, RegisterFooter } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <GuestRoute>
      <AuthLayout
        title="Create your Nexus account"
        subtitle="Start collaborating with your team"
        footer={<RegisterFooter />}
      >
        <RegisterForm />
      </AuthLayout>
    </GuestRoute>
  );
}