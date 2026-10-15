"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PageLoader } from "./Loader";

interface RouteGuardProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: RouteGuardProps) {
  const { loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return <PageLoader label="Checking your session…" />;
  }

  return <>{children}</>;
}

export function GuestRoute({ children }: RouteGuardProps) {
  const { loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [loading, isAuthenticated, router]);

  if (loading || isAuthenticated) {
    return <PageLoader label="Please wait…" />;
  }

  return <>{children}</>;
}