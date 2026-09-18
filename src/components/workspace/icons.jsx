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