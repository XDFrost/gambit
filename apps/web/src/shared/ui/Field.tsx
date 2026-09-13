import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Label above, hint present in markup, error below. Never placeholder-as-label. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[13px] font-medium text-ink-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${inputId}-desc` : undefined}
        className={cn(
          'h-12 rounded-[var(--radius-input)] bg-sunken px-4 text-[16px] text-ink ring-1 ring-hairline-strong',
          'placeholder:text-ink-faint focus:ring-2 focus:ring-accent focus:outline-none',
          error && 'ring-danger',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-desc`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-desc`} className="text-[13px] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
