import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [ciclos, cursos] = await Promise.all([
    sql`select id, slug, nombre, grados from ciclos where activo order by nombre`,
    // Nota: curso_ciclos todavía no tiene filas cargadas, así que por ahora
    // se listan todos los cursos activos sin filtrar por ciclo.
    sql`select id, slug, nombre from cursos where activo order by nombre`,
  ]);
  return NextResponse.json({ ciclos, cursos });
}
