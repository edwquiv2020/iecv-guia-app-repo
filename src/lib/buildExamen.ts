import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, ImageRun, AlignmentType, WidthType, VerticalAlign, ShadingType,
} from "docx";
import type { ParametrosExamen, ContenidoExamen } from "./types";

// Puerto a Word de los dos formatos reales del colegio:
// - FTO-EDU-FOR-82 "Diagnóstico de Presaberes Colegio" (solo Diagnóstico).
// - FTO-EDU-FOR-98 "Instrumento de Evaluación Colegio" (Intermedio y Final,
//   la plantilla en blanco literalmente dice "Tipo de prueba: (Intermedio/Final)").
// Ambos comparten estructura: tabla de datos del estudiante, intro con
// cantidad de preguntas y valoración, preguntas numeradas con imagen de
// apoyo opcional, y al final una tabla de respuestas tipo óvalos (A-D) para
// calificar en papel. La clave de respuestas NO va en este documento (lo ve
// el estudiante) — va aparte, en el kit de subida (ver buildKit.ts).

const FONT = "Arial";
const LETRAS = ["A", "B", "C", "D"] as const;

/** Imagen de apoyo ya resuelta para UNA pregunta puntual (índice 1-indexado). */
export interface ImagenPreguntaExamen {
  index: number;
  buffer: Buffer;
  tipo: "png" | "jpg";
}

function p(text: string, opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; size?: number; bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 160, before: opts.before ?? 0 },
    children: [new TextRun({ text, font: FONT, size: (opts.size || 12) * 2, bold: !!opts.bold, italics: !!opts.italics })],
  });
}

// ---------- Encabezado y pie (repiten en cada página) ----------
function buildHeader(tituloForm: string) {
  const headerTable = new Table({
    width: { size: 10500, type: WidthType.DXA },
    columnWidths: [8000, 2500],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 8000, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: tituloForm, font: FONT, size: 22, bold: true })] })],
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: "INSTITUTO DE EDUCACIÓN COMFENALCO VALLE", font: FONT, size: 15, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PROGRAMA DE BÁSICA Y MEDIA POR CICLOS (CLEI) PARA JÓVENES Y ADULTOS", font: FONT, size: 15 })] }),
            ],
          }),
        ],
      }),
    ],
  });
  return new Header({ children: [headerTable] });
}

function buildFooter(formCode: string) {
  return new Footer({
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formCode, font: FONT, size: 18 })] })],
  });
}

// ---------- Tabla de datos del estudiante ----------
function labelCell(text: string, w: number, span = 1, extra?: Paragraph[]) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    columnSpan: span,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: extra
      ? [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20, bold: true })] }), ...extra]
      : [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20, bold: true })] })],
  });
}
function valueCell(text: string, w: number, span = 1) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    columnSpan: span,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20 })] })],
  });
}

function buildStudentTable(params: ParametrosExamen, conNota: boolean) {
  const W1 = 3500, W2 = 3500, W3 = 3500;
  const filas = [
    new TableRow({ children: [labelCell("PRIMER APELLIDO: ", W1), labelCell("SEGUNDO APELLIDO: ", W2), labelCell("NOMBRE: ", W3)] }),
    new TableRow({
      children: [
        labelCell("CLEI", W1, 1, [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: params.grupoCleiJornada, font: FONT, size: 20 })] })]),
        new TableCell({
          width: { size: W2, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TIPO DE DOCUMENTO", font: FONT, size: 20, bold: true })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TI [   ]        CC [   ]", font: FONT, size: 20 })] }),
          ],
        }),
        new TableCell({
          width: { size: W3, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({ children: [new TextRun({ text: "NÚMERO DOCUMENTO", font: FONT, size: 20, bold: true })] }),
            new Paragraph({ children: [new TextRun({ text: "_____________________", font: FONT, size: 20 })] }),
          ],
        }),
      ],
    }),
    new TableRow({ children: [labelCell("FECHA APLICACIÓN:", W1), valueCell(params.fechaAplicacion, W2 + W3, 2)] }),
    new TableRow({ children: [labelCell("SEDE:", W1), valueCell(params.sede, W2 + W3, 2)] }),
    new TableRow({ children: [labelCell("NOMBRE DEL DOCENTE/EVALUADOR:", W1), valueCell(params.docente, W2 + W3, 2)] }),
  ];
  if (conNota) {
    filas.push(new TableRow({ children: [labelCell("NOTA:", W1), valueCell("", W2 + W3, 2)] }));
  }
  return new Table({ width: { size: 10500, type: WidthType.DXA }, columnWidths: [W1, W2, W3], rows: filas });
}

// ---------- Preguntas ----------
function preguntaParagraphs(n: number, enunciado: string, opciones: readonly string[], imagen?: ImagenPreguntaExamen): (Paragraph)[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 100, before: 200 },
    indent: { left: 300, hanging: 300 },
    children: [
      new TextRun({ text: `${n}. `, font: FONT, size: 24, bold: true }),
      new TextRun({ text: enunciado, font: FONT, size: 24 }),
    ],
  }));
  if (imagen) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new ImageRun({ data: imagen.buffer, type: imagen.tipo, transformation: { width: 380, height: 238 } })],
    }));
  }
  opciones.forEach((op, i) => {
    out.push(new Paragraph({
      spacing: { after: 40 },
      indent: { left: 500 },
      children: [new TextRun({ text: `${LETRAS[i]}. ${op}`, font: FONT, size: 24 })],
    }));
  });
  return out;
}

// ---------- Tabla de respuestas (hoja de óvalos) ----------
function tablaRespuestas(cantidadPreguntas: number) {
  const w = Math.floor(10500 / (cantidadPreguntas + 1));
  const filaNumeros = new TableRow({
    children: [
      new TableCell({ width: { size: w, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "D9E1F2" }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "N°", font: FONT, size: 18, bold: true })] })] }),
      ...Array.from({ length: cantidadPreguntas }, (_, i) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "D9E1F2" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), font: FONT, size: 18, bold: true })] })],
      })),
    ],
  });
  const CIRCULO: Record<(typeof LETRAS)[number], string> = { A: "Ⓐ", B: "Ⓑ", C: "Ⓒ", D: "Ⓓ" };
  const filasLetras = LETRAS.map((letra) => new TableRow({
    children: [
      new TableCell({ width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: letra, font: FONT, size: 18, bold: true })] })] }),
      ...Array.from({ length: cantidadPreguntas }, () => new TableCell({
        width: { size: w, type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: CIRCULO[letra], font: FONT, size: 22 })] })],
      })),
    ],
  }));
  return new Table({ width: { size: 10500, type: WidthType.DXA }, rows: [filaNumeros, ...filasLetras] });
}

interface BuildExamenOpts {
  tituloForm: string;
  formCode: string;
  tipoPruebaLinea?: string; // solo Intermedio/Final
  introTexto: string;
  conNota: boolean;
}

async function buildExamenBase(params: ParametrosExamen, contenido: ContenidoExamen, imagenes: ImagenPreguntaExamen[], opts: BuildExamenOpts): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
  const infoLinea = opts.tipoPruebaLinea
    ? `Área o Asignatura: ${params.asignatura}                                          ${opts.tipoPruebaLinea}`
    : `Área o Asignatura: ${params.asignatura}`;
  children.push(p(infoLinea, { after: 160, align: AlignmentType.LEFT }));
  children.push(buildStudentTable(params, opts.conNota));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  children.push(p(opts.introTexto, { after: 300 }));

  const imagenPorIndice = new Map(imagenes.map((img) => [img.index, img]));
  contenido.preguntas.forEach((pregunta, i) => {
    children.push(...preguntaParagraphs(i + 1, pregunta.enunciado, pregunta.opciones, imagenPorIndice.get(i + 1)));
  });

  children.push(new Paragraph({ text: "", spacing: { before: 300, after: 120 } }));
  children.push(p("TABLA DE RESPUESTAS", { bold: true, align: AlignmentType.CENTER, after: 100 }));
  children.push(tablaRespuestas(params.cantidadPreguntas));

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 900, left: 1100, right: 1100 } } },
        headers: { default: buildHeader(opts.tituloForm) },
        footers: { default: buildFooter(opts.formCode) },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** Diagnóstico de Presaberes (FTO-EDU-FOR-82) — sin curso específico, se agrega NOTA porque el docente sí lo califica. */
export async function buildDiagnosticoDocx(params: ParametrosExamen, contenido: ContenidoExamen, imagenes: ImagenPreguntaExamen[] = []): Promise<Buffer> {
  return buildExamenBase(params, contenido, imagenes, {
    tituloForm: "DIAGNÓSTICO DE PRESABERES COLEGIO",
    formCode: "FTO-EDU-FOR-82 V2",
    introTexto: `Con el objeto de identificar los saberes previos que usted posee sobre la Asignatura y/o CLEI que desarrollaremos durante este período académico, responda las siguientes ${params.cantidadPreguntas} preguntas de selección múltiple con única respuesta, señalando en la tabla de respuestas la opción correcta.`,
    conNota: true,
  });
}

/** Instrumento de Evaluación (FTO-EDU-FOR-98) — Intermedio o Final, un curso específico. */
export async function buildExamenDocx(params: ParametrosExamen, contenido: ContenidoExamen, imagenes: ImagenPreguntaExamen[] = []): Promise<Buffer> {
  if (params.tipo === "diagnostico") throw new Error("Usa buildDiagnosticoDocx() para el tipo 'diagnostico'.");
  const etiqueta = params.tipo === "intermedio" ? "Intermedio" : "Final";
  return buildExamenBase(params, contenido, imagenes, {
    tituloForm: "INSTRUMENTO DE EVALUACIÓN COLEGIO",
    formCode: "FTO-EDU-FOR-98 V1",
    tipoPruebaLinea: `Tipo de prueba: (${etiqueta})`,
    introTexto: `Con el objeto de identificar los conocimientos, competencias y/o habilidades adquiridas que posee sobre la Asignatura y/o CLEI, le invitamos a responder el siguiente examen que consta de ${params.cantidadPreguntas} preguntas de selección múltiple con única respuesta. Para desarrollarlo, debe leer los enunciados y de las cuatro opciones de respuesta, seleccionar una y señalar en la tabla de respuestas la correcta. Valoración de cada pregunta: ${params.valoracionPregunta}.`,
    conNota: true,
  });
}
