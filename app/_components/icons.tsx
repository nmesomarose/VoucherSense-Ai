"use client";

interface IconProps {
  size?: number;
  className?: string;
}

function baseProps({ size = 20, className }: IconProps): { width: number; height: number; viewBox: string; fill: "none"; stroke: "currentColor"; strokeWidth: number; strokeLinecap: "round"; strokeLinejoin: "round"; className?: string } {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  };
}

export function ReceiptIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3L21 21V3l-2 1.3L17 3l-2 1.3L13 3l-2 1.3L9 3 7 4.3 5 3Z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  );
}

export function UploadIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m6 10 6-6 6 6" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function AlertIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function InfoIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function XCircleIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ClockIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function SparklesIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M9.9 4.5a.5.5 0 0 0-.95 0l-1.4 4.1a.5.5 0 0 1-.3.3l-4.1 1.4a.5.5 0 0 0 0 .95l4.1 1.4c.15.05.25.16.3.3l1.4 4.1a.5.5 0 0 0 .95 0l1.4-4.1a.5.5 0 0 1 .3-.3l4.1-1.4a.5.5 0 0 0 0-.95l-4.1-1.4a.5.5 0 0 1-.3-.3Z" />
      <path d="M19 15.5v2" />
      <path d="M19 21.5v.01" />
    </svg>
  );
}

export function EyeIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function TrashIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...baseProps(props)} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}