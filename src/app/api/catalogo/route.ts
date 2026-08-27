import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const esAdmin = session?.user?.rol === "admin";
  const email = session?.user?.email?.toLowerCase() ?? "";

  const [ciclos, cursos, jornadas, actividades] = await Promise.all([
    sql`select id, slug, nombre, grados from ciclos where activo order by nombre`,
    // Nota: curso_ciclos todavía no tiene filas cargadas, así que por ahora
    // no se filtra por ciclo. Sí se filtra por docente: un admin ve el
    // catálogo completo, un docente solo las asignaturas que un admin le
    // asignó en /admin/usuarios (ver docente_cursos).
    esAdmin
      ? sql`select id, slug, nombre from cursos where activo order by nombre`
      : sql`
          select c.id, c.slug, c.nombre
          from cursos c
          join docente_cursos dc on dc.curso_id = c.id
          where c.activo and dc.email = ${email}
          order by c.nombre
        `,
    sql`select id, slug, nombre, dias from jornadas where activa order by nombre`,
    sql`select id, nombre from actividades where activa order by nombre`,
  ]);
  return NextResponse.json({ ciclos, cursos, jornadas, actividades });
}
