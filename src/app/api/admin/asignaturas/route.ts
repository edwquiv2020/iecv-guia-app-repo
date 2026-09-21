import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { clave, slugify, slugLibre } from "@/lib/slug";

export const dynamic = "force-dynamic";

async function esAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.rol === "admin";
}

/** Todas las asignaturas (también las desactivadas) con cuántos cursos activos tiene cada una. */
export async function GET() {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }
  const asignaturas = await sql`
    select a.id, a.slug, a.nombre, a.activa,
           (select count(*)::int from cursos c where c.asignatura_id = a.id and c.activo) as "cursosActivos"
    from asignaturas a
    order by a.nombre
  `;
  return NextResponse.json({ asignaturas });
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ") : "";
  if (!nombre || nombre.length > 100) {
    return NextResponse.json({ error: "Escribe el nombre de la asignatura (máximo 100 caracteres)." }, { status: 400 });
  }

  const existentes = await sql`select nombre, slug from asignaturas`;
  if (existentes.some((a) => clave(a.nombre) === clave(nombre))) {
    return NextResponse.json({ error: `Ya existe la asignatura "${nombre}".` }, { status: 409 });
  }
  const slug = slugLibre(slugify(nombre), new Set(existentes.map((a) => a.slug)));

  try {
    const [nueva] = await sql`
      insert into asignaturas (slug, nombre) values (${slug}, ${nombre})
      returning id, slug, nombre, activa
    `;
    return NextResponse.json({ asignatura: { ...nueva, cursosActivos: 0 } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear la asignatura." }, { status: 500 });
  }
}
