import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Protege todo menos las rutas de auth y los assets estáticos — sin sesión
// (o sesión de un correo no autorizado, ver auth.ts) redirige al login.
export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!api/auth|acceso-denegado|_next/static|_next/image|favicon.ico).*)"],
};
