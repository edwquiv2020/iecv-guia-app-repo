// Seguimiento de estudiantes: aspectos por fuera de lo cognitivo —
// personales y sociales — calificados de 1 a 5 (5 = mejor) clase a clase.
// Los 10 criterios son una lista fija (mismo patrón que ICONOS_PASOS o
// CRITERIO_PARTICIPACION_DUA en types.ts): el docente los definió así y
// cambiarlos es un cambio de código, no un dato editable desde un panel.
// Privado por docente: cada estudiante y cada registro quedan asociados a
// quien los creó (docente_email) — ver db/schema.sql y las rutas de
// /api/estudiantes y /api/seguimiento.

export type CategoriaCriterio = "personal" | "social";

export interface CriterioSeguimiento {
  id: string;
  categoria: CategoriaCriterio;
  etiqueta: string;
  ayuda: string;
}

export const CRITERIOS_SEGUIMIENTO: CriterioSeguimiento[] = [
  { id: "puntualidad", categoria: "personal", etiqueta: "Puntualidad", ayuda: "Llegada a tiempo a la jornada y a cada clase." },
  { id: "presentacion", categoria: "personal", etiqueta: "Uniforme y presentación personal", ayuda: "Uso correcto del uniforme y cuidado de la presentación." },
  { id: "asistencia", categoria: "personal", etiqueta: "Ausencias con soporte", ayuda: "Justifica sus inasistencias con el soporte correspondiente." },
  { id: "responsabilidad", categoria: "personal", etiqueta: "Responsabilidad y reposición de trabajos", ayuda: "Cumple y repone tareas y evaluaciones pendientes." },
  { id: "participacion", categoria: "personal", etiqueta: "Participación e interés", ayuda: "Participa activamente y muestra interés en la clase." },
  { id: "comunicacion", categoria: "social", etiqueta: "Comunicación asertiva", ayuda: "Se expresa con respeto hacia docentes y compañeros." },
  { id: "convivencia", categoria: "social", etiqueta: "Cumplimiento del manual de convivencia", ayuda: "Cumple las normas institucionales de convivencia." },
  { id: "conducto", categoria: "social", etiqueta: "Seguimiento del conducto regular", ayuda: "Sigue el conducto regular ante situaciones o inquietudes." },
  { id: "relacionamiento", categoria: "social", etiqueta: "Relacionamiento y resolución de conflictos", ayuda: "Se relaciona sanamente y resuelve conflictos de forma adecuada." },
  { id: "pertenencia", categoria: "social", etiqueta: "Sentido de pertenencia", ayuda: "Muestra sentido de pertenencia con la institución y el grupo." },
];

export const IDS_PERSONAL = CRITERIOS_SEGUIMIENTO.filter((c) => c.categoria === "personal").map((c) => c.id);
export const IDS_SOCIAL = CRITERIOS_SEGUIMIENTO.filter((c) => c.categoria === "social").map((c) => c.id);

/** Nombres de columna en seguimiento_registros — coinciden 1:1 con los ids de arriba. */
export const COLUMNAS_CRITERIOS = CRITERIOS_SEGUIMIENTO.map((c) => c.id);

export const ETIQUETAS_ESCALA: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Insuficiente",
  2: "Bajo",
  3: "Aceptable",
  4: "Bueno",
  5: "Excelente",
};

/** Una fila cruda de seguimiento_registros (o un objeto con las mismas claves de criterio). */
export type FilaRegistro = Record<string, unknown>;

function promedio(valores: number[]): number | null {
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export interface ResumenAgregado {
  registros: number;
  porCriterio: Record<string, number | null>;
  personal: number | null;
  social: number | null;
  definitiva: number | null;
}

/**
 * Agrega N registros de clase de un mismo estudiante+período en la nota
 * definitiva: promedia cada criterio por separado (solo sobre los
 * registros donde de verdad se diligenció), y luego promedia personal/
 * social a partir de esos promedios por criterio — así un registro
 * parcial (una clase donde solo se calificaron algunos criterios, que es
 * el flujo normal de "una clase a la vez") no distorsiona el resultado
 * frente a uno completo.
 */
export function agregarRegistros(filas: FilaRegistro[]): ResumenAgregado {
  const porCriterio: Record<string, number | null> = {};
  for (const id of COLUMNAS_CRITERIOS) {
    const valores = filas
      .map((f) => f[id])
      .filter((v): v is number => typeof v === "number");
    porCriterio[id] = promedio(valores);
  }
  const personal = promedio(
    IDS_PERSONAL.map((id) => porCriterio[id]).filter((v): v is number => v != null)
  );
  const social = promedio(
    IDS_SOCIAL.map((id) => porCriterio[id]).filter((v): v is number => v != null)
  );
  const definitiva = promedio([personal, social].filter((v): v is number => v != null));
  return { registros: filas.length, porCriterio, personal, social, definitiva };
}
