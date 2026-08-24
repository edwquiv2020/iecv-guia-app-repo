import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface UsuarioUpdateInput {
  nombre?: string | null;
  activo?: boolean;
  rol?: "docente" | "admin";
}

/**
 * Actualiza nombre/activo/rol de un docente. Con guardia explícita: nadie
 * puede desactivarse ni quitarse el rol admin a sí mismo — evita que un
 * admin se bloquee el acceso por accidente y deje la app sin nadie que
 * pueda revertirlo.
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ email: string }> }
) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const { email: emailParam } = await ctx.params;
  const email = decodeURIComponent(emailParam).toLowerCase();
  const body = (await request.json()) as UsuarioUpdateInput;

  const esUnoMismo = email === session.user.email?.toLowerCase();
  if (esUnoMismo && (body.activo === false || body.rol === "docente")) {
    return NextResponse.json(
      { error: "No puedes quitarte tu propio acceso ni tu rol admin." },
      { status: 400 }
    );
  }

  const [actualizado] = await sql`
    update usuarios_autorizados
    set nombre = coalesce(${body.nombre ?? null}, nombre),
        activo = coalesce(${body.activo ?? null}, activo),
        rol = coalesce(${body.rol ?? null}, rol)
    where email = ${email}
    returning email, nombre, activo, rol, created_at
  `;
  if (!actualizado) {
    return NextResponse.json({ error: "Docente no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ usuario: actualizado });
}
