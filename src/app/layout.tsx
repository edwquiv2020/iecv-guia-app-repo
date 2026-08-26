import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth, signOut } from "@/auth";
import { Navbar } from "@/components/Navbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Generador de Guías IECV",
  description: "Genera la Guía de Formación semanal del IECV en Word.",
};

// Aplica el tema guardado antes del primer paint, para no parpadear entre
// claro y oscuro mientras React hidrata. "system" (sin clase) no necesita
// JS porque ya lo resuelve el media query en globals.css.
const THEME_INIT_SCRIPT = `
try {
  const t = localStorage.getItem("theme");
  if (t === "dark" || t === "light") document.documentElement.classList.add(t);
} catch {}
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html lang="es" className={`h-full antialiased ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <SessionProvider session={session}>
          <TooltipProvider>
            <Navbar
              userEmail={session?.user?.email}
              isAdmin={session?.user?.rol === "admin"}
              onSignOut={async () => {
                "use server";
                await signOut();
              }}
            />
            {children}
            <Toaster />
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
