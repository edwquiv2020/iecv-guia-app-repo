import type { ParametrosExamen, ContenidoExamen, ContenidoDiagnostico } from "./types";
import { buildExamenDesdePlantilla, buildDiagnosticoDesdePlantilla } from "./plantillaExamen";

/** Imagen de apoyo ya resuelta para UNA pregunta puntual (índice 1-indexado). */
export interface ImagenPreguntaExamen {
  index: number;
  buffer: Buffer;
  tipo: "png" | "jpg";
}

/**
 * Diagnóstico de Presaberes (FTO-EDU-FOR-82) — 7 preguntas abiertas. Se
 * construye desde el archivo original de la institución (ver plantillaExamen.ts).
 */
export async function buildDiagnosticoDocx(params: ParametrosExamen, contenido: ContenidoDiagnostico): Promise<Buffer> {
  return buildDiagnosticoDesdePlantilla(params, contenido);
}

/**
 * Instrumento de Evaluación (FTO-EDU-FOR-98) — Intermedio o Final, un curso
 * específico. Se construye desde el archivo original de la institución (ver
 * plantillaExamen.ts).
 */
export async function buildExamenDocx(params: ParametrosExamen, contenido: ContenidoExamen, imagenes: ImagenPreguntaExamen[] = []): Promise<Buffer> {
  if (params.tipo === "diagnostico") throw new Error("Usa buildDiagnosticoDocx() para el tipo 'diagnostico'.");
  return buildExamenDesdePlantilla(params, contenido, imagenes);
}
