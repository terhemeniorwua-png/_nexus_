// Thin-line inline SVG icons for the auth pages.
function base({ size = 16, className = "" }, children) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function MailIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ));
}

export function LockIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ));
}

export function UserIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-3.6 4.3-6 8-6s6.8 2.4 8 6" />
    </>
  ));
}

export function CheckIcon({ size = 16, className = "" }) {
  return base({ size, className }, <path d="M5 12.5l4.5 4.5L19 7" />);
}

export function ArrowLeftIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ));
}

export function ArrowRightIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ));
}

export function UsersIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
    </>
  ));
}

export function GraduationIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <path d="M22 9 12 4 2 9l10 5 10-5Z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
      <path d="M22 9v4" />
    </>
  ));
}

export function GlobeIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18Z" />
    </>
  ));
}

export function XIcon({ size = 16, className = "" }) {
  return base({ size, className }, (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ));
}