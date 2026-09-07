export function PhantomLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 40"
      className={className}
      fill="none"
    >
      <text
        x="5"
        y="30"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontSize="28"
        fill="currentColor"
        letterSpacing="-1"
      >
        PH
      </text>
      <text
        x="48"
        y="30"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontSize="28"
        fill="#22C55E"
        letterSpacing="-1"
      >
        Q
      </text>
      <path
        d="M 64 22 L 74 34 L 66 34 L 56 22 Z"
        fill="#22C55E"
      />
    </svg>
  );
}