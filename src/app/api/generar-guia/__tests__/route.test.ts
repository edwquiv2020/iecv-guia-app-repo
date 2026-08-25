import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import type { ContenidoDua, ContenidoGuia, ContenidoKahoot } from "@/lib/types";

// Integración de la ruta completa: valida el body, orquesta IA + imagen +
// ensamblado de documentos. Se mockean los tres bordes externos (Anthropic,
// el script Python de la imagen motivacional y Postgres) para que el test
// corra rápido y sin credenciales — todo lo demás (armado real de los
// .docx/.xlsx) se ejecuta de verdad, que es la parte que más vale proteger.

const generarContenidoGuia = vi.fn();
const generarContenidoDua = vi.fn();
const generarCuestionarioKahoot = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  generarContenidoGuia: (...args: unknown[]) => generarContenidoGuia(...args),
  generarContenidoDua: (...args: unknown[]) => generarContenidoDua(...args),
  generarCuestionarioKahoot: (...args: unknown[]) => generarCuestionarioKahoot(...args),
}));

const generarImagenMotivacional = vi.fn();
vi.mock("@/lib/images", () => ({
  generarImagenMotivacional: (...args: unknown[]) => generarImagenMotivacional(...args),
}));

const generarRutaVisual = vi.fn();
vi.mock("@/lib/rutaVisual", () => ({
  generarRutaVisual: (...args: unknown[]) => generarRutaVisual(...args),
}));

const sql = vi.fn();
vi.mock("@/lib/db", () => ({
  sql: Object.assign((...args: unknown[]) => sql(...args), { json: (v: unknown) => v }),
}));

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const { POST } = await import("../route");

const paramsBase = {
  clei: "III" as const,
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  semana: 21,
  guia: 21,
  fechaClase: "15/07/26",
  fechaClaseLarga: "15/07/2026",
  tema: "INTRODUCCIÓN A INTERNET",
  subtemas: ["Navegadores web", "Buscadores", "Correo electrónico"],
  fechaCargue: "15/07/2026",
  horaMaxima: "23:59",
  videoApoyo: { titulo: "¿Qué es Internet?", canal: "Canal de prueba", duracion: "3:45", url: "https://youtube.com/watch?v=x" },
};

const contenidoFixture: ContenidoGuia = {
  saludoMotivacion: "¡Bienvenido de nuevo!",
  introduccion: "Internet se ha vuelto una herramienta indispensable.",
  competencia: "Utiliza Internet de forma segura y eficiente.",
  desempeno: "Navega, busca información confiable y gestiona un correo.",
  objetivoGuia: ["abrir un navegador", "usar un buscador", "enviar un correo"],
  reflexionInicial: "¿Alguna vez has necesitado buscar información urgente?",
  parteDeLoQueYaSabes: "Ya saben pedir consejo a otras personas para resolver dudas.",
  subtemas: [
    { titulo: "Navegadores web", funcion: "Programa que permite acceder a páginas de Internet." },
    { titulo: "Buscadores", funcion: "Herramienta para encontrar información." },
    {
      titulo: "Correo electrónico", funcion: "Servicio para enviar y recibir mensajes.",
      pasos: [
        { texto: "Abra el navegador y escriba gmail.com.", icono: "ninguno" },
        { texto: "Escriba el mensaje y aplique negrita al asunto.", icono: "negrita" },
      ],
      rutaVisual: { tab: "Inicio", grupo: "Fuente", opciones: [{ icono: "negrita", etiqueta: "Negrita" }] },
    },
  ],
  talleres: [
    { tipo: "cuestionario", instrucciones: "Responde.", items: ["¿Qué es un navegador?"] },
  ],
  rubricaCriteriosEspecificos: [
    { criterio: "Uso del navegador", superior: "Navega con fluidez.", alto: "Con apoyo mínimo.", basico: "Con apoyo constante.", bajo: "No logra navegar." },
  ],
  listaVerificacion: ["Abrí el navegador y visité una página web."],
  antesDeCerrarPregunta: "¿En qué momento vas a usar Internet esta semana?",
  fichaResumen: [{ concepto: "Navegadores web", resumen: "Acceden a páginas de Internet." }],
  bibliografia: [{ autor: "Comfenalco Valle", anio: "2026", titulo: "Manual de Tecnología e Informática" }],
  fotoMotivacionalClave: "tortuga",
};

const contenidoDuaFixture: ContenidoDua = {
  saludoMotivacion: "¡Bienvenido!",
  introduccion: "Vamos a practicar un procedimiento paso a paso.",
  competencia: "Repite un procedimiento guiado con apoyo decreciente.",
  desempeno: "Sigue instrucciones simples y repetidas.",
  objetivoGuia: "Vas a poder abrir un navegador y buscar información.",
  reflexionInicial: "¿Cómo buscas algo que no sabes?",
  parteDeLoQueYaSabes: "Ya saben pedir ayuda a otra persona.",
  subtemaTitulo: "Navegadores web",
  funcionExplicita: "Un navegador es el programa para entrar a páginas de Internet.",
  repeticiones: [
    { instruccion: "Abre el navegador (ejemplo resuelto)." },
    { instruccion: "Abre el navegador de nuevo." },
    { instruccion: "Abre el navegador una vez más." },
    { instruccion: "Abre el navegador sin ayuda." },
  ],
  tallerSituacionPropia: { opcionA: "Busca el clima de hoy.", opcionB: "Busca una receta." },
  rubricaCriteriosEspecificos: [
    { criterio: "Apertura del navegador", superior: "Solo.", alto: "Con apoyo mínimo.", basico: "Con apoyo constante.", bajo: "No lo logra." },
  ],
  listaVerificacion: ["Abrí el navegador."],
  antesDeCerrarPregunta: "¿Qué vas a buscar esta semana?",
  fichaResumen: "Abrir el navegador es el primer paso para usar Internet.",
  bibliografia: [{ autor: "CAST", anio: "2018", titulo: "UDL Guidelines 2.2" }],
};

const kahootFixture: ContenidoKahoot = {
  preguntas: [
    { pregunta: "¿Qué es un navegador?", respuestas: ["Un programa", "Un cable", "Un teclado", "Un mouse"], tiempoSeg: 20, correctas: [1] },
    { pregunta: "Internet sirve para buscar información.", respuestas: ["Verdadero", "Falso"], tiempoSeg: 10, correctas: [1] },
  ],
};

async function imagenTortuga(): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));
}

async function iconoNegrita(): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), "assets", "iconos", "negrita.png"));
}

function esZipValido(base64: string): boolean {
  return Buffer.from(base64, "base64").subarray(0, 2).toString("ascii") === "PK";
}

beforeEach(() => {
  vi.clearAllMocks();
  generarContenidoGuia.mockResolvedValue(contenidoFixture);
  generarContenidoDua.mockResolvedValue(contenidoDuaFixture);
  generarCuestionarioKahoot.mockResolvedValue(kahootFixture);
  generarImagenMotivacional.mockImplementation(imagenTortuga);
  generarRutaVisual.mockImplementation(iconoNegrita);
  sql.mockResolvedValue([]);
  auth.mockResolvedValue({ user: { email: "docente@gmail.com" } });
});

describe("POST /api/generar-guia", () => {
  it("rechaza con 400 cuando falta un campo requerido", async () => {
    const sinTema: Record<string, unknown> = { ...paramsBase, tipos: ["estandar"] };
    delete sinTema.tema;
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sinTema),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/tema/);
    expect(generarContenidoGuia).not.toHaveBeenCalled();
  });

  it("rechaza con 400 cuando no se elige ningún tipo de guía", async () => {
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: [] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("genera la guía Estándar: .docx + Kahoot .xlsx + kit, todos zips válidos", async () => {
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.archivos).toHaveLength(3);
    expect(data.archivos.map((a: { nombre: string }) => a.nombre)).toEqual([
      "FTO-EDU-FOR-96_V3_Guia_Semana21_Guia21_CLEIIII.docx",
      "Cuestionario_Semana21_CLEIIII_Kahoot.xlsx",
      "KIT_SUBIDA_Semana21_CLEIIII.docx",
    ]);
    for (const archivo of data.archivos) {
      expect(esZipValido(archivo.contenidoBase64)).toBe(true);
    }

    expect(data.talleresTipos).toEqual(["cuestionario"]);
    expect(data.contenido).toEqual(contenidoFixture);
    expect(data.cuestionarioKahoot).toEqual(kahootFixture);
    expect(data.contenidoDua).toBeUndefined();

    // Rotación de foto motivacional: semana 21 -> índice (21-1) % 20 = 0 -> "tortuga".
    expect(generarImagenMotivacional).toHaveBeenCalledWith("tortuga");
    expect(generarContenidoDua).not.toHaveBeenCalled();

    // Solo el subtema "Correo electrónico" trae rutaVisual en el fixture.
    expect(generarRutaVisual).toHaveBeenCalledTimes(1);
    expect(generarRutaVisual).toHaveBeenCalledWith("Inicio", "Fuente", [{ icono: "negrita", etiqueta: "Negrita" }]);
  });

  it("si la ruta visual de un subtema falla, la guía se genera igual (sin bloquear por eso)", async () => {
    generarRutaVisual.mockRejectedValue(new Error("python3: cannot open resource"));
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(esZipValido(data.archivos[0].contenidoBase64)).toBe(true);
  });

  it("genera solo la guía DUA cuando tipos=['dua'] (sin Kahoot ni guía Estándar)", async () => {
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["dua"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.archivos).toHaveLength(1);
    expect(data.archivos[0].nombre).toBe(
      "FTO-EDU-FOR-96_V3_Guia_Semana21_Guia21_CLEIIII_ADAPTADA.docx"
    );
    expect(esZipValido(data.archivos[0].contenidoBase64)).toBe(true);
    expect(data.contenidoDua).toEqual(contenidoDuaFixture);
    expect(data.contenido).toBeUndefined();
    expect(generarCuestionarioKahoot).not.toHaveBeenCalled();
    // Encadenada: usa el contenido de la Estándar como base, aunque no se
    // pidió generarla como archivo entregable.
    expect(generarContenidoGuia).toHaveBeenCalledTimes(1);
    expect(generarContenidoDua).toHaveBeenCalledWith(expect.objectContaining({ tema: paramsBase.tema }), contenidoFixture);
  });

  it("genera ambos tipos (Estándar + DUA) en una sola llamada", async () => {
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar", "dua"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.archivos).toHaveLength(4); // guía + kahoot + kit + DUA
  });

  it("propaga como 500 un error del modelo (ej. contenido incompleto tras reintentos)", async () => {
    generarContenidoGuia.mockRejectedValue(new Error("El modelo devolvió contenido incompleto."));
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/contenido incompleto/);
  });

  it("acepta multipart/form-data con una imagen de subtema y se la pasa al ensamblado", async () => {
    const form = new FormData();
    form.set("params", JSON.stringify({ ...paramsBase, tipos: ["estandar"] }));
    const bytes = await imagenTortuga();
    form.set("subtemaImg_2", new File([new Uint8Array(bytes)], "captura.png", { type: "image/png" }));
    form.set("subtemaImgEsCaptura_2", "true");

    const nativeRequest = new Request("http://localhost/api/generar-guia", { method: "POST", body: form });
    const request = new NextRequest(nativeRequest);

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.archivos).toHaveLength(3);
    expect(esZipValido(data.archivos[0].contenidoBase64)).toBe(true);
  });

  it("el .docx generado trae el logo, la ilustración y la ruta visual embebidos como media real", async () => {
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar"] }),
    });

    const res = await POST(request);
    const data = await res.json();
    const docxBuf = Buffer.from(data.archivos[0].contenidoBase64, "base64");
    const zip = await JSZip.loadAsync(docxBuf);
    const mediaFiles = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
    expect(mediaFiles.length).toBeGreaterThanOrEqual(4); // logo + ilustración + ícono del paso + ruta visual
  });

  it("rechaza con 401 si no hay sesión con correo (no debería pasar detrás del proxy, pero no confía a ciegas)", async () => {
    auth.mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(401);
    expect(generarContenidoGuia).not.toHaveBeenCalled();
  });

  it("rechaza con 429 al alcanzar el límite diario de generaciones, sin llamar al modelo", async () => {
    sql.mockResolvedValueOnce([{ total: 30 }]); // conteo del límite diario ya en el tope
    const request = new NextRequest("http://localhost/api/generar-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paramsBase, tipos: ["estandar"] }),
    });

    const res = await POST(request);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/límite/);
    expect(generarContenidoGuia).not.toHaveBeenCalled();
  });
});
