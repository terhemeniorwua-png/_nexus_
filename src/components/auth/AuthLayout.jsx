import NexusLogoIcon from "@/components/NexusLogo";
import { GradientMesh } from "@/components/landing/GradientMesh";

export function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="landing-root relative flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-zinc-100">
      <GradientMesh />

      <div className="relative z-10 mb-8 flex justify-center">
        <span className="inline-flex items-center gap-2.5">
          <NexusLogoIcon size={36} />
          <span
            className="font-semibold tracking-tight text-zinc-50"
            style={{ fontSize: 26, lineHeight: 1 }}
          >
            Nexus
          </span>
        </span>
      </div>

      <div className="hero-card relative z-10 w-full max-w-[420px] rounded-2xl border border-white/10 p-7 sm:p-9">
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
  );
}