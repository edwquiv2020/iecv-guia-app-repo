import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: (...args: unknown[]) => mockCreate(...args) } };
  }),
}));

const { generarMallaIA, normalizarTema, validarMalla } = await import("@/lib/mallaIA");

const toolUse = (input: unknown) => ({ content: [{ type: "tool_use", id: "t1", name: "entregar_malla", input }] });
const temas = (n: number) => Array.from({ length: n }, (_, i) => ({ tema: `Tema ${i + 1}`, subtemas: "Uno\nDos\nTres" }));
const params = { cursoNombre: "Microsoft Excel", asignatura: "Tecnología e Informática", nivel: "intermedio" as const, temaGeneral: "Excel para la vida laboral", clases: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("generarMallaIA", () => {
  it("lanza sin llamar a la API si falta ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generarMallaIA(params)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("devuelve un tema por clase, y el prompt lleva curso, nivel, tema general, clases e indicaciones", async () => {
    mockCreate.mockResolvedValue(toolUse({ temas: temas(5) }));
    const r = await generarMallaIA({ ...params, indicaciones: "Adultos que nunca usaron Excel" });
    expect(r).toHaveLength(5);
    const llamada = mockCreate.mock.calls[0][0];
    const prompt = llamada.messages[0].content as string;
    expect(prompt).toContain("Microsoft Excel");
    expect(prompt).toContain("Intermedio");
    expect(prompt).toContain("Excel para la vida laboral");
    expect(prompt).toContain("5");
    expect(prompt).toContain("Adultos que nunca usaron Excel");
    expect(llamada.system).toContain("INTERMEDIO");
    expect(llamada.tools[0].input_schema.properties.temas.minItems).toBe(5);
    expect(llamada.tools[0].input_schema.properties.temas.maxItems).toBe(5);
  });

  it("cada nivel usa su propia descripción en las instrucciones", async () => {
    mockCreate.mockResolvedValue(toolUse({ temas: temas(5) }));
    await generarMallaIA({ ...params, nivel: "basico" });
    await generarMallaIA({ ...params, nivel: "avanzado" });
    expect(mockCreate.mock.calls[0][0].system).toContain("BÁSICO");
    expect(mockCreate.mock.calls[1][0].system).toContain("AVANZADO");
  });

  it("no pide videos ni enlaces (no se inventan)", async () => {
    mockCreate.mockResolvedValue(toolUse({ temas: temas(5) }));
    await generarMallaIA(params);
    expect(mockCreate.mock.calls[0][0].system).toMatch(/No incluyas enlaces, videos/);
  });

  it("reintenta y falla si la cantidad de temas no coincide", async () => {
    mockCreate.mockResolvedValue(toolUse({ temas: temas(3) }));
    await expect(generarMallaIA(params)).rejects.toThrow(/incompleta/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("reintenta y se recupera si el segundo intento sí viene completo", async () => {
    mockCreate.mockResolvedValueOnce(toolUse({ temas: temas(2) })).mockResolvedValueOnce(toolUse({ temas: temas(5) }));
    expect(await generarMallaIA(params)).toHaveLength(5);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("falla si un tema viene sin subtemas o sin título", async () => {
    const malos = temas(5);
    malos[2] = { tema: "Tema 3", subtemas: "  " };
    mockCreate.mockResolvedValue(toolUse({ temas: malos }));
    await expect(generarMallaIA(params)).rejects.toThrow(/clase 3/);
  });

  it("falla si el modelo no usa la herramienta", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "hola" }] });
    await expect(generarMallaIA(params)).rejects.toThrow(/tool_use/);
  });
});

describe("normalizarTema / validarMalla", () => {
  it("quita viñetas, numeración y líneas vacías de los subtemas, y numeración del título", () => {
    expect(normalizarTema({ tema: " 3. Función SI ", subtemas: "- Sintaxis\n• Condiciones\n\n2) Ejemplos; Práctica" })).toEqual({
      tema: "Función SI",
      subtemas: "Sintaxis\nCondiciones\nEjemplos\nPráctica",
    });
  });

  it("validarMalla exige exactamente N temas", () => {
    expect(validarMalla({ temas: temas(4) }, 5)[0]).toMatch(/exactamente 5/);
    expect(validarMalla({ temas: temas(5) }, 5)).toEqual([]);
    expect(validarMalla({}, 5)[0]).toMatch(/exactamente 5/);
  });
});
