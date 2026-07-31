/**
 * Shared UI primitives.
 *
 * Deliberately a small hand-rolled set rather than a component library: Phase 1
 * needs about a dozen elements, and keeping them here means one place to change
 * the visual language.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";

// --- layout ----------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-[--color-line] bg-[--color-surface] shadow-[0_1px_2px_rgba(16,24,40,0.05)]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[--color-line] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[--color-muted]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[--color-muted]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-[--color-muted]">{hint}</p> : null}
    </div>
  );
}

// --- controls --------------------------------------------------------------

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const buttonVariants = {
  primary: "bg-[--color-brand] text-white hover:bg-[--color-brand-ink]",
  secondary: "border border-[--color-line] bg-[--color-surface] hover:bg-[--color-canvas]",
  danger: "border border-[--color-danger] text-[--color-danger] hover:bg-[--color-danger-wash]",
  ghost: "text-[--color-muted] hover:bg-[--color-canvas] hover:text-[--color-ink]",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[--color-muted]">{hint}</p> : null}
      {error ? <p className="text-xs text-[--color-danger]">{error}</p> : null}
    </div>
  );
}

const controlClass =
  "w-full rounded-lg border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm placeholder:text-[--color-muted] focus:border-[--color-brand] focus:outline-none disabled:bg-[--color-canvas] disabled:text-[--color-muted]";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, "appearance-none bg-[--color-surface] pr-8", className)} {...props}>
      {children}
    </select>
  );
}

// --- feedback --------------------------------------------------------------

const toneStyles = {
  neutral: "bg-[--color-canvas] text-[--color-muted] border-[--color-line]",
  brand: "bg-[--color-brand-wash] text-[--color-brand-ink] border-transparent",
  success: "bg-[--color-success-wash] text-[--color-success] border-transparent",
  warn: "bg-[--color-warn-wash] text-[--color-warn] border-transparent",
  danger: "bg-[--color-danger-wash] text-[--color-danger] border-transparent",
} as const;

export type Tone = keyof typeof toneStyles;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", toneStyles[tone])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "danger", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <div role="alert" className={cn("rounded-lg border px-3.5 py-2.5 text-sm", toneStyles[tone])}>
      {children}
    </div>
  );
}

/** Maps an employee status to a sensible colour without hardcoding it at call sites. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "ONBOARDING":
      return "brand";
    case "ON_LEAVE":
      return "warn";
    case "OFFBOARDING":
      return "warn";
    case "TERMINATED":
      return "danger";
    default:
      return "neutral";
  }
}

export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// --- table -----------------------------------------------------------------

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-[--color-line] px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--color-muted]",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-[--color-line] px-5 py-3 align-middle", className)}>{children}</td>;
}

// --- formatting ------------------------------------------------------------

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** `YYYY-MM-DD` for date inputs. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function displayName(person: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return `${person.preferredName || person.firstName} ${person.lastName}`;
}

export function initials(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
}

export function Avatar({ person, size = 36 }: { person: { firstName: string; lastName: string }; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[--color-brand-wash] text-xs font-semibold text-[--color-brand-ink]"
      style={{ width: size, height: size }}
    >
      {initials(person)}
    </span>
  );
}
