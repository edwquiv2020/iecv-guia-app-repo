import { describe, expect, it, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({
  sql: (...a: unknown[]) => sql(...a),
  conReintento: <T,>(fn: () => Promise<T>) => fn(),
}));

const { GET } = await import("../lote/route");
const texto = (args: unknown[]) => (args[0] as TemplateStringsArray).join("?");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/examenes/lote", () => {
  it("devuelve en una sola respuesta las semanas Intermedio y las combinaciones ciclo × jornada, con solo 2 consultas", async () => {
    sql.mockImplementation((...args: unknown[]) =>
      Promise.resolve(texto(args).includes("cross join") ? [{ ciclo_id: "c", jornada_id: "j" }] : [{ id: "cc1", examen_generado: false }])
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.filas).toEqual([{ id: "cc1", examen_generado: false }]);
    expect(data.combos).toHaveLength(1);
    expect(sql).toHaveBeenCalledTimes(2); // nunca una consulta por ciclo/jornada
    const consultas = sql.mock.calls.map(texto);
    expect(consultas[0]).toContain("a.nombre = 'EXAMEN INTERMEDIO'");
    expect(consultas[0]).toContain("g.tipo = 'intermedio'");
  });

  it("500 con el mensaje si la base falla", async () => {
    sql.mockRejectedValue(new Error("timeout"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("timeout");
  });
});
