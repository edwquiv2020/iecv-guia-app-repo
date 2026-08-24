"use client";

import { useEffect } from "react";

// Error boundary de toda la app (cubre page.tsx, examenes, horarios,
// admin/mallas, acceso-denegado) — un error de render en cualquiera de
// esas pantallas cae acá en vez de mostrar la página de error genérica de
// Next. No cubre errores en layout.tsx (ver global-error.tsx para eso).
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">Algo salió mal</h1>
      <p className="mt-2 text-sm text-gray-500">
        Ocurrió un error inesperado en esta pantalla. Puedes intentar de
        nuevo — si el problema sigue, avísale a quien administra la app.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-gray-400">Código de referencia: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
      >
        Intentar de nuevo
      </button>
    </main>
  );
}
