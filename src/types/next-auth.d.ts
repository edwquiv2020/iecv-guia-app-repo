import type { DefaultSession } from "next-auth";

// Extiende la sesión con el rol de usuarios_autorizados (ver auth.ts) —
// 'admin' puede administrar mallas, 'docente' solo leerlas.
declare module "next-auth" {
  interface Session {
    user: {
      rol: "docente" | "admin";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol?: "docente" | "admin";
  }
}

// `next-auth/jwt` solo re-exporta desde acá — los callbacks internos de
// next-auth referencian este módulo directamente, así que hay que
// aumentarlo también para que `token.rol` tipe bien dentro de auth.ts.
declare module "@auth/core/jwt" {
  interface JWT {
    rol?: "docente" | "admin";
  }
}
