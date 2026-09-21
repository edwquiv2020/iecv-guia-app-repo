import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { clave } from "@/lib/slug";

export const dynamic = "force-dynamic";

/**
 * Edita un curso: nombre, descripción, asignatura a la que pertenece y
 * activo/desactivado. No se borra nunca (calendario, guías y mallas lo
 * referencian): desactivarlo lo oculta de los selectores, pero las clases ya
 * programadas siguen mostrándose.
 */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  const [actual] = await sql`select id, nombre, descripcion, asignatura_id, activo from cursos where id = ${id}`;
  if (!actual) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }

  let nombre: string = actual.nombre;
  if (body?.nombre !== undefined) {
    nombre = typeof body.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ") : "";
    if (!nombre || nombre.length > 120) {
      return NextResponse.json({ error: "Escribe el nombre del curso (máximo 120 caracteres)." }, { status: 400 });
    }
  }
  let asignaturaId: string | null = actual.asignatura_id;
  if (body?.asignaturaId !== undefined) {
    asignaturaId = body.asignaturaId;
    const [asignatura] = await sql`select id from asignaturas where id = ${asignaturaId} and activa`;
    if (!asignatura) {
      return NextResponse.json({ error: "La asignatura elegida no existe o está desactivada." }, { status: 400 });
    }
  }
  let descripcion: string | null = actual.descripcion;
  if (body?.descripcion !== undefined) {
    descripcion = typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 500) || null : null;
  }
  let activo: boolean = actual.activo;
  if (body?.activo !== undefined) {
    if (typeof body.activo !== "boolean") {
      return NextResponse.json({ error: "Valor de 'activo' inválido." }, { status: 400 });
    }
    activo = body.activo;
  }

  // Sin dos cursos con el mismo nombre dentro de la misma asignatura.
  if (asignaturaId) {
    const hermanos = await sql`select nombre from cursos where asignatura_id = ${asignaturaId} and id <> ${id}`;
    if (hermanos.some((c) => clave(c.nombre) === clave(nombre))) {
      return NextResponse.json({ error: `Ya existe un curso "${nombre}" en esa asignatura.` }, { status: 409 });
    }
  }

  const [actualizado] = await sql`
    update cursos set nombre = ${nombre}, descripcion = ${descripcion}, asignatura_id = ${asignaturaId}, activo = ${activo}
    where id = ${id}
    returning id, slug, nombre, descripcion, activo, asignatura_id as "asignaturaId"
  `;
  return NextResponse.json({ curso: actualizado });
}
