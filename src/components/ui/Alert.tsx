import type { ReactNode } from "react";

type Tone = "danger" | "success" | "warning" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  danger: "bg-danger-subtle text-danger-subtle-foreground",
  success: "bg-success-subtle text-success-subtle-foreground",
  warning: "bg-warning-subtle text-warning-subtle-foreground",
  info: "bg-info-subtle text-info-subtle-foreground",
};

/** Banner inline persistente — a propósito no es un toast: en formularios
 * async largos (generación de guía, ~20-30s) el mensaje debe poder releerse.
 * Es un <div> (no <p>) para poder contener listas, botones u otros bloques
 * cuando el mensaje trae más que una línea de texto. */
export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-lg px-3.5 py-2.5 text-sm ${TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}
