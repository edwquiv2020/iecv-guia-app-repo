import type { ReactNode } from "react";

type Tone = "default" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  default: "border-border bg-surface",
  info: "border-info/30 bg-info-subtle",
};

export function Fieldset({
  legend,
  children,
  tone = "default",
  className = "",
}: {
  legend: ReactNode;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <fieldset className={`rounded-xl border p-5 ${TONE_CLASSES[tone]} ${className}`}>
      <legend className="px-1 text-sm font-medium text-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}
