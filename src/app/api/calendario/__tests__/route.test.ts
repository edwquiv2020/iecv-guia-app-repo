import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Una semana (ciclo + jornada + semana) es UNA fila del calendario. Crear
// al vuelo una clase en una semana ya ocupada la reutilizaba en silencio y
// la guía nueva se registraba encima de la existente — ahora es 409.

const sql = vi.fn();
vi.mock("@/lib/db", () => ({
  sql: Object.assign((...args: unknown[]) => sql(...args), { json: (v: unknown) => v }),
}));

const { POST } = await import("../route");

const body = {
  cicloId: "ciclo-1",
  jornadaId: "jornada-1",
  origen: "ad_hoc",
  filas: [{ cursoId: "curso-mate", semana: 1, guia: 1, fecha: "2026-09-26", actividadId: "act-clases", temaId: null }],
};

function post(b: unknown) {
  return POST(new NextRequest("http://localhost/api/calendario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  }));
}

function textoDe(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray | unknown[];
  return Array.isArray(strings) && "raw" in strings ? (strings as TemplateStringsArray).join(" ") : "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/calendario (origen ad_hoc)", () => {
  it("rechaza con 409 si la semana ya tiene una clase, sin insertar nada", async () => {
    sql.mockImplementation((...args: unknown[]) =>
      Promise.resolve(textoDe(args).includes("join actividades") ? [{ semana: 1, curso: "Microsoft Excel", actividad: "CLASES" }] : [])
    );

    const res = await post(body);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/semana 1 \(Microsoft Excel\)/);
    expect(data.error).toMatch(/Semana programada/);
    const insertó = sql.mock.calls.some((c) => textoDe(c).includes("insert into calendario_clases"));
    expect(insertó).toBe(false);
  });

  it("inserta normalmente cuando la semana está libre", async () => {
    sql.mockImplementation((...args: unknown[]) => {
      const t = textoDe(args);
      if (t.includes("join actividades")) return Promise.resolve([]);
      if (t.includes("from actividades where nombre")) return Promise.resolve([{ id: "act-clases" }]);
      if (t.includes("insert into calendario_clases")) return Promise.resolve([{ id: "fila-nueva" }]);
      if (t.includes("select id from calendario_clases")) return Promise.resolve([{ id: "fila-nueva" }]);
      return Promise.resolve([]);
    });

    const res = await post(body);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.filasGuardadas).toBe(1);
    expect(data.idsPorSemana).toEqual({ 1: "fila-nueva" });
  });
});
