"use client";

// Reemplaza layout.tsx entero cuando el error ocurre ahí mismo (ej. falla
// auth() o la consulta a usuarios_autorizados) — por eso trae su propio
// <html>/<body> y su propio import de globals.css: global-error no hereda
// nada del layout raíz. Ver error.tsx para el resto de las pantallas.
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <head>
        <title>Error — Generador de Guías IECV</title>
      </head>
      <body className="antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="text-xl font-bold">Algo salió mal</h1>
          <p className="mt-2 text-sm text-gray-500">
            Ocurrió un error inesperado cargando la app. Puedes intentar de
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
      </body>
    </html>
  );
}
