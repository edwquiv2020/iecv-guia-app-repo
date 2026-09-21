import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { buildGuiaDocx, buildGuiaDuaDocx, CRITERIOS_INSTITUCIONALES } from "@/lib/buildGuia";
import type { ContenidoGuia, ParametrosGuia } from "@/lib/types";

// Smoke test del ensamblado del .docx — mismo fixture que test_build.ts (el
// script manual para revisión visual), pero sin invocar Python: usa una
// imagen real del banco de fotos directo en vez de generarla, para que
// corra rápido y sin dependencias externas en CI.

const params: ParametrosGuia = {
  asignatura: "Tecnología e Informática",
  clei: "III",
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
  videoApoyo: {
    titulo: "¿Qué es Internet?",
    canal: "Canal de prueba",
    duracion: "3:45",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
};

const contenido: ContenidoGuia = {
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

describe("buildGuiaDocx", () => {
  it("arma un .docx válido (zip) sin lanzar excepción", async () => {
    const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
    const ilustracionBuf = await fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));

    const docxBuf = await buildGuiaDocx(params, contenido, { logoBuf, ilustracionBuf });

    // Un .docx es un .zip — todo zip empieza con la firma "PK".
    expect(docxBuf.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(docxBuf.length).toBeGreaterThan(10_000);
  });

  // La tabla de datos del estudiante es la del formato original: la sede y el
  // docente salen del formulario (antes estaban fijos en el código para todos).
  it("la tabla de datos usa la sede y el docente recibidos, en negrita, y marca TI/CC con casillas", async () => {
    const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
    const ilustracionBuf = await fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));
    const docxBuf = await buildGuiaDocx({ ...params, sede: "PALMIRA", docente: "MARÍA PÉREZ" }, contenido, { logoBuf, ilustracionBuf });
    const xml = await (await JSZip.loadAsync(docxBuf)).file("word/document.xml")!.async("string");
    const texto = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(texto).toContain("SEDE: PALMIRA");
    expect(texto).toContain("NOMBRE DEL DOCENTE: MARÍA PÉREZ");
    expect(texto).not.toContain("EDWARD QUIÑONES");
    expect(texto).not.toContain("CALI");
    expect(texto).toContain("TI ☐");
    expect(texto).toContain("CC ☐");
    expect(texto).not.toContain("TI [");
    // el valor de la sede va en negrita (como en la guía de ejemplo)
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,120}<w:t[^>]*>PALMIRA<\/w:t>/);
  });

  it("sin sede/docente la tabla queda con esas celdas vacías (nunca con el nombre de otra persona)", async () => {
    const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
    const ilustracionBuf = await fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));
    const docxBuf = await buildGuiaDocx(params, contenido, { logoBuf, ilustracionBuf });
    const texto = (await (await JSZip.loadAsync(docxBuf)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");
    expect(texto).not.toContain("EDWARD");
    expect(texto).not.toContain("CALI");
  });

  // Plantilla FTO-EDU-FOR-96: Arial 10 y los 6 criterios generales de la rúbrica.
  describe("formato de la plantilla original", () => {
    async function xmlEstandar() {
      const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
      const ilustracionBuf = await fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));
      const buf = await buildGuiaDocx({ ...params, sede: "CALI", docente: "X" }, contenido, { logoBuf, ilustracionBuf });
      return (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    }

    it("el texto del cuerpo y los títulos van en Arial 10 (sz 20), no en 12/13/16", async () => {
      const xml = await xmlEstandar();
      const tamanos = new Set([...xml.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => m[1]));
      expect(tamanos.has("20")).toBe(true);
      // ningún texto de cuerpo/título en 12, 13 u 16 pt (24/26/32 half-points)
      for (const grande of ["24", "26", "32"]) {
        const fuera = [...xml.matchAll(new RegExp(`<w:sz w:val="${grande}"`, "g"))].length;
        // "ESTRUCTURA DE LA GUÍA DE FORMACIÓN" conserva 12 pt (una sola vez)
        expect(fuera).toBeLessThanOrEqual(grande === "24" ? 1 : 0);
      }
    });

    it("la rúbrica trae los 6 criterios generales de la plantilla y luego los del tema", async () => {
      const xml = await xmlEstandar();
      const texto = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      expect(CRITERIOS_INSTITUCIONALES).toHaveLength(6);
      for (const [criterio, superior, alto, basico, bajo] of CRITERIOS_INSTITUCIONALES) {
        for (const celda of [criterio, superior, alto, basico, bajo]) expect(texto).toContain(celda);
        expect(new Set([superior, alto, basico, bajo]).size).toBe(4); // niveles distintos
      }
      expect(texto).toContain("Uso del navegador"); // criterio propio del tema, después de los generales
      expect(texto.indexOf("Usa adecuadamente el cuaderno")).toBeLessThan(texto.indexOf("Uso del navegador"));
      expect(texto).not.toContain("Reconocimiento de herramientas de la cinta");
    });

    it("la guía DUA conserva su letra grande (12 pt) por accesibilidad", async () => {
      const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
      const ilustracionBuf = await fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));
      const buf = await buildGuiaDuaDocx(
        { ...params, sede: "CALI", docente: "X" },
        {
          saludoMotivacion: "Hola", introduccion: "Intro", competencia: "C", desempeno: "D", objetivoGuia: "Objetivo", reflexionInicial: "R",
          parteDeLoQueYaSabes: "P", subtemaTitulo: "Sub", funcionExplicita: "F",
          repeticiones: [{ instruccion: "a" }, { instruccion: "b" }, { instruccion: "c" }, { instruccion: "d" }],
          tallerSituacionPropia: { opcionA: "A", opcionB: "B" },
          listaVerificacion: ["v"], antesDeCerrarPregunta: "?", fichaResumen: "f",
          rubricaCriteriosEspecificos: [], bibliografia: [{ autor: "A", anio: "2026", titulo: "T" }],
        },
        { logoBuf, ilustracionBuf }
      );
      const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
      expect(xml).toContain('<w:sz w:val="24"');
      expect(xml).toContain('<w:sz w:val="26"');
    });
  });
});
