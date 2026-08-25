import { describe, expect, it, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({
  sql: Object.assign((...args: unknown[]) => sql(...args), { json: (v: unknown) => v }),
}));

const { dentroDelLimiteDiario, registrarGeneracion, mensajeLimiteAlcanzado } = await import("@/lib/rateLimit");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LIMITE_GENERACIONES_DIA;
});

describe("dentroDelLimiteDiario", () => {
  it("true cuando el conteo está por debajo del límite por defecto (30)", async () => {
    sql.mockResolvedValue([{ total: 5 }]);
    expect(await dentroDelLimiteDiario("x@gmail.com", "generar-guia")).toBe(true);
  });

  it("false cuando el conteo ya alcanzó el límite por defecto", async () => {
    sql.mockResolvedValue([{ total: 30 }]);
    expect(await dentroDelLimiteDiario("x@gmail.com", "generar-guia")).toBe(false);
  });

  it("true cuando la consulta no devuelve filas (cero generaciones aún)", async () => {
    sql.mockResolvedValue([]);
    expect(await dentroDelLimiteDiario("x@gmail.com", "generar-guia")).toBe(true);
  });

  it("respeta LIMITE_GENERACIONES_DIA del entorno", async () => {
    process.env.LIMITE_GENERACIONES_DIA = "3";
    sql.mockResolvedValue([{ total: 3 }]);
    expect(await dentroDelLimiteDiario("x@gmail.com", "generar-guia")).toBe(false);

    sql.mockResolvedValue([{ total: 2 }]);
    expect(await dentroDelLimiteDiario("x@gmail.com", "generar-guia")).toBe(true);
  });

  it("cae al valor por defecto si LIMITE_GENERACIONES_DIA no es un número válido", async () => {
    process.env.LIMITE_GENERACIONES_DIA = "no-es-un-numero";
    sql.mockResolvedValue([{ total: 29 }]);
    expect(await dentroDelLimiteDiario("x@gmail.com", "generar-guia")).toBe(true); // 29 < 30 (default)
  });
});

describe("registrarGeneracion", () => {
  it("inserta una fila en generaciones_log", async () => {
    sql.mockResolvedValue([]);
    await registrarGeneracion("x@gmail.com", "generar-examen");
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("mensajeLimiteAlcanzado", () => {
  it("incluye el límite configurado en el mensaje", () => {
    process.env.LIMITE_GENERACIONES_DIA = "7";
    expect(mensajeLimiteAlcanzado()).toContain("7");
  });

  it("incluye el límite por defecto si no hay override", () => {
    expect(mensajeLimiteAlcanzado()).toContain("30");
  });
});
