import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-2.5" aria-label="ClipForge AI home">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-ember text-ink transition-transform duration-300 group-hover:-rotate-6">
        <svg
          viewBox="0 0 24 24"
          className="h-4.5 w-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        >
          <path d="M8 4v16M16 4v16M4 9h4M16 15h4" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">
        ClipForge <span className="text-mute">AI</span>
      </span>
    </button>
  );
}

type Variant = "primary" | "ghost" | "outline";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg"; children: ReactNode }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember";
  const sizes = { md: "h-11 px-5 text-[15px]", lg: "h-16 px-9 text-lg" };
  const variants: Record<Variant, string> = {
    primary: "bg-ember text-ink hover:bg-ember-soft shadow-[0_10px_40px_-12px_rgba(255,106,61,0.7)]",
    ghost: "text-white/80 hover:text-white hover:bg-white/5",
    outline: "border border-line bg-white/[0.02] text-white hover:border-white/25 hover:bg-white/[0.05]",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const Icon = {
  upload: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  ),
  download: (
    <svg
      viewBox="0 0 24 24"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />
    </svg>
  ),
  refresh: (
    <svg
      viewBox="0 0 24 24"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
  ),
  spark: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h3l2-6 4 12 2-6h5" />
    </svg>
  ),
  check: (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  arrowLeft: (
    <svg
      viewBox="0 0 24 24"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
};
