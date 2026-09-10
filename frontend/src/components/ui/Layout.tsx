/* ----------------------------------------------------------------- Card -- */

export function Card({
  className = "", children, ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-line bg-panel ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title, description, action, className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 px-4 py-3.5 border-b border-border-subtle ${className}`}>
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-primary">{title}</h3>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------- SectionHeading -- */

/** The one section label style: small, uppercase, faint. Used above every
 *  group of content so scanning a page feels the same everywhere. */
export function SectionHeading({
  action, className = "", children,
}: {
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</h2>
      {action}
    </div>
  );
}

/* ----------------------------------------------------- SegmentedControl -- */

interface SegmentedControlProps<T extends string> {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  /** Labels the group for screen readers, e.g. "Result view". */
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/** Two-or-three-way view switch (table/chart, dark/light). Uses radio
 *  semantics so arrow keys move between options the way users expect. */
export function SegmentedControl<T extends string>({
  value, options, onChange, label, size = "sm", className = "",
}: SegmentedControlProps<T>) {
  const pad = size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3 text-sm";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-md border border-line bg-raised ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded transition-colors ${pad} ${
              selected
                ? "bg-accent/15 text-accent-text font-medium"
                : "text-muted hover:text-primary hover:bg-hover"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Tabs -- */

export function Tabs<T extends string>({
  value, options, onChange, label, className = "",
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex items-center gap-1 border-b border-line ${className}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`relative px-3 py-2 text-sm transition-colors -mb-px border-b-2 ${
              selected
                ? "text-primary border-accent font-medium"
                : "text-muted border-transparent hover:text-secondary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
