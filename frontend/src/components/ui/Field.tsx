import { forwardRef, useId } from "react";

/** Shared shell: label above, control, then hint or error below. Every form in
 *  PHQ uses this so labels, spacing and error text never drift apart. */
function FieldShell({
  label, htmlFor, hint, error, required, children, className = "",
}: {
  label?: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-secondary mb-1.5">
          {label}
          {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-md bg-raised border text-sm text-primary placeholder:text-faint " +
  "transition-colors focus:outline-none focus:ring-2 focus:ring-accent/35 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

function controlClasses(error?: string | null, extra = "") {
  return [
    CONTROL_BASE,
    error ? "border-danger/60 focus:border-danger" : "border-line focus:border-accent",
    extra,
  ].join(" ");
}

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Rendered inside the field on the left; the input pads around it. */
  icon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className = "", containerClassName, id, required, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
            aria-hidden
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={controlClasses(error, `h-9 ${icon ? "pl-9" : "px-3"} pr-3 ${className}`)}
          {...rest}
        />
      </div>
    </FieldShell>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className = "", containerClassName, id, required, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={controlClasses(error, `px-3 py-2 resize-y ${className}`)}
        {...rest}
      />
    </FieldShell>
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className = "", containerClassName, id, required, children, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={controlClasses(error, `h-9 px-2.5 pr-8 cursor-pointer ${className}`)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});
