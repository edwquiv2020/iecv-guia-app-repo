import { google } from "googleapis";
import ExcelJS from "exceljs";

/**
 * Lectura desde la carpeta de Drive "01_MALLAS_CONTENIDO/" — archivos
 * .xlsx subidos (no Google Sheets nativo), un archivo por curso salvo
 * excepciones (ej. varios cursos como pestañas de un mismo archivo). Por
 * eso NO se intenta adivinar qué archivo corresponde a qué curso por
 * nombre — el admin lo elige explícitamente en /admin/mallas
 * (listarArchivosDrive + listarPestanas), y recién ahí se lee.
 *
 * Autenticación vía cuenta de servicio (no el login de los docentes) — la
 * carpeta se comparte una sola vez con el email de esa cuenta de servicio,
 * como lectora. Nunca se guarda ni se renueva un token por docente.
 */

export interface TemaDrive {
  numero: number;
  tema: string;
  subtemas: string;
  url_video: string | null;
  archivo_kahoot: string | null;
}

export interface ArchivoDrive {
  id: string;
  name: string;
}

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "Falta GOOGLE_SERVICE_ACCOUNT_KEY en el entorno. Pega ahí el contenido completo del JSON de la cuenta de servicio."
    );
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY no es un JSON válido.");
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function folderId(): string {
  const id = process.env.GOOGLE_DRIVE_MALLAS_FOLDER_ID;
  if (!id) throw new Error("Falta GOOGLE_DRIVE_MALLAS_FOLDER_ID en el entorno.");
  return id;
}

// Tipos de archivo "hoja de cálculo" que puede haber en la carpeta —
// .xlsx subido (el caso real de esta carpeta), .xls viejo, o un Google
// Sheet nativo (por si algún día se agrega uno).
const MIME_HOJA_CALCULO = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.google-apps.spreadsheet",
];

/** Lista los archivos tipo hoja de cálculo en la carpeta de mallas, para que el admin elija cuál sincronizar. */
export async function listarArchivosDrive(): Promise<ArchivoDrive[]> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const mimeQuery = MIME_HOJA_CALCULO.map((m) => `mimeType='${m}'`).join(" or ");
  const res = await drive.files.list({
    q: `'${folderId()}' in parents and trashed=false and (${mimeQuery})`,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 200,
  });
  return (res.data.files ?? []).filter((f): f is { id: string; name: string } => !!f.id && !!f.name);
}

async function descargarWorkbook(fileId: string): Promise<ExcelJS.Workbook> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs trae su propia copia de @types/node cuyo tipo Buffer no
    // coincide nominalmente con el del proyecto, aunque sea estructuralmente
    // igual — de ahí el `any` puntual.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(res.data as ArrayBuffer) as any);
  } catch (err) {
    // exceljs lanza errores de zip/XML crudos (ej. "uncompressed data size
    // mismatch", "unmatched closing tag") cuando el .xlsx quedó mal armado
    // por el exportador que lo generó — no es recuperable acá, pero sí
    // accionable: re-guardarlo desde Excel/Sheets reescribe el zip válido.
    const detalle = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Este archivo parece estar dañado (no se pudo leer como .xlsx: ${detalle}). Ábrelo en Excel o Google Sheets y guárdalo de nuevo — eso normalmente arregla el problema.`
    );
  }
  return wb;
}

/** Pestañas de un archivo — algunos traen una sola ("Subtemas"), otros varias (una por curso). */
export async function listarPestanas(fileId: string): Promise<string[]> {
  const wb = await descargarWorkbook(fileId);
  return wb.worksheets.map((ws) => ws.name);
}

/** minúsculas, sin tildes — para mapear encabezados de columna tolerando variaciones de tilde/mayúsculas. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrae texto plano de una celda de ExcelJS — puede venir como string, número, hipervínculo {text,hyperlink} o texto enriquecido {richText}. */
function celdaTexto(valor: ExcelJS.CellValue): string {
  if (valor == null) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number") return String(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    const v = valor as unknown as Record<string, unknown>;
    if (typeof v.hyperlink === "string") return v.hyperlink.trim(); // ej. columna url_video
    if (typeof v.text === "string") return v.text.trim();
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("").trim();
    }
    if ("result" in v) return celdaTexto(v.result as ExcelJS.CellValue);
  }
  return String(valor).trim();
}

const ALIAS_COLUMNAS: Record<keyof TemaDrive, string[]> = {
  numero: ["numero", "no", "n"],
  tema: ["tema"],
  subtemas: ["subtemas", "subtema"],
  url_video: ["urlvideo", "video"],
  archivo_kahoot: ["archivokahoot", "kahoot"],
};

function indiceColumna(headerPorColumna: string[], campo: keyof TemaDrive): number {
  const alias = ALIAS_COLUMNAS[campo];
  return headerPorColumna.findIndex((h) => alias.includes(h.replace(/[^a-z0-9]+/g, "")));
}

/**
 * Lee y parsea una pestaña de un .xlsx descargado de Drive — fila 1 =
 * encabezados (mapeados por nombre, no por posición fija), filas
 * siguientes = datos. Sin `pestana`, usa la primera hoja del archivo.
 * Filas sin numero/tema/subtemas se omiten (fila vacía o separadora).
 */
export async function leerMallaDesdeXlsx(fileId: string, pestana?: string): Promise<TemaDrive[]> {
  const wb = await descargarWorkbook(fileId);
  const ws = pestana ? wb.getWorksheet(pestana) : wb.worksheets[0];
  if (!ws) {
    throw new Error(`No se encontró la pestaña "${pestana}" en este archivo.`);
  }

  // Índice 0 sin usar — las columnas de ExcelJS empiezan en 1.
  const headerPorColumna: string[] = [""];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerPorColumna[colNumber] = normalizar(celdaTexto(cell.value));
  });

  const idx = {
    numero: indiceColumna(headerPorColumna, "numero"),
    tema: indiceColumna(headerPorColumna, "tema"),
    subtemas: indiceColumna(headerPorColumna, "subtemas"),
    url_video: indiceColumna(headerPorColumna, "url_video"),
    archivo_kahoot: indiceColumna(headerPorColumna, "archivo_kahoot"),
  };
  if (idx.numero === -1 || idx.tema === -1 || idx.subtemas === -1) {
    throw new Error(
      `La pestaña "${ws.name}" no tiene las columnas esperadas (numero, tema, subtemas) en la fila 1. Encabezados encontrados: ${headerPorColumna.slice(1).join(", ")}.`
    );
  }

  const temas: TemaDrive[] = [];
  for (let fila = 2; fila <= ws.rowCount; fila++) {
    const row = ws.getRow(fila);
    const numeroTexto = celdaTexto(row.getCell(idx.numero).value);
    const tema = celdaTexto(row.getCell(idx.tema).value);
    const subtemas = celdaTexto(row.getCell(idx.subtemas).value);
    if (!numeroTexto || !tema || !subtemas) continue; // fila vacía/separadora en el archivo

    const numero = parseInt(numeroTexto, 10);
    if (Number.isNaN(numero)) continue;

    const urlVideo = idx.url_video >= 1 ? celdaTexto(row.getCell(idx.url_video).value) : "";
    const archivoKahoot = idx.archivo_kahoot >= 1 ? celdaTexto(row.getCell(idx.archivo_kahoot).value) : "";
    temas.push({
      numero,
      tema,
      subtemas,
      url_video: urlVideo || null,
      archivo_kahoot: archivoKahoot || null,
    });
  }
  return temas;
}
