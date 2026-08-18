import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { ParametrosGuia, ImagenSubtema } from "@/lib/types";
import { generarContenidoGuia, generarContenidoDua, generarCuestionarioKahoot } from "@/lib/anthropic";
import { generarImagenMotivacional } from "@/lib/images";
import { buildGuiaDocx, buildGuiaDuaDocx } from "@/lib/buildGuia";
import { buildKahootXlsx } from "@/lib/buildKahoot";
import { buildKitSubidaDocx } from "@/lib/buildKit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TipoGuia = "estandar" | "dua";
interface ParamsConTipos extends ParametrosGuia {
  tipos: TipoGuia[];
}

function validar(body: unknown): { ok: true; data: ParamsConTipos } | { ok: false; error: string } {
  const b = body as Partial<ParamsConTipos> | null;
  if (!b) return { ok: false, error: "Cuerpo de la petición vacío." };
  const requeridos: Array<keyof ParametrosGuia> = [
    "clei", "grupoCleiJornada", "jornada", "semana", "guia",
    "fechaClase", "fechaClaseLarga", "tema", "subtemas",
    "fechaCargue", "horaMaxima", "videoApoyo",
  ];
  for (const campo of requeridos) {
    if (b[campo] === undefined || b[campo] === null || b[campo] === "") {
      return { ok: false, error: `Falta el campo requerido: ${String(campo)}` };
    }
  }
  if (!Array.isArray(b.subtemas) || b.subtemas.length === 0) {
    return { ok: false, error: "Debes indicar al menos un subtema." };
  }
  if (!b.videoApoyo?.url || !b.videoApoyo?.titulo) {
    return { ok: false, error: "Falta el video de apoyo (título y URL)." };
  }
  if (!Array.isArray(b.tipos) || b.tipos.length === 0) {
    return { ok: false, error: "Debes elegir al menos un tipo de guía (Estándar, DUA)." };
  }
  return { ok: true, data: b as ParamsConTipos };
}

/** Extrae params (JSON) + imágenes por subtema de un FormData multipart. */
async function leerFormData(request: NextRequest): Promise<{ body: unknown; imagenesSubtemas: ImagenSubtema[] }> {
  const form = await request.formData();
  const paramsRaw = form.get("params");
  const body = typeof paramsRaw === "string" ? JSON.parse(paramsRaw) : null;

  const imagenesSubtemas: ImagenSubtema[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("subtemaImg_") || !(value instanceof File)) continue;
    const [, subtemaIndexStr] = key.split("_");
    const subtemaIndex = Number(subtemaIndexStr);
    const esCapturaOffice = form.get(`subtemaImgEsCaptura_${subtemaIndex}`) === "true";
    const tipo = value.type === "image/jpeg" ? "jpg" : "png";
    const buffer = Buffer.from(await value.arrayBuffer());
    imagenesSubtemas.push({ subtemaIndex, buffer, tipo, esCapturaOffice });
  }
  return { body, imagenesSubtemas };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  let imagenesSubtemas: ImagenSubtema[] = [];
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      ({ body, imagenesSubtemas } = await leerFormData(request));
    } else {
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const validado = validar(body);
  if (!validado.ok) {
    return NextResponse.json({ error: validado.error }, { status: 400 });
  }
  const params = validado.data;

  try {
    // Tipos de taller usados en las últimas guías Estándar de este mismo
    // curso, para pedirle a la IA que no repita siempre la misma combinación.
    let talleresRecientes: string[] = [];
    if (params.cursoId) {
      const filas = await sql`
        select g.talleres_tipos
        from guias g
        join calendario_clases cc on cc.id = g.calendario_clase_id
        where cc.curso_id = ${params.cursoId} and g.tipo = 'estandar' and g.talleres_tipos is not null
        order by g.generado_en desc
        limit 3
      `;
      talleresRecientes = [...new Set(filas.flatMap((f) => f.talleres_tipos as string[]))];
    }

    // 1) Contenido pedagógico (IA) + 2) Imagen motivacional (Python) en paralelo
    // no es posible porque la imagen depende de la clave elegida dentro del
    // contenido (rotación por semana) — pero la clave hoy solo depende de
    // `semana`, así que sí podemos lanzarlas en paralelo.
    const [contenido, ilustracionBuf, logoBuf] = await Promise.all([
      generarContenidoGuia(params, talleresRecientes),
      generarImagenMotivacional(claveBancoParaSemana(params.semana)),
      fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg")),
    ]);

    const archivos: Array<{ nombre: string; contenidoBase64: string }> = [];
    let talleresTipos: string[] | undefined;

    if (params.tipos.includes("estandar")) {
      const nombreGuia = `FTO-EDU-FOR-96_V3_Guia_Semana${params.semana}_Guia${params.guia}_CLEI${params.clei}.docx`;
      const nombreKahoot = `Cuestionario_Semana${params.semana}_CLEI${params.clei}_Kahoot.xlsx`;

      const docxBuf = await buildGuiaDocx(params, contenido, { logoBuf, ilustracionBuf, imagenesSubtemas });
      archivos.push({ nombre: nombreGuia, contenidoBase64: docxBuf.toString("base64") });
      talleresTipos = contenido.talleres.map((t) => t.tipo);

      // El cuestionario Kahoot se genera siempre junto con la guía Estándar
      // (no hay que pedirlo aparte) — nunca se sube automáticamente, ver kit.
      const cuestionarioKahoot = await generarCuestionarioKahoot(params, contenido);
      const kahootBuf = await buildKahootXlsx(params, cuestionarioKahoot);
      archivos.push({ nombre: nombreKahoot, contenidoBase64: kahootBuf.toString("base64") });

      const kitBuf = await buildKitSubidaDocx(params, { nombreArchivoGuia: nombreGuia, nombreArchivoKahoot: nombreKahoot });
      archivos.push({
        nombre: `KIT_SUBIDA_Semana${params.semana}_CLEI${params.clei}.docx`,
        contenidoBase64: kitBuf.toString("base64"),
      });
    }

    if (params.tipos.includes("dua")) {
      // Encadenada: usa el contenido de la Estándar (subtema A) como base,
      // para que ambas versiones queden consistentes en el fondo.
      const contenidoDua = await generarContenidoDua(params, contenido);
      const imagenesSubtemaA = imagenesSubtemas.filter((img) => img.subtemaIndex === 0);
      const docxDuaBuf = await buildGuiaDuaDocx(params, contenidoDua, { logoBuf, ilustracionBuf, imagenesSubtemaA });
      archivos.push({
        nombre: `FTO-EDU-FOR-96_V3_Guia_Semana${params.semana}_Guia${params.guia}_CLEI${params.clei}_ADAPTADA.docx`,
        contenidoBase64: docxDuaBuf.toString("base64"),
      });
    }

    return NextResponse.json({ archivos, talleresTipos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido generando la guía.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Debe coincidir con la rotación usada en lib/anthropic.ts (fotoParaSemana).
const BANCO_KEYS = [
  "tortuga", "buho", "leon", "elefante", "aguila", "delfin", "lobo",
  "montana_amanecer", "sendero_bosque", "oceano_rocas", "desierto", "cascada",
  "girasoles", "mariposa", "colibri", "caballo", "estrellas", "brujula",
  "atardecer_playa", "bosque_pino",
];
function claveBancoParaSemana(semana: number): string {
  return BANCO_KEYS[(semana - 1) % BANCO_KEYS.length];
}
