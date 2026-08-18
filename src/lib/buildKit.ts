import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, VerticalAlign, ShadingType, ExternalHyperlink,
} from "docx";
import type { ParametrosGuia } from "./types";

// Kit de subida manual: desde agosto 2026 la skill decidió no automatizar
// la subida a Kahoot/Moodle (era la parte más cara del flujo) — en su lugar
// se entrega este resumen para que el docente suba los recursos él mismo,
// 2-3 minutos por guía. Ver SKILL.md, sección "Decisión de agosto 2026".

const FONT = "Arial";

function p(text: string, opts: { bold?: boolean; size?: number; after?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120 },
    children: [new TextRun({ text, font: FONT, size: (opts.size ?? 12) * 2, bold: !!opts.bold })],
  });
}

function labelCell(text: string) {
  return new TableCell({
    width: { size: 3200, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 22, bold: true })] })],
  });
}

function valueCell(children: Paragraph[]) {
  return new TableCell({
    width: { size: 7300, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children,
  });
}

function textoValor(text: string) {
  return [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 22 })] })];
}

function linkValor(url: string) {
  return [new Paragraph({ children: [new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, font: FONT, size: 22, style: "Hyperlink" })] })] })];
}

export async function buildKitSubidaDocx(
  params: ParametrosGuia,
  opts: { nombreArchivoGuia: string; nombreArchivoKahoot: string }
): Promise<Buffer> {
  const nombreSeccion = `SEMANA ${params.semana} ${params.tema} ${params.fechaClase}`;

  const children: (Paragraph | Table)[] = [
    p("KIT DE SUBIDA MANUAL A MOODLE Y KAHOOT", { bold: true, size: 16, after: 60 }),
    p(`${params.tema} — Semana ${params.semana} / Guía ${params.guia} — CLEI ${params.clei} — ${params.grupoCleiJornada}`, { after: 200 }),
    p(
      "La subida automática a Moodle/Kahoot está pausada por costo (decisión de agosto 2026) — sube estos recursos tú mismo con la información de abajo, toma 2-3 minutos por guía.",
      { after: 300 }
    ),
    p("Nombre de sección sugerido en Moodle:", { bold: true, after: 60 }),
    p(nombreSeccion, { after: 300 }),
    new Table({
      width: { size: 10500, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [labelCell("Recurso GUÍA (Archivo)"), valueCell(textoValor(opts.nombreArchivoGuia))] }),
        new TableRow({ children: [labelCell("Recurso VIDEO (Video Time)"), valueCell(linkValor(params.videoApoyo.url))] }),
        new TableRow({
          children: [
            labelCell("Recurso ACTIVIDAD (Tarea)"),
            valueCell(textoValor(`Permitir entregas desde: ${params.fechaClase}  ·  Fecha de entrega: ${params.fechaCargue}, ${params.horaMaxima}`)),
          ],
        }),
        new TableRow({ children: [labelCell("Recurso kahoot.it (URL)"), valueCell(linkValor("https://www.kahoot.it"))] }),
        new TableRow({ children: [labelCell("Archivo Kahoot a importar"), valueCell(textoValor(opts.nombreArchivoKahoot))] }),
      ],
    }),
    p("", { after: 200 }),
    p(
      "Pasos para el Kahoot: create.kahoot.it → Crear → Kahoot → Lienzos en blanco → Añadir → Importar → Importar hoja de cálculo → sube el archivo de arriba → Añadir preguntas (borra la pregunta 1 en blanco) → título → Visibilidad Privado → Guardar.",
      { after: 0 }
    ),
  ];

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 900, left: 1100, right: 1100 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
