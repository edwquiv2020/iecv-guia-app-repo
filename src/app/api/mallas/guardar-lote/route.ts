import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { esNivel } from "@/lib/types";
import { MAX_CLASES_MALLA } from "@/lib/mallaIA";

export const dynamic = "force-dynamic";

/**
 * Guarda de una vez los temas de una malla revisada (típicamente la que
 * propuso /api/mallas/generar-ia). Solo AGREGA: los temas nuevos se numeran
 * a continuación del último número que exista para ese curso y nivel
 * (contando también los desactivados), así que nunca pisa ni borra nada.
 * Video y Kahoot quedan vacíos — se completan después con "Editar".
 * Todo o nada: si algo falla no queda una malla a medias.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const cursoId = body?.cursoId as string | undefined;
  const nivel = body?.nivel;
  const entrada = body?.temas as Array<{ tema?: unknown; subtemas?: unknown }> | undefined;

  if (!cursoId || !esNivel(nivel) || !Array.isArray(entrada)) {
    return NextResponse.json({ error: "Faltan el curso, el nivel o los temas." }, { status: 400 });
  }
  if (entrada.length < 1 || entrada.length > MAX_CLASES_MALLA) {
    return NextResponse.json({ error: `Debe haber entre 1 y ${MAX_CLASES_MALLA} temas.` }, { status: 400 });
  }
  const temas = entrada.map((t) => ({
    tema: typeof t.tema === "string" ? t.tema.trim() : "",
    subtemas: typeof t.subtemas === "string" ? t.subtemas.trim() : "",
  }));
  const invalido = temas.findIndex((t) => !t.tema || !t.subtemas || t.tema.length > 200 || t.subtemas.length > 2000);
  if (invalido >= 0) {
    return NextResponse.json({ error: `El tema ${invalido + 1} está incompleto o es demasiado largo.` }, { status: 400 });
  }

  const [curso] = await sql`select id from cursos where id = ${cursoId} and activo`;
  if (!curso) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }

  try {
    const guardados = await sql.begin(async (tx) => {
      const [{ maximo }] = await tx`select coalesce(max(numero), 0) as maximo from temas where curso_id = ${cursoId} and nivel = ${nivel}`;
      let numero = Number(maximo);
      for (const t of temas) {
        numero++;
        await tx`
          insert into temas (curso_id, nivel, numero, tema, subtemas)
          values (${cursoId}, ${nivel}, ${numero}, ${t.tema}, ${t.subtemas})
        `;
      }
      return { desde: Number(maximo) + 1, hasta: numero };
    });
    return NextResponse.json({ ok: true, filas: temas.length, ...guardados }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "Otra persona agregó temas a este curso al mismo tiempo — vuelve a generar la propuesta." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar la malla." }, { status: 500 });
  }
}
