import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, VerticalAlign, ShadingType, ExternalHyperlink,
} from "docx";
import type { ParametrosGuia, ParametrosExamen, ContenidoExamen } from "./types";

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

// Kit de subida para exámenes: el examen se aplica y califica en papel (hoja
// de respuestas tipo óvalos), así que no hay Kahoot — solo se sube el
// archivo a Moodle como evidencia/registro. La clave de respuestas va SOLO
// aquí (documento de uso del docente), nunca en el examen que ve el
// estudiante.

const LETRAS_KIT = ["A", "B", "C", "D"] as const;

export async function buildKitSubidaExamenDocx(
  params: ParametrosExamen,
  contenido: ContenidoExamen,
  opts: { nombreArchivoExamen: string }
): Promise<Buffer> {
  const etiquetaTipo = params.tipo === "diagnostico" ? "DIAGNÓSTICO DE PRESABERES" : params.tipo === "intermedio" ? "EXAMEN INTERMEDIO" : "EXAMEN FINAL";
  const nombreSeccion = params.cursoNombre
    ? `${etiquetaTipo} ${params.cursoNombre.toUpperCase()} — ${params.grupoCleiJornada}`
    : `${etiquetaTipo} — ${params.grupoCleiJornada}`;

  const children: (Paragraph | Table)[] = [
    p("KIT DE SUBIDA MANUAL A MOODLE", { bold: true, size: 16, after: 60 }),
    p(`${etiquetaTipo} — CLEI ${params.clei} — ${params.grupoCleiJornada} — ${params.fechaAplicacion}`, { after: 200 }),
    p(
      "Este examen se aplica y califica en papel (hoja de respuestas). Sube el archivo a Moodle solo como evidencia/registro — no hay Kahoot para exámenes.",
      { after: 300 }
    ),
    p("Nombre de sección sugerido en Moodle:", { bold: true, after: 60 }),
    p(nombreSeccion, { after: 300 }),
    new Table({
      width: { size: 10500, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [labelCell("Recurso EXAMEN (Archivo)"), valueCell(textoValor(opts.nombreArchivoExamen))] }),
      ],
    }),
    p("", { after: 300 }),
    p("CLAVE DE RESPUESTAS (uso exclusivo del docente — no compartir con estudiantes)", { bold: true, after: 100 }),
    claveRespuestasTable(contenido),
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

function claveRespuestasTable(contenido: ContenidoExamen) {
  const filas = contenido.preguntas.map((preg, i) => new TableRow({
    children: [
      new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "F2F2F2" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), font: "Arial", size: 20, bold: true })] })] }),
      new TableCell({ width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: LETRAS_KIT[preg.correcta] ?? "?", font: "Arial", size: 20, bold: true })] })] }),
    ],
  }));
  return new Table({ width: { size: 3000, type: WidthType.DXA }, rows: [
    new TableRow({ children: [
      new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "D9E1F2" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Pregunta", font: "Arial", size: 20, bold: true })] })] }),
      new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "D9E1F2" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Correcta", font: "Arial", size: 20, bold: true })] })] }),
    ] }),
    ...filas,
  ] });
}
