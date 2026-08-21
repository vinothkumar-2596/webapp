import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Button ────────────────────────────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
  ghost: 'bg-transparent text-brand border border-transparent hover:bg-ok-bg',
  danger: 'bg-surface text-bad-fg border border-bad-line hover:bg-bad-bg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium',
        'cursor-pointer whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── Badge ─────────────────────────────────────────────────────────── */

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

const TONES: Record<Tone, string> = {
  ok: 'text-ok-fg bg-ok-bg border-ok-line',
  warn: 'text-warn-fg bg-warn-bg border-warn-line',
  bad: 'text-bad-fg bg-bad-bg border-bad-line',
  neutral: 'text-ink-4 bg-canvas border-line',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-[7px] py-[2px]',
        'text-[11.5px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Card ──────────────────────────────────────────────────────────── */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-line px-4 py-3.5',
        className,
      )}
    >
      <h2 className="m-0 text-[13.5px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

/* ── Form controls ─────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-[11.5px] font-medium text-bad-fg">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-ink-5">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        'h-9 w-full rounded-md border border-line bg-surface-muted px-3',
        'text-[13px] text-ink outline-none',
        'focus:border-brand focus:bg-surface',
        'aria-[invalid=true]:border-bad-line aria-[invalid=true]:bg-bad-bg',
        className,
      )}
    />
  );
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cn(
        'w-full resize-y rounded-md border border-line bg-surface-muted px-3 py-2',
        'text-[13px] leading-relaxed text-ink outline-none',
        'focus:border-brand focus:bg-surface',
        className,
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        'h-8 cursor-pointer rounded-md border border-line bg-surface px-2.5',
        'text-[12.5px] font-medium text-ink outline-none focus:border-brand',
        className,
      )}
    >
      {children}
    </select>
  );
}

/* ── Toggle ────────────────────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-block h-[19px] w-[34px] shrink-0 cursor-pointer rounded-full',
        'border-0 transition-colors',
        checked ? 'bg-brand' : 'bg-[#d3d9e0]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[15px] w-[15px] rounded-full bg-white shadow-sm transition-all',
          checked ? 'left-[17px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-5">{icon}</div> : null}
      <p className="m-0 text-[14px] font-semibold">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] text-ink-4">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
