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

// El nivel (basico/intermedio/avanzado) se elige al programar el curso: cada
// nivel es una malla distinta, con su propio contador de posición.
describe("POST /api/calendario — nivel de la malla", () => {
  const cuerpoHorario = (nivel?: string, cantidad = 2) => ({
    cicloId: "ciclo-1",
    jornadaId: "jornada-1",
    confirmar: true,
    filas: Array.from({ length: cantidad }, (_, i) => ({
      cursoId: "curso-word", semana: i + 1, guia: i + 1, fecha: "2026-10-01", actividadId: "act-clases", ...(nivel ? { nivel } : {}),
    })),
  });

  /** Base falsa: registra qué nivel se consultó/insertó y devuelve un tema por (nivel, número). */
  function baseConNiveles(maximoPrevio = 0) {
    const insertsNivel: unknown[] = [];
    const consultas: Array<{ nivel: unknown; numero?: unknown }> = [];
    sql.mockImplementation((...args: unknown[]) => {
      const t = textoDe(args);
      const vals = args.slice(1);
      if (t.includes("from actividades where nombre")) return Promise.resolve([{ id: "act-clases" }]);
      if (t.includes("max(t.numero)")) { consultas.push({ nivel: vals[vals.length - 1] }); return Promise.resolve([{ maximo: maximoPrevio }]); }
      if (t.includes("select id from temas")) {
        consultas.push({ nivel: vals[1], numero: vals[2] });
        return Promise.resolve([{ id: `tema-${vals[1]}-${vals[2]}` }]);
      }
      if (t.includes("insert into calendario_clases")) {
        insertsNivel.push(vals[vals.length - 1]); // el nivel es el último parámetro
        return Promise.resolve([{ id: "fila" }]);
      }
      return Promise.resolve([]);
    });
    return { insertsNivel, consultas };
  }

  it("guarda el nivel en cada fila y resuelve los temas de ESE nivel, arrancando en su tema 1", async () => {
    const { insertsNivel, consultas } = baseConNiveles(0);
    const res = await post(cuerpoHorario("intermedio"));
    expect(res.status).toBe(200);
    expect(insertsNivel).toEqual(["intermedio", "intermedio"]);
    expect(consultas.filter((c) => c.numero !== undefined)).toEqual([
      { nivel: "intermedio", numero: 1 },
      { nivel: "intermedio", numero: 2 },
    ]);
  });

  it("el contador de posición cuenta solo los temas ya programados de ese mismo nivel", async () => {
    const { consultas } = baseConNiveles(3); // ya hay 3 temas de este nivel programados
    await post(cuerpoHorario("avanzado", 1));
    expect(consultas.find((c) => c.numero !== undefined)).toEqual({ nivel: "avanzado", numero: 4 });
    expect(consultas[0]).toEqual({ nivel: "avanzado" });
  });

  it("sin nivel se programa como básico (comportamiento de siempre)", async () => {
    const { insertsNivel } = baseConNiveles(0);
    await post(cuerpoHorario(undefined, 1));
    expect(insertsNivel).toEqual(["basico"]);
  });

  it("rechaza con 400 un nivel inválido sin tocar la base", async () => {
    sql.mockResolvedValue([]);
    const res = await post(cuerpoHorario("experto", 1));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("origen ad_hoc también guarda el nivel elegido", async () => {
    const { insertsNivel } = baseConNiveles(0);
    sql.mockImplementation((...args: unknown[]) => {
      const t = textoDe(args);
      const vals = args.slice(1);
      if (t.includes("join actividades")) return Promise.resolve([]);
      if (t.includes("insert into calendario_clases")) { insertsNivel.push(vals[vals.length - 1]); return Promise.resolve([{ id: "f" }]); }
      if (t.includes("select id from calendario_clases")) return Promise.resolve([{ id: "f" }]);
      return Promise.resolve([]);
    });
    await post({ ...body, filas: [{ ...body.filas[0], nivel: "avanzado" }] });
    expect(insertsNivel).toEqual(["avanzado"]);
  });
});

describe("GET /api/calendario", () => {
  it("expone si ya hay un examen generado en cada semana (examen_generado)", async () => {
    const { GET } = await import("../route");
    sql.mockImplementation((...args: unknown[]) => {
      const t = textoDe(args);
      if (t.includes("from calendario_clases cc")) return Promise.resolve([{ id: "f1", examen_generado: true }]);
      return Promise.resolve([]);
    });
    const res = await GET(new NextRequest("http://localhost/api/calendario?cicloId=c&jornadaId=j"));
    expect((await res.json()).filas[0].examen_generado).toBe(true);
    const consulta = textoDe(sql.mock.calls[0]);
    expect(consulta).toContain("as examen_generado");
    expect(consulta).toMatch(/tipo in \('diagnostico', 'intermedio', 'final'\)/);
  });
});

