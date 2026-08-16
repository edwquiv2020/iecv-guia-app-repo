import Anthropic from "@anthropic-ai/sdk";
import type { ParametrosGuia, ContenidoGuia } from "./types";
import { duracionPorClei } from "./types";

const BANCO_KEYS = [
  "tortuga", "buho", "leon", "elefante", "aguila", "delfin", "lobo",
  "montana_amanecer", "sendero_bosque", "oceano_rocas", "desierto", "cascada",
  "girasoles", "mariposa", "colibri", "caballo", "estrellas", "brujula",
  "atardecer_playa", "bosque_pino",
];

/** Rotación cíclica semana a semana, igual que indicaba la skill original. */
function fotoParaSemana(semana: number): string {
  return BANCO_KEYS[(semana - 1) % BANCO_KEYS.length];
}

const CONTENIDO_TOOL = {
  name: "entregar_contenido_guia",
  description: "Entrega el contenido pedagógico completo de la guía de formación en el formato estructurado requerido.",
  input_schema: {
    type: "object" as const,
    properties: {
      saludoMotivacion: { type: "string", description: "Saludo cercano, motivador, sin infantilizar, anclado a una situación laboral o cotidiana de adultos, relacionado con el tema de la semana." },
      introduccion: { type: "string", description: "Contexto y relevancia del tema." },
      competencia: { type: "string", description: "Competencia particularizada al tema puntual, no genérica." },
      desempeno: { type: "string", description: "Desempeño particularizado al tema puntual." },
      reflexionInicial: { type: "string", description: "Analogía o pregunta detonante para iniciar el DESARROLLO." },
      subtemas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            funcion: { type: "string", description: "Explicación técnica del subtema." },
          },
          required: ["titulo", "funcion"],
        },
      },
      talleres: {
        type: "array",
        description: "2 talleres para CLEI III, 3 talleres para CLEI IV/V/VI.",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string", description: "cuestionario | emparejamiento | caso de estudio | ejercicio guiado | producto entregable" },
            instrucciones: { type: "string" },
            items: { type: "array", items: { type: "string" }, description: "Preguntas o pasos numerados del taller." },
          },
          required: ["tipo", "instrucciones", "items"],
        },
      },
      rubricaCriteriosEspecificos: {
        type: "array",
        description: "3 a 4 criterios específicos (uno por subtema), SIN incluir los genéricos de Participación / Herramientas / Entrega (esos ya los agrega la app).",
        items: {
          type: "object",
          properties: {
            criterio: { type: "string" },
            superior: { type: "string" },
            alto: { type: "string" },
            basico: { type: "string" },
            bajo: { type: "string" },
          },
          required: ["criterio", "superior", "alto", "basico", "bajo"],
        },
      },
      bibliografia: {
        type: "array",
        items: {
          type: "object",
          properties: { autor: { type: "string" }, anio: { type: "string" }, titulo: { type: "string" } },
          required: ["autor", "anio", "titulo"],
        },
      },
    },
    required: [
      "saludoMotivacion", "introduccion", "competencia", "desempeno", "reflexionInicial",
      "subtemas", "talleres", "rubricaCriteriosEspecificos", "bibliografia",
    ],
  },
};

function systemPrompt(): string {
  return `Actúas como docente experto en Tecnología e Informática del Instituto de
Educación Comfenalco Valle (IECV), programa de Educación Básica y Media por
Ciclos (CLEI) para jóvenes y adultos, sede Cali. Redactas el contenido
pedagógico de la Guía de Formación semanal, formato institucional
FTO-EDU-FOR-96 V3.

Escribe para estudiantes en extra edad y adultos: tono cercano, respetuoso,
motivador, sin infantilizar; ejemplos anclados en situaciones laborales o
cotidianas de adultos (control de gastos, un negocio propio, un trámite
laboral, etc.).

Reglas de contenido:
- Competencia y Desempeño deben ser particularizados al tema puntual, nunca genéricos.
- Los subtemas deben cubrir exactamente los subtemas indicados por el docente, en el mismo orden.
- Los talleres deben basarse en los conceptos exactos del tema/subtemas de esta semana, no inventes temas nuevos.
- La rúbrica específica debe tener un criterio por subtema (3-4 criterios), con descripciones de desempeño reales y verificables, no genéricas ("hace bien el ejercicio" no sirve).
- La bibliografía debe ser plausible y estar relacionada con el tema (formato: Autor. (Año). Título.).
- No uses markdown en los textos (nada de **, #, etc.), son párrafos de un documento Word formal.

Entrega el resultado exclusivamente llamando a la herramienta entregar_contenido_guia.`;
}

function userPrompt(params: ParametrosGuia): string {
  const { duracion, numTalleres } = duracionPorClei(params.clei);
  return `Genera el contenido para la guía de esta semana:

- CLEI: ${params.clei}
- Jornada: ${params.jornada}
- Semana No: ${params.semana} / Guía No: ${params.guia}
- Tema: ${params.tema}
- Subtemas a desarrollar (en este orden): ${params.subtemas.join(", ")}
- Duración de la guía: ${duracion}
- Número de talleres requeridos: ${numTalleres}
- Fecha de la clase: ${params.fechaClaseLarga}`;
}

/**
 * Llama a la API de Anthropic para generar el contenido pedagógico de la guía.
 * Requiere ANTHROPIC_API_KEY en el entorno (ver .env.example).
 */
export async function generarContenidoGuia(params: ParametrosGuia): Promise<ContenidoGuia> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en el entorno. Consigue una API key en https://console.anthropic.com y agrégala a .env.local"
    );
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: systemPrompt(),
    messages: [{ role: "user", content: userPrompt(params) }],
    tools: [CONTENIDO_TOOL],
    tool_choice: { type: "tool", name: "entregar_contenido_guia" },
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("El modelo no devolvió el contenido esperado (sin tool_use en la respuesta).");
  }

  const data = toolUse.input as Omit<ContenidoGuia, "fotoMotivacionalClave">;

  return {
    ...data,
    fotoMotivacionalClave: fotoParaSemana(params.semana),
  };
}
