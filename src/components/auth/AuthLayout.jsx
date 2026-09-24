import Link from "next/link";
import NexusLogoIcon from "@/components/NexusLogo";
import { GradientMesh } from "@/components/landing/GradientMesh";

export function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="landing-root relative flex h-dvh flex-col items-center overflow-y-auto px-4 py-12 text-zinc-100">
      <GradientMesh />

      <div className="relative z-10 my-auto flex flex-col items-center">
        <div className="mb-8 flex justify-center">
        <Link
          href="/"
          aria-label="Back to welcome page"
          className="inline-flex items-center gap-2.5 focus-ring rounded-lg"
        >
          <span className="inline-flex items-center gap-2.5">
            <NexusLogoIcon size={36} />
            <span
              className="font-semibold tracking-tight text-zinc-50"
              style={{ fontSize: 26, lineHeight: 1 }}
            >
              Nexus
            </span>
          </span>
        </Link>
      </div>

      <div className="hero-card relative z-10 mb-auto w-full max-w-[420px] rounded-2xl border border-white/10 p-7 sm:p-9">
        <header className="mb-7">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-zinc-400">{subtitle}</p>}
        </header>

        {children}

        {footer && (
          <div className="mt-7 border-t border-white/10 pt-5 text-center text-sm text-zinc-400">
            {footer}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}