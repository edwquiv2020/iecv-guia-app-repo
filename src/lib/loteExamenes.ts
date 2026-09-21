import { cantidadPreguntasPorJornada, esNivel, type Clei, type Nivel } from "./types";

/** Una semana de "EXAMEN INTERMEDIO" del calendario, con todo lo necesario para generar su examen. */
export interface FilaLote {
  id: string; // calendario_clases.id
  semana: number;
  fecha: string; // yyyy-mm-dd
  cursoId: string | null;
  cursoNombre: string | null;
  nivel: string;
  examenGenerado: boolean;
  cicloId: string;
  cicloNombre: string;
  cicloGrados: string[];
  jornadaId: string;
  jornadaNombre: string;
  jornadaDias: string;
}

export function cleiDesdeCiclo(nombreCiclo: string): Clei | null {
  const codigo = nombreCiclo.replace("Ciclo", "").trim();
  return (["II", "III", "IV", "V", "VI"] as const).includes(codigo as Clei) ? (codigo as Clei) : null;
}

export function gradosATexto(grados: string[]): string {
  return grados.map((g) => g.replace("°", "")).join("-");
}

export function formatearFechaLarga(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** ¿Se puede generar el examen de esta fila? Necesita un curso y un ciclo con CLEI válido. */
export function motivoNoGenerable(fila: FilaLote): string | null {
  if (!fila.cursoId) return "sin curso en el calendario";
  if (!cleiDesdeCiclo(fila.cicloNombre)) return "ciclo sin CLEI";
  return null;
}

/** Mismos parámetros que arma el formulario de Exámenes para un Intermedio de una semana ya programada. */
export function paramsExamenIntermedio(fila: FilaLote, extra: { sede: string; docente: string }) {
  const clei = cleiDesdeCiclo(fila.cicloNombre);
  if (!clei || !fila.cursoId) throw new Error(`La semana ${fila.semana} de ${fila.cicloNombre} no se puede generar: ${motivoNoGenerable(fila)}.`);
  const jornada = fila.jornadaNombre.toUpperCase();
  const cantidadPreguntas = cantidadPreguntasPorJornada(fila.jornadaDias);
  const nivel: Nivel = esNivel(fila.nivel) ? fila.nivel : "basico";
  return {
    tipo: "intermedio" as const,
    clei,
    grupoCleiJornada: `${gradosATexto(fila.cicloGrados)}/${clei}/${jornada}`,
    jornada,
    cantidadPreguntas,
    valoracionPregunta: Math.round((5 / cantidadPreguntas) * 100) / 100,
    semana: fila.semana,
    fechaAplicacion: formatearFechaLarga(fila.fecha),
    sede: extra.sede,
    docente: extra.docente,
    cicloId: fila.cicloId,
    jornadaId: fila.jornadaId,
    cursoId: fila.cursoId,
    cursoNombre: fila.cursoNombre ?? undefined,
    nivel,
  };
}

/** Ruta dentro del ZIP: "Ciclo III/Semanal 1/archivo.docx" (sin caracteres que rompan rutas). */
export function rutaEnZip(cicloNombre: string, jornadaNombre: string, archivo: string): string {
  const limpio = (t: string) => t.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${limpio(cicloNombre)}/${limpio(jornadaNombre)}/${limpio(archivo)}`;
}
