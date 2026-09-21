import Anthropic from "@anthropic-ai/sdk";
import { ETIQUETA_NIVEL, type Nivel } from "./types";

export const MAX_CLASES_MALLA = 40;

export interface ParametrosMallaIA {
  cursoNombre: string;
  asignatura: string | null;
  nivel: Nivel;
  temaGeneral: string;
  clases: number;
  indicaciones?: string;
}

export interface TemaMallaGenerado {
  tema: string;
  /** Subtemas separados por salto de línea (uno por línea), como los guarda el editor de mallas. */
  subtemas: string;
}

const DESCRIPCION_NIVEL: Record<Nivel, string> = {
  basico:
    "BÁSICO: el estudiante adulto parte de cero o casi cero en el tema. Conceptos fundamentales, vocabulario esencial, prácticas guiadas paso a paso y tareas cotidianas simples. No asumas conocimientos previos.",
  intermedio:
    "INTERMEDIO: el estudiante ya domina lo fundamental del tema (lo visto en el nivel básico). Profundiza en herramientas y procedimientos de uso frecuente, combina varios conceptos y resuelve problemas de la vida laboral o cotidiana de complejidad media.",
  avanzado:
    "AVANZADO: el estudiante ya domina el nivel intermedio. Trabaja funciones y técnicas especializadas, automatización o análisis, integración de varias herramientas y resolución de problemas complejos con criterio propio.",
};

function systemPrompt(p: ParametrosMallaIA): string {
  return `Actúas como docente y diseñador curricular experto en ${p.asignatura ?? p.cursoNombre} del
Instituto de Educación Comfenalco Valle (IECV), programa de Educación Básica y
Media por Ciclos (CLEI) para jóvenes y adultos, sede Cali. Diseñas la MALLA de
un curso: la lista ordenada de temas, uno por clase, que el docente dictará
semana a semana.

Nivel de la malla — ${DESCRIPCION_NIVEL[p.nivel]}

Reglas:
- Exactamente ${p.clases} temas: uno por clase, en el orden en que se dictan. Cada clase construye sobre las anteriores (de lo más sencillo a lo más exigente dentro del nivel), sin repetir temas.
- "tema": un título corto en español (máximo 8 palabras), sin numeración, ej. "Función lógica SI".
- "subtemas": entre 2 y 4 subtemas concretos de esa clase, uno por línea, cada uno una frase corta (no oraciones largas). Sin viñetas ni numeración.
- Contenido dictable en UNA clase de 1 a 2 horas para adultos. Aterrizado a situaciones laborales o cotidianas, no escolares.
- Sin markdown. No incluyas enlaces, videos ni referencias a archivos.

Entrega el resultado exclusivamente llamando a la herramienta entregar_malla.`;
}

function userPrompt(p: ParametrosMallaIA): string {
  return `Diseña la malla del curso "${p.cursoNombre}" (nivel ${ETIQUETA_NIVEL[p.nivel]}):

- Tema general del curso: ${p.temaGeneral}
- Número de clases (temas): ${p.clases}${p.indicaciones?.trim() ? `\n- Indicaciones del docente: ${p.indicaciones.trim()}` : ""}`;
}

function mallaTool(clases: number) {
  return {
    name: "entregar_malla",
    description: "Entrega la malla del curso: un tema por clase, en orden.",
    input_schema: {
      type: "object" as const,
      properties: {
        temas: {
          type: "array",
          minItems: clases,
          maxItems: clases,
          description: `Exactamente ${clases} temas, EN ORDEN (el elemento N es la clase N).`,
          items: {
            type: "object",
            properties: {
              tema: { type: "string", description: "Título corto del tema de la clase (máximo 8 palabras)." },
              subtemas: { type: "string", description: "Entre 2 y 4 subtemas, uno por línea (separados por salto de línea), frases cortas." },
            },
            required: ["tema", "subtemas"],
          },
        },
      },
      required: ["temas"],
    },
  };
}

export function validarMalla(data: { temas?: TemaMallaGenerado[] }, clases: number): string[] {
  if (!Array.isArray(data.temas) || data.temas.length !== clases) return [`temas (deben ser exactamente ${clases})`];
  const faltantes: string[] = [];
  data.temas.forEach((t, i) => {
    if (!t.tema || t.tema.trim() === "") faltantes.push(`clase ${i + 1} (tema)`);
    if (!t.subtemas || t.subtemas.trim() === "") faltantes.push(`clase ${i + 1} (subtemas)`);
  });
  return faltantes;
}

/** Limpia lo que devuelve la IA: recorta espacios, quita viñetas/numeración de los subtemas y líneas vacías. */
export function normalizarTema(t: TemaMallaGenerado): TemaMallaGenerado {
  const subtemas = t.subtemas
    .split(/\r?\n|;/)
    .map((s) => s.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
  return { tema: t.tema.trim().replace(/^\d+[.)]\s*/, ""), subtemas };
}

export async function generarMallaIA(params: ParametrosMallaIA): Promise<TemaMallaGenerado[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  const client = new Anthropic({ apiKey });
  const tool = mallaTool(params.clases);

  let ultimoError: Error | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: systemPrompt(params),
      messages: [{ role: "user", content: userPrompt(params) }],
      tools: [tool],
      tool_choice: { type: "tool", name: "entregar_malla" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      ultimoError = new Error("El modelo no devolvió la malla esperada (sin tool_use en la respuesta).");
      continue;
    }
    const data = toolUse.input as { temas?: TemaMallaGenerado[] };
    const faltantes = validarMalla(data, params.clases);
    if (faltantes.length > 0) {
      ultimoError = new Error(`La malla quedó incompleta: ${faltantes.join(", ")}.`);
      continue;
    }
    const temas = (data.temas as TemaMallaGenerado[]).map(normalizarTema);
    if (temas.some((t) => !t.tema || !t.subtemas)) {
      ultimoError = new Error("La malla quedó incompleta: algún tema quedó sin subtemas válidos.");
      continue;
    }
    return temas;
  }
  throw ultimoError ?? new Error("No se pudo generar la malla.");
}
