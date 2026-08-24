import Anthropic from "@anthropic-ai/sdk";
import type { ParametrosGuia, ContenidoGuia, ContenidoDua, ContenidoKahoot, ParametrosExamen, ContenidoExamen, PreguntaExamenInput } from "./types";
import { duracionPorClei, BIBLIOGRAFIA_TEORICA_ESTANDAR, BIBLIOGRAFIA_TEORICA_DUA, ICONOS_PASOS, TIEMPOS_KAHOOT } from "./types";

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
      objetivoGuia: {
        type: "array",
        description: "Exactamente 3 logros concretos y verificables que el estudiante podrá hacer SOLO, sin ayuda, al terminar la guía (recuadro 'OBJETIVO DE LA GUÍA'). Cada ítem empieza directo con el verbo en infinitivo, SIN repetir 'vas a poder' (la app ya antepone esa frase una sola vez) — ej. 'ubicar cualquier celda por su referencia', no 'vas a poder ubicar cualquier celda...'.",
        items: { type: "string" },
      },
      reflexionInicial: { type: "string", description: "Analogía o pregunta detonante para iniciar el DESARROLLO." },
      parteDeLoQueYaSabes: {
        type: "string",
        description: "1-2 frases que conectan el tema con algo que el estudiante adulto ya sabe hacer en su vida cotidiana o trabajo, sin computador (recuadro 'PARTE DE LO QUE YA SABES').",
      },
      subtemas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            funcion: { type: "string", description: "Explicación técnica del subtema." },
            pasos: {
              type: "array",
              description: `SOLO si el subtema es un procedimiento concreto de Windows/Office (ej. "Guardar un documento", "Aplicar negrita") — omite este campo por completo si el subtema es conceptual/explicativo. Cada paso lleva su ícono si corresponde a una de estas acciones: ${ICONOS_PASOS.join(", ")}. Si el paso no corresponde a ninguna, usa "ninguno" — nunca inventes un ícono fuera de esta lista.`,
              items: {
                type: "object",
                properties: {
                  texto: { type: "string" },
                  icono: { type: "string", enum: [...ICONOS_PASOS, "ninguno"] },
                },
                required: ["texto", "icono"],
              },
            },
            rutaVisual: {
              type: "object",
              description: "Resumen visual del procedimiento como tira 'pestaña > grupo > opciones' de la cinta real de Word/Excel/PowerPoint (reemplaza la Imagen Representativa en texto). Mismo criterio que 'pasos': agrégalo solo si el subtema es un procedimiento concreto con pasos, y omítelo por completo si es conceptual. Usa los nombres REALES de pestaña y grupo del programa que corresponda al tema (ej. Word: 'Inicio'>'Fuente'/'Párrafo'; Excel: 'Inicio'>'Alineación'; Insertar>'Ilustraciones'/'Tablas'). Las opciones deben ser un subconjunto (2 a 4) de los íconos ya usados en 'pasos' de este mismo subtema, en el orden real en que aparecen en la cinta.",
              properties: {
                tab: { type: "string", description: "Nombre real de la pestaña de la cinta, ej. 'Inicio', 'Insertar'." },
                grupo: { type: "string", description: "Nombre real del grupo dentro de esa pestaña, ej. 'Fuente', 'Párrafo', 'Ilustraciones'." },
                opciones: {
                  type: "array",
                  description: "2 a 4 opciones, en el orden real en que aparecen en la cinta.",
                  items: {
                    type: "object",
                    properties: {
                      icono: { type: "string", enum: ICONOS_PASOS },
                      etiqueta: { type: "string", description: "Etiqueta corta tal como aparece en la cinta, ej. 'Negrita', 'Centrar'." },
                    },
                    required: ["icono", "etiqueta"],
                  },
                },
              },
              required: ["tab", "grupo", "opciones"],
            },
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
      listaVerificacion: {
        type: "array",
        description: "3-4 frases cortas en primera persona que el estudiante marca antes de entregar (recuadro 'LISTA DE VERIFICACIÓN ANTES DE ENTREGAR'), ej. 'Guardé el archivo con el nombre correcto.'",
        items: { type: "string" },
      },
      antesDeCerrarPregunta: {
        type: "string",
        description: "Pregunta reflexiva breve que conecta lo aprendido con la vida real del estudiante esta semana (recuadro 'ANTES DE CERRAR: ¿EN QUÉ TE SIRVE ESTO?').",
      },
      fichaResumen: {
        type: "array",
        description: "Un ítem por cada subtema (mismo orden y cantidad que 'subtemas'): concepto = el título corto, resumen = una frase de referencia rápida (recuadro 'FICHA RESUMEN').",
        items: {
          type: "object",
          properties: { concepto: { type: "string" }, resumen: { type: "string" } },
          required: ["concepto", "resumen"],
        },
      },
      bibliografia: {
        type: "array",
        description: "3-4 referencias sobre el TEMA puntual de la semana (no incluyas aquí la bibliografía teórica de andragogía/visual — esa la agrega la app aparte).",
        items: {
          type: "object",
          properties: { autor: { type: "string" }, anio: { type: "string" }, titulo: { type: "string" } },
          required: ["autor", "anio", "titulo"],
        },
      },
    },
    required: [
      "saludoMotivacion", "introduccion", "competencia", "desempeno", "objetivoGuia",
      "reflexionInicial", "parteDeLoQueYaSabes", "subtemas", "talleres",
      "rubricaCriteriosEspecificos", "listaVerificacion", "antesDeCerrarPregunta",
      "fichaResumen", "bibliografia",
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
- objetivoGuia: 3 logros de acción verificables, en segunda persona ("vas a poder..."), no genéricos ni copiados del estándar.
- parteDeLoQueYaSabes: conecta con una situación real de un adulto (gastos de casa, un negocio propio, un trámite laboral), nunca con experiencia escolar previa.
- Los subtemas deben cubrir exactamente los subtemas indicados por el docente, en el mismo orden.
- pasos: solo agrégalo cuando el subtema sea un procedimiento concreto de Windows/Office con acciones que el estudiante ejecuta en orden (ej. "1. Abra el menú Archivo. 2. Haga clic en Guardar."). No lo agregues para subtemas conceptuales/explicativos — en esos casos deja el subtema solo con "función", como antes. Antes de asignar un ícono, confirma que de verdad corresponda a esa acción exacta — es mejor "ninguno" que un ícono equivocado.
- rutaVisual: mismo criterio que pasos (solo procedimientos concretos). Tab y grupo deben ser los nombres REALES de la cinta del programa exacto del tema (no inventes ni mezcles Word/Excel/PowerPoint), y las opciones deben salir de los íconos que ya usaste en "pasos" de ese subtema — nunca agregues un ícono ahí que no hayas usado en algún paso.
- Los talleres deben basarse en los conceptos exactos del tema/subtemas de esta semana, no inventes temas nuevos.
- Rota el tipo de taller entre guías — si el usuario te indica tipos usados recientemente en este curso, no los repitas, elige uno distinto de la lista de tipos disponibles.
- La rúbrica específica debe tener un criterio por subtema (3-4 criterios), con descripciones de desempeño reales y verificables, no genéricas ("hace bien el ejercicio" no sirve).
- listaVerificacion: en primera persona ("Guardé...", "Escribí..."), específica de las acciones de esta guía, no genérica.
- fichaResumen: mismo orden y cantidad que subtemas, resumen de una frase corta cada uno, pensado como referencia rápida sin releer la guía.
- La bibliografía debe ser plausible y estar relacionada con el tema (formato: Autor. (Año). Título.). No incluyas aquí la bibliografía teórica de andragogía — la agrega la aplicación aparte.
- Nunca menciones el día de la semana ni la jornada (nada de "esta sesión de sábado") — la misma guía se reutiliza para Semanal 1, Sábado 1 y Sábado 2.
- No uses markdown en los textos (nada de **, #, etc.), son párrafos de un documento Word formal.

Entrega el resultado exclusivamente llamando a la herramienta entregar_contenido_guia.`;
}

const TIPOS_TALLER_DISPONIBLES = ["cuestionario", "emparejamiento", "caso de estudio", "ejercicio guiado", "producto entregable"];

function userPrompt(params: ParametrosGuia, talleresRecientes: string[]): string {
  const { duracion, numTalleres } = duracionPorClei(params.clei);
  const lineaRotacion = talleresRecientes.length > 0
    ? `\n- Tipos de taller usados en las últimas guías de este mismo curso (EVITA repetirlos, elige tipos distintos de esta lista si es posible): ${talleresRecientes.join(", ")}. Tipos disponibles: ${TIPOS_TALLER_DISPONIBLES.join(", ")}.`
    : "";
  return `Genera el contenido para la guía de esta semana:

- CLEI: ${params.clei}
- Jornada: ${params.jornada}
- Semana No: ${params.semana} / Guía No: ${params.guia}
- Tema: ${params.tema}
- Subtemas a desarrollar (en este orden): ${params.subtemas.join(", ")}
- Duración de la guía: ${duracion}
- Número de talleres requeridos: ${numTalleres}
- Fecha de la clase: ${params.fechaClaseLarga}${lineaRotacion}`;
}

/**
 * Llama a la API de Anthropic para generar el contenido pedagógico de la guía.
 * Requiere ANTHROPIC_API_KEY en el entorno (ver .env.example).
 *
 * @param talleresRecientes tipos de taller usados en las últimas guías del
 * mismo curso (ver Fase 1 del roadmap) — se le pide al modelo no repetirlos.
 */
export async function generarContenidoGuia(params: ParametrosGuia, talleresRecientes: string[] = []): Promise<ContenidoGuia> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en el entorno. Consigue una API key en https://console.anthropic.com y agrégala a .env.local"
    );
  }

  const client = new Anthropic({ apiKey });

  // El modelo a veces omite algún campo cuando la llamada tiene muchos
  // requeridos a la vez (mismo hallazgo real que en DUA/Kahoot) — un
  // reintento resuelve la gran mayoría de casos.
  let ultimoError: Error | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(params, talleresRecientes) }],
      tools: [CONTENIDO_TOOL],
      tool_choice: { type: "tool", name: "entregar_contenido_guia" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      ultimoError = new Error("El modelo no devolvió el contenido esperado (sin tool_use en la respuesta).");
      continue;
    }

    const data = toolUse.input as Omit<ContenidoGuia, "fotoMotivacionalClave">;
    const faltantes = validarContenidoGuia(data);
    if (faltantes.length > 0) {
      ultimoError = new Error(`El modelo devolvió contenido incompleto (faltan o están vacíos: ${faltantes.join(", ")}).`);
      continue;
    }

    return {
      ...data,
      bibliografia: [...data.bibliografia, ...BIBLIOGRAFIA_TEORICA_ESTANDAR],
      fotoMotivacionalClave: fotoParaSemana(params.semana),
    };
  }

  throw ultimoError ?? new Error("No se pudo generar el contenido de la guía.");
}

/** Valida que el modelo haya llenado todos los campos requeridos (a veces omite alguno en llamadas con muchos campos). Devuelve la lista de campos faltantes/vacíos. */
function validarContenidoGuia(data: Omit<ContenidoGuia, "fotoMotivacionalClave">): string[] {
  const faltantes: string[] = [];
  const textos: Array<[string, unknown]> = [
    ["saludoMotivacion", data.saludoMotivacion], ["introduccion", data.introduccion],
    ["competencia", data.competencia], ["desempeno", data.desempeno],
    ["reflexionInicial", data.reflexionInicial], ["parteDeLoQueYaSabes", data.parteDeLoQueYaSabes],
    ["antesDeCerrarPregunta", data.antesDeCerrarPregunta],
  ];
  for (const [campo, valor] of textos) {
    if (typeof valor !== "string" || valor.trim() === "") faltantes.push(campo);
  }
  if (!Array.isArray(data.objetivoGuia) || data.objetivoGuia.length === 0) faltantes.push("objetivoGuia");
  if (!Array.isArray(data.subtemas) || data.subtemas.length === 0) faltantes.push("subtemas");
  if (!Array.isArray(data.talleres) || data.talleres.length === 0) faltantes.push("talleres");
  if (!Array.isArray(data.rubricaCriteriosEspecificos) || data.rubricaCriteriosEspecificos.length === 0) faltantes.push("rubricaCriteriosEspecificos");
  if (!Array.isArray(data.listaVerificacion) || data.listaVerificacion.length === 0) faltantes.push("listaVerificacion");
  if (!Array.isArray(data.fichaResumen) || data.fichaResumen.length === 0) faltantes.push("fichaResumen");
  if (!Array.isArray(data.bibliografia) || data.bibliografia.length === 0) faltantes.push("bibliografia");
  return faltantes;
}

// ---------- Guía DUA: segunda llamada encadenada a partir del contenido Estándar ----------

const CONTENIDO_DUA_TOOL = {
  name: "entregar_contenido_dua",
  description: "Entrega el contenido de la versión DUA (accesible/adaptada) de la guía, derivado del subtema A de la guía Estándar.",
  input_schema: {
    type: "object" as const,
    properties: {
      saludoMotivacion: { type: "string", description: "Versión corta (2-3 frases) del saludo, mismo tono cercano y motivador." },
      introduccion: { type: "string", description: "Versión corta (1-2 frases) de la introducción, enfocada solo en el procedimiento elegido." },
      competencia: { type: "string", description: "Competencia reescrita para un procedimiento guiado y repetido (no cubre todos los subtemas, solo el elegido)." },
      desempeno: { type: "string", description: "Desempeño como una secuencia de acciones concretas y repetibles." },
      objetivoGuia: { type: "string", description: "Una sola frase fluida: 'Al terminar, vas a poder [acción] solo, sin ayuda.'" },
      reflexionInicial: { type: "string", description: "Analogía corta y concreta." },
      parteDeLoQueYaSabes: { type: "string", description: "1 frase corta conectando con algo cotidiano." },
      funcionExplicita: { type: "string", description: "Explicación del procedimiento MUY explícita y simple, en pasos cortos — nada de tecnicismos innecesarios." },
      repeticiones: {
        type: "array",
        description: "Exactamente 4 repeticiones del MISMO procedimiento, cambiando solo el dato de entrada. La repetición 1 (índice 0) es un ejemplo YA RESUELTO con un dato concreto de muestra (marca explícitamente que ya está resuelto). Las repeticiones 2-4 son para que el estudiante las haga, con apoyo decreciente.",
        items: { type: "object", properties: { instruccion: { type: "string" } }, required: ["instruccion"] },
      },
      tallerSituacionPropia: {
        type: "object",
        description: "Segundo taller: el estudiante elige UNA de dos opciones concretas de su vida real para aplicar el procedimiento una vez más.",
        properties: { opcionA: { type: "string" }, opcionB: { type: "string" } },
        required: ["opcionA", "opcionB"],
      },
      rubricaCriteriosEspecificos: {
        type: "array",
        description: "3 criterios específicos (SIN incluir Participación, esa la agrega la app): deben evaluar la ejecución del procedimiento, la autonomía en la última repetición, y la entrega del Taller 2.",
        items: {
          type: "object",
          properties: { criterio: { type: "string" }, superior: { type: "string" }, alto: { type: "string" }, basico: { type: "string" }, bajo: { type: "string" } },
          required: ["criterio", "superior", "alto", "basico", "bajo"],
        },
      },
      listaVerificacion: { type: "array", description: "3 ítems cortos en primera persona sobre las 4 repeticiones.", items: { type: "string" } },
      antesDeCerrarPregunta: { type: "string" },
      fichaResumen: { type: "string", description: "Una sola frase tipo 'paso 1 → paso 2 → paso 3. Ese es el ciclo completo, siempre igual.'" },
      bibliografia: {
        type: "array",
        description: "2-3 referencias sobre el tema puntual (no incluyas aquí la bibliografía teórica DUA — la agrega la app aparte).",
        items: {
          type: "object",
          properties: { autor: { type: "string" }, anio: { type: "string" }, titulo: { type: "string" } },
          required: ["autor", "anio", "titulo"],
        },
      },
    },
    required: [
      "saludoMotivacion", "introduccion", "competencia", "desempeno", "objetivoGuia",
      "reflexionInicial", "parteDeLoQueYaSabes", "funcionExplicita", "repeticiones",
      "tallerSituacionPropia", "rubricaCriteriosEspecificos", "listaVerificacion",
      "antesDeCerrarPregunta", "fichaResumen", "bibliografia",
    ],
  },
};

function systemPromptDua(): string {
  return `Actúas como docente experto en Diseño Universal para el Aprendizaje (DUA) del
Instituto de Educación Comfenalco Valle (IECV). Vas a reescribir UN subtema
puntual de una guía ya generada como una versión accesible/adaptada, para
estudiantes con dificultad de lectura, de visión, o motricidad fina —
típicamente adultos de jornada sabatina.

Regla central: NO es contenido nuevo, es la MISMA guía reestructurada.
Quita toda la carga cognitiva que puedas: frases cortas, un solo
procedimiento (nunca varios subtemas), sin tecnicismos innecesarios, todo
explicado paso a paso.

Estructura obligatoria: un único procedimiento, repetido EXACTAMENTE 4
veces, cambiando solo el dato de entrada en cada repetición — nunca varios
procedimientos distintos. La repetición 1 es un ejemplo ya resuelto, tan
explícito que el estudiante pueda copiar el patrón sin dudas. Las
repeticiones 2 a 4 aumentan la autonomía progresivamente (menos apoyo en
cada una).

Nunca menciones el día de la semana ni la jornada. No uses markdown en los
textos (nada de **, #, etc.).

Entrega el resultado exclusivamente llamando a la herramienta entregar_contenido_dua.`;
}

function userPromptDua(params: ParametrosGuia, contenidoEstandar: ContenidoGuia): string {
  const subtemaA = contenidoEstandar.subtemas[0];
  return `Convierte este subtema de la guía Estándar en la versión DUA de esta semana:

- Tema de la guía: ${params.tema}
- Subtema A elegido (base de la versión DUA): ${subtemaA.titulo}
- Explicación técnica ya usada en la Estándar (para que no inventes datos nuevos): ${subtemaA.funcion}
- Competencia de la Estándar (para mantener coherencia de fondo): ${contenidoEstandar.competencia}
- CLEI: ${params.clei}`;
}

/**
 * Segunda llamada, encadenada a partir del contenido ya generado de la
 * Estándar — garantiza que el subtema A se explique con la misma base de
 * fondo en ambas versiones, solo cambia el tratamiento pedagógico.
 */
export async function generarContenidoDua(params: ParametrosGuia, contenidoEstandar: ContenidoGuia): Promise<ContenidoDua> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  }

  const client = new Anthropic({ apiKey });

  // El modelo a veces omite algún campo cuando la llamada tiene muchos
  // requeridos a la vez — un reintento resuelve la gran mayoría de casos.
  let ultimoError: Error | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 6144,
      system: systemPromptDua(),
      messages: [{ role: "user", content: userPromptDua(params, contenidoEstandar) }],
      tools: [CONTENIDO_DUA_TOOL],
      tool_choice: { type: "tool", name: "entregar_contenido_dua" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      ultimoError = new Error("El modelo no devolvió el contenido DUA esperado (sin tool_use en la respuesta).");
      continue;
    }

    const data = toolUse.input as Omit<ContenidoDua, "subtemaTitulo">;
    const faltantes = validarContenidoDua(data);
    if (faltantes.length > 0) {
      ultimoError = new Error(`El modelo devolvió contenido DUA incompleto (faltan o están vacíos: ${faltantes.join(", ")}).`);
      continue;
    }

    return {
      ...data,
      subtemaTitulo: params.subtemas[0] ?? contenidoEstandar.subtemas[0]?.titulo ?? "",
      bibliografia: [...data.bibliografia, ...BIBLIOGRAFIA_TEORICA_DUA],
    };
  }

  throw ultimoError ?? new Error("No se pudo generar el contenido DUA.");
}

/** Valida que el modelo haya llenado todos los campos requeridos (a veces omite alguno en llamadas con muchos campos). Devuelve la lista de campos faltantes/vacíos. */
function validarContenidoDua(data: Omit<ContenidoDua, "subtemaTitulo">): string[] {
  const faltantes: string[] = [];
  const textos: Array<[string, unknown]> = [
    ["saludoMotivacion", data.saludoMotivacion], ["introduccion", data.introduccion],
    ["competencia", data.competencia], ["desempeno", data.desempeno],
    ["objetivoGuia", data.objetivoGuia], ["reflexionInicial", data.reflexionInicial],
    ["parteDeLoQueYaSabes", data.parteDeLoQueYaSabes], ["funcionExplicita", data.funcionExplicita],
    ["antesDeCerrarPregunta", data.antesDeCerrarPregunta], ["fichaResumen", data.fichaResumen],
  ];
  for (const [campo, valor] of textos) {
    if (typeof valor !== "string" || valor.trim() === "") faltantes.push(campo);
  }
  if (!Array.isArray(data.repeticiones) || data.repeticiones.length !== 4 || data.repeticiones.some((r) => !r?.instruccion)) faltantes.push("repeticiones");
  if (!data.tallerSituacionPropia?.opcionA || !data.tallerSituacionPropia?.opcionB) faltantes.push("tallerSituacionPropia");
  if (!Array.isArray(data.rubricaCriteriosEspecificos) || data.rubricaCriteriosEspecificos.length === 0) faltantes.push("rubricaCriteriosEspecificos");
  if (!Array.isArray(data.listaVerificacion) || data.listaVerificacion.length === 0) faltantes.push("listaVerificacion");
  if (!Array.isArray(data.bibliografia) || data.bibliografia.length === 0) faltantes.push("bibliografia");
  return faltantes;
}

// ---------- Cuestionario Kahoot: llamada encadenada a partir del contenido Estándar ----------

const CONTENIDO_KAHOOT_TOOL = {
  name: "entregar_cuestionario_kahoot",
  description: "Entrega el cuestionario Kahoot de 10 preguntas basado en el contenido de la guía.",
  input_schema: {
    type: "object" as const,
    properties: {
      preguntas: {
        type: "array",
        description: "Exactamente 10 preguntas: las primeras 7 de selección múltiple (4 respuestas), las últimas 3 de Verdadero/Falso (respuestas EXACTAMENTE ['Verdadero','Falso']).",
        items: {
          type: "object",
          properties: {
            pregunta: { type: "string", description: "Máximo 95 caracteres." },
            respuestas: {
              type: "array", items: { type: "string" },
              description: "4 respuestas (máx 60 caracteres c/u) para selección múltiple, o exactamente ['Verdadero','Falso'] para V/F.",
            },
            tiempoSeg: { type: "integer", enum: [...TIEMPOS_KAHOOT] },
            correctas: {
              type: "array", items: { type: "integer" },
              description: "Índices 1-indexados de la(s) respuesta(s) correcta(s) dentro de 'respuestas' — normalmente un solo número, ej. [2].",
            },
          },
          required: ["pregunta", "respuestas", "tiempoSeg", "correctas"],
        },
      },
    },
    required: ["preguntas"],
  },
};

function systemPromptKahoot(): string {
  return `Actúas como docente de Tecnología e Informática del IECV creando un
cuestionario Kahoot de repaso para la guía de esta semana.

Regla central: las 10 preguntas deben salir EXCLUSIVAMENTE de los conceptos
que trae la guía (subtemas, definiciones, pasos de los talleres) — nunca
inventes temas que no estén en el contenido que te paso.

Estructura obligatoria: exactamente 10 preguntas — las primeras 7 de
selección múltiple con única respuesta correcta (4 opciones), las últimas 3
de Verdadero/Falso (respuestas literalmente "Verdadero" y "Falso", en ese
orden).

Límites estrictos de Kahoot (no los excedas nunca):
- Pregunta: máximo 95 caracteres.
- Cada respuesta: máximo 60 caracteres.
- Tiempo permitido: solo 5, 10, 20, 30, 60 o 120 segundos.

No uses markdown en los textos. Entrega el resultado exclusivamente llamando
a la herramienta entregar_cuestionario_kahoot.`;
}

function userPromptKahoot(params: ParametrosGuia, contenido: ContenidoGuia): string {
  const subtemasTexto = contenido.subtemas.map((s) => `${s.titulo}: ${s.funcion}`).join("\n");
  const talleresTexto = contenido.talleres.map((t) => `${t.tipo}: ${t.items.join(" / ")}`).join("\n");
  return `Genera el cuestionario Kahoot de esta guía:

- Tema: ${params.tema}
- Subtemas y su explicación:\n${subtemasTexto}
- Talleres (para referencia, no repitas las preguntas literales):\n${talleresTexto}`;
}

function validarContenidoKahoot(data: ContenidoKahoot): string[] {
  const faltantes: string[] = [];
  if (!Array.isArray(data.preguntas) || data.preguntas.length !== 10) {
    faltantes.push("preguntas (deben ser exactamente 10)");
    return faltantes;
  }
  data.preguntas.forEach((p, i) => {
    const n = i + 1;
    if (!p.pregunta || p.pregunta.length > 95) faltantes.push(`pregunta ${n} (texto o longitud)`);
    if (!Array.isArray(p.respuestas) || p.respuestas.length < 2) faltantes.push(`pregunta ${n} (respuestas)`);
    else if (p.respuestas.some((r) => !r || r.length > 60)) faltantes.push(`pregunta ${n} (longitud de respuesta)`);
    if (!TIEMPOS_KAHOOT.includes(p.tiempoSeg)) faltantes.push(`pregunta ${n} (tiempoSeg inválido)`);
    if (!Array.isArray(p.correctas) || p.correctas.length === 0) faltantes.push(`pregunta ${n} (correctas)`);
  });
  return faltantes;
}

/**
 * Segunda llamada encadenada (igual patrón que DUA): genera el cuestionario
 * Kahoot a partir del contenido ya generado de la Estándar, para que las
 * preguntas salgan solo de lo que trae esa guía puntual.
 */
export async function generarCuestionarioKahoot(params: ParametrosGuia, contenidoEstandar: ContenidoGuia): Promise<ContenidoKahoot> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");

  const client = new Anthropic({ apiKey });

  let ultimoError: Error | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3072,
      system: systemPromptKahoot(),
      messages: [{ role: "user", content: userPromptKahoot(params, contenidoEstandar) }],
      tools: [CONTENIDO_KAHOOT_TOOL],
      tool_choice: { type: "tool", name: "entregar_cuestionario_kahoot" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      ultimoError = new Error("El modelo no devolvió el cuestionario Kahoot esperado (sin tool_use en la respuesta).");
      continue;
    }

    const data = toolUse.input as ContenidoKahoot;
    const faltantes = validarContenidoKahoot(data);
    if (faltantes.length > 0) {
      ultimoError = new Error(`El cuestionario Kahoot quedó incompleto o fuera de los límites de Kahoot: ${faltantes.join(", ")}.`);
      continue;
    }

    return data;
  }

  throw ultimoError ?? new Error("No se pudo generar el cuestionario Kahoot.");
}

// ---------- Exámenes: Diagnóstico, Intermedio y Final ----------

function contenidoExamenTool(nombre: string, cantidadPreguntas: number, descripcionHerramienta: string) {
  return {
    name: nombre,
    description: descripcionHerramienta,
    input_schema: {
      type: "object" as const,
      properties: {
        preguntas: {
          type: "array",
          minItems: cantidadPreguntas,
          maxItems: cantidadPreguntas,
          description: `Exactamente ${cantidadPreguntas} preguntas de selección múltiple con única respuesta, EN ORDEN (la pregunta N de este arreglo es la pregunta número N del examen).`,
          items: {
            type: "object",
            properties: {
              enunciado: {
                type: "string",
                description: "Situación/contexto breve seguido de la pregunta puntual, como un párrafo fluido (ej. 'Carlos está elaborando una hoja de cálculo... ¿Con cuál símbolo debe comenzar la fórmula?'). Sin markdown.",
              },
              opciones: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                description: "Exactamente 4 opciones de respuesta (A, B, C, D en ese orden), solo una correcta. Nunca incluyas una opción tipo 'ninguna de las anteriores'.",
                items: { type: "string" },
              },
              correcta: { type: "integer", minimum: 0, maximum: 3, description: "Índice (0=A, 1=B, 2=C, 3=D) de la opción correcta." },
            },
            required: ["enunciado", "opciones", "correcta"],
          },
        },
      },
      required: ["preguntas"],
    },
  };
}

function lineaImagenesPreguntas(preguntasInput: PreguntaExamenInput[], cantidadPreguntas: number): string {
  const conImagen = preguntasInput.filter((p) => p.imagen);
  if (conImagen.length === 0) {
    return "Ninguna pregunta lleva imagen de apoyo — redacta las preguntas de forma autocontenida, sin referirte a ninguna imagen.";
  }
  const lineas = conImagen
    .filter((p) => p.index >= 1 && p.index <= cantidadPreguntas)
    .map((p) => `- Pregunta ${p.index}: el docente adjuntó una imagen de apoyo que muestra: "${p.descripcionImagen || "una captura de pantalla relacionada con el tema"}". Redacta el enunciado de ESA pregunta a partir exactamente de lo que describe esa imagen (ej. si describe una tabla de Excel con columnas y valores concretos, la pregunta debe referirse a esos datos concretos), y menciona en el texto que hay una imagen de referencia (ej. "Observa la siguiente imagen:").`);
  return `Estas preguntas llevan imagen de apoyo — redáctalas alrededor de lo que describe cada imagen:\n${lineas.join("\n")}\nLas demás preguntas (sin mención arriba) no llevan imagen — redáctalas de forma autocontenida.`;
}

function validarContenidoExamen(data: ContenidoExamen, cantidadPreguntas: number): string[] {
  const faltantes: string[] = [];
  if (!Array.isArray(data.preguntas) || data.preguntas.length !== cantidadPreguntas) {
    faltantes.push(`preguntas (deben ser exactamente ${cantidadPreguntas})`);
    return faltantes;
  }
  data.preguntas.forEach((p, i) => {
    const n = i + 1;
    if (!p.enunciado || p.enunciado.trim() === "") faltantes.push(`pregunta ${n} (enunciado)`);
    if (!Array.isArray(p.opciones) || p.opciones.length !== 4 || p.opciones.some((o) => !o || o.trim() === "")) faltantes.push(`pregunta ${n} (opciones)`);
    if (typeof p.correcta !== "number" || p.correcta < 0 || p.correcta > 3) faltantes.push(`pregunta ${n} (correcta)`);
  });
  return faltantes;
}

function systemPromptDiagnostico(): string {
  return `Actúas como docente experto en Tecnología e Informática del Instituto de
Educación Comfenalco Valle (IECV), programa de Educación Básica y Media por
Ciclos (CLEI) para jóvenes y adultos, sede Cali. Redactas el Diagnóstico de
Presaberes (formato FTO-EDU-FOR-82), aplicado el primer día del período,
ANTES de dictar cualquier contenido del curso.

Regla central: NO evalúas un curso puntual (aún no se ha dictado nada) — evalúas
conocimiento general y previo de Tecnología e Informática que un adulto
podría ya tener por experiencia de vida o laboral: qué es la informática,
componentes básicos de un computador (procesador, monitor, USB, etc.), qué
hace un sistema operativo, y uso general (no técnico) de Word/Excel/PowerPoint.
Preguntas de cultura general del área, no de procedimientos específicos de
ningún programa.

Tono: situaciones cotidianas o laborales de adultos, nunca escolares. Sin
markdown en los textos. Exactamente 4 opciones por pregunta (A-D), sin
"ninguna de las anteriores".

Entrega el resultado exclusivamente llamando a la herramienta entregar_diagnostico.`;
}

function userPromptDiagnostico(params: ParametrosExamen, preguntasInput: PreguntaExamenInput[]): string {
  return `Genera el Diagnóstico de Presaberes de Tecnología e Informática:

- CLEI: ${params.clei}
- Jornada: ${params.jornada}
- Cantidad de preguntas: ${params.cantidadPreguntas}
- Fecha de aplicación: ${params.fechaAplicacion}

${lineaImagenesPreguntas(preguntasInput, params.cantidadPreguntas)}`;
}

/** Diagnóstico de Presaberes — sin curso específico, conocimiento general de Tecnología e Informática. */
export async function generarContenidoDiagnostico(
  params: ParametrosExamen,
  preguntasInput: PreguntaExamenInput[] = []
): Promise<ContenidoExamen> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");

  const client = new Anthropic({ apiKey });
  const tool = contenidoExamenTool(
    "entregar_diagnostico",
    params.cantidadPreguntas,
    "Entrega las preguntas del Diagnóstico de Presaberes."
  );

  let ultimoError: Error | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: systemPromptDiagnostico(),
      messages: [{ role: "user", content: userPromptDiagnostico(params, preguntasInput) }],
      tools: [tool],
      tool_choice: { type: "tool", name: "entregar_diagnostico" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      ultimoError = new Error("El modelo no devolvió el diagnóstico esperado (sin tool_use en la respuesta).");
      continue;
    }

    const data = toolUse.input as ContenidoExamen;
    const faltantes = validarContenidoExamen(data, params.cantidadPreguntas);
    if (faltantes.length > 0) {
      ultimoError = new Error(`El diagnóstico quedó incompleto: ${faltantes.join(", ")}.`);
      continue;
    }

    return data;
  }

  throw ultimoError ?? new Error("No se pudo generar el diagnóstico.");
}

function systemPromptExamen(tipo: "intermedio" | "final"): string {
  const alcance = tipo === "intermedio"
    ? "Cubre SOLO los temas ya vistos hasta la fecha de este examen (los que te paso abajo) — nunca temas del curso que aún no se han dictado."
    : "Es el examen FINAL del curso — debe cubrir de forma equilibrada TODOS los temas vistos durante el curso completo (los que te paso abajo), sin concentrarse solo en los últimos.";

  return `Actúas como docente experto en Tecnología e Informática del Instituto de
Educación Comfenalco Valle (IECV), programa de Educación Básica y Media por
Ciclos (CLEI) para jóvenes y adultos, sede Cali. Redactas el Instrumento de
Evaluación (formato FTO-EDU-FOR-98, tipo de prueba "${tipo === "intermedio" ? "Intermedio" : "Final"}").

Regla central: ${alcance} Nunca inventes contenido que no esté en la lista de
temas — las preguntas deben poder responderse solo con lo que ya se enseñó.

Estilo (igual al de los exámenes reales de este colegio): cada pregunta es
una situación breve y concreta de un adulto en un contexto laboral o
cotidiano (ej. "Carlos está elaborando una hoja de cálculo para registrar
las ventas de una pequeña tienda..."), seguida de la pregunta puntual.
Exactamente 4 opciones por pregunta (A-D), sin "ninguna de las anteriores".
Sin markdown en los textos.

Entrega el resultado exclusivamente llamando a la herramienta entregar_examen.`;
}

function userPromptExamen(params: ParametrosExamen, preguntasInput: PreguntaExamenInput[], temasCubiertos: string[]): string {
  const temasTexto = temasCubiertos.length > 0
    ? temasCubiertos.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(sin temas registrados en el catálogo — usa el nombre del curso como única referencia)";
  return `Genera el examen ${params.tipo === "intermedio" ? "Intermedio" : "Final"} de ${params.cursoNombre ?? "este curso"}:

- CLEI: ${params.clei}
- Jornada: ${params.jornada}
- Cantidad de preguntas: ${params.cantidadPreguntas}
- Fecha de aplicación: ${params.fechaAplicacion}
- Temas del curso a evaluar:\n${temasTexto}

${lineaImagenesPreguntas(preguntasInput, params.cantidadPreguntas)}`;
}

/**
 * Examen Intermedio o Final — grounded en los temas del curso realmente
 * cubiertos hasta la fecha (calculados por quien llama, desde
 * calendario_clases), para que nunca evalúe contenido no dictado.
 */
export async function generarContenidoExamen(
  params: ParametrosExamen,
  temasCubiertos: string[],
  preguntasInput: PreguntaExamenInput[] = []
): Promise<ContenidoExamen> {
  if (params.tipo === "diagnostico") {
    throw new Error("Usa generarContenidoDiagnostico() para el tipo 'diagnostico'.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");

  const client = new Anthropic({ apiKey });
  const tool = contenidoExamenTool(
    "entregar_examen",
    params.cantidadPreguntas,
    `Entrega las preguntas del examen ${params.tipo}.`
  );

  let ultimoError: Error | null = null;
  for (let intento = 1; intento <= 2; intento++) {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: systemPromptExamen(params.tipo),
      messages: [{ role: "user", content: userPromptExamen(params, preguntasInput, temasCubiertos) }],
      tools: [tool],
      tool_choice: { type: "tool", name: "entregar_examen" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      ultimoError = new Error("El modelo no devolvió el examen esperado (sin tool_use en la respuesta).");
      continue;
    }

    const data = toolUse.input as ContenidoExamen;
    const faltantes = validarContenidoExamen(data, params.cantidadPreguntas);
    if (faltantes.length > 0) {
      ultimoError = new Error(`El examen quedó incompleto: ${faltantes.join(", ")}.`);
      continue;
    }

    return data;
  }

  throw ultimoError ?? new Error("No se pudo generar el examen.");
}
