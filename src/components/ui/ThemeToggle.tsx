"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const LABELS: Record<Theme, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const ICONS: Record<Theme, string> = { system: "🖥️", light: "☀️", dark: "🌙" };

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "system") root.classList.add(theme);
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // localStorage puede fallar en modo privado — el tema simplemente no persiste.
  }
}

/** Cicla sistema → claro → oscuro. El layout ya aplicó la clase guardada
 * antes del primer paint (ver THEME_INIT_SCRIPT en layout.tsx); aquí solo
 * leemos esa clase para mostrar el estado inicial correcto. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // Sincroniza el estado inicial con la clase que ya puso THEME_INIT_SCRIPT
    // en <html> antes del hidratado — no hay forma de leer eso durante el
    // render sin desalinear el markup del servidor.
    const root = document.documentElement;
    if (root.classList.contains("dark")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme("dark");
    } else if (root.classList.contains("light")) {
      setTheme("light");
    }
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className={
        className ??
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      }
      aria-label={`Tema: ${LABELS[theme]}. Cambiar tema.`}
      title={`Tema: ${LABELS[theme]}`}
    >
      <span aria-hidden="true">{ICONS[theme]}</span>
      <span>{LABELS[theme]}</span>
    </button>
  );
}
