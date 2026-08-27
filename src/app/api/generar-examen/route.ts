import { NextRequest, NextResponse } from "next/server";
import type { ParametrosExamen, PreguntaExamenInput, TipoExamen } from "@/lib/types";
import { generarContenidoDiagnostico, generarContenidoExamen } from "@/lib/anthropic";
import { buildDiagnosticoDocx, buildExamenDocx, type ImagenPreguntaExamen } from "@/lib/buildExamen";
import { buildKitSubidaExamenDocx } from "@/lib/buildKit";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { dentroDelLimiteDiario, registrarGeneracion, mensajeLimiteAlcanzado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ParamsExamenRequest extends ParametrosExamen {
  cicloId: string;
  jornadaId: string;
  /** Solo Diagnóstico (no tiene cursoId de dónde derivar la asignatura) — el docente la elige directamente. */
  asignaturaId?: string;
}

function validar(body: unknown): { ok: true; data: ParamsExamenRequest } | { ok: false; error: string } {
  const b = body as Partial<ParamsExamenRequest> | null;
  if (!b) return { ok: false, error: "Cuerpo de la petición vacío." };
  const requeridos: Array<keyof ParamsExamenRequest> = [
    "tipo", "clei", "grupoCleiJornada", "jornada", "cantidadPreguntas",
    "valoracionPregunta", "semana", "fechaAplicacion", "sede", "docente",
    "cicloId", "jornadaId",
  ];
  for (const campo of requeridos) {
    if (b[campo] === undefined || b[campo] === null || b[campo] === "") {
      return { ok: false, error: `Falta el campo requerido: ${String(campo)}` };
    }
  }
  const tiposValidos: TipoExamen[] = ["diagnostico", "intermedio", "final"];
  if (!tiposValidos.includes(b.tipo as TipoExamen)) {
    return { ok: false, error: "Tipo de examen inválido." };
  }
  if ((b.tipo === "intermedio" || b.tipo === "final") && !b.cursoId) {
    return { ok: false, error: "Falta el curso a evaluar (requerido para Intermedio/Final)." };
  }
  if (b.tipo === "diagnostico" && !b.asignaturaId) {
    return { ok: false, error: "Falta elegir la asignatura del diagnóstico." };
  }
  return { ok: true, data: b as ParamsExamenRequest };
}

/** Extrae params (JSON) + imagen/descripción por pregunta de un FormData multipart. */
async function leerFormData(request: NextRequest): Promise<{ body: unknown; preguntasInput: PreguntaExamenInput[] }> {
  const form = await request.formData();
  const paramsRaw = form.get("params");
  const body = typeof paramsRaw === "string" ? JSON.parse(paramsRaw) : null;

  const porIndice = new Map<number, PreguntaExamenInput>();
  for (const [key, value] of form.entries()) {
    const matchImg = key.match(/^preguntaImg_(\d+)$/);
    const matchDesc = key.match(/^preguntaDesc_(\d+)$/);
    if (matchImg && value instanceof File) {
      const index = Number(matchImg[1]);
      const tipo = value.type === "image/jpeg" ? "jpg" : "png";
      const buffer = Buffer.from(await value.arrayBuffer());
      porIndice.set(index, { ...(porIndice.get(index) ?? { index }), index, imagen: { buffer, tipo } });
    } else if (matchDesc && typeof value === "string") {
      const index = Number(matchDesc[1]);
      porIndice.set(index, { ...(porIndice.get(index) ?? { index }), index, descripcionImagen: value });
    }
  }
  return { body, preguntasInput: [...porIndice.values()] };
}

/** Temas del curso ya cubiertos hasta la fecha del examen (calendario_clases con guía generada). */
async function temasCubiertos(params: ParamsExamenRequest): Promise<string[]> {
  if (!params.cursoId) return [];
  const filas = await sql`
    select t.tema, t.subtemas
    from calendario_clases cc
    join temas t on t.id = cc.tema_id
    where cc.ciclo_id = ${params.cicloId} and cc.jornada_id = ${params.jornadaId}
      and cc.curso_id = ${params.cursoId} and cc.semana_academica <= ${params.semana}
    order by cc.semana_academica
  `;
  return filas.map((f) => `${f.tema} — ${f.subtemas}`);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  let preguntasInput: PreguntaExamenInput[] = [];
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      ({ body, preguntasInput } = await leerFormData(request));
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
  const datosFormulario = validado.data;

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
  }

  // Protección de costo: mismo criterio que /api/generar-guia — cuenta este
  // intento aunque termine en error abajo (los reintentos de anthropic.ts
  // también cuestan).
  if (!(await dentroDelLimiteDiario(email, "generar-examen"))) {
    return NextResponse.json({ error: mensajeLimiteAlcanzado() }, { status: 429 });
  }
  await registrarGeneracion(email, "generar-examen");

  // La asignatura nunca la manda el formulario a mano — se resuelve acá.
  // Intermedio/Final la sacan del curso elegido (cursos.asignatura_id,
  // misma fuente que ya filtra qué cursos ve cada docente). Diagnóstico no
  // tiene curso, así que el docente elige la asignatura directamente —
  // validada contra sus propias asignaturas asignadas (docente_asignaturas),
  // salvo que sea admin, que puede elegir cualquiera.
  let asignatura: string | undefined;
  if (datosFormulario.tipo === "diagnostico") {
    // validar() ya exigió asignaturaId para este tipo — el `if` es solo para que TS lo angoste.
    const asignaturaId = datosFormulario.asignaturaId;
    if (!asignaturaId) {
      return NextResponse.json({ error: "Falta elegir la asignatura del diagnóstico." }, { status: 400 });
    }
    const esAdmin = session?.user?.rol === "admin";
    const [fila] = esAdmin
      ? await sql`select nombre from asignaturas where id = ${asignaturaId}`
      : await sql`
          select a.nombre
          from asignaturas a
          join docente_asignaturas da on da.asignatura_id = a.id
          where a.id = ${asignaturaId} and da.email = ${email}
        `;
    asignatura = fila?.nombre;
    if (!asignatura) {
      return NextResponse.json(
        { error: "Esa asignatura no existe o no está asociada a tu cuenta." },
        { status: 403 }
      );
    }
  } else {
    // validar() ya exigió cursoId para intermedio/final — el `if` es solo para que TS lo angoste.
    const cursoId = datosFormulario.cursoId;
    if (!cursoId) {
      return NextResponse.json({ error: "Falta el curso a evaluar." }, { status: 400 });
    }
    const [fila] = await sql`
      select a.nombre
      from cursos c join asignaturas a on a.id = c.asignatura_id
      where c.id = ${cursoId}
    `;
    asignatura = fila?.nombre;
    if (!asignatura) {
      return NextResponse.json(
        { error: "No se pudo determinar la asignatura del curso elegido — vuelve a seleccionarlo." },
        { status: 400 }
      );
    }
  }
  const params: ParamsExamenRequest = { ...datosFormulario, asignatura };

  try {
    const contenido = params.tipo === "diagnostico"
      ? await generarContenidoDiagnostico(params, preguntasInput)
      : await generarContenidoExamen(params, await temasCubiertos(params), preguntasInput);

    const imagenes: ImagenPreguntaExamen[] = preguntasInput
      .filter((p): p is PreguntaExamenInput & { imagen: NonNullable<PreguntaExamenInput["imagen"]> } => !!p.imagen)
      .map((p) => ({ index: p.index, buffer: p.imagen.buffer, tipo: p.imagen.tipo }));

    const etiquetaTipo = params.tipo === "diagnostico" ? "Diagnostico" : params.tipo === "intermedio" ? "Examen_Intermedio" : "Examen_Final";
    const formCode = params.tipo === "diagnostico" ? "FTO-EDU-FOR-82_V2" : "FTO-EDU-FOR-98_V1";
    const nombreExamen = `${formCode}_${etiquetaTipo}_Semana${params.semana}_CLEI_${params.clei}_${params.jornada.replace(/\s+/g, "")}.docx`;

    const docxBuf = params.tipo === "diagnostico"
      ? await buildDiagnosticoDocx(params, contenido, imagenes)
      : await buildExamenDocx(params, contenido, imagenes);

    const kitBuf = await buildKitSubidaExamenDocx(params, contenido, { nombreArchivoExamen: nombreExamen });

    const archivos = [
      { nombre: nombreExamen, contenidoBase64: docxBuf.toString("base64") },
      { nombre: `KIT_SUBIDA_${etiquetaTipo}_Semana${params.semana}_CLEI_${params.clei}.docx`, contenidoBase64: kitBuf.toString("base64") },
    ];

    return NextResponse.json({ archivos, contenido });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido generando el examen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
