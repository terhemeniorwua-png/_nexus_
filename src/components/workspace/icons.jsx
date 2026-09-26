const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ size = 18, className = "", children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export function GridIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" {...stroke} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" {...stroke} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" {...stroke} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" {...stroke} />
    </Svg>
  );
}

export function BoardIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="7" height="16" rx="1.5" {...stroke} />
      <rect x="12.5" y="4" width="7" height="10" rx="1.5" {...stroke} />
      <rect x="12.5" y="16.5" width="7" height="3.5" rx="1" {...stroke} />
    </Svg>
  );
}

export function DocIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 3h8l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" {...stroke} />
      <path d="M14 3v4h4" {...stroke} />
      <path d="M8.5 12h7M8.5 16h7" {...stroke} />
    </Svg>
  );
}

export function ChatIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" {...stroke} />
      <path d="M8 12h.01M12 12h.01M16 12h.01" {...stroke} strokeWidth={2.4} />
    </Svg>
  );
}

export function BellIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2.5 6.5H3.5C4.5 14.5 6 13 6 9Z" {...stroke} />
      <path d="M10.2 19a2 2 0 0 0 3.6 0" {...stroke} />
    </Svg>
  );
}

export function PlusIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </Svg>
  );
}

export function SearchIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" {...stroke} />
      <path d="m20 20-3.5-3.5" {...stroke} />
    </Svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="m14.5 6-6 6 6 6" {...stroke} />
    </Svg>
  );
}

export function TrashIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" {...stroke} />
      <path d="M10 11v6M14 11v6" {...stroke} />
    </Svg>
  );
}

export function EditIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l11-11-4-4L4 16v4Z" {...stroke} />
      <path d="m13 6 4 4" {...stroke} />
    </Svg>
  );
}

export function ClockIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M12 7v5l3 2" {...stroke} />
    </Svg>
  );
}

export function FlagIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 21V4m0 0c3.5-1.5 6.5 1.5 13-1v11c-6 2-9-1-13 1" {...stroke} />
    </Svg>
  );
}

export function TagIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-8 8-10-8Z" {...stroke} />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </Svg>
  );
}

export function UsersIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" {...stroke} />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" {...stroke} />
      <path d="M16 5a3.5 3.5 0 0 1 0 7M18.5 14.5A6 6 0 0 1 21.5 20" {...stroke} />
    </Svg>
  );
}

export function TeamIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="7" r="3" {...stroke} />
      <circle cx="16" cy="9" r="2.5" {...stroke} />
      <path d="M2.5 18.5a5.5 5.5 0 0 1 11 0" {...stroke} />
      <path d="M14 14.5a4.5 4.5 0 0 1 6 3" {...stroke} />
      <circle cx="8" cy="14" r="2" {...stroke} />
    </Svg>
  );
}

export function CheckIcon(props) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" {...stroke} strokeWidth={2} />
    </Svg>
  );
}

export function XIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" {...stroke} />
    </Svg>
  );
}

export function SendIcon(props) {
  return (
    <Svg {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" {...stroke} strokeWidth={1.7} />
      <path d="M22 2 11 13" {...stroke} />
    </Svg>
  );
}

export function CalendarIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="16" rx="2" {...stroke} />
      <path d="M8 3v4M16 3v4M4 9h16" {...stroke} />
    </Svg>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" {...stroke} />
    </Svg>
  );
}

export function SparkIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...stroke} />
    </Svg>
  );
}

export function ActivityIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 12h4l2.5-7 5 14 2.5-7H21" {...stroke} />
    </Svg>
  );
}

export function LogOutIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...stroke} />
    </Svg>
  );
}

export function DotsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </Svg>
  );
}

export function MailIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} />
      <path d="m4 7 8 6 8-6" {...stroke} />
    </Svg>
  );
}

export function HashIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16" {...stroke} />
    </Svg>
  );
}

export function HomeIcon(props) {
  return (
    <Svg {...props}>
      <path d="m3 11 9-8 9 8" {...stroke} />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" {...stroke} />
    </Svg>
  );
}

export function ListTasksIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" {...stroke} />
      <path d="M9 8h6M9 12h6M9 16h3.5" {...stroke} />
    </Svg>
  );
}
// --- Phase 22 knowledge base -------------------------------------------------
// Same hand-rolled set as the icons above, so the Knowledge Base uses the icon
// language the product already speaks instead of a second library.

export function BookIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h4.5A1.5 1.5 0 0 1 20 5.5v12a1.5 1.5 0 0 1-1.5 1.5H14a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 17.5Z" {...stroke} />
      <path d="M12 5v14" {...stroke} />
    </Svg>
  );
}

export function FileTextIcon(props) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" {...stroke} />
      <path d="M14 3v5h5" {...stroke} />
      <path d="M9 13h6M9 17h4" {...stroke} />
    </Svg>
  );
}

export function FileIcon(props) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" {...stroke} />
      <path d="M14 3v5h5" {...stroke} />
    </Svg>
  );
}

export function NetworkIcon(props) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="5" rx="1.2" {...stroke} />
      <rect x="3" y="16" width="6" height="5" rx="1.2" {...stroke} />
      <rect x="15" y="16" width="6" height="5" rx="1.2" {...stroke} />
      <path d="M12 8v4M6 16v-2h12v2" {...stroke} />
    </Svg>
  );
}

export function FlaskIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3" {...stroke} />
      <path d="M9 3h6" {...stroke} />
      <path d="M7.4 15h9.2" {...stroke} />
    </Svg>
  );
}

export function GithubIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9 19c-4 1.4-4-2.2-6-2.7m12 5.2v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.5 3 5.5 3.3 5.5 3.3a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.8c0 4.6 2.8 5.6 5.5 6a3 3 0 0 0-.8 2.2V21" {...stroke} />
    </Svg>
  );
}

export function LinkIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.7 6.6" {...stroke} />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.6-1.6" {...stroke} />
    </Svg>
  );
}

export function ExternalLinkIcon(props) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6" {...stroke} />
      <path d="M20 4 11 13" {...stroke} />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" {...stroke} />
    </Svg>
  );
}

export function ArchiveIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="4.5" rx="1.3" {...stroke} />
      <path d="M5 8.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5" {...stroke} />
      <path d="M10 12.5h4" {...stroke} />
    </Svg>
  );
}

// --- Phase 23 shell ----------------------------------------------------------
// The workspace shell hides its sidebar below the md breakpoint, so the header
// needs a way to open it again. Same hand-rolled set as the icons above.

export function MenuIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" {...stroke} />
    </Svg>
  );
}

export function SettingsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.63.71 1.09 1.51 1H21a2 2 0 1 1 0 4h-.09c-.8 0-1.37.46-1.51 1Z"
        {...stroke}
      />
    </Svg>
  );
}
