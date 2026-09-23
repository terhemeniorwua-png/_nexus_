import { Suspense } from "react";
import NexusLogoIcon from "@/components/NexusLogo";
import { GradientMesh } from "@/components/landing/GradientMesh";
import { GetStarted } from "@/components/landing/GetStarted";
import { HeroPreview, Avatar } from "@/components/landing/HeroPreview";
import { Reveal } from "@/components/landing/Reveal";
import { TiltCard } from "@/components/landing/TiltCard";
import { DocIcon, BoardIcon, ChatIcon, SparkleIcon } from "@/components/landing/icons";
import "./landing.css";

const FEATURES = [
  {
    icon: DocIcon,
    accent: "text-indigo-300",
    title: "Docs",
    body: "Capture structured knowledge with live collaborative pages that stay permanently in sync.",
  },
  {
    icon: BoardIcon,
    accent: "text-violet-300",
    title: "Boards",
    body: "Visualize work across projects with flexible boards, cards, and progress you can trust.",
  },
  {
    icon: ChatIcon,
    accent: "text-sky-300",
    title: "Chat",
    body: "Move friction out of the way with realtime threads and presence that feel effortless.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-root relative flex min-h-dvh flex-col overflow-x-clip text-zinc-100">
      <GradientMesh />

      <header className="relative z-10 flex h-16 items-center justify-between border-b border-white/10 px-6">
        <span className="inline-flex items-center gap-2.5">
          <NexusLogoIcon size={28} />
          <span
            className="font-semibold tracking-tight text-zinc-50"
            style={{ fontSize: 20, lineHeight: 1 }}
          >
            Nexus
          </span>
        </span>
        <nav className="flex items-center gap-3">
          <Suspense fallback={null}>
            <GetStarted />
          </Suspense>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6 pb-28 pt-14 sm:pt-20">
        <section className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div className="text-center lg:text-left">
          

            <Reveal delay={80}>
              <h1 className="mt-7 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
                Everything your team needs,
                <br />
                <span className="text-primary">connected.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-zinc-400 sm:text-base lg:mx-0">
                Nexus is a secure workspace where teams manage work, share
                knowledge, and communicate in one calm, reliable place.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Suspense fallback={null}>
                  <GetStarted />
                </Suspense>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <div className="flex items-center">
                  <Avatar
                    name="Amara K"
                    gradient="bg-gradient-to-br from-indigo-400 to-violet-600"
                    size={28}
                  />
                  <Avatar
                    name="Luka Reyes"
                    gradient="bg-gradient-to-br from-rose-400 to-pink-600"
                    size={28}
                    online
                    className="-ml-2"
                  />
                  <Avatar
                    name="Priya Nair"
                    gradient="bg-gradient-to-br from-emerald-400 to-teal-600"
                    size={28}
                    className="-ml-2"
                  />
                  <Avatar
                    name="Tom Osei"
                    gradient="bg-gradient-to-br from-amber-400 to-orange-600"
                    size={28}
                    online
                    className="-ml-2"
                  />
                </div>
                <p className="text-sm text-zinc-500">
                  Trusted by{" "}
                  <span className="font-semibold text-zinc-300">2,400+ teams</span>{" "}
                  to ship together
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <TiltCard maxTilt={5} scale={1.01}>
              <HeroPreview />
            </TiltCard>
          </Reveal>
        </section>

        <section className="mt-28 grid gap-5 sm:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={index * 110}>
                <TiltCard maxTilt={10} className="hero-card h-full rounded-2xl p-6">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 ${feature.accent}`}
                  >
                    <Icon size={18} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {feature.body}
                  </p>
                </TiltCard>
              </Reveal>
            );
          })}
        </section>
      </main>
    </div>
  );
}