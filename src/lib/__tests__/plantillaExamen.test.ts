import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import { buildExamenDocx, buildDiagnosticoDocx } from "@/lib/buildExamen";
import type { ContenidoExamen, ParametrosExamen } from "@/lib/types";

// El instrumento FTO-EDU-FOR-98 se arma desde el ARCHIVO ORIGINAL de la
// institución. Lo que estos tests protegen: (1) exactamente UNA tabla de
// respuestas, la que corresponde (5 o 10), y byte a byte la de la plantilla;
// (2) valoración 1.0 con 5 preguntas y 0.5 con 10; (3) el resto del formato
// original (encabezado con logo, pie, tabla de datos) sigue ahí.

const params = (n: number): ParametrosExamen => ({
  asignatura: "Tecnología e Informática",
  tipo: "intermedio",
  clei: "III",
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  cantidadPreguntas: n,
  valoracionPregunta: 5 / n,
  semana: 8,
  fechaAplicacion: "24/10/2026",
  sede: "CALI",
  docente: "EDWARD QUIÑONES VALENZUELA",
  cursoNombre: "Microsoft Excel",
});

const contenido = (n: number): ContenidoExamen => ({
  preguntas: Array.from({ length: n }, (_, i) => ({
    enunciado: `Enunciado ${i + 1} con <símbolos> & "comillas".`,
    opciones: ["Uno", "Dos", "Tres", "Cuatro"] as [string, string, string, string],
    correcta: i % 4,
  })),
});

async function abrir(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const texto = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { zip, xml, texto };
}

async function assetPlantilla(nombre: string) {
  return fs.readFile(path.join(process.cwd(), "assets", "plantillas", nombre));
}

describe("buildExamenDocx (plantilla FTO-EDU-FOR-98)", () => {
  it("10 preguntas: valoración 0.5 y UNA sola tabla de respuestas — la de 10, idéntica a la de la plantilla", async () => {
    const { zip, xml, texto } = await abrir(await buildExamenDocx(params(10), contenido(10)));
    expect(texto).toContain("consta de 10 preguntas");
    expect(texto).toContain("Valoración de cada pregunta: 0.5");
    expect(xml.match(/<w:drawing>.*?Tabla de respuestas/g)).toHaveLength(1);
    expect(xml).toContain("Tabla de respuestas (10 preguntas)");
    const embebida = await zip.file("word/media/tabla_respuestas.png")!.async("nodebuffer");
    expect(embebida.equals(await assetPlantilla("tabla_respuestas_10.png"))).toBe(true);
  });

  it("5 preguntas: valoración 1.0 y UNA sola tabla de respuestas — la de 5, idéntica a la de la plantilla", async () => {
    const { zip, xml, texto } = await abrir(await buildExamenDocx(params(5), contenido(5)));
    expect(texto).toContain("consta de 5 preguntas");
    expect(texto).toContain("Valoración de cada pregunta: 1.0");
    expect(xml.match(/<w:drawing>.*?Tabla de respuestas/g)).toHaveLength(1);
    expect(xml).toContain("Tabla de respuestas (5 preguntas)");
    const embebida = await zip.file("word/media/tabla_respuestas.png")!.async("nodebuffer");
    expect(embebida.equals(await assetPlantilla("tabla_respuestas_5.png"))).toBe(true);
  });

  it("la tabla de 5 de la plantilla es exactamente la imagen original (imagen2.png) del .docx oficial", async () => {
    const original = await JSZip.loadAsync(await assetPlantilla("FTO-EDU-FOR-98_V1.docx"));
    const imagen2 = await original.file("word/media/image2.png")!.async("nodebuffer");
    expect(imagen2.equals(await assetPlantilla("tabla_respuestas_5.png"))).toBe(true);
  });

  it("no queda ninguna marca de la plantilla en blanco (Opción 1./2., placeholders, tipo sin llenar)", async () => {
    const { texto } = await abrir(await buildExamenDocx(params(10), contenido(10)));
    expect(texto).not.toMatch(/Opción 1|Opción 2/);
    expect(texto).not.toContain("(Intermedio/Final)");
    // Un solo bloque de preguntas numeradas del 1 al 10 (no quedan los "1." vacíos del original).
    expect((texto.match(/ 10\. Enunciado 10/g) ?? []).length).toBe(1);
  });

  it("rellena los campos: asignatura, tipo de prueba, CLEI, fecha (día/mes/año), sede y docente", async () => {
    const { texto } = await abrir(await buildExamenDocx(params(10), contenido(10)));
    expect(texto).toContain("Área o Asignatura: Tecnología e Informática");
    expect(texto).toContain("Tipo de prueba: (Intermedio)");
    expect(texto).toMatch(/CLEI\s+6-7\/III\/SEMANAL 1/);
    expect(texto).toContain("rellenando el círculo");
    expect(texto).toMatch(/DÍA:\s+24/);
    expect(texto).toMatch(/MES:\s+10/);
    expect(texto).toMatch(/AÑO:\s+2026/);
    expect(texto).toMatch(/SEDE:\s+CALI/);
    expect(texto).toContain("EDWARD QUIÑONES VALENZUELA");
  });

  it("tipo Final se refleja en la línea de tipo de prueba", async () => {
    const { texto } = await abrir(await buildExamenDocx({ ...params(5), tipo: "final" }, contenido(5)));
    expect(texto).toContain("Tipo de prueba: (Final)");
  });

  it("escapa caracteres especiales de XML en los enunciados", async () => {
    const { xml } = await abrir(await buildExamenDocx(params(5), contenido(5)));
    expect(xml).toContain("&lt;símbolos&gt; &amp; \"comillas\"");
  });

  it("conserva el formato original: encabezado con logo, pie FTO-EDU-FOR-98 y tabla de datos", async () => {
    const { zip, texto } = await abrir(await buildExamenDocx(params(10), contenido(10)));
    expect(zip.file("word/media/image3.png")).not.toBeNull(); // logo Comfenalco Valle del encabezado
    const encabezado = (await zip.file("word/header1.xml")!.async("string")).replace(/<[^>]+>/g, " ");
    expect(encabezado).toContain("INSTRUMENTO");
    const pie = (await zip.file("word/footer1.xml")!.async("string")).replace(/<[^>]+>/g, " ");
    expect(pie).toContain("FTO-EDU-FOR-98");
    for (const etiqueta of ["PRIMER APELLIDO", "SEGUNDO APELLIDO", "NOMBRE", "TIPO DE DOCUMENTO", "NÚMERO DOCUMENTO", "FECHA APLICACIÓN", "SEDE", "NOMBRE DEL DOCENTE/EVALUADOR", "NOTA"]) {
      expect(texto).toContain(etiqueta);
    }
  });

  it("incrusta la imagen de apoyo de una pregunta como parte nueva del paquete", async () => {
    const png = await assetPlantilla("tabla_respuestas_5.png");
    const { zip, xml } = await abrir(await buildExamenDocx(params(5), contenido(5), [{ index: 2, buffer: png, tipo: "png" }]));
    expect(zip.file("word/media/pregunta2.png")).not.toBeNull();
    expect(xml).toContain('r:embed="rIdPregunta2"');
    expect(await zip.file("word/_rels/document.xml.rels")!.async("string")).toContain('Id="rIdPregunta2"');
  });

  it("rechaza cantidades de preguntas que no existen en el formato (solo 5 o 10)", async () => {
    await expect(buildExamenDocx(params(7), contenido(7))).rejects.toThrow(/5 o 10/);
  });
});

describe("buildDiagnosticoDocx (plantilla FTO-EDU-FOR-82)", () => {
  const preguntas = Array.from({ length: 7 }, (_, i) => ({ enunciado: `¿Qué sabe usted del tema ${i + 1} & <más>?` }));
  const paramsDiag = { ...params(10), tipo: "diagnostico" as const, cursoNombre: undefined };

  it("título, código y pie del FOR-82, con las 7 preguntas abiertas numeradas y el texto original", async () => {
    const { zip, texto } = await abrir(await buildDiagnosticoDocx(paramsDiag, { preguntas }));
    const encabezado = (await zip.file("word/header1.xml")!.async("string")).replace(/<[^>]+>/g, " ");
    expect(encabezado).toContain("DIAGNÓSTICO DE PRESABERES COLEGIO");
    expect(encabezado).not.toContain("INSTRUMENTO");
    const pie = (await zip.file("word/footer1.xml")!.async("string")).replace(/<[^>]+>/g, " ").replace(/\s+/g, "");
    expect(pie).toContain("FTO-EDU-FOR-82V2");
    expect(texto).toContain("solicitamos responda las preguntas de manera clara y con letra legible:");
    for (let n = 1; n <= 7; n++) expect(texto).toContain(` ${n}. ¿Qué sabe usted del tema ${n} &amp;`.replace("&amp;", "&"));
    expect(texto).toContain("Área o Asignatura: Tecnología e Informática");
    expect(texto).not.toContain("Tipo de prueba");
  });

  it("no tiene tabla de respuestas, opciones, valoración ni NOTA; sin imágenes de tablas del FOR-98", async () => {
    const { zip, xml, texto } = await abrir(await buildDiagnosticoDocx(paramsDiag, { preguntas }));
    expect(texto).not.toMatch(/Valoración|NOTA|selección múltiple|tabla de respuestas/);
    expect(xml).not.toContain("Tabla de respuestas");
    expect(zip.file("word/media/image1.png")).toBeNull();
    expect(zip.file("word/media/image2.png")).toBeNull();
    expect(zip.file("word/media/tabla_respuestas.png")).toBeNull();
    expect(zip.file("word/media/image3.png")).not.toBeNull(); // logo
    expect(await zip.file("word/_rels/document.xml.rels")!.async("string")).not.toMatch(/image[12]\.png/);
  });

  it("rellena los datos: CLEI completo, fecha, sede y docente", async () => {
    const { texto } = await abrir(await buildDiagnosticoDocx(paramsDiag, { preguntas }));
    expect(texto).toMatch(/CLEI\s+6-7\/III\/SEMANAL 1/);
    expect(texto).toMatch(/DÍA:\s+24/);
    expect(texto).toMatch(/SEDE:\s+CALI/);
    expect(texto).toContain("EDWARD QUIÑONES VALENZUELA");
  });
});
