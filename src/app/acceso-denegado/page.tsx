import Link from "next/link";

export default function AccesoDenegado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">No tienes acceso a esta app</h1>
      <p className="mt-2 text-sm text-gray-500">
        Tu cuenta de Google inició sesión, pero ese correo no está en la lista de docentes
        autorizados. Pídele a quien administra la app que lo agregue.
      </p>
      <Link href="/api/auth/signin" className="mt-6 text-sm text-emerald-700 underline">
        Intentar con otra cuenta
      </Link>
    </main>
  );
}
