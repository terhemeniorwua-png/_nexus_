// Thin-line dual-tone inline SVG icons for the landing page hero.
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function base({ size = 16, className = "" }, children) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      {...STROKE}
    >
      {children}
    </svg>
  );
}

export function DocIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
      <path d="M9 9h1.5" className="text-indigo-400" />
    </>
  ));
}

export function BoardIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" className="text-indigo-400" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" className="text-violet-400" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ));
}

export function ChatIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.9-5.1A8.5 8.5 0 1 1 20.5 11.5Z" />
      <path d="M8 12h8" className="text-indigo-400" />
      <path d="M8 15.5h5" className="text-violet-400" />
    </>
  ));
}

export function SparkleIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
  ));
}

export function CheckIcon({ size = 16, className = "" }) {
  return base({ size, className }, <path d="M5 12l4.5 4.5L19 7" />);
}

export function ImageIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" className="text-indigo-400" />
      <path d="M21 16.5l-5-5-9 9" />
    </>
  ));
}