import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { ParametrosGuia, ImagenSubtema } from "@/lib/types";
import { generarContenidoGuia } from "@/lib/anthropic";
import { generarImagenMotivacional } from "@/lib/images";
import { buildGuiaDocx } from "@/lib/buildGuia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validar(body: unknown): { ok: true; data: ParametrosGuia } | { ok: false; error: string } {
  const b = body as Partial<ParametrosGuia> | null;
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
  return { ok: true, data: b as ParametrosGuia };
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
    // 1) Contenido pedagógico (IA) + 2) Imagen motivacional (Python) en paralelo
    // no es posible porque la imagen depende de la clave elegida dentro del
    // contenido (rotación por semana) — pero la clave hoy solo depende de
    // `semana`, así que sí podemos lanzarlas en paralelo.
    const [contenido, ilustracionBuf, logoBuf] = await Promise.all([
      generarContenidoGuia(params),
      generarImagenMotivacional(claveBancoParaSemana(params.semana)),
      fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg")),
    ]);

    const docxBuf = await buildGuiaDocx(params, contenido, { logoBuf, ilustracionBuf, imagenesSubtemas });

    const nombreArchivo = `FTO-EDU-FOR-96_V3_Guia_Semana${params.semana}_Guia${params.guia}_CLEI${params.clei}.docx`;

    return new NextResponse(docxBuf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      },
    });
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
