import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { sql } from "@/lib/db";

// Sin dominio institucional propio, el control de acceso es la lista
// explícita en `usuarios_autorizados` (ver db/schema.sql) en vez de un
// filtro por dominio de correo — cualquier cuenta de Google puede *intentar*
// entrar, pero solo pasa si su correo está en esa tabla y activo.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const [autorizado] = await sql`
        select 1 from usuarios_autorizados where email = ${user.email} and activo
      `;
      return !!autorizado;
    },
    // Solo consulta la BD en el sign-in inicial (cuando `user` viene
    // presente) — el rol queda cacheado en el JWT hasta la próxima vez que
    // el docente inicie sesión, no en cada request.
    async jwt({ token, user }) {
      if (user?.email) {
        const [autorizado] = await sql`
          select rol from usuarios_autorizados where email = ${user.email} and activo
        `;
        token.rol = (autorizado?.rol as "docente" | "admin" | undefined) ?? "docente";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.rol = token.rol ?? "docente";
      return session;
    },
  },
  pages: {
    error: "/acceso-denegado",
  },
});
