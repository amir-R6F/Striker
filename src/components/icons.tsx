import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
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

export function FlameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3c1.8 3.2.2 4.6-.8 6.2-1 1.5-.8 3.1.6 4.1.8-1.1 1.3-2.3 1.4-3.6 2.2 2 3.8 4.1 3.8 6.3A5 5 0 0 1 12 21a5 5 0 0 1-5-5c0-2.2 1.4-4.2 3.2-5.8C11.7 8.8 12.7 6.4 12 3Z" />
    </Icon>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />
    </Icon>
  );
}

export function EllipsisIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12 4 4L19 6" />
    </Icon>
  );
}

export function CollapseAllIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4 4 8l4 4M4 8h7M16 20l4-4-4-4M20 16h-7" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}
