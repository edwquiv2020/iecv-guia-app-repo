import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, ImageRun, AlignmentType, WidthType,
  VerticalAlign, ShadingType, ExternalHyperlink,
} from "docx";
import fs from "node:fs/promises";
import path from "node:path";
import type { ParametrosGuia, ContenidoGuia, ContenidoDua, ImagenSubtema } from "./types";
import { duracionPorClei, CRITERIO_PARTICIPACION_DUA } from "./types";

// ---------- Íconos de pasos (assets/iconos/) ----------
const cacheIconos = new Map<string, Buffer | null>();
async function cargarIcono(clave: string): Promise<Buffer | null> {
  if (clave === "ninguno") return null;
  if (cacheIconos.has(clave)) return cacheIconos.get(clave)!;
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "assets", "iconos", `${clave}.png`));
    cacheIconos.set(clave, buf);
    return buf;
  } catch {
    cacheIconos.set(clave, null); // ícono no disponible todavía — el paso queda sin ícono, no falla la generación
    return null;
  }
}

/** Ancho/alto reales de un PNG, leídos del chunk IHDR (bytes 16-23) — la ruta visual tiene ancho variable según el texto, así que hace falta esto para insertarla sin deformarla. */
function dimensionesPng(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Un paso numerado, con su ícono real inline al frente si está disponible. */
async function pasoParagraph(n: number, texto: string, iconoBuf: Buffer | null) {
  const runs: (TextRun | ImageRun)[] = [];
  if (iconoBuf) {
    runs.push(new ImageRun({ data: iconoBuf, type: "png", transformation: { width: 16, height: 16 } }));
    runs.push(new TextRun({ text: " ", font: FONT, size: 24 }));
  }
  runs.push(new TextRun({ text: `${n}. ${texto}`, font: FONT, size: 24 }));
  return new Paragraph({ spacing: { after: 100 }, indent: { left: 400, hanging: iconoBuf ? 0 : 300 }, children: runs });
}

// Puerto a TypeScript de scripts/build_guia.js (skill iecv-guia-formacion),
// parametrizado: en vez de un CONFIG hardcodeado editado a mano por guía,
// recibe los datos del formulario + el contenido generado por IA.
// La estructura de tablas (encabezado, datos del estudiante, cargue) se deja
// IDÉNTICA a la validada en la skill original — no se toca su diseño.

const FONT = "Arial";

function p(text: string, opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; size?: number; bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 160, before: opts.before ?? 0 },
    children: [new TextRun({ text, font: FONT, size: (opts.size || 12) * 2, bold: !!opts.bold, italics: !!opts.italics })],
  });
}

function pRuns(runs: Array<{ text: string; bold?: boolean; italics?: boolean }>, opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; indent?: { left: number; hanging?: number }; size?: number } = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 160, before: opts.before ?? 0 },
    indent: opts.indent,
    children: runs.map((r) => new TextRun({ text: r.text, font: FONT, size: (opts.size || 12) * 2, bold: !!r.bold, italics: !!r.italics })),
  });
}

function heading(text: string, opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; size?: number; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before ?? 300, after: opts.after ?? 160 },
    children: [new TextRun({ text, font: FONT, size: (opts.size || 13) * 2, bold: true, italics: !!opts.italics })],
  });
}

function numItem(n: number, text: string) {
  return new Paragraph({
    spacing: { after: 140 },
    indent: { left: 400, hanging: 300 },
    children: [
      new TextRun({ text: `${n}. `, font: FONT, size: 24 }),
      new TextRun({ text, font: FONT, size: 24 }),
    ],
  });
}

function videoApoyoParagraph(v: ParametrosGuia["videoApoyo"]) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160 },
    children: [
      new TextRun({ text: "Video de apoyo (", font: FONT, size: 24, bold: true }),
      new TextRun({ text: `máx. 5 min — ${v.duracion}): `, font: FONT, size: 24, bold: true }),
      new TextRun({ text: `"${v.titulo}" — ${v.canal}. `, font: FONT, size: 24 }),
      new ExternalHyperlink({
        link: v.url,
        children: [new TextRun({ text: v.url, font: FONT, size: 24, style: "Hyperlink" })],
      }),
    ],
  });
}

// ---------- Recuadros sombreados (Objetivo, Parte de lo que ya sabes, Mapa, Lista de verificación, Antes de cerrar) ----------
const SHADE_AMARILLO = "FFF2CC";
const SHADE_AZUL = "DDEBF7";
const SHADE_VERDE = "E2EFDA";

function box(titulo: string, cuerpo: string[], shade: string) {
  return new Table({
    width: { size: 10500, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 10500, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: shade },
            margins: { top: 120, bottom: 120, left: 150, right: 150 },
            children: [
              new Paragraph({ spacing: { after: cuerpo.length ? 80 : 0 }, children: [new TextRun({ text: titulo, font: FONT, size: 22, bold: true })] }),
              ...cuerpo.map((linea) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: [new TextRun({ text: linea, font: FONT, size: 22 })] })),
            ],
          }),
        ],
      }),
    ],
  });
}

/** "MAPA DE LO QUE VAS A APRENDER HOY" — secuencia de los subtemas en orden, unidos con flechas. */
function mapaAprendizaje(titulosSubtemas: string[]) {
  const texto = titulosSubtemas.map((t, i) => `${i + 1}. ${t}`).join("   →   ");
  return box("MAPA DE LO QUE VAS A APRENDER HOY", [texto], SHADE_VERDE);
}

/** "FICHA RESUMEN" — tabla de 2 a 4 columnas, una por concepto clave. */
function fichaResumen(items: ContenidoGuia["fichaResumen"]) {
  const w = Math.floor(10500 / Math.max(items.length, 1));
  return new Table({
    width: { size: 10500, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: items.map((it) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: SHADE_VERDE },
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: it.concepto, font: FONT, size: 20, bold: true })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: it.resumen, font: FONT, size: 18 })] }),
          ],
        })),
      }),
    ],
  });
}

/** Imágenes subidas por el docente para un subtema puntual, con crédito de Microsoft cuando aplica. */
function imagenesDeSubtema(imagenes: ImagenSubtema[]) {
  const out: Paragraph[] = [];
  for (const img of imagenes) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: img.esCapturaOffice ? 40 : 160 },
      children: [new ImageRun({ data: img.buffer, type: img.tipo, transformation: { width: 420, height: 262 } })],
    }));
    if (img.esCapturaOffice) {
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: "Captura de pantalla de Microsoft Office. Used with permission from Microsoft.", font: FONT, size: 16, italics: true })],
      }));
    }
  }
  return out;
}

// ---------- Tabla de encabezado (repite en cada página) ----------
function buildHeader(params: ParametrosGuia, logoBuf: Buffer) {
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
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "INSTITUTO DE EDUCACIÓN COMFENALCO VALLE", font: FONT, size: 20, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "EDUCACIÓN BÁSICA y MEDIA POR CICLOS (CLEI)", font: FONT, size: 20, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: `SEMANA No ${params.semana} / ${params.fechaClase} /   GUÍA DE FORMACIÓN No ${params.guia}`, font: FONT, size: 20, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: `ASIGNATURA ${params.asignatura.toUpperCase()}`, font: FONT, size: 20, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: `NOMBRE DE LA GUÍA ${params.tema}`, font: FONT, size: 20, bold: true })] }),
            ],
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBuf, type: "jpg", transformation: { width: 130, height: 54 } })] })],
          }),
        ],
      }),
    ],
  });
  return new Header({ children: [headerTable] });
}

function buildFooter() {
  return new Footer({
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "FTO-EDU-FOR-96 V3", font: FONT, size: 18 })] })],
  });
}

// ---------- Tabla de datos del estudiante (estructura fija) ----------
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

function buildStudentTable(params: ParametrosGuia) {
  const W1 = 3500, W2 = 3500, W3 = 3500;
  return new Table({
    width: { size: 10500, type: WidthType.DXA },
    columnWidths: [W1, W2, W3],
    rows: [
      new TableRow({ children: [labelCell("PRIMER APELLIDO: ", W1), labelCell("SEGUNDO APELLIDO: ", W2), labelCell("NOMBRE: ", W3)] }),
      new TableRow({
        children: [
          labelCell("GRUPO/ CLEI/ JORNADA", W1, 1, [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: params.grupoCleiJornada, font: FONT, size: 20 })] })]),
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
      new TableRow({ children: [labelCell("SEDE:", W1), valueCell("CALI", W2 + W3, 2)] }),
      new TableRow({ children: [labelCell("NOMBRE DEL DOCENTE:", W1), valueCell("EDWARD QUIÑONES VALENZUELA", W2 + W3, 2)] }),
    ],
  });
}

// ---------- Tabla de rúbrica ----------
function rcell(text: string, opts: { w?: number; bold?: boolean; center?: boolean; shade?: string } = {}) {
  return new TableCell({
    width: { size: opts.w || 2000, type: WidthType.DXA },
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text, font: FONT, size: 18, bold: !!opts.bold })] })],
  });
}
function buildRubricTable(rows: string[][]) {
  return new Table({
    width: { size: 10500, type: WidthType.DXA },
    columnWidths: [1900, 2150, 2150, 2150, 2150],
    rows: rows.map((row, i) => new TableRow({
      children: row.map((text, j) => rcell(text, { w: j === 0 ? 1900 : 2150, bold: i === 0 || j === 0, center: i === 0, shade: i === 0 ? "D9E1F2" : undefined })),
    })),
  });
}
const RUBRIC_HEADER_ROW = ["Criterios a evaluar", "Superior (5.0 - 4.6)", "Alto (4.5 - 4.0)", "Básico (3.9 - 3.0)", "Bajo (2.9 - 1.0)"];

// Criterios genéricos institucionales (no dependen del tema puntual).
const CRITERIO_PARTICIPACION = ["Participación", "Participa activamente en toda la sesión, aporta y respeta los aportes de sus compañeros.", "Participa la mayor parte de la sesión, con aportes pertinentes.", "Participa de forma intermitente o con aportes poco pertinentes.", "No participa o su participación es disruptiva."];
const CRITERIO_HERRAMIENTAS = ["Reconocimiento de herramientas de la cinta", "Identifica y utiliza correctamente todas las herramientas de la cinta de opciones trabajadas.", "Identifica y utiliza la mayoría de las herramientas trabajadas.", "Identifica algunas herramientas, con apoyo del docente.", "No identifica ni utiliza las herramientas trabajadas."];
const CRITERIO_ENTREGA = ["Trabajo práctico (entrega)", "Entrega el trabajo completo, en el formato y fecha indicados, sin errores.", "Entrega el trabajo completo, en el formato y fecha indicados, con errores menores.", "Entrega el trabajo incompleto o fuera del formato/fecha indicados.", "No entrega el trabajo."];

// ---------- Tabla de cargue (estructura fija) ----------
function cLabel(text: string) {
  return new TableCell({ width: { size: 4200, type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20 })] })] });
}
function cValue(text: string) {
  return new TableCell({ width: { size: 6300, type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20, bold: true })] })] });
}
function buildCargueTable(params: ParametrosGuia, maxPaginas: string) {
  return new Table({
    width: { size: 10500, type: WidthType.DXA },
    columnWidths: [4200, 6300],
    rows: [
      new TableRow({ children: [cLabel("FECHA DE CARGUE DE LA GUÍA\n(día, mes, año)"), cValue(params.fechaCargue)] }),
      new TableRow({ children: [cLabel("HORA MÁXIMA DE ENTREGA"), cValue(params.horaMaxima)] }),
      new TableRow({ children: [cLabel("CANTIDAD DE PÁGINAS A RECIBIR"), cValue(maxPaginas)] }),
      new TableRow({ children: [cLabel("FORMATO (FOTO O PDF)"), cValue("PDF, DOCX")] }),
      new TableRow({ children: [cLabel("NOMBRE DEL ADJUNTO"), cValue("Nombre estudiante + guía")] }),
      new TableRow({ children: [cLabel("CARGUE DE LA TAREA"), cValue("moodlecomfenalco.datasae.com")] }),
    ],
  });
}

/** Ruta visual (tira pestaña > grupo > íconos) ya generada para un subtema — ver src/lib/rutaVisual.ts. */
export interface RutaVisualSubtema {
  subtemaIndex: number;
  buffer: Buffer;
}

export interface BuildGuiaAssets {
  logoBuf: Buffer;
  ilustracionBuf: Buffer;
  imagenesSubtemas?: ImagenSubtema[];
  rutasVisuales?: RutaVisualSubtema[];
}

/** Arma el .docx completo y devuelve el Buffer listo para descargar. */
export async function buildGuiaDocx(params: ParametrosGuia, contenido: ContenidoGuia, assets: BuildGuiaAssets): Promise<Buffer> {
  const { duracion, maxPaginas } = duracionPorClei(params.clei);

  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
  children.push(buildStudentTable(params));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "ESTRUCTURA DE LA GUÍA DE FORMACIÓN", font: FONT, size: 24, bold: true })] }));

  // INICIO
  children.push(heading("INICIO", { size: 16, before: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new ImageRun({ data: assets.ilustracionBuf, type: "png", transformation: { width: 260, height: 217 } })] }));

  children.push(heading("1. Saludo y Motivación:", { size: 13 }));
  children.push(p(contenido.saludoMotivacion));

  children.push(heading("2. Introducción:", { size: 13 }));
  children.push(p(contenido.introduccion));
  children.push(videoApoyoParagraph(params.videoApoyo));

  children.push(heading("3. Competencias y Desempeños:", { size: 13 }));
  children.push(pRuns([{ text: "Competencia: ", bold: true }, { text: contenido.competencia }], { indent: { left: 400 }, after: 100 }));
  children.push(pRuns([{ text: "Desempeño: ", bold: true }, { text: contenido.desempeno }], { indent: { left: 400 } }));

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box(
    "OBJETIVO DE LA GUÍA (lo que vas a lograr hoy)",
    [`Al terminar, vas a poder: ${contenido.objetivoGuia.map((o, i) => `(${i + 1}) ${o}`).join(", ")}.`],
    SHADE_AMARILLO,
  ));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  children.push(heading("4. Duración de horas de la guía:", { size: 13 }));
  children.push(p(duracion));

  // DESARROLLO
  children.push(heading("DESARROLLO", { size: 16, before: 500 }));

  children.push(heading("1. Actividades de Reflexión Inicial.", { size: 13 }));
  children.push(p(contenido.reflexionInicial));

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box("PARTE DE LO QUE YA SABES", [contenido.parteDeLoQueYaSabes], SHADE_AZUL));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  children.push(heading("2. Explicación y presentación de temáticas, ejemplarización de contenidos, ejercicios, definiciones, leyes, premisas y recursos didácticos:", { size: 13 }));

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(mapaAprendizaje(contenido.subtemas.map((s) => s.titulo)));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  const letras = "ABCDEFGH";
  const imagenesPorSubtema = assets.imagenesSubtemas ?? [];
  const rutasVisualesPorSubtema = assets.rutasVisuales ?? [];
  for (let i = 0; i < contenido.subtemas.length; i++) {
    const st = contenido.subtemas[i];
    children.push(heading(`${letras[i] || i + 1}. ${st.titulo}`, { size: 12, before: 200, italics: true }));
    children.push(pRuns([{ text: "Función: ", bold: true }, { text: st.funcion }], { indent: { left: 400 } }));
    const rutaVisualBuf = rutasVisualesPorSubtema.find((rv) => rv.subtemaIndex === i)?.buffer;
    if (rutaVisualBuf) {
      // Alto fijo (~el mismo porte visual que la ilustración de INICIO),
      // ancho proporcional real — el PNG generado varía de ancho según el
      // texto de pestaña/grupo/opciones, así que estirarlo a un tamaño fijo
      // lo deformaría.
      const { width, height } = dimensionesPng(rutaVisualBuf);
      const alto = 70;
      const ancho = Math.round(alto * (width / height));
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 160 },
        children: [new ImageRun({ data: rutaVisualBuf, type: "png", transformation: { width: ancho, height: alto } })],
      }));
    }
    if (st.pasos?.length) {
      for (let j = 0; j < st.pasos.length; j++) {
        const paso = st.pasos[j];
        const iconoBuf = await cargarIcono(paso.icono);
        children.push(await pasoParagraph(j + 1, paso.texto, iconoBuf));
      }
    }
    const imgs = imagenesPorSubtema.filter((img) => img.subtemaIndex === i);
    if (imgs.length) children.push(...imagenesDeSubtema(imgs));
  }

  children.push(heading("3. Asignación de Actividades Formativas:", { size: 13, before: 300 }));
  contenido.talleres.forEach((taller, i) => {
    children.push(heading(`TALLER ${i + 1}: ${taller.tipo}`, { size: 12, italics: true }));
    children.push(p(taller.instrucciones));
    taller.items.forEach((item, j) => children.push(numItem(j + 1, item)));
  });

  children.push(new Paragraph({ text: "", spacing: { before: 200, after: 100 } }));
  children.push(box("LISTA DE VERIFICACIÓN ANTES DE ENTREGAR", contenido.listaVerificacion.map((it) => `☐ ${it}`), SHADE_AMARILLO));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box("ANTES DE CERRAR: ¿EN QUÉ TE SIRVE ESTO?", [contenido.antesDeCerrarPregunta], SHADE_AZUL));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(fichaResumen(contenido.fichaResumen));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  children.push(heading("4. Seguimiento, retroalimentación, evaluación y verificación del cumplimiento de objetivos, competencias y desempeños (RÚBRICA)", { size: 13, before: 300 }));
  children.push(heading("RÚBRICA CRITERIOS GENERALES (FTO-EDU-FOR-96 V3)", { size: 12, italics: true, before: 100 }));
  const rubricRows: string[][] = [
    RUBRIC_HEADER_ROW,
    CRITERIO_PARTICIPACION,
    ...contenido.rubricaCriteriosEspecificos.map((c) => [c.criterio, c.superior, c.alto, c.basico, c.bajo]),
    CRITERIO_HERRAMIENTAS,
    CRITERIO_ENTREGA,
  ];
  children.push(buildRubricTable(rubricRows));

  children.push(pRuns([{ text: "5. INDICACIONES ", bold: true }, { text: "PARA EL CARGUE DE LAS ACTIVIDADES:" }], { after: 160, before: 400 }));
  children.push(buildCargueTable(params, maxPaginas));

  children.push(heading("6. BIBLIOGRAFÍA Y WEBGRAFÍA:", { size: 13, before: 400 }));
  contenido.bibliografia.forEach((ref) => {
    children.push(pRuns([{ text: `${ref.autor}. ` }, { text: `(${ref.anio}). ${ref.titulo}.`, italics: true }], { indent: { left: 400 } }));
  });
  children.push(pRuns([{ text: "Formato estandarizado institucional de diseño instruccional integrado: " }, { text: "FTO-EDU-FOR-96 V3.", italics: true }], { indent: { left: 400 } }));

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 900, left: 1100, right: 1100 } } },
        headers: { default: buildHeader(params, assets.logoBuf) },
        footers: { default: buildFooter() },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ---------- Guía DUA ----------

const SHADE_AZUL_EJEMPLO = "DDEBF7";
const SHADE_AMARILLO_ULTIMA = "FFF2CC";

/** Una repetición del taller de "ciclo completo", con sombreado si es el ejemplo resuelto o la última (sin ayuda). */
function repeticionParagraph(n: number, instruccion: string, opts: { esEjemplo?: boolean; esUltima?: boolean }) {
  const shade = opts.esEjemplo ? SHADE_AZUL_EJEMPLO : opts.esUltima ? SHADE_AMARILLO_ULTIMA : undefined;
  const sufijo = opts.esEjemplo ? " (ya resuelto)" : "";
  const texto = opts.esEjemplo ? `${n} · EJEMPLO.  ${instruccion}${sufijo}` : `${n}.  ${instruccion}`;
  return new Table({
    width: { size: 10500, type: WidthType.DXA },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 10500, type: WidthType.DXA },
      shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      children: [new Paragraph({ children: [new TextRun({ text: texto, font: FONT, size: 24 })] })],
    })] })],
  });
}

export interface BuildGuiaDuaAssets {
  logoBuf: Buffer;
  ilustracionBuf: Buffer;
  /** Imágenes ya subidas para el subtema A de la Estándar — se reutilizan tal cual, no se piden de nuevo. */
  imagenesSubtemaA?: ImagenSubtema[];
}

/** Arma el .docx de la versión DUA (accesible/adaptada) y devuelve el Buffer listo para descargar. */
export async function buildGuiaDuaDocx(params: ParametrosGuia, contenido: ContenidoDua, assets: BuildGuiaDuaAssets): Promise<Buffer> {
  const { maxPaginas } = duracionPorClei(params.clei);

  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
  children.push(buildStudentTable(params));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "ESTRUCTURA DE LA GUÍA DE FORMACIÓN", font: FONT, size: 24, bold: true })] }));

  // INICIO
  children.push(heading("INICIO", { size: 16, before: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new ImageRun({ data: assets.ilustracionBuf, type: "png", transformation: { width: 260, height: 217 } })] }));

  children.push(heading("1. Saludo y Motivación:", { size: 13 }));
  children.push(p(contenido.saludoMotivacion));

  children.push(heading("2. Introducción:", { size: 13 }));
  children.push(p(contenido.introduccion));
  children.push(videoApoyoParagraph(params.videoApoyo));

  children.push(heading("3. Competencias y Desempeños:", { size: 13 }));
  children.push(pRuns([{ text: "Competencia: ", bold: true }, { text: contenido.competencia }], { indent: { left: 400 }, after: 100 }));
  children.push(pRuns([{ text: "Desempeño: ", bold: true }, { text: contenido.desempeno }], { indent: { left: 400 } }));

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box("OBJETIVO DE LA GUÍA (lo que vas a lograr hoy)", [contenido.objetivoGuia], SHADE_AMARILLO));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  children.push(heading("4. Duración de horas de la guía:", { size: 13 }));
  children.push(p(duracionPorClei(params.clei).duracion));

  // DESARROLLO
  children.push(heading("DESARROLLO", { size: 16, before: 500 }));

  children.push(heading("1. Actividades de Reflexión Inicial.", { size: 13 }));
  children.push(p(contenido.reflexionInicial));

  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box("PARTE DE LO QUE YA SABES", [contenido.parteDeLoQueYaSabes], SHADE_AZUL));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));

  // Un único subtema (A) — sin mapa de aprendizaje, para no sumar carga cognitiva.
  children.push(heading("2. Explicación y presentación de temáticas, ejemplarización de contenidos, ejercicios, definiciones, leyes, premisas y recursos didácticos:", { size: 13 }));
  children.push(heading(`A. ${contenido.subtemaTitulo}`, { size: 12, before: 200, italics: true }));
  children.push(pRuns([{ text: "Función: ", bold: true }, { text: contenido.funcionExplicita }], { indent: { left: 400 } }));
  if (assets.imagenesSubtemaA?.length) children.push(...imagenesDeSubtema(assets.imagenesSubtemaA));

  children.push(heading("3. Asignación de Actividades Formativas:", { size: 13, before: 300 }));
  children.push(heading("TALLER 1: Ciclo completo — 4 repeticiones", { size: 13, italics: false }));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  contenido.repeticiones.forEach((rep, i) => {
    children.push(repeticionParagraph(i + 1, rep.instruccion, { esEjemplo: i === 0, esUltima: i === contenido.repeticiones.length - 1 }));
    children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  });
  children.push(pRuns([{ text: "Leyenda de color: ", bold: true }, { text: "azul = ejemplo ya resuelto   ·   amarillo = último ciclo, sin ayuda" }], { after: 200 }));

  children.push(heading("TALLER 2: Situación propia", { size: 12, italics: true }));
  children.push(p(`Elija UNA: Opción A — ${contenido.tallerSituacionPropia.opcionA}. Opción B — ${contenido.tallerSituacionPropia.opcionB}.`));

  children.push(new Paragraph({ text: "", spacing: { before: 200, after: 100 } }));
  children.push(box("LISTA DE VERIFICACIÓN ANTES DE ENTREGAR", contenido.listaVerificacion.map((it) => `☐ ${it}`), SHADE_AMARILLO));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box("ANTES DE CERRAR: ¿EN QUÉ TE SIRVE ESTO?", [contenido.antesDeCerrarPregunta], SHADE_AZUL));
  children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  children.push(box("FICHA RESUMEN", [contenido.fichaResumen], SHADE_VERDE));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  children.push(heading("4. Seguimiento, retroalimentación, evaluación y verificación del cumplimiento de objetivos, competencias y desempeños (RÚBRICA)", { size: 13, before: 300 }));
  children.push(heading("RÚBRICA CRITERIOS GENERALES (FTO-EDU-FOR-96 V3)", { size: 12, italics: true, before: 100 }));
  const rubricRows: string[][] = [
    RUBRIC_HEADER_ROW,
    CRITERIO_PARTICIPACION_DUA,
    ...contenido.rubricaCriteriosEspecificos.map((c) => [c.criterio, c.superior, c.alto, c.basico, c.bajo]),
  ];
  children.push(buildRubricTable(rubricRows));

  children.push(pRuns([{ text: "5. INDICACIONES ", bold: true }, { text: "PARA EL CARGUE DE LAS ACTIVIDADES:" }], { after: 160, before: 400 }));
  children.push(buildCargueTable(params, maxPaginas));

  children.push(heading("6. BIBLIOGRAFÍA Y WEBGRAFÍA:", { size: 13, before: 400 }));
  contenido.bibliografia.forEach((ref) => {
    children.push(pRuns([{ text: `${ref.autor}. ` }, { text: `(${ref.anio}). ${ref.titulo}.`, italics: true }], { indent: { left: 400 } }));
  });
  children.push(pRuns([{ text: "Formato estandarizado institucional de diseño instruccional integrado: " }, { text: "FTO-EDU-FOR-96 V3.", italics: true }], { indent: { left: 400 } }));

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 900, left: 1100, right: 1100 } } },
        headers: { default: buildHeader(params, assets.logoBuf) },
        footers: { default: buildFooter() },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
