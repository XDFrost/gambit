import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ember' | 'tide';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  trailing?: ReactNode;
  leading?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-[0_1px_0_rgb(255_255_255/0.25)_inset]',
  secondary: 'bg-raised text-ink ring-1 ring-hairline-strong hover:bg-panel',
  ghost: 'bg-transparent text-ink-muted hover:text-ink hover:bg-raised',
  danger: 'bg-danger text-[#fff6f6] hover:brightness-110',
  ember: 'bg-ember text-ember-ink hover:brightness-110',
  tide: 'bg-tide text-tide-ink hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px] gap-2',
  md: 'h-11 px-5 text-[15px] gap-2.5',
  lg: 'h-13 px-7 text-[16px] gap-3',
};

/** Pill button. Trailing icons sit in their own circular well (nested "button in button"). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, trailing, leading, loading, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'group inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap select-none',
        'transition-[transform,background-color,filter] duration-200 ease-[var(--ease-tabletop)]',
        'active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {leading ? <span className="-ml-1 inline-flex">{leading}</span> : null}
      <span>{children}</span>
      {trailing ? (
        <span
          className={cn(
            '-mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full',
            variant === 'primary' ? 'bg-black/10' : 'bg-white/8',
            'transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105',
          )}
        >
          {trailing}
        </span>
      ) : null}
    </button>
  );
});
