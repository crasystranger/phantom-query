import { useEffect, useId, useRef, useState } from "react";

type Align = "left" | "right";

interface MenuProps {
  /** Receives the props the trigger needs; render whatever button you like. */
  trigger: (props: {
    onClick: (e: React.MouseEvent) => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
    id: string;
  }) => React.ReactNode;
  align?: Align;
  /** Distance from the trigger's top edge. Matches the trigger height. */
  className?: string;
  children: (close: () => void) => React.ReactNode;
}

/**
 * Dropdown shell. Replaces the hand-rolled `useState` + fixed-inset click
 * catcher that eight components each reimplemented slightly differently --
 * that pattern swallowed Escape, trapped nothing, and told screen readers
 * nothing about the popup.
 *
 * Closes on outside pointerdown, Escape, and any item activation (items get
 * the `close` callback). Arrow keys walk the items.
 */
export default function Menu({ trigger, align = "right", className = "", children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        wrapperRef.current?.querySelector<HTMLElement>("button")?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const items = listRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),[role="menuitem"]:not([aria-disabled="true"])'
      );
      if (!items?.length) return;
      e.preventDefault();
      const current = Array.from(items).indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length;
      items[next].focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // `min-w-0` matters: as a flex child this wrapper would otherwise refuse to
  // shrink below its trigger's intrinsic width, and a long workspace or
  // database name would push the whole header into horizontal overflow.
  return (
    <div ref={wrapperRef} className="relative min-w-0">
      {trigger({
        onClick: (e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        },
        "aria-expanded": open,
        "aria-haspopup": "menu",
        id: triggerId,
      })}

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-labelledby={triggerId}
          className={[
            "absolute top-[calc(100%+4px)] z-50 min-w-44 py-1",
            "bg-elevated border border-line rounded-lg shadow-popover animate-pop-in",
            align === "right" ? "right-0" : "left-0",
            className,
          ].join(" ")}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  danger?: boolean;
  /** Shows a check and marks the item as the current choice. */
  selected?: boolean;
}

export function MenuItem({
  icon, danger, selected, className = "", children, ...rest
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={[
        "w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm transition-colors",
        "disabled:opacity-45 disabled:pointer-events-none",
        danger
          ? "text-danger hover:bg-danger/10"
          : selected
            ? "text-accent-text bg-accent/10"
            : "text-secondary hover:bg-hover hover:text-primary",
        className,
      ].join(" ")}
      {...rest}
    >
      {icon && <span className="shrink-0" aria-hidden>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-border-subtle" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
      {children}
    </p>
  );
}
