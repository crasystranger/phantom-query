import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

interface Props {
  title: string;
  description?: string;
  onClose: () => void;
  size?: keyof typeof SIZES;
  /** Rendered against the bottom edge, right-aligned. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The one modal shell in PHQ. It owns the behaviour every dialog needs and
 * that ad-hoc overlays kept forgetting: Escape closes, focus moves inside on
 * open and returns to the trigger on close, Tab is trapped, the background
 * doesn't scroll, and the overlay click only counts when it starts *and* ends
 * on the overlay (so a text selection dragged out of the panel can't dismiss
 * the work you were doing).
 *
 * On small screens it docks to the bottom as a sheet rather than floating a
 * shrunken desktop card in the middle of the viewport.
 */
export default function Dialog({
  title, description, onClose, size = "lg", footer, children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayMouseDown = useRef(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Land on the first *field*, not the first focusable node -- the close
    // button comes first in the DOM, and opening a form with focus on "close"
    // means a keyboard user's first Enter throws the dialog away.
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])'
      ) ?? panel?.querySelector<HTMLElement>("button:not([disabled])");
    (target ?? panel)?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const titleId = `dialog-title-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-[2px] animate-fade-in p-0 sm:p-6"
      onMouseDown={(e) => {
        overlayMouseDown.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (overlayMouseDown.current && e.target === e.currentTarget) onClose();
        overlayMouseDown.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${SIZES[size]} max-h-[92dvh] sm:max-h-[85dvh] flex flex-col
          bg-elevated border border-line rounded-t-xl sm:rounded-xl shadow-dialog
          animate-slide-up focus:outline-none`}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border-subtle shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-primary truncate">
              {title}
            </h2>
            {description && <p className="text-xs text-muted mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 -mr-1 -mt-0.5 w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border-subtle shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
