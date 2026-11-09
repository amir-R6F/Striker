import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BoltIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </Icon>
  );
}

export function PenIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 7.5 17 10" />
    </Icon>
  );
}

export function ChartIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4 4v16h16" />
      <path d="M8 15v-4M12 15V8M16 15v-6" />
    </Icon>
  );
}

export function CalendarCheckIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="m9 14.5 2 2 4-4" />
    </Icon>
  );
}

export function SlidersIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4 7h9M17 7h3M4 12h4M12 12h8M4 17h8M16 17h4" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="14" cy="17" r="2" />
    </Icon>
  );
}

export function ChevronDownIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronLeftIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="m15 5-7 7 7 7" />
    </Icon>
  );
}

export function ChevronRightIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

export function MinusIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function CheckIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function FlameIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M12 3c3.2 3.4 4.8 6 4.8 8.6A4.8 4.8 0 0 1 12 16.4a4.8 4.8 0 0 1-4.8-4.8C7.2 9 8.8 6.4 12 3z" />
      <path d="M12 16.4c1.4 1 1.8 2 1.1 3.1M12 19.5c-.7-1.1-.3-2.1 1.1-3.1" />
    </Icon>
  );
}

export function ClockIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function DownloadIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M12 4v10" />
      <path d="m7.5 10 4.5 4.5L16.5 10" />
      <path d="M5 19h14" />
    </Icon>
  );
}

export function SearchIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}

export function TreeIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M5 5v14M5 8h5M5 16h5" />
      <circle cx="5" cy="5" r="1.6" />
      <circle cx="15" cy="8" r="1.6" />
      <circle cx="15" cy="16" r="1.6" />
      <path d="M16.5 8h3M16.5 16h3" />
    </Icon>
  );
}

export function TrashIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </Icon>
  );
}

export function PencilIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    </Icon>
  );
}

export function LinkIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
    </Icon>
  );
}

export function FlagIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M6 21V4M6 4h9l-1.5 3L15 10H6" />
    </Icon>
  );
}

export function TrophyIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5H5.5A2.5 2.5 0 0 0 8 7.5M16 5h2.5A2.5 2.5 0 0 1 16 7.5" />
      <path d="M12 13v4M9.5 20h5M10 17h4" />
    </Icon>
  );
}

export function SparkIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="m12 2 2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />
    </Icon>
  );
}

export function InfoIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6M12 7.5h.01" />
    </Icon>
  );
}

export function ImageIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 18" />
    </Icon>
  );
}

export function FileIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M6 2.5h8l4 4V21H6z" />
      <path d="M14 2.5V7h4M9 12h6M9 16h6" />
    </Icon>
  );
}

export function PlusIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PlayIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M8 5.5v13l10-6.5z" />
    </Icon>
  );
}

export function PauseIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M9 5.5v13M15 5.5v13" />
    </Icon>
  );
}

export function RotateIcon({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4 5v5h5" />
      <path d="M5.5 14a7 7 0 1 0 1.2-7.5L4 10" />
    </Icon>
  );
}
