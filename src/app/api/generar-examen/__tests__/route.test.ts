import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { ContenidoExamen } from "@/lib/types";

// Misma idea que generar-guia/__tests__/route.test.ts: se mockean los
// bordes externos (Anthropic y Postgres) y se ejerce de verdad el
// ensamblado real de los .docx (examen + kit).

const generarContenidoDiagnostico = vi.fn();
const generarContenidoExamen = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  generarContenidoDiagnostico: (...args: unknown[]) => generarContenidoDiagnostico(...args),
  generarContenidoExamen: (...args: unknown[]) => generarContenidoExamen(...args),
}));

const sql = vi.fn();
vi.mock("@/lib/db", () => ({
  sql: Object.assign((...args: unknown[]) => sql(...args), { json: (v: unknown) => v }),
}));

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const { POST } = await import("../route");

const diagnosticoParams = {
  tipo: "diagnostico" as const,
  clei: "III" as const,
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  cantidadPreguntas: 10,
  valoracionPregunta: 0.5,
  semana: 5,
  fechaAplicacion: "10/02/2026",
  sede: "Sede Principal",
  docente: "Docente de prueba",
  cicloId: "ciclo-1",
  jornadaId: "jornada-1",
};

const intermedioParams = {
  ...diagnosticoParams,
  tipo: "intermedio" as const,
  cursoId: "curso-1",
  cursoNombre: "Microsoft Excel",
};

function contenidoConPreguntas(n: number): ContenidoExamen {
  return {
    preguntas: Array.from({ length: n }, (_, i) => ({
      enunciado: `Enunciado de la pregunta ${i + 1}.`,
      opciones: ["A", "B", "C", "D"] as [string, string, string, string],
      correcta: i % 4,
    })),
  };
}

function esZipValido(base64: string): boolean {
  return Buffer.from(base64, "base64").subarray(0, 2).toString("ascii") === "PK";
}

beforeEach(() => {
  vi.clearAllMocks();
  generarContenidoDiagnostico.mockResolvedValue(contenidoConPreguntas(10));
  generarContenidoExamen.mockResolvedValue(contenidoConPreguntas(10));
  // Sirve tanto para temasCubiertos() como para el conteo del límite diario
  // (rateLimit.ts solo lee ${fila?.total ?? 0}, que da 0 con este shape —
  // dentro del límite por defecto).
  sql.mockResolvedValue([{ tema: "FUNCIÓN SI", subtemas: "Sintaxis\nCondiciones" }]);
  auth.mockResolvedValue({ user: { email: "docente@gmail.com" } });
});

describe("POST /api/generar-examen", () => {
  it("rechaza con 400 cuando falta un campo requerido", async () => {
    const sinSede: Record<string, unknown> = { ...diagnosticoParams };
    delete sinSede.sede;
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sinSede),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
    expect(generarContenidoDiagnostico).not.toHaveBeenCalled();
  });

  it("rechaza con 400 un tipo de examen inválido", async () => {
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...diagnosticoParams, tipo: "sorpresa" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("rechaza con 400 un examen Intermedio sin cursoId", async () => {
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...diagnosticoParams, tipo: "intermedio" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/curso/i);
  });

  it("genera el Diagnóstico: examen .docx + kit, zips válidos, sin consultar temas del curso", async () => {
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diagnosticoParams),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.archivos).toHaveLength(2);
    expect(data.archivos[0].nombre).toBe(
      "FTO-EDU-FOR-82_V2_Diagnostico_Semana5_CLEI_III_SEMANAL1.docx"
    );
    expect(data.archivos[1].nombre).toBe("KIT_SUBIDA_Diagnostico_Semana5_CLEI_III.docx");
    for (const archivo of data.archivos) {
      expect(esZipValido(archivo.contenidoBase64)).toBe(true);
    }
    // No consulta temasCubiertos (Diagnóstico no evalúa un curso), pero sql
    // sí se llama 2 veces para el límite diario: el conteo + el registro.
    expect(sql).toHaveBeenCalledTimes(2);
    expect(generarContenidoExamen).not.toHaveBeenCalled();
  });

  it("genera el Intermedio consultando los temas cubiertos hasta la semana del examen", async () => {
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intermedioParams),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.archivos).toHaveLength(2);
    expect(data.archivos[0].nombre).toBe(
      "FTO-EDU-FOR-98_V1_Examen_Intermedio_Semana5_CLEI_III_SEMANAL1.docx"
    );
    // 3 llamadas a sql: conteo del límite diario + registro + temasCubiertos.
    expect(sql).toHaveBeenCalledTimes(3);
    expect(generarContenidoExamen).toHaveBeenCalledWith(
      expect.objectContaining({ cursoId: "curso-1" }),
      ["FUNCIÓN SI — Sintaxis\nCondiciones"],
      []
    );
  });

  it("propaga como 500 un error del modelo", async () => {
    generarContenidoDiagnostico.mockRejectedValue(new Error("El diagnóstico quedó incompleto."));
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diagnosticoParams),
    });

    const res = await POST(request);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/incompleto/);
  });

  it("acepta multipart/form-data con imagen + descripción de una pregunta", async () => {
    const form = new FormData();
    form.set("params", JSON.stringify(diagnosticoParams));
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // firma PNG mínima
    form.set("preguntaImg_1", new File([bytes], "captura.png", { type: "image/png" }));
    form.set("preguntaDesc_1", "Captura de la barra de fórmulas de Excel.");

    const nativeRequest = new Request("http://localhost/api/generar-examen", { method: "POST", body: form });
    const request = new NextRequest(nativeRequest);

    const res = await POST(request);
    expect(res.status).toBe(200);
    expect(generarContenidoDiagnostico).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "diagnostico" }),
      [expect.objectContaining({ index: 1, descripcionImagen: "Captura de la barra de fórmulas de Excel." })]
    );
  });

  it("rechaza con 401 si no hay sesión con correo (no debería pasar detrás del proxy, pero no confía a ciegas)", async () => {
    auth.mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diagnosticoParams),
    });

    const res = await POST(request);
    expect(res.status).toBe(401);
    expect(generarContenidoDiagnostico).not.toHaveBeenCalled();
  });

  it("rechaza con 429 al alcanzar el límite diario de generaciones, sin llamar al modelo", async () => {
    sql.mockResolvedValueOnce([{ total: 30 }]); // conteo del límite diario ya en el tope
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diagnosticoParams),
    });

    const res = await POST(request);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/límite/);
    expect(generarContenidoDiagnostico).not.toHaveBeenCalled();
  });

  it("respeta LIMITE_GENERACIONES_DIA si está configurado en el entorno", async () => {
    process.env.LIMITE_GENERACIONES_DIA = "2";
    sql.mockResolvedValueOnce([{ total: 2 }]);
    const request = new NextRequest("http://localhost/api/generar-examen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diagnosticoParams),
    });

    const res = await POST(request);
    expect(res.status).toBe(429);
    delete process.env.LIMITE_GENERACIONES_DIA;
  });
});
