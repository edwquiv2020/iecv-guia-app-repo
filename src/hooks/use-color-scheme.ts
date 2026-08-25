"use client";

import { useEffect, useState } from "react";

function readColorScheme(): "light" | "dark" {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Sigue el tema real aplicado por ThemeToggle (clase .dark/.light en
 * <html>, o el sistema si no hay ninguna) — no usamos next-themes porque
 * ya tenemos nuestro propio mecanismo con persistencia en localStorage. */
export function useColorScheme(): "light" | "dark" {
  const [scheme, setScheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScheme(readColorScheme());

    const root = document.documentElement;
    const observer = new MutationObserver(() => setScheme(readColorScheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => setScheme(readColorScheme());
    media.addEventListener("change", onMediaChange);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  return scheme;
}
