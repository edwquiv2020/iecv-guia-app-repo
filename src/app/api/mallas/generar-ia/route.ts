import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { dentroDelLimiteDiario, registrarGeneracion, mensajeLimiteAlcanzado } from "@/lib/rateLimit";
import { generarMallaIA, MAX_CLASES_MALLA } from "@/lib/mallaIA";
import { esNivel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Propone (NO guarda) una malla generada con IA para un curso y nivel. El
 * admin la revisa/ajusta en pantalla y recién ahí se guarda con
 * /api/mallas/guardar-lote. La numeración propuesta continúa después del
 * último tema que ya tenga ese curso en ese nivel (nunca pisa los existentes).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (session?.user?.rol !== "admin" || !email) {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const cursoId = body?.cursoId as string | undefined;
  const nivel = body?.nivel;
  const temaGeneral = typeof body?.temaGeneral === "string" ? body.temaGeneral.trim() : "";
  const clases = Number(body?.clases);
  const indicaciones = typeof body?.indicaciones === "string" ? body.indicaciones.trim().slice(0, 1000) : "";

  if (!cursoId || !esNivel(nivel)) {
    return NextResponse.json({ error: "Faltan el curso o el nivel." }, { status: 400 });
  }
  if (!temaGeneral || temaGeneral.length > 300) {
    return NextResponse.json({ error: "Escribe el tema general (máximo 300 caracteres)." }, { status: 400 });
  }
  if (!Number.isInteger(clases) || clases < 1 || clases > MAX_CLASES_MALLA) {
    return NextResponse.json({ error: `El número de clases debe estar entre 1 y ${MAX_CLASES_MALLA}.` }, { status: 400 });
  }

  const [curso] = await sql`
    select c.nombre, a.nombre as asignatura
    from cursos c left join asignaturas a on a.id = c.asignatura_id
    where c.id = ${cursoId} and c.activo
  `;
  if (!curso) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }

  if (!(await dentroDelLimiteDiario(email, "generar-malla"))) {
    return NextResponse.json({ error: mensajeLimiteAlcanzado() }, { status: 429 });
  }
  await registrarGeneracion(email, "generar-malla");

  try {
    const temas = await generarMallaIA({
      cursoNombre: curso.nombre,
      asignatura: curso.asignatura ?? null,
      nivel,
      temaGeneral,
      clases,
      indicaciones,
    });
    // Incluye los temas desactivados: su número sigue ocupado en la base.
    const [{ maximo }] = await sql`select coalesce(max(numero), 0) as maximo from temas where curso_id = ${cursoId} and nivel = ${nivel}`;
    const desde = Number(maximo) + 1;
    return NextResponse.json({
      propuesta: temas.map((t, i) => ({ numero: desde + i, ...t })),
      existentes: Number(maximo),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido generando la malla.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
