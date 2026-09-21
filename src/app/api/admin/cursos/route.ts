import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { clave, slugify, slugLibre } from "@/lib/slug";

export const dynamic = "force-dynamic";

async function esAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.rol === "admin";
}

/** Todos los cursos (también los desactivados) con su asignatura y cuántos temas tiene su malla. */
export async function GET() {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }
  const cursos = await sql`
    select c.id, c.slug, c.nombre, c.descripcion, c.activo,
           c.asignatura_id as "asignaturaId", a.nombre as "asignaturaNombre",
           (select count(*)::int from temas t where t.curso_id = c.id and t.activo) as "temas"
    from cursos c
    left join asignaturas a on a.id = c.asignatura_id
    order by a.nombre nulls last, c.nombre
  `;
  return NextResponse.json({ cursos });
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ") : "";
  const asignaturaId = body?.asignaturaId as string | undefined;
  const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim().slice(0, 500) : "";

  if (!nombre || nombre.length > 120) {
    return NextResponse.json({ error: "Escribe el nombre del curso (máximo 120 caracteres)." }, { status: 400 });
  }
  if (!asignaturaId) {
    return NextResponse.json({ error: "Elige la asignatura a la que pertenece el curso." }, { status: 400 });
  }

  const [asignatura] = await sql`select id from asignaturas where id = ${asignaturaId} and activa`;
  if (!asignatura) {
    return NextResponse.json({ error: "La asignatura elegida no existe o está desactivada." }, { status: 400 });
  }

  const hermanos = await sql`select nombre from cursos where asignatura_id = ${asignaturaId}`;
  if (hermanos.some((c) => clave(c.nombre) === clave(nombre))) {
    return NextResponse.json({ error: `Ya existe un curso "${nombre}" en esa asignatura.` }, { status: 409 });
  }
  const slugs = await sql`select slug from cursos`;
  const slug = slugLibre(slugify(nombre), new Set(slugs.map((c) => c.slug)));

  try {
    const [nuevo] = await sql`
      insert into cursos (slug, nombre, descripcion, asignatura_id)
      values (${slug}, ${nombre}, ${descripcion || null}, ${asignaturaId})
      returning id, slug, nombre, descripcion, activo, asignatura_id as "asignaturaId"
    `;
    return NextResponse.json({ curso: nuevo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear el curso." }, { status: 500 });
  }
}
