import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ sql: (...a: unknown[]) => sql(...a) }));
const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const { POST: crearAsignatura, GET: listarAsignaturas } = await import("../asignaturas/route");
const { PUT: editarAsignatura } = await import("../asignaturas/[id]/route");
const { POST: crearCurso, GET: listarCursos } = await import("../cursos/route");
const { PUT: editarCurso } = await import("../cursos/[id]/route");

const req = (b: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/admin/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const texto = (args: unknown[]) => (args[0] as TemplateStringsArray).join("?");

/** Base falsa: cada pieza responde según el SQL. */
function base(r: Partial<Record<string, unknown[]>>) {
  sql.mockImplementation((...args: unknown[]) => {
    const t = texto(args);
    for (const [fragmento, filas] of Object.entries(r)) if (t.includes(fragmento)) return Promise.resolve(filas);
    return Promise.resolve([]);
  });
}
const inserts = () => sql.mock.calls.filter((c) => /insert into/i.test(texto(c)));

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { email: "admin@iecv.co", rol: "admin" } });
});

describe("permisos", () => {
  it.each([
    ["GET asignaturas", () => listarAsignaturas()],
    ["POST asignaturas", () => crearAsignatura(req({ nombre: "X" }))],
    ["PUT asignatura", () => editarAsignatura(req({ nombre: "X" }, "PUT"), ctx("a1"))],
    ["GET cursos", () => listarCursos()],
    ["POST cursos", () => crearCurso(req({ nombre: "X", asignaturaId: "a1" }))],
    ["PUT curso", () => editarCurso(req({ nombre: "X" }, "PUT"), ctx("c1"))],
  ])("%s: 403 para un docente, sin tocar la base", async (_n, llamar) => {
    auth.mockResolvedValue({ user: { email: "d@iecv.co", rol: "docente" } });
    const res = await llamar();
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/asignaturas", () => {
  it("crea la asignatura con un slug automático", async () => {
    base({ "from asignaturas": [{ nombre: "Español", slug: "espanol" }], "insert into asignaturas": [{ id: "a9", slug: "matematicas", nombre: "Matemáticas", activa: true }] });
    const res = await crearAsignatura(req({ nombre: "  Matemáticas " }));
    expect(res.status).toBe(201);
    expect(inserts()[0].slice(1)).toEqual(["matematicas", "Matemáticas"]);
  });

  it("slug con -2 si el slug ya lo usa otra asignatura", async () => {
    base({ "from asignaturas": [{ nombre: "Ciencias (Naturales)", slug: "ciencias-naturales" }], "insert into asignaturas": [{ id: "a9" }] });
    await crearAsignatura(req({ nombre: "Ciencias Naturales" }));
    expect(inserts()[0].slice(1)[0]).toBe("ciencias-naturales-2");
  });

  it("409 si ya existe una con el mismo nombre (sin importar tildes ni mayúsculas)", async () => {
    base({ "from asignaturas": [{ nombre: "Matemáticas", slug: "matematicas" }] });
    const res = await crearAsignatura(req({ nombre: "matematicas" }));
    expect(res.status).toBe(409);
    expect(inserts()).toHaveLength(0);
  });

  it.each([[""], ["   "], ["x".repeat(101)]])("400 con nombre inválido (%#)", async (nombre) => {
    const res = await crearAsignatura(req({ nombre }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/asignaturas/[id]", () => {
  it("no deja desactivar una asignatura con cursos activos", async () => {
    base({ "from asignaturas where id": [{ id: "a1", nombre: "Tecnología", activa: true }], "from cursos where asignatura_id": [{ total: 3 }] });
    const res = await editarAsignatura(req({ activa: false }, "PUT"), ctx("a1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/3 curso\(s\) activo\(s\)/);
    expect(sql.mock.calls.some((c) => /update asignaturas/i.test(texto(c)))).toBe(false);
  });

  it("desactiva cuando no tiene cursos activos", async () => {
    base({ "from asignaturas where id": [{ id: "a1", nombre: "Vieja", activa: true }], "from cursos where asignatura_id": [{ total: 0 }], "update asignaturas": [{ id: "a1", activa: false }] });
    expect((await editarAsignatura(req({ activa: false }, "PUT"), ctx("a1"))).status).toBe(200);
  });

  it("409 al renombrar con el nombre de otra; 404 si no existe", async () => {
    // el fragmento más específico va primero: la base falsa responde con la primera coincidencia
    base({ "from asignaturas where id <>": [{ nombre: "Español" }], "from asignaturas where id": [{ id: "a1", nombre: "Inglés", activa: true }] });
    expect((await editarAsignatura(req({ nombre: "español" }, "PUT"), ctx("a1"))).status).toBe(409);
    base({});
    expect((await editarAsignatura(req({ nombre: "X" }, "PUT"), ctx("zz"))).status).toBe(404);
  });
});

describe("POST /api/admin/cursos", () => {
  const valido = { nombre: "Fundamentos de Álgebra", asignaturaId: "a1", descripcion: " Álgebra desde cero " };

  it("crea el curso dentro de su asignatura con slug automático", async () => {
    base({ "from asignaturas where id": [{ id: "a1" }], "from cursos where asignatura_id": [], "select slug from cursos": [{ slug: "excel" }], "insert into cursos": [{ id: "c9" }] });
    const res = await crearCurso(req(valido));
    expect(res.status).toBe(201);
    expect(inserts()[0].slice(1)).toEqual(["fundamentos-de-algebra", "Fundamentos de Álgebra", "Álgebra desde cero", "a1"]);
  });

  it("exige asignatura (400) y que exista y esté activa (400)", async () => {
    expect((await crearCurso(req({ nombre: "X" }))).status).toBe(400);
    base({ "from asignaturas where id": [] });
    const res = await crearCurso(req(valido));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/desactivada|no existe/);
    expect(inserts()).toHaveLength(0);
  });

  it("409 si la misma asignatura ya tiene un curso con ese nombre", async () => {
    base({ "from asignaturas where id": [{ id: "a1" }], "from cursos where asignatura_id": [{ nombre: "fundamentos de algebra" }] });
    expect((await crearCurso(req(valido))).status).toBe(409);
    expect(inserts()).toHaveLength(0);
  });

  it("el mismo nombre en OTRA asignatura sí se permite", async () => {
    base({ "from asignaturas where id": [{ id: "a2" }], "from cursos where asignatura_id": [], "select slug from cursos": [], "insert into cursos": [{ id: "c9" }] });
    expect((await crearCurso(req({ ...valido, asignaturaId: "a2" }))).status).toBe(201);
  });
});

describe("PUT /api/admin/cursos/[id]", () => {
  const actual = { id: "c1", nombre: "Excel", descripcion: null, asignatura_id: "a1", activo: true };

  it("mueve el curso a otra asignatura activa", async () => {
    base({ "from cursos where id": [actual], "from asignaturas where id": [{ id: "a2" }], "from cursos where asignatura_id": [], "update cursos": [{ id: "c1", asignaturaId: "a2" }] });
    const res = await editarCurso(req({ asignaturaId: "a2" }, "PUT"), ctx("c1"));
    expect(res.status).toBe(200);
    const upd = sql.mock.calls.find((c) => /update cursos/i.test(texto(c)))!;
    expect(upd.slice(1)).toContain("a2");
  });

  it("desactiva sin tocar lo demás (no se borra)", async () => {
    base({ "from cursos where id": [actual], "from cursos where asignatura_id": [], "update cursos": [{ id: "c1", activo: false }] });
    const res = await editarCurso(req({ activo: false }, "PUT"), ctx("c1"));
    expect(res.status).toBe(200);
    expect(sql.mock.calls.some((c) => /delete/i.test(texto(c)))).toBe(false);
    expect(sql.mock.calls.find((c) => /update cursos/i.test(texto(c)))!.slice(1)).toEqual(["Excel", null, "a1", false, "c1"]);
  });

  it("409 si el nuevo nombre choca con otro curso de la asignatura; 404 si no existe; 400 con nombre vacío", async () => {
    base({ "from cursos where id": [actual], "from cursos where asignatura_id": [{ nombre: "Word" }] });
    expect((await editarCurso(req({ nombre: "word" }, "PUT"), ctx("c1"))).status).toBe(409);
    base({ "from cursos where id": [actual] });
    expect((await editarCurso(req({ nombre: "  " }, "PUT"), ctx("c1"))).status).toBe(400);
    base({});
    expect((await editarCurso(req({ nombre: "X" }, "PUT"), ctx("zz"))).status).toBe(404);
  });
});
