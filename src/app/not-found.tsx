import Link from "next/link";

// Se muestra cuando la ruta no existe. No cubre el caso de un correo no
// autorizado (eso es /acceso-denegado, redirigido desde auth.ts).
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">Página no encontrada</h1>
      <p className="mt-2 text-sm text-gray-500">
        La página que buscas no existe o se movió.
      </p>
      <Link href="/" className="mt-6 text-sm text-emerald-700 underline">
        Volver al generador de guías
      </Link>
    </main>
  );
}
