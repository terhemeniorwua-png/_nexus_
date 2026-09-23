import { DocIcon, CheckIcon, ImageIcon } from "@/components/landing/icons";

const AVATAR_GRADIENTS = [
  "bg-gradient-to-br from-indigo-400 to-violet-600",
  "bg-gradient-to-br from-rose-400 to-pink-600",
  "bg-gradient-to-br from-emerald-400 to-teal-600",
  "bg-gradient-to-br from-amber-400 to-orange-600",
];

export function Avatar({
  name,
  gradient = AVATAR_GRADIENTS[0],
  size = 24,
  online = false,
  className = "",
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-oncolor ${gradient} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="hero-ping-dot absolute h-full w-full rounded-full bg-emerald-400" />
          <span className="relative h-2.5 w-2.5 rounded-full border-2 border-[var(--page)] bg-emerald-400" />
        </span>
      )}
    </span>
  );
}

function StatusPill({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="hero-ping-dot absolute h-full w-full rounded-full bg-emerald-400" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {label}
    </span>
  );
}

function NotionBlocks() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
        <span className="text-xs text-zinc-300">Draft Q3 launch checklist</span>
      </div>
      <div className="flex items-center gap-2 pl-4">
        <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-indigo-400" />
        <span className="text-xs text-zinc-400">Finalize hero sections</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-indigo-500/20 text-indigo-300">
          <CheckIcon size={11} />
        </span>
        <span className="text-xs text-zinc-300">Ship onboarding flow</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-white/5 text-violet-300">
          <ImageIcon size={11} />
        </span>
        <span className="flex h-6 w-16 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500/40 to-violet-500/40 text-[8px] text-zinc-300">
          hero.png
        </span>
      </div>
    </div>
  );
}

function NotionPanel() {
  return (
    <div
      className="absolute left-0 top-9 z-0"
      style={{ transform: "rotateX(8deg) rotateY(-6deg) rotate(-6deg)" }}
    >
      <div className="hero-card hero-float-slow w-56 rounded-2xl p-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <DocIcon size={15} className="text-indigo-300" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight text-zinc-100">
              Product brief
            </p>
            <p className="text-[10px] text-zinc-500">Edited 2m ago · 4 viewing</p>
          </div>
        </div>
        <div className="mt-3">
          <NotionBlocks />
        </div>
      </div>
    </div>
  );
}

function TrelloCard() {
  return (
    <div
      className="absolute left-[calc(50%_-_9.375rem)] top-24 z-20"
      style={{ transform: "rotateX(5deg) rotateY(3deg)" }}
    >
      <div className="hero-card hero-float w-[300px] rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
              Sprint 24
            </span>
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
              Design
            </span>
          </div>
          <StatusPill label="Live" />
        </div>
        <h4 className="mt-3 text-[15px] font-semibold leading-snug text-zinc-50">
          Polish the Nexus landing page
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Launch the new hero with glass previews and 3D tilt.
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500">
          <span>72% complete</span>
          <span>12 / 16 tasks</span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <div className="flex items-center">
            <Avatar name="Amara K" gradient={AVATAR_GRADIENTS[0]} size={24} online />
            <Avatar name="Luka Reyes" gradient={AVATAR_GRADIENTS[1]} size={24} online className="-ml-1.5" />
            <Avatar name="Priya Nair" gradient={AVATAR_GRADIENTS[2]} size={24} className="-ml-1.5" />
            <Avatar name="Tom Osei" gradient={AVATAR_GRADIENTS[3]} size={24} className="-ml-1.5" />
          </div>
          <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-zinc-300">
            Due Fri
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatRow({ name, time, text, gradient, online }) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={name} gradient={gradient} size={24} online={online} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-zinc-200">{name}</span>
          <span className="text-[9px] text-zinc-600">{time}</span>
        </div>
        <p className="text-xs leading-relaxed text-zinc-400">{text}</p>
      </div>
    </div>
  );
}

function SlackPanel() {
  return (
    <div
      className="absolute bottom-6 right-0 z-10"
      style={{ transform: "rotateX(7deg) rotateY(5deg) rotate(6deg)" }}
    >
      <div className="hero-card hero-float-delayed w-60 rounded-2xl p-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <p className="text-[13px] font-semibold text-zinc-100">#launch</p>
          <StatusPill label="Online" />
        </div>
        <div className="mt-3 space-y-3">
          <ChatRow
            name="Amara"
            time="2m"
            text="just pushed the new hero preview ✨"
            gradient={AVATAR_GRADIENTS[0]}
            online
          />
          <ChatRow
            name="Kwame"
            time="1m"
            text="Love the glass cards 👌"
            gradient={AVATAR_GRADIENTS[3]}
            online
          />
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-500">
          Reply…
        </div>
      </div>
    </div>
  );
}

function ViewerBadge() {
  return (
    <div
      className="absolute right-[4%] top-2 z-30"
      style={{ transform: "translateZ(60px)" }}
    >
      <div className="hero-card flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3">
        <div className="flex items-center">
          <Avatar name="Amara K" gradient={AVATAR_GRADIENTS[0]} size={22} online />
          <Avatar name="Luka Reyes" gradient={AVATAR_GRADIENTS[1]} size={22} className="-ml-1.5" />
          <Avatar name="Tom Osei" gradient={AVATAR_GRADIENTS[3]} size={22} online className="-ml-1.5" />
        </div>
        <div className="text-left">
          <p className="text-[11px] font-semibold leading-tight text-zinc-100">
            14 viewing
          </p>
          <p className="text-[9px] leading-tight text-zinc-500">All synced live</p>
        </div>
      </div>
    </div>
  );
}

export function HeroPreview() {
  return (
    <div className="hero-perspective relative mx-auto w-full max-w-[560px]">
      <div className="hero-stage relative h-[460px] w-full">
        <NotionPanel />
        <TrelloCard />
        <SlackPanel />
        <ViewerBadge />
      </div>
    </div>
  );
}