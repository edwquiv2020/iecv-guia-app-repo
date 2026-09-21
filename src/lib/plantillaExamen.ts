import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { ParametrosExamen, ContenidoExamen, ContenidoDiagnostico } from "./types";
import type { ImagenPreguntaExamen } from "./buildExamen";

// Instrumento de Evaluación (FTO-EDU-FOR-98 V1) construido PARTIENDO DEL
// ARCHIVO ORIGINAL de la institución (assets/plantillas/FTO-EDU-FOR-98_V1.docx),
// no imitándolo: el encabezado con logo, la tabla de datos del estudiante
// (que en el original es una tabla flotante anclada a la página), los
// estilos, el pie y las dos tablas de respuestas se conservan byte a byte —
// solo se rellenan los campos en blanco y se reemplaza el bloque de
// preguntas. Las tablas de respuestas del original son imágenes ("Opción
// 1." = la de 10 preguntas, un recorte de imagen1.png; "Opción 2." = la de
// 5, imagen2.png). En cada examen queda exactamente UNA, la que corresponde.
// Se incrustan desde assets/plantillas/tabla_respuestas_{5,10}.png (la de 10
// es ese mismo recorte ya aplicado al PNG: Word respeta la propiedad de
// recorte del original, pero otros visores —Pages, Google Docs, vistas
// previas— la ignoran y mostrarían las dos tablas juntas).

const RUTA_PLANTILLA = path.join(process.cwd(), "assets", "plantillas", "FTO-EDU-FOR-98_V1.docx");

/** Posición (twips desde el margen izquierdo) donde la plantilla original ubica "Tipo de prueba:" en su línea de asignatura. */
const POS_TIPO_PRUEBA = 5880;

/** 380x238 px a 96 dpi — mismo tamaño que ya usaban las imágenes de apoyo por pregunta. */
const IMG_CX = 380 * 9525;
const IMG_CY = 238 * 9525;

/** Tamaño con que el original muestra cada tabla (EMU): la de 10 se ve así en la plantilla, la de 5 sin deformar. */
const TABLAS = {
  5: { archivo: "tabla_respuestas_5.png", cx: 2242820, cy: 1062990 },
  10: { archivo: "tabla_respuestas_10.png", cx: 4289425, cy: 1581785 },
} as const;

const LETRAS = ["A", "B", "C", "D"] as const;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Índice del `<w:p ...>` (o `<w:p>`) que abre el párrafo que contiene la posición `pos`. */
function inicioParrafo(xml: string, pos: number): number {
  return Math.max(xml.lastIndexOf("<w:p ", pos), xml.lastIndexOf("<w:p>", pos));
}

/** Reemplaza el párrafo completo que contiene `texto` (debe estar dentro de un solo `<w:t>` de la plantilla). */
function reemplazarParrafo(xml: string, texto: string, nuevo: (parrafoOriginal: string) => string): string {
  const i = xml.indexOf(texto);
  if (i === -1) throw new Error(`La plantilla FTO-EDU-FOR-98 no trae el texto esperado: "${texto}".`);
  const ini = inicioParrafo(xml, i);
  const fin = xml.indexOf("</w:p>", i) + "</w:p>".length;
  return xml.slice(0, ini) + nuevo(xml.slice(ini, fin)) + xml.slice(fin);
}

/** Agrega texto al final del párrafo `indice` de una celda (la etiqueta del original queda intacta, y el valor va después). */
function rellenarCelda(celda: string, texto: string, indiceParrafo = 0): string {
  let n = -1;
  return celda.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (parrafo) => {
    n++;
    if (n !== indiceParrafo) return parrafo;
    const run = `<w:r><w:rPr><w:rFonts w:cs="Calibri"/><w:b w:val="0"/><w:bCs w:val="0"/><w:lang w:eastAsia="ar-SA"/></w:rPr><w:t xml:space="preserve"> ${esc(texto)}</w:t></w:r>`;
    return parrafo.replace(/<\/w:p>$/, `${run}</w:p>`);
  });
}

function dibujoImagen(rId: string, id: number, cx: number, cy: number, nombre: string): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${nombre}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${nombre}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function dibujoImagenPregunta(rId: string, id: number): string {
  return dibujoImagen(rId, id, IMG_CX, IMG_CY, `Imagen de apoyo ${id}`);
}

const RPR_TEXTO = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`;
const RPR_NEGRITA = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`;

function bloquePreguntas(contenido: ContenidoExamen, imagenes: Map<number, string>): string {
  let idDibujo = 200;
  return contenido.preguntas
    .map((pregunta, i) => {
      const n = i + 1;
      const partes: string[] = [];
      partes.push(
        `<w:p><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="80" w:line="240" w:lineRule="auto"/><w:ind w:left="425" w:hanging="425"/><w:jc w:val="both"/></w:pPr>` +
          `<w:r>${RPR_NEGRITA}<w:t xml:space="preserve">${n}. </w:t></w:r>` +
          `<w:r>${RPR_TEXTO}<w:t xml:space="preserve">${esc(pregunta.enunciado)}</w:t></w:r></w:p>`
      );
      const rId = imagenes.get(n);
      if (rId) {
        partes.push(
          `<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr>${dibujoImagenPregunta(rId, idDibujo++)}</w:r></w:p>`
        );
      }
      pregunta.opciones.forEach((opcion, j) => {
        const ultima = j === pregunta.opciones.length - 1;
        partes.push(
          `<w:p><w:pPr>${ultima ? "" : "<w:keepNext/>"}<w:keepLines/><w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/><w:ind w:left="851"/></w:pPr>` +
            `<w:r>${RPR_TEXTO}<w:t xml:space="preserve">${LETRAS[j]}. ${esc(opcion)}</w:t></w:r></w:p>`
        );
      });
      return partes.join("");
    })
    .join("");
}


/** Llena la tabla de datos del estudiante (CLEI, fecha, sede, docente) — igual en FOR-98 y FOR-82. */
function llenarTablaDatos(xml: string, params: ParametrosExamen): string {
  const [dia = "", mes = "", anio = ""] = params.fechaAplicacion.split("/");
  const valores: Record<string, { texto: string; parrafo?: number }> = {
    "1,0": { texto: params.grupoCleiJornada, parrafo: 1 }, // CLEI: texto completo, ej. "6-7/III/SEMANAL 1"
    "2,1": { texto: dia }, // DÍA
    "2,2": { texto: mes }, // MES
    "2,3": { texto: anio }, // AÑO
    "3,1": { texto: params.sede }, // SEDE
    "4,1": { texto: params.docente }, // NOMBRE DEL DOCENTE/EVALUADOR
    // NOTA queda en blanco: la pone el docente al calificar.
  };
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, (tabla) => {
    let fila = -1;
    return tabla.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (tr) => {
      fila++;
      let col = -1;
      return tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
        col++;
        const v = valores[`${fila},${col}`];
        return v ? rellenarCelda(tc, v.texto, v.parrafo ?? 0) : tc;
      });
    });
  });
}

/**
 * FOR-82 no trae la celda NOTA de FOR-98: se quitan sus dos últimas celdas de
 * la fila del docente y la celda del nombre absorbe ese ancho (5063+864+1976 twips, 6+1+1 columnas).
 */
function quitarCeldasNota(xml: string): string {
  return xml.replace(/<w:tr[ >](?:(?!<\/w:tr>)[\s\S])*?NOMBRE DEL DOCENTE(?:(?!<\/w:tr>)[\s\S])*?<\/w:tr>/, (fila) => {
    const celdas = fila.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
    if (celdas.length !== 4) throw new Error("La plantilla FTO-EDU-FOR-98 no trae la fila del docente esperada.");
    const ensanchada = celdas[1].replace('<w:tcW w:w="5063" w:type="dxa"/>', '<w:tcW w:w="7903" w:type="dxa"/>').replace('<w:gridSpan w:val="6"/>', '<w:gridSpan w:val="8"/>');
    return fila.replace(celdas[1], () => ensanchada).replace(celdas[2], () => "").replace(celdas[3], () => "");
  });
}

/** Quita del paquete las dos imágenes de tablas de respuestas del original (image1/image2) que ya no se referencian. */
function quitarTablasOriginales(zip: JSZip, rels: string): string {
  for (const img of ["image1.png", "image2.png"]) zip.remove(`word/media/${img}`);
  return rels.replace(/<Relationship [^>]*Target="media\/image[12]\.png"[^>]*\/>/g, "");
}

export async function buildExamenDesdePlantilla(
  params: ParametrosExamen,
  contenido: ContenidoExamen,
  imagenes: ImagenPreguntaExamen[] = []
): Promise<Buffer> {
  if (params.tipo === "diagnostico") throw new Error("La plantilla FTO-EDU-FOR-98 es solo para Intermedio/Final.");
  const cantidad = contenido.preguntas.length;
  if (cantidad !== 5 && cantidad !== 10) {
    throw new Error(`El instrumento FTO-EDU-FOR-98 solo existe con 5 o 10 preguntas (llegaron ${cantidad}).`);
  }
  // 5 preguntas -> 1.0 c/u, 10 preguntas -> 0.5 c/u (escala de 1 a 5).
  const valoracion = cantidad === 5 ? "1.0" : "0.5";
  const etiqueta = params.tipo === "intermedio" ? "Intermedio" : "Final";

  const zip = await JSZip.loadAsync(await fs.readFile(RUTA_PLANTILLA));
  let xml = await zip.file("word/document.xml")!.async("string");

  // ---- 1. Bloque de preguntas + tabla de respuestas (todo lo que va después del encabezado del formulario)
  const iPrimera = xml.indexOf("<w:t>1.</w:t>");
  if (iPrimera === -1) throw new Error("La plantilla FTO-EDU-FOR-98 no trae el bloque de preguntas esperado.");
  const iniBloque = inicioParrafo(xml, iPrimera);
  const iniSect = xml.indexOf("<w:sectPr");

  // Tabla de respuestas: exactamente UNA, la que corresponde a la cantidad.
  const tabla = TABLAS[cantidad];
  const bufTabla = await fs.readFile(path.join(process.cwd(), "assets", "plantillas", tabla.archivo));

  // Imágenes de apoyo por pregunta: partes nuevas en el paquete.
  const rIdPorPregunta = new Map<number, string>();
  let rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  let tipos = await zip.file("[Content_Types].xml")!.async("string");
  for (const img of imagenes) {
    if (img.index < 1 || img.index > cantidad) continue;
    const ext = img.tipo === "jpg" ? "jpg" : "png";
    const nombre = `pregunta${img.index}.${ext}`;
    zip.file(`word/media/${nombre}`, img.buffer);
    const rId = `rIdPregunta${img.index}`;
    rels = rels.replace("</Relationships>", `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombre}"/></Relationships>`);
    rIdPorPregunta.set(img.index, rId);
    if (ext === "jpg" && !tipos.includes('Extension="jpg"')) {
      tipos = tipos.replace("<Default ", '<Default Extension="jpg" ContentType="image/jpeg"/><Default ');
    }
  }
  zip.file("word/media/tabla_respuestas.png", bufTabla);
  rels = rels.replace("</Relationships>", `<Relationship Id="rIdTablaRespuestas" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tabla_respuestas.png"/></Relationships>`);
  rels = quitarTablasOriginales(zip, rels);
  zip.file("word/_rels/document.xml.rels", rels);
  zip.file("[Content_Types].xml", tipos);

  const parrafoTabla = `<w:p><w:pPr><w:keepLines/><w:spacing w:before="240" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr>${dibujoImagen("rIdTablaRespuestas", 190, tabla.cx, tabla.cy, `Tabla de respuestas (${cantidad} preguntas)`)}</w:r></w:p>`;
  xml = xml.slice(0, iniBloque) + bloquePreguntas(contenido, rIdPorPregunta) + parrafoTabla + xml.slice(iniSect);

  // ---- 2. "Área o Asignatura: ____ Tipo de prueba: (Intermedio/Final)"
  xml = reemplazarParrafo(xml, "Área o Asignatura:", (p) => {
    const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)![0].replace(/(<w:pStyle [^>]*\/>)/, `$1<w:tabs><w:tab w:val="left" w:pos="${POS_TIPO_PRUEBA}"/></w:tabs>`);
    const rPr = `<w:rPr><w:rStyle w:val="A5"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>`;
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">Área o Asignatura: ${esc(params.asignatura)}</w:t></w:r><w:r>${rPr}<w:tab/><w:t xml:space="preserve">Tipo de prueba: (${etiqueta})</w:t></w:r></w:p>`;
  });

  // ---- 3. Párrafo de instrucciones: mismos textos del original, solo se llenan los dos blancos
  xml = reemplazarParrafo(xml, "Con el objeto de identificar", (p) => {
    const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)![0];
    const texto =
      `Con el objeto de identificar los conocimientos, competencias y/o habilidades adquiridas que posee sobre la Asignatura y/o CLEI, le invitamos a responder el siguiente examen que consta de ${cantidad} preguntas de selección múltiple con única respuesta. ` +
      `Para desarrollarlo, debe leer los enunciados y de las cuatro opciones de respuesta, seleccionar una y señalar en la tabla de respuestas la correcta, rellenando el círculo. ` +
      `Valoración de cada pregunta: ${valoracion}`;
    return `<w:p>${pPr}<w:r>${RPR_TEXTO}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
  });

  // ---- 4. Tabla de datos (la etiqueta del original queda; se agrega el valor)
  xml = llenarTablaDatos(xml, params);

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const INTRO_DIAGNOSTICO =
  "Con el objeto de identificar los saberes previos que usted posee sobre la Asignatura y/o CLEI que desarrollaremos durante este período académico, solicitamos responda las preguntas de manera clara y con letra legible:";

/** Reemplaza `<w:t>` exacto dentro de un archivo del paquete (encabezado/pie). */
async function reemplazarEnParte(zip: JSZip, parte: string, de: string, a: string): Promise<void> {
  const xml = await zip.file(parte)!.async("string");
  if (!xml.includes(de)) throw new Error(`La plantilla no trae "${de}" en ${parte}.`);
  zip.file(parte, xml.replace(de, a));
}

function bloqueDiagnostico(contenido: ContenidoDiagnostico): string {
  // Renglón para escribir: guiones bajos como los del original ("Área o Asignatura: ____"); 80 caben en el ancho útil con Arial 11.
  const linea = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="400" w:lineRule="auto"/><w:ind w:left="425"/></w:pPr><w:r>${RPR_TEXTO}<w:t>${"_".repeat(80)}</w:t></w:r></w:p>`;
  return contenido.preguntas
    .map(
      (pregunta, i) =>
        `<w:p><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="60" w:line="240" w:lineRule="auto"/><w:ind w:left="425" w:hanging="425"/><w:jc w:val="both"/></w:pPr>` +
        `<w:r>${RPR_NEGRITA}<w:t xml:space="preserve">${i + 1}. </w:t></w:r><w:r>${RPR_TEXTO}<w:t xml:space="preserve">${esc(pregunta.enunciado)}</w:t></w:r></w:p>` +
        linea +
        linea
    )
    .join("");
}

/**
 * Diagnóstico de Presaberes (FTO-EDU-FOR-82 V2): mismo encabezado con logo,
 * tabla de datos y pie que el original, con título "DIAGNÓSTICO DE
 * PRESABERES COLEGIO", código FOR-82 V2, preguntas abiertas numeradas (7) y
 * sin tabla de respuestas ni NOTA (no se califica con hoja de óvalos).
 * Se parte de la plantilla FOR-98 (mismo diseño y logo) porque el .doc
 * original de FOR-82 no se puede leer sin perder el logo.
 */
export async function buildDiagnosticoDesdePlantilla(params: ParametrosExamen, contenido: ContenidoDiagnostico): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await fs.readFile(RUTA_PLANTILLA));
  let xml = await zip.file("word/document.xml")!.async("string");

  const iPrimera = xml.indexOf("<w:t>1.</w:t>");
  if (iPrimera === -1) throw new Error("La plantilla no trae el bloque de preguntas esperado.");
  xml = xml.slice(0, inicioParrafo(xml, iPrimera)) + bloqueDiagnostico(contenido) + xml.slice(xml.indexOf("<w:sectPr"));

  xml = reemplazarParrafo(xml, "Área o Asignatura:", (p) => {
    const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)![0];
    const rPr = `<w:rPr><w:rStyle w:val="A5"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>`;
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">Área o Asignatura: ${esc(params.asignatura)}</w:t></w:r></w:p>`;
  });
  xml = reemplazarParrafo(xml, "Con el objeto de identificar", (p) => {
    const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)![0];
    return `<w:p>${pPr}<w:r>${RPR_TEXTO}<w:t xml:space="preserve">${esc(INTRO_DIAGNOSTICO)}</w:t></w:r></w:p>`;
  });
  xml = llenarTablaDatos(xml, params);
  xml = quitarCeldasNota(xml); // el diagnóstico no lleva nota

  const rels = quitarTablasOriginales(zip, await zip.file("word/_rels/document.xml.rels")!.async("string"));
  zip.file("word/_rels/document.xml.rels", rels);
  zip.file("word/document.xml", xml);

  await reemplazarEnParte(zip, "word/header1.xml", "INSTRUMENTO DE EVALUACIÓN COLEGIO ", "DIAGNÓSTICO DE PRESABERES COLEGIO ");
  await reemplazarEnParte(zip, "word/footer1.xml", "FTO-EDU-FOR-98", "FTO-EDU-FOR-82");
  await reemplazarEnParte(zip, "word/footer1.xml", "<w:t>1</w:t>", "<w:t>2</w:t>");

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
