import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { leerMallaDesdeXlsx } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";

/**
 * Sincroniza la malla de UN curso desde un archivo/pestaña elegido
 * explícitamente por el admin en la carpeta de Drive
 * "01_MALLAS_CONTENIDO/" hacia Postgres — el resto de la app sigue
 * leyendo de Postgres como siempre, esto solo la actualiza bajo demanda
 * (nunca lee Drive en cada request). No destructivo: solo
 * inserta/actualiza filas por (curso, numero); nunca desactiva un tema
 * que ya no esté en el archivo.
 *
 * No se adivina el archivo por nombre del curso (ver
 * src/lib/googleDrive.ts) — el admin lo elige en la UI a partir de
 * GET /api/mallas/drive-archivos y GET /api/mallas/drive-archivos/[fileId]/pestanas.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const cursoId = body?.cursoId as string | undefined;
  const fileId = body?.fileId as string | undefined;
  const pestana = body?.pestana as string | undefined;
  if (!cursoId || !fileId) {
    return NextResponse.json({ error: "Faltan cursoId o fileId." }, { status: 400 });
  }

  const [curso] = await sql`select id from cursos where id = ${cursoId} and activo`;
  if (!curso) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }

  try {
    const temas = await leerMallaDesdeXlsx(fileId, pestana);
    if (temas.length === 0) {
      return NextResponse.json(
        { error: "El archivo/pestaña elegido no tiene filas válidas para importar." },
        { status: 400 }
      );
    }

    for (const t of temas) {
      await sql`
        insert into temas (curso_id, numero, tema, subtemas, url_video, archivo_kahoot)
        values (${cursoId}, ${t.numero}, ${t.tema}, ${t.subtemas}, ${t.url_video}, ${t.archivo_kahoot})
        on conflict (curso_id, numero) do update set
          tema = excluded.tema, subtemas = excluded.subtemas,
          url_video = excluded.url_video, archivo_kahoot = excluded.archivo_kahoot
      `;
    }

    return NextResponse.json({ ok: true, filas: temas.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido sincronizando desde Drive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
