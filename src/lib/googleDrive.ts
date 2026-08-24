import { google } from "googleapis";

/**
 * Lectura desde la carpeta de Drive "01_MALLAS_CONTENIDO/" (un Google Sheet
 * por curso, mismo esquema de columnas que ya usa la app: numero | tema |
 * subtemas | url_video | archivo_kahoot, encabezado en la fila 1).
 *
 * Autenticación vía cuenta de servicio (no el login de los docentes) — la
 * carpeta se comparte una sola vez con el email de esa cuenta de servicio,
 * como lector. Nunca se guarda ni se renueva un token por docente.
 */

export interface TemaDrive {
  numero: number;
  tema: string;
  subtemas: string;
  url_video: string | null;
  archivo_kahoot: string | null;
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
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

function folderId(): string {
  const id = process.env.GOOGLE_DRIVE_MALLAS_FOLDER_ID;
  if (!id) throw new Error("Falta GOOGLE_DRIVE_MALLAS_FOLDER_ID en el entorno.");
  return id;
}

/** minúsculas, sin tildes, sin espacios/guiones repetidos — para comparar nombres sin depender de tildes/mayúsculas. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Busca, dentro de la carpeta de mallas, el Sheet cuyo nombre coincide con
 * el nombre del curso (comparación normalizada, contención en cualquier
 * sentido — ej. curso "Microsoft Word" matchea un archivo "Malla Microsoft
 * Word 2026" o "word"). null si no hay ninguno. Lanza si hay más de uno
 * (ambigüedad real — mejor que adivinar cuál).
 */
export async function buscarMallaEnDrive(nombreCurso: string): Promise<{ id: string; name: string } | null> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const res = await drive.files.list({
    q: `'${folderId()}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 200,
  });
  const archivos = res.data.files ?? [];
  const objetivo = normalizar(nombreCurso);
  const candidatos = archivos.filter((f) => {
    const nombre = normalizar(f.name ?? "");
    return nombre.includes(objetivo) || objetivo.includes(nombre);
  });

  if (candidatos.length === 0) return null;
  if (candidatos.length > 1) {
    throw new Error(
      `Hay ${candidatos.length} Sheets en la carpeta que coinciden con "${nombreCurso}": ${candidatos.map((c) => c.name).join(", ")}. Renombra el archivo correcto en Drive para que sea inequívoco.`
    );
  }
  const [c] = candidatos;
  if (!c.id || !c.name) return null;
  return { id: c.id, name: c.name };
}

const ALIAS_COLUMNAS: Record<keyof TemaDrive, string[]> = {
  numero: ["numero", "no", "n"],
  tema: ["tema"],
  subtemas: ["subtemas", "subtema"],
  url_video: ["urlvideo", "video"],
  archivo_kahoot: ["archivokahoot", "kahoot"],
};

function indiceColumna(headerNormalizado: string[], campo: keyof TemaDrive): number {
  const alias = ALIAS_COLUMNAS[campo];
  return headerNormalizado.findIndex((h) => alias.includes(h.replace(/\s+/g, "")));
}

/**
 * Lee y parsea el Sheet completo — fila 1 = encabezados (se mapean por
 * nombre, no por posición fija, tolerando variaciones menores de tilde/
 * mayúsculas), filas siguientes = datos. Filas sin numero/tema/subtemas se
 * omiten (fila vacía o de separación en el Sheet, no error).
 */
export async function leerMallaDesdeSheet(spreadsheetId: string): Promise<TemaDrive[]> {
  const sheets = google.sheets({ version: "v4", auth: auth() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "A1:Z1000" });
  const filas = res.data.values ?? [];
  if (filas.length < 2) return [];

  const headerNormalizado = filas[0].map((h) => normalizar(String(h ?? "")));
  const idx = {
    numero: indiceColumna(headerNormalizado, "numero"),
    tema: indiceColumna(headerNormalizado, "tema"),
    subtemas: indiceColumna(headerNormalizado, "subtemas"),
    url_video: indiceColumna(headerNormalizado, "url_video"),
    archivo_kahoot: indiceColumna(headerNormalizado, "archivo_kahoot"),
  };
  if (idx.numero === -1 || idx.tema === -1 || idx.subtemas === -1) {
    throw new Error(
      `El Sheet no tiene las columnas esperadas (numero, tema, subtemas) en la fila 1. Encabezados encontrados: ${filas[0].join(", ")}.`
    );
  }

  const temas: TemaDrive[] = [];
  for (const fila of filas.slice(1)) {
    const numeroTexto = String(fila[idx.numero] ?? "").trim();
    const tema = String(fila[idx.tema] ?? "").trim();
    const subtemas = String(fila[idx.subtemas] ?? "").trim();
    if (!numeroTexto || !tema || !subtemas) continue; // fila vacía/separadora en el Sheet

    const numero = parseInt(numeroTexto, 10);
    if (Number.isNaN(numero)) continue;

    const urlVideo = idx.url_video >= 0 ? String(fila[idx.url_video] ?? "").trim() : "";
    const archivoKahoot = idx.archivo_kahoot >= 0 ? String(fila[idx.archivo_kahoot] ?? "").trim() : "";
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
