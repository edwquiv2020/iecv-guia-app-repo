import type { ReactNode } from "react";

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "violet" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-subtle text-brand-subtle-foreground",
  success: "bg-success-subtle text-success-subtle-foreground",
  warning: "bg-warning-subtle text-warning-subtle-foreground",
  danger: "bg-danger-subtle text-danger-subtle-foreground",
  info: "bg-info-subtle text-info-subtle-foreground",
  violet: "bg-violet-subtle text-violet-subtle-foreground",
  neutral: "bg-surface-muted text-muted-foreground",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
