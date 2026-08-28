import { NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const esAdmin = session?.user?.rol === "admin";
  const email = session?.user?.email?.toLowerCase() ?? "";

  try {
    // Son 5 SELECT de solo lectura en paralelo — un reintento es seguro
    // (ver conReintento en lib/db.ts).
    const [ciclos, cursos, jornadas, actividades, asignaturas, misAsignaturas] = await conReintento(() =>
      Promise.all([
        sql`select id, slug, nombre, grados from ciclos where activo order by nombre`,
        // Nota: curso_ciclos todavía no tiene filas cargadas, así que por
        // ahora no se filtra por ciclo. Sí se filtra por asignatura: un
        // admin ve el catálogo completo, un docente solo los cursos cuya
        // asignatura le asignó un admin en /admin/usuarios (ver
        // docente_asignaturas). Cada curso trae el nombre de su asignatura
        // — el frontend agrupa el selector con eso (ver
        // agruparPorAsignatura en lib/types.ts) para que la lista no se
        // vuelva ilegible a medida que se cargan cursos de más asignaturas.
        esAdmin
          ? sql`
              select c.id, c.slug, c.nombre, a.nombre as "asignaturaNombre"
              from cursos c
              left join asignaturas a on a.id = c.asignatura_id
              where c.activo
              order by a.nombre, c.nombre
            `
          : sql`
              select c.id, c.slug, c.nombre, a.nombre as "asignaturaNombre"
              from cursos c
              join asignaturas a on a.id = c.asignatura_id
              join docente_asignaturas da on da.asignatura_id = c.asignatura_id
              where c.activo and da.email = ${email}
              order by a.nombre, c.nombre
            `,
        sql`select id, slug, nombre, dias from jornadas where activa order by nombre`,
        sql`select id, nombre from actividades where activa order by nombre`,
        // Catálogo completo de asignaturas — no se filtra por docente, lo
        // usa /admin/usuarios para las casillas de "a qué asignaturas asociar".
        sql`select id, slug, nombre from asignaturas where activa order by nombre`,
        // Solo LAS asignaturas de este docente (o todas si es admin) — las
        // usa /examenes para elegir la asignatura del Diagnóstico, que no
        // tiene curso de dónde derivarla.
        esAdmin
          ? sql`select id, slug, nombre from asignaturas where activa order by nombre`
          : sql`
              select a.id, a.slug, a.nombre
              from asignaturas a
              join docente_asignaturas da on da.asignatura_id = a.id
              where a.activa and da.email = ${email}
              order by a.nombre
            `,
      ])
    );
    return NextResponse.json({ ciclos, cursos, jornadas, actividades, asignaturas, misAsignaturas });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido cargando el catálogo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
