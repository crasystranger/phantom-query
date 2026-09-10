/**
 * The PHQ wordmark: "PH" in the current text colour, then a Q drawn as a
 * magnifying glass in the accent -- the product's two ideas, a database
 * shorthand and a query, in one mark.
 *
 * Both halves read from tokens (`currentColor` and `--color-accent`), so the
 * logo follows the active theme and the user's chosen accent instead of
 * hardcoding green in five different files.
 */
export function PhantomLogo({
  className = "h-8 w-auto",
  title = "Phantom Query",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 76 32"
      className={className}
      fill="none"
      role="img"
      aria-label={title}
    >
      <text
        x="0"
        y="24"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize="24"
        fill="currentColor"
        letterSpacing="-1.2"
      >
        PH
      </text>
      <circle cx="50" cy="15" r="8" stroke="var(--color-accent)" strokeWidth="3.4" fill="none" />
      <path
        d="M55.8 20.8 63 28"
        stroke="var(--color-accent)"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Square mark for tight spots -- the app header, avatars, the mobile top bar. */
export function PhantomMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role="img"
      aria-label="Phantom Query"
    >
      <circle cx="14" cy="14" r="8.2" stroke="currentColor" strokeWidth="3" fill="none" />
      <path
        d="m19.9 19.9 6.1 6.1"
        stroke="var(--color-accent)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
