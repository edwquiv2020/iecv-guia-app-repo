import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { subirArchivoGuia, borrarArchivosPrevios } from "@/lib/storage";

export const dynamic = "force-dynamic";

type TipoRegistrable = "estandar" | "dua" | "diagnostico" | "intermedio" | "final";
const TIPOS_VALIDOS: TipoRegistrable[] = ["estandar", "dua", "diagnostico", "intermedio", "final"];

interface ArchivoEntrada { nombre: string; contenidoBase64: string }

/**
 * Registra (o marca manualmente) que una guía o examen ya existe para una
 * semana del calendario. Si vienen `archivos` (generación real, con
 * contenido base64), además los sube a Supabase Storage y guarda el
 * `contenido` pedagógico de la IA — así queda recuperable sin regenerar.
 * Sin `archivos` (marcado manual desde /horarios para guías de antes de
 * este sistema), solo registra la metadata, como antes.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const calendarioClaseId = body?.calendarioClaseId as string | undefined;
  const tipo = body?.tipo as TipoRegistrable | undefined;
  const archivoPath = (body?.archivoPath as string | undefined) ?? null;
  const talleresTipos = (body?.talleresTipos as string[] | undefined) ?? null;
  const archivos = (body?.archivos as ArchivoEntrada[] | undefined) ?? null;
  const contenido = body?.contenido ?? null;
  const kahootContenido = body?.kahootContenido ?? null;

  if (!calendarioClaseId || !tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: "Faltan calendarioClaseId o tipo." }, { status: 400 });
  }

  try {
    const [guia] = await sql`
      insert into guias (calendario_clase_id, tipo, estado, archivo_path, talleres_tipos, contenido, kahoot_contenido, generado_en)
      values (${calendarioClaseId}, ${tipo}, 'generada', ${archivoPath}, ${talleresTipos}, ${sql.json(contenido)}, ${sql.json(kahootContenido)}, now())
      on conflict (calendario_clase_id, tipo) do update set
        estado = 'generada', archivo_path = excluded.archivo_path,
        talleres_tipos = excluded.talleres_tipos, contenido = excluded.contenido,
        kahoot_contenido = excluded.kahoot_contenido, generado_en = now()
      returning id
    `;

    if (archivos && archivos.length > 0) {
      // Se regeneró — los archivos previos de esta guía ya no corresponden,
      // se reemplazan enteros (borra en Storage + en la tabla).
      const previos = await sql`select storage_path from guia_archivos where guia_id = ${guia.id}`;
      await borrarArchivosPrevios(previos.map((p) => p.storage_path as string));
      await sql`delete from guia_archivos where guia_id = ${guia.id}`;

      for (const archivo of archivos) {
        const { storagePath, mimeType } = await subirArchivoGuia(guia.id, tipo, archivo.nombre, archivo.contenidoBase64);
        await sql`
          insert into guia_archivos (guia_id, nombre_archivo, mime_type, storage_path)
          values (${guia.id}, ${archivo.nombre}, ${mimeType}, ${storagePath})
        `;
      }
    }

    return NextResponse.json({ ok: true, guiaId: guia.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido registrando la guía.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Desmarca una guía (vuelve a quedar como pendiente) — la elimina del registro y sus archivos. */
export async function DELETE(request: NextRequest) {
  const calendarioClaseId = request.nextUrl.searchParams.get("calendarioClaseId");
  const tipo = request.nextUrl.searchParams.get("tipo");
  if (!calendarioClaseId || !tipo) {
    return NextResponse.json({ error: "Faltan calendarioClaseId o tipo." }, { status: 400 });
  }
  const [guia] = await sql`select id from guias where calendario_clase_id = ${calendarioClaseId} and tipo = ${tipo}`;
  if (guia) {
    const previos = await sql`select storage_path from guia_archivos where guia_id = ${guia.id}`;
    await borrarArchivosPrevios(previos.map((p) => p.storage_path as string));
  }
  await sql`delete from guias where calendario_clase_id = ${calendarioClaseId} and tipo = ${tipo}`;
  return NextResponse.json({ ok: true });
}
