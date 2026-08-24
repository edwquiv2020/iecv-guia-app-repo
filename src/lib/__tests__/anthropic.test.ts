import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ParametrosGuia, ParametrosExamen, ContenidoGuia, ContenidoDua, ContenidoKahoot, ContenidoExamen } from "@/lib/types";

// Unit tests del borde real con la API de Anthropic: se mockea únicamente
// client.messages.create (nunca se llama la API de verdad) y se ejercen de
// verdad la extracción de tool_use, la validación de contenido incompleto,
// el reintento (hasta 2 intentos) y el enriquecimiento posterior a la
// respuesta del modelo (bibliografía teórica, foto motivacional, etc.) —
// toda lógica propia de este archivo, no del SDK.

// mockImplementation debe ser una función normal, no arrow — el código real
// hace `new Anthropic(...)`, y una arrow function nunca es constructable.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: (...args: unknown[]) => mockCreate(...args) } };
  }),
}));

const {
  generarContenidoGuia,
  generarContenidoDua,
  generarCuestionarioKahoot,
  generarContenidoDiagnostico,
  generarContenidoExamen,
} = await import("@/lib/anthropic");

function toolUseResponse(input: unknown) {
  return { content: [{ type: "tool_use", id: "toolu_1", name: "x", input }] };
}
function textOnlyResponse() {
  return { content: [{ type: "text", text: "no debería pasar esto" }] };
}

const paramsGuia: ParametrosGuia = {
  clei: "III",
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  semana: 3,
  guia: 3,
  fechaClase: "15/07/26",
  fechaClaseLarga: "15/07/2026",
  tema: "INTRODUCCIÓN A INTERNET",
  subtemas: ["Navegadores web", "Buscadores"],
  fechaCargue: "15/07/2026",
  horaMaxima: "23:59",
  videoApoyo: { titulo: "¿Qué es Internet?", canal: "Canal de prueba", duracion: "3:45", url: "https://youtube.com/watch?v=x" },
};

const contenidoGuiaValido: Omit<ContenidoGuia, "fotoMotivacionalClave"> = {
  saludoMotivacion: "¡Bienvenido!",
  introduccion: "Internet es clave hoy.",
  competencia: "Usa Internet con seguridad.",
  desempeno: "Navega y busca información.",
  objetivoGuia: ["abrir un navegador"],
  reflexionInicial: "¿Has buscado algo urgente?",
  parteDeLoQueYaSabes: "Ya saben pedir ayuda a alguien.",
  subtemas: [{ titulo: "Navegadores web", funcion: "Programa para acceder a páginas." }],
  talleres: [{ tipo: "cuestionario", instrucciones: "Responde.", items: ["¿Qué es un navegador?"] }],
  rubricaCriteriosEspecificos: [{ criterio: "Uso del navegador", superior: "Fluido.", alto: "Con apoyo.", basico: "Con apoyo constante.", bajo: "No navega." }],
  listaVerificacion: ["Abrí el navegador."],
  antesDeCerrarPregunta: "¿Cuándo lo vas a usar?",
  fichaResumen: [{ concepto: "Navegadores", resumen: "Acceden a páginas web." }],
  bibliografia: [{ autor: "Comfenalco Valle", anio: "2026", titulo: "Manual de Tecnología" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("generarContenidoGuia", () => {
  it("lanza sin llamar a la API si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generarContenidoGuia(paramsGuia)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("en éxito: agrega la bibliografía teórica y la foto motivacional por rotación de semana", async () => {
    mockCreate.mockResolvedValue(toolUseResponse(contenidoGuiaValido));

    const resultado = await generarContenidoGuia(paramsGuia);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    // semana 3 -> índice (3-1) % 20 = 2 -> "leon" (ver BANCO_KEYS en anthropic.ts).
    expect(resultado.fotoMotivacionalClave).toBe("leon");
    expect(resultado.bibliografia).toEqual([
      ...contenidoGuiaValido.bibliografia,
      ...(await import("@/lib/types")).BIBLIOGRAFIA_TEORICA_ESTANDAR,
    ]);
  });

  it("llama al modelo correcto, forzando la tool entregar_contenido_guia", async () => {
    mockCreate.mockResolvedValue(toolUseResponse(contenidoGuiaValido));
    await generarContenidoGuia(paramsGuia);

    const llamada = mockCreate.mock.calls[0][0];
    expect(llamada.model).toBe("claude-sonnet-5");
    expect(llamada.tool_choice).toEqual({ type: "tool", name: "entregar_contenido_guia" });
    expect(llamada.tools[0].name).toBe("entregar_contenido_guia");
    expect(llamada.messages[0].content).toContain(paramsGuia.tema);
  });

  it("incluye la rotación de talleres recientes en el prompt cuando se pasan", async () => {
    mockCreate.mockResolvedValue(toolUseResponse(contenidoGuiaValido));
    await generarContenidoGuia(paramsGuia, ["cuestionario", "caso de estudio"]);

    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toMatch(/EVITA repetirlos/);
    expect(prompt).toMatch(/cuestionario, caso de estudio/);
  });

  it("reintenta una vez si la respuesta no trae tool_use, y falla si tampoco la trae en el segundo intento", async () => {
    mockCreate.mockResolvedValue(textOnlyResponse());
    await expect(generarContenidoGuia(paramsGuia)).rejects.toThrow(/sin tool_use/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("reintenta si el contenido queda incompleto, y devuelve el resultado si el segundo intento sí está completo", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse({ ...contenidoGuiaValido, saludoMotivacion: "" }))
      .mockResolvedValueOnce(toolUseResponse(contenidoGuiaValido));

    const resultado = await generarContenidoGuia(paramsGuia);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(resultado.saludoMotivacion).toBe(contenidoGuiaValido.saludoMotivacion);
  });

  it("falla con el detalle de campos faltantes si el contenido queda incompleto en ambos intentos", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ ...contenidoGuiaValido, talleres: [] }));
    await expect(generarContenidoGuia(paramsGuia)).rejects.toThrow(/talleres/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe("generarContenidoDua", () => {
  const contenidoDuaValido: Omit<ContenidoDua, "subtemaTitulo"> = {
    saludoMotivacion: "¡Bienvenido!",
    introduccion: "Vamos a practicar.",
    competencia: "Repite un procedimiento guiado.",
    desempeno: "Sigue instrucciones simples.",
    objetivoGuia: "Vas a poder abrir un navegador.",
    reflexionInicial: "¿Cómo buscas algo?",
    parteDeLoQueYaSabes: "Ya saben pedir ayuda.",
    funcionExplicita: "Un navegador abre páginas de Internet.",
    repeticiones: [
      { instruccion: "Ejemplo resuelto." },
      { instruccion: "Repite." },
      { instruccion: "Repite de nuevo." },
      { instruccion: "Repite sin ayuda." },
    ],
    tallerSituacionPropia: { opcionA: "Busca el clima.", opcionB: "Busca una receta." },
    rubricaCriteriosEspecificos: [{ criterio: "Apertura", superior: "Solo.", alto: "Con apoyo mínimo.", basico: "Con apoyo constante.", bajo: "No lo logra." }],
    listaVerificacion: ["Abrí el navegador."],
    antesDeCerrarPregunta: "¿Qué vas a buscar?",
    fichaResumen: "Abrir el navegador es el primer paso.",
    bibliografia: [{ autor: "CAST", anio: "2018", titulo: "UDL Guidelines 2.2" }],
  };
  const contenidoEstandar: ContenidoGuia = { ...contenidoGuiaValido, fotoMotivacionalClave: "tortuga" };

  it("lanza sin llamar a la API si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generarContenidoDua(paramsGuia, contenidoEstandar)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("en éxito: agrega la bibliografía teórica DUA y usa subtemas[0] del formulario como subtemaTitulo", async () => {
    mockCreate.mockResolvedValue(toolUseResponse(contenidoDuaValido));

    const resultado = await generarContenidoDua(paramsGuia, contenidoEstandar);

    expect(resultado.subtemaTitulo).toBe(paramsGuia.subtemas[0]);
    expect(resultado.bibliografia).toEqual([
      ...contenidoDuaValido.bibliografia,
      ...(await import("@/lib/types")).BIBLIOGRAFIA_TEORICA_DUA,
    ]);
  });

  it("si el formulario no trae subtemas, usa el título del subtema A de la Estándar como respaldo", async () => {
    mockCreate.mockResolvedValue(toolUseResponse(contenidoDuaValido));
    const resultado = await generarContenidoDua({ ...paramsGuia, subtemas: [] }, contenidoEstandar);
    expect(resultado.subtemaTitulo).toBe(contenidoEstandar.subtemas[0].titulo);
  });

  it("reintenta y falla si las 4 repeticiones exigidas nunca llegan completas", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ ...contenidoDuaValido, repeticiones: contenidoDuaValido.repeticiones.slice(0, 2) }));
    await expect(generarContenidoDua(paramsGuia, contenidoEstandar)).rejects.toThrow(/repeticiones/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe("generarCuestionarioKahoot", () => {
  const contenidoEstandar: ContenidoGuia = { ...contenidoGuiaValido, fotoMotivacionalClave: "tortuga" };
  function preguntasValidas(n = 10): ContenidoKahoot["preguntas"] {
    return Array.from({ length: n }, (_, i) =>
      i < 7
        ? { pregunta: `Pregunta ${i + 1}`, respuestas: ["A", "B", "C", "D"], tiempoSeg: 20 as const, correctas: [1] }
        : { pregunta: `Pregunta ${i + 1}`, respuestas: ["Verdadero", "Falso"], tiempoSeg: 10 as const, correctas: [1] }
    );
  }

  it("lanza sin llamar a la API si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generarCuestionarioKahoot(paramsGuia, contenidoEstandar)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("en éxito devuelve las 10 preguntas tal cual las entregó el modelo", async () => {
    const preguntas = preguntasValidas();
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas }));
    const resultado = await generarCuestionarioKahoot(paramsGuia, contenidoEstandar);
    expect(resultado.preguntas).toEqual(preguntas);
  });

  it("reintenta y falla si no llegan exactamente 10 preguntas", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas: preguntasValidas(8) }));
    await expect(generarCuestionarioKahoot(paramsGuia, contenidoEstandar)).rejects.toThrow(/exactamente 10/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("reintenta y falla si una pregunta excede el límite de 95 caracteres de Kahoot", async () => {
    const preguntas = preguntasValidas();
    preguntas[0] = { ...preguntas[0], pregunta: "x".repeat(96) };
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas }));
    await expect(generarCuestionarioKahoot(paramsGuia, contenidoEstandar)).rejects.toThrow(/límites de Kahoot/);
  });
});

const paramsExamenBase: ParametrosExamen = {
  tipo: "diagnostico",
  clei: "III",
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  cantidadPreguntas: 10,
  valoracionPregunta: 0.5,
  semana: 5,
  fechaAplicacion: "10/02/2026",
  sede: "Sede Principal",
  docente: "Docente de prueba",
};

function preguntasExamenValidas(n: number): ContenidoExamen["preguntas"] {
  return Array.from({ length: n }, (_, i) => ({
    enunciado: `Enunciado ${i + 1}.`,
    opciones: ["A", "B", "C", "D"] as [string, string, string, string],
    correcta: i % 4,
  }));
}

describe("generarContenidoDiagnostico", () => {
  it("lanza sin llamar a la API si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generarContenidoDiagnostico(paramsExamenBase)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("en éxito devuelve las preguntas del diagnóstico", async () => {
    const preguntas = preguntasExamenValidas(10);
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas }));
    const resultado = await generarContenidoDiagnostico(paramsExamenBase);
    expect(resultado.preguntas).toEqual(preguntas);
  });

  it("reintenta y falla si la cantidad de preguntas no coincide con cantidadPreguntas", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas: preguntasExamenValidas(7) }));
    await expect(generarContenidoDiagnostico(paramsExamenBase)).rejects.toThrow(/incompleto/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe("generarContenidoExamen", () => {
  const paramsIntermedio: ParametrosExamen = { ...paramsExamenBase, tipo: "intermedio", cursoId: "curso-1", cursoNombre: "Microsoft Excel" };

  it("rechaza tipo='diagnostico' antes de tocar la API (hay que usar generarContenidoDiagnostico)", async () => {
    await expect(generarContenidoExamen(paramsExamenBase, [])).rejects.toThrow(/generarContenidoDiagnostico/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("lanza sin llamar a la API si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generarContenidoExamen(paramsIntermedio, [])).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("en éxito incluye los temas cubiertos en el prompt y devuelve las preguntas", async () => {
    const preguntas = preguntasExamenValidas(10);
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas }));

    const resultado = await generarContenidoExamen(paramsIntermedio, ["FUNCIÓN SI — Sintaxis y condiciones"]);

    expect(resultado.preguntas).toEqual(preguntas);
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("FUNCIÓN SI — Sintaxis y condiciones");
    expect(prompt).toContain("Microsoft Excel");
  });

  it("reintenta y falla si alguna pregunta queda sin las 4 opciones", async () => {
    const preguntas = preguntasExamenValidas(10);
    preguntas[0] = { ...preguntas[0], opciones: ["Solo una"] as unknown as [string, string, string, string] };
    mockCreate.mockResolvedValue(toolUseResponse({ preguntas }));
    await expect(generarContenidoExamen(paramsIntermedio, [])).rejects.toThrow(/incompleto/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
