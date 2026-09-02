import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

interface EstudianteUpdate {
  activo?: boolean;
  nombre?: string;
  cicloId?: string | null;
  jornadaId?: string | null;
}

/**
 * Dos usos en un solo verbo, según qué trae el body: `{ activo }` solo
 * (activar/desactivar, acción de un clic) o `{ nombre, cicloId?, jornadaId? }`
 * (editar los datos del estudiante) — nunca mezclados, para no necesitar un
 * update parcial con coalesce.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { id } = await params;

  const body = (await request.json()) as EstudianteUpdate;

  try {
    let actualizado;
    if (typeof body.activo === "boolean" && body.nombre === undefined) {
      [actualizado] = await sql`
        update estudiantes set activo = ${body.activo}
        where id = ${id} and docente_email = ${email}
        returning id, nombre, activo
      `;
    } else {
      const nombre = body.nombre?.trim();
      if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
      [actualizado] = await sql`
        update estudiantes set nombre = ${nombre}, ciclo_id = ${body.cicloId || null}, jornada_id = ${body.jornadaId || null}
        where id = ${id} and docente_email = ${email}
        returning id, nombre, activo
      `;
    }
    if (!actualizado) return NextResponse.json({ error: "Estudiante no encontrado." }, { status: 404 });
    return NextResponse.json({ estudiante: actualizado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo actualizar el estudiante.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
