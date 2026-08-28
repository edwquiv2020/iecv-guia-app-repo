import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

async function cargarCatalogo(esAdmin: boolean, email: string) {
  const [ciclos, cursos, jornadas, actividades, asignaturas, misAsignaturas] = await Promise.all([
    sql`select id, slug, nombre, grados from ciclos where activo order by nombre`,
    // Nota: curso_ciclos todavía no tiene filas cargadas, así que por ahora
    // no se filtra por ciclo. Sí se filtra por asignatura: un admin ve el
    // catálogo completo, un docente solo los cursos cuya asignatura le
    // asignó un admin en /admin/usuarios (ver docente_asignaturas).
    esAdmin
      ? sql`select id, slug, nombre from cursos where activo order by nombre`
      : sql`
          select c.id, c.slug, c.nombre
          from cursos c
          join docente_asignaturas da on da.asignatura_id = c.asignatura_id
          where c.activo and da.email = ${email}
          order by c.nombre
        `,
    sql`select id, slug, nombre, dias from jornadas where activa order by nombre`,
    sql`select id, nombre from actividades where activa order by nombre`,
    // Catálogo completo de asignaturas — no se filtra por docente, lo usa
    // /admin/usuarios para las casillas de "a qué asignaturas asociar".
    sql`select id, slug, nombre from asignaturas where activa order by nombre`,
    // Solo LAS asignaturas de este docente (o todas si es admin) — las usa
    // /examenes para elegir la asignatura del Diagnóstico, que no tiene
    // curso de dónde derivarla.
    esAdmin
      ? sql`select id, slug, nombre from asignaturas where activa order by nombre`
      : sql`
          select a.id, a.slug, a.nombre
          from asignaturas a
          join docente_asignaturas da on da.asignatura_id = a.id
          where a.activa and da.email = ${email}
          order by a.nombre
        `,
  ]);
  return { ciclos, cursos, jornadas, actividades, asignaturas, misAsignaturas };
}

export async function GET() {
  const session = await auth();
  const esAdmin = session?.user?.rol === "admin";
  const email = session?.user?.email?.toLowerCase() ?? "";

  // Son 5 SELECT de solo lectura en paralelo — si el pooler de Supabase da
  // una conexión zombie (ver src/lib/db.ts), un solo reintento casi siempre
  // basta (confirmado en producción: la siguiente conexión suele salir
  // limpia). No hay riesgo de duplicar nada porque no escribe.
  try {
    return NextResponse.json(await cargarCatalogo(esAdmin, email));
  } catch {
    try {
      return NextResponse.json(await cargarCatalogo(esAdmin, email));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido cargando el catálogo.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
}
