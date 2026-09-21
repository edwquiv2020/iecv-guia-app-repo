import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { clave } from "@/lib/slug";

export const dynamic = "force-dynamic";

/**
 * Renombra o activa/desactiva una asignatura. No se borra nunca (los cursos,
 * guías y docentes la referencian). Una asignatura con cursos activos no se
 * puede desactivar: sus cursos quedarían sin asignatura visible para los
 * docentes — hay que mover o desactivar esos cursos primero.
 */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  const [actual] = await sql`select id, nombre, activa from asignaturas where id = ${id}`;
  if (!actual) {
    return NextResponse.json({ error: "Asignatura no encontrada." }, { status: 404 });
  }

  let nombre: string = actual.nombre;
  if (body?.nombre !== undefined) {
    nombre = typeof body.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ") : "";
    if (!nombre || nombre.length > 100) {
      return NextResponse.json({ error: "Escribe el nombre de la asignatura (máximo 100 caracteres)." }, { status: 400 });
    }
    const otras = await sql`select nombre from asignaturas where id <> ${id}`;
    if (otras.some((a) => clave(a.nombre) === clave(nombre))) {
      return NextResponse.json({ error: `Ya existe la asignatura "${nombre}".` }, { status: 409 });
    }
  }

  let activa: boolean = actual.activa;
  if (body?.activa !== undefined) {
    if (typeof body.activa !== "boolean") {
      return NextResponse.json({ error: "Valor de 'activa' inválido." }, { status: 400 });
    }
    activa = body.activa;
    if (!activa && actual.activa) {
      const [{ total }] = await sql`select count(*)::int as total from cursos where asignatura_id = ${id} and activo`;
      if (total > 0) {
        return NextResponse.json(
          { error: `No se puede desactivar: tiene ${total} curso(s) activo(s). Muévelos a otra asignatura o desactívalos primero.` },
          { status: 409 }
        );
      }
    }
  }

  const [actualizada] = await sql`
    update asignaturas set nombre = ${nombre}, activa = ${activa} where id = ${id}
    returning id, slug, nombre, activa
  `;
  return NextResponse.json({ asignatura: actualizada });
}
