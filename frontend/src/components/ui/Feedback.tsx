import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

/* ---------------------------------------------------------------- Badge -- */

export type BadgeTone = "neutral" | "accent" | "warn" | "danger" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-hover text-muted border-line",
  accent: "bg-accent/12 text-accent-text border-accent/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  danger: "bg-danger/12 text-danger border-danger/30",
  info: "bg-info/12 text-info border-info/30",
};

export function Badge({
  tone = "neutral", icon, className = "", title, children,
}: {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center gap-1 shrink-0 rounded-full border",
        "px-2 py-0.5 text-[11px] font-medium leading-tight",
        BADGE_TONES[tone],
        className,
      ].join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Alert -- */

export type AlertTone = "info" | "success" | "warn" | "danger";

const ALERT_TONES: Record<AlertTone, { wrap: string; icon: React.ReactNode }> = {
  info: { wrap: "bg-info/8 border-info/25 text-info", icon: <Info size={15} /> },
  success: { wrap: "bg-accent/8 border-accent/25 text-accent-text", icon: <CheckCircle2 size={15} /> },
  warn: { wrap: "bg-warn/8 border-warn/25 text-warn", icon: <AlertTriangle size={15} /> },
  danger: { wrap: "bg-danger/8 border-danger/25 text-danger", icon: <XCircle size={15} /> },
};

/**
 * Inline status message. `title` carries the plain-language summary; body text
 * carries the detail. Errors are announced politely rather than assertively --
 * they follow a user action, so the user is already looking.
 */
export function Alert({
  tone = "info", title, action, className = "", children,
}: {
  tone?: AlertTone;
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const { wrap, icon } = ALERT_TONES[tone];
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${wrap} ${className}`}
    >
      <span className="shrink-0 mt-px" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-xs font-medium leading-snug">{title}</p>}
        {children && (
          <div className={`text-xs leading-relaxed text-secondary ${title ? "mt-1" : ""}`}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------- StatusIndicator -- */

export type StatusTone = "ok" | "warn" | "danger" | "idle" | "busy";

const STATUS_COLORS: Record<StatusTone, string> = {
  ok: "bg-accent",
  warn: "bg-warn",
  danger: "bg-danger",
  idle: "bg-faint",
  busy: "bg-info",
};

/** A dot plus a label. The dot alone never carries the meaning -- colour-blind
 *  users read the label, which is why `label` isn't optional. */
export function StatusIndicator({
  tone, label, pulse = false, className = "",
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted ${className}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${STATUS_COLORS[tone]}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${STATUS_COLORS[tone]}`} />
      </span>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------- Skeleton -- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden />;
}

/** Several skeleton lines with a ragged last line, which reads as text far
 *  better than a stack of identical bars. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-1/2" : "w-full"}`} />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- EmptyState -- */

export function EmptyState({
  icon, title, description, action, className = "", children,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`text-center px-6 py-10 ${className}`}>
      {icon && (
        <div
          className="mx-auto mb-3 w-10 h-10 rounded-lg bg-raised border border-line flex items-center justify-center text-faint"
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {children}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
