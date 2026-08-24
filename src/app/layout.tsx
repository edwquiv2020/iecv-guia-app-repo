import type { Metadata } from "next";
import "./globals.css";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "Generador de Guías IECV",
  description: "Genera la Guía de Formación semanal del IECV en Word.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {session?.user && (
          <div className="flex items-center justify-end gap-3 border-b bg-gray-50 px-6 py-1.5 text-xs text-gray-500">
            <span>{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button type="submit" className="underline hover:text-gray-700">
                Cerrar sesión
              </button>
            </form>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
