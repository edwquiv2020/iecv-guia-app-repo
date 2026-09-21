import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sql = vi.fn();
const begin = vi.fn();
vi.mock("@/lib/db", () => ({ sql: Object.assign((...a: unknown[]) => sql(...a), { begin: (fn: unknown) => begin(fn) }) }));
const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));
const generarMallaIA = vi.fn();
vi.mock("@/lib/mallaIA", async (orig) => ({ ...(await orig<typeof import("@/lib/mallaIA")>()), generarMallaIA: (...a: unknown[]) => generarMallaIA(...a) }));
const dentroDelLimiteDiario = vi.fn();
const registrarGeneracion = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  dentroDelLimiteDiario: (...a: unknown[]) => dentroDelLimiteDiario(...a),
  registrarGeneracion: (...a: unknown[]) => registrarGeneracion(...a),
  mensajeLimiteAlcanzado: () => "Límite alcanzado",
}));

const { POST: generarIA } = await import("../generar-ia/route");
const { POST: guardarLote } = await import("../guardar-lote/route");
const { GET: getTemas, POST: postTema } = await import("../../temas/route");

const req = (url: string, b: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

/** Devuelve, según el SQL, lo que respondería la base. */
function baseFalsa(opts: { maximo?: number; curso?: boolean } = {}) {
  sql.mockImplementation((strings: TemplateStringsArray) => {
    const q = strings.join("?");
    if (q.includes("max(numero)")) return Promise.resolve([{ maximo: opts.maximo ?? 0 }]);
    if (q.includes("from cursos")) return Promise.resolve(opts.curso === false ? [] : [{ id: "c1", nombre: "Microsoft Excel", asignatura: "Tecnología e Informática" }]);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { email: "admin@iecv.co", rol: "admin" } });
  dentroDelLimiteDiario.mockResolvedValue(true);
  generarMallaIA.mockResolvedValue([
    { tema: "Introducción", subtemas: "A\nB" },
    { tema: "Fórmulas", subtemas: "C\nD" },
  ]);
  baseFalsa();
});

const cuerpoIA = { cursoId: "c1", nivel: "intermedio", temaGeneral: "Excel laboral", clases: 2 };

describe("POST /api/mallas/generar-ia", () => {
  it("rechaza con 403 a quien no es admin, sin gastar IA", async () => {
    auth.mockResolvedValue({ user: { email: "docente@iecv.co", rol: "docente" } });
    const res = await generarIA(req("/api/mallas/generar-ia", cuerpoIA));
    expect(res.status).toBe(403);
    expect(generarMallaIA).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...cuerpoIA, nivel: "experto" }, /curso o el nivel/],
    [{ ...cuerpoIA, temaGeneral: "  " }, /tema general/],
    [{ ...cuerpoIA, clases: 0 }, /entre 1 y 40/],
    [{ ...cuerpoIA, clases: 41 }, /entre 1 y 40/],
    [{ ...cuerpoIA, clases: 2.5 }, /entre 1 y 40/],
  ])("valida la entrada (%#) con 400", async (cuerpo, mensaje) => {
    const res = await generarIA(req("/api/mallas/generar-ia", cuerpo));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(generarMallaIA).not.toHaveBeenCalled();
  });

  it("404 si el curso no existe", async () => {
    baseFalsa({ curso: false });
    const res = await generarIA(req("/api/mallas/generar-ia", cuerpoIA));
    expect(res.status).toBe(404);
    expect(generarMallaIA).not.toHaveBeenCalled();
  });

  it("429 y sin IA si se pasó del límite diario", async () => {
    dentroDelLimiteDiario.mockResolvedValue(false);
    const res = await generarIA(req("/api/mallas/generar-ia", cuerpoIA));
    expect(res.status).toBe(429);
    expect(generarMallaIA).not.toHaveBeenCalled();
  });

  it("devuelve la propuesta numerada a continuación de los temas existentes de ese nivel, sin guardar nada", async () => {
    baseFalsa({ maximo: 7 });
    const res = await generarIA(req("/api/mallas/generar-ia", { ...cuerpoIA, indicaciones: "adultos" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.existentes).toBe(7);
    expect(data.propuesta.map((t: { numero: number }) => t.numero)).toEqual([8, 9]);
    expect(generarMallaIA).toHaveBeenCalledWith(expect.objectContaining({ nivel: "intermedio", clases: 2, cursoNombre: "Microsoft Excel", asignatura: "Tecnología e Informática", indicaciones: "adultos" }));
    expect(registrarGeneracion).toHaveBeenCalledWith("admin@iecv.co", "generar-malla");
    const sqls = sql.mock.calls.map((c) => (c[0] as TemplateStringsArray).join("?"));
    expect(sqls.some((q) => /insert into temas/i.test(q))).toBe(false);
    // el máximo se calcula sobre ese curso Y ese nivel, contando también los desactivados
    expect(sqls.find((q) => q.includes("max(numero)"))).toMatch(/curso_id = \?[\s\S]*nivel = \?/);
  });

  it("500 con el mensaje si la IA falla", async () => {
    generarMallaIA.mockRejectedValue(new Error("La malla quedó incompleta"));
    const res = await generarIA(req("/api/mallas/generar-ia", cuerpoIA));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/incompleta/);
  });
});

describe("POST /api/mallas/guardar-lote", () => {
  const lote = { cursoId: "c1", nivel: "avanzado", temas: [{ tema: "A", subtemas: "x\ny" }, { tema: "B", subtemas: "z" }, { tema: "C", subtemas: "w" }] };

  function transaccion(maximo: number) {
    const inserts: unknown[][] = [];
    begin.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = (strings: TemplateStringsArray, ...vals: unknown[]) => {
        const q = strings.join("?");
        if (q.includes("max(numero)")) return Promise.resolve([{ maximo }]);
        if (/insert into temas/i.test(q)) { inserts.push(vals); return Promise.resolve([]); }
        return Promise.resolve([]);
      };
      return fn(tx);
    });
    return inserts;
  }

  it("rechaza con 403 a quien no es admin", async () => {
    auth.mockResolvedValue({ user: { email: "d@iecv.co", rol: "docente" } });
    expect((await guardarLote(req("/api/mallas/guardar-lote", lote))).status).toBe(403);
    expect(begin).not.toHaveBeenCalled();
  });

  it("agrega los temas numerados desde max+1 en ese nivel, sin video ni Kahoot", async () => {
    const inserts = transaccion(12);
    const res = await guardarLote(req("/api/mallas/guardar-lote", lote));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, filas: 3, desde: 13, hasta: 15 });
    // valores: (curso, nivel, numero, tema, subtemas)
    expect(inserts.map((v) => [v[0], v[1], v[2], v[3]])).toEqual([
      ["c1", "avanzado", 13, "A"],
      ["c1", "avanzado", 14, "B"],
      ["c1", "avanzado", 15, "C"],
    ]);
  });

  it("malla vacía: arranca en 1", async () => {
    const inserts = transaccion(0);
    const res = await guardarLote(req("/api/mallas/guardar-lote", lote));
    expect((await res.json()).desde).toBe(1);
    expect(inserts[0][2]).toBe(1);
  });

  it.each([
    [{ ...lote, nivel: "otro" }],
    [{ ...lote, temas: [] }],
    [{ ...lote, temas: [{ tema: "", subtemas: "x" }] }],
    [{ ...lote, temas: [{ tema: "A", subtemas: "  " }] }],
    [{ ...lote, temas: Array.from({ length: 41 }, () => ({ tema: "A", subtemas: "x" })) }],
  ])("valida la entrada (%#) con 400 y no guarda", async (cuerpo) => {
    const res = await guardarLote(req("/api/mallas/guardar-lote", cuerpo));
    expect(res.status).toBe(400);
    expect(begin).not.toHaveBeenCalled();
  });

  it("409 si otra persona ocupó esos números (violación de unicidad)", async () => {
    begin.mockRejectedValue(new Error('duplicate key value violates unique constraint "temas_curso_nivel_numero_key"'));
    const res = await guardarLote(req("/api/mallas/guardar-lote", lote));
    expect(res.status).toBe(409);
  });
});

describe("/api/temas con nivel", () => {
  it("GET sin nivel devuelve la malla básica (comportamiento de siempre)", async () => {
    await getTemas(new NextRequest("http://localhost/api/temas?cursoId=c1"));
    const [strings, ...vals] = sql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toMatch(/nivel = \?/);
    expect(vals).toEqual(["c1", "basico"]);
  });

  it("GET con nivel filtra por ese nivel; un nivel inválido es 400", async () => {
    await getTemas(new NextRequest("http://localhost/api/temas?cursoId=c1&nivel=avanzado"));
    expect((sql.mock.calls[0] as unknown[]).slice(1)).toEqual(["c1", "avanzado"]);
    const res = await getTemas(new NextRequest("http://localhost/api/temas?cursoId=c1&nivel=xx"));
    expect(res.status).toBe(400);
  });

  it("POST crea el tema en el nivel indicado (básico si no se indica)", async () => {
    sql.mockResolvedValue([{ id: "t1" }]);
    await postTema(req("/api/temas", { cursoId: "c1", numero: 1, tema: "T", subtemas: "S", nivel: "intermedio" }));
    expect((sql.mock.calls[0] as unknown[]).slice(1, 3)).toEqual(["c1", "intermedio"]);
    sql.mockClear();
    await postTema(req("/api/temas", { cursoId: "c1", numero: 1, tema: "T", subtemas: "S" }));
    expect((sql.mock.calls[0] as unknown[]).slice(1, 3)).toEqual(["c1", "basico"]);
  });
});
