import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. Keeps the label so the button
   *  doesn't change width mid-action. */
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Three tiers of intent, and nothing else:
 *   primary   -- the one action the screen is for (accent fill)
 *   secondary -- available, not urged (bordered)
 *   ghost     -- incidental (no chrome until hovered)
 * `danger` is secondary's destructive twin; `link` is inline text.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg font-medium hover:bg-accent-hover active:brightness-95 border border-transparent",
  secondary:
    "bg-raised text-secondary border border-line hover:bg-hover hover:text-primary active:brightness-95",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-hover hover:text-primary",
  danger:
    "bg-transparent text-danger border border-danger/35 hover:bg-danger/10 hover:border-danger/60",
  link: "bg-transparent text-accent-text border border-transparent hover:underline underline-offset-2 px-0 py-0",
};

/** Heights are 32 / 36 / 44px so touch targets clear 44px at `lg` and stay
 *  comfortable at `md`, which is the app default. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
};

/**
 * Note on `className`: use it for spacing and colour, not for `display`.
 * The base sets `inline-flex`, and a `hidden` passed here would lose to it on
 * stylesheet order rather than winning as you'd expect -- wrap the button in a
 * `hidden sm:block` element instead when you need to hide it responsively.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconRight,
    fullWidth,
    className = "",
    disabled,
    children,
    type = "button",
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center whitespace-nowrap transition-colors",
        "disabled:opacity-45 disabled:pointer-events-none",
        variant === "link" ? "" : SIZES[size],
        VARIANTS[variant],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === "sm" ? 13 : 15} className="animate-spin shrink-0" aria-hidden />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </button>
  );
});

export default Button;
