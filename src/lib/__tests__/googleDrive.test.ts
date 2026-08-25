import { describe, expect, it, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";

// Unit tests del borde con Google Drive: se mockea el SDK de googleapis
// (drive.files.list/drive.files.get) y se ejerce de verdad la lógica
// propia — listar archivos/pestañas, y el parseo de un .xlsx real
// (mapeo de columnas por encabezado, celdas con hipervínculo, filas
// vacías). No se intenta adivinar el archivo por nombre del curso — eso
// lo elige el admin en la UI, ver MallasEditor.tsx.

const filesList = vi.fn();
const filesGet = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(function MockGoogleAuth() { return {}; }) },
    drive: vi.fn().mockImplementation(() => ({
      files: {
        list: (...args: unknown[]) => filesList(...args),
        get: (...args: unknown[]) => filesGet(...args),
      },
    })),
  },
}));

const { listarArchivosDrive, listarPestanas, leerMallaDesdeXlsx } = await import("@/lib/googleDrive");

/** Arma un .xlsx real en memoria (mismo mecanismo que usa la app para leerlo) — más fiel que mockear ExcelJS. */
async function xlsxBuffer(filas: unknown[][], nombreHoja = "Subtemas"): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  filas.forEach((fila) => ws.addRow(fila));
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

function mockDescarga(data: ArrayBuffer) {
  filesGet.mockResolvedValue({ data });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: "x@y.iam.gserviceaccount.com", private_key: "x" });
  process.env.GOOGLE_DRIVE_MALLAS_FOLDER_ID = "folder-123";
});

describe("listarArchivosDrive", () => {
  it("lanza si falta GOOGLE_SERVICE_ACCOUNT_KEY, sin llamar a Drive", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    await expect(listarArchivosDrive()).rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_KEY/);
    expect(filesList).not.toHaveBeenCalled();
  });

  it("devuelve los archivos encontrados en la carpeta", async () => {
    filesList.mockResolvedValue({ data: { files: [{ id: "1", name: "BANCO_Excel.xlsx" }, { id: "2", name: "BANCO_Word.xlsx" }] } });
    const archivos = await listarArchivosDrive();
    expect(archivos).toEqual([{ id: "1", name: "BANCO_Excel.xlsx" }, { id: "2", name: "BANCO_Word.xlsx" }]);
  });

  it("consulta la carpeta correcta, solo tipos de hoja de cálculo, sin borrados", async () => {
    filesList.mockResolvedValue({ data: { files: [] } });
    await listarArchivosDrive();
    const llamada = filesList.mock.calls[0][0];
    expect(llamada.q).toContain("'folder-123' in parents");
    expect(llamada.q).toContain("trashed=false");
    expect(llamada.q).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
});

describe("listarPestanas", () => {
  it("devuelve los nombres de las pestañas del archivo", async () => {
    const buf = await xlsxBuffer([["N°", "Tema", "Subtema"]], "Subtemas");
    mockDescarga(buf);
    expect(await listarPestanas("file-1")).toEqual(["Subtemas"]);
  });

  it("devuelve varias pestañas cuando el archivo combina varios cursos", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Inteligencia Artificial");
    wb.addWorksheet("PowerPoint");
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    mockDescarga(buf);
    expect(await listarPestanas("file-1")).toEqual(["Inteligencia Artificial", "PowerPoint"]);
  });

  it("da un mensaje claro y accionable si el .xlsx está dañado (zip truncado/corrupto)", async () => {
    // Caso real encontrado en la carpeta de Drive: algunos .xlsx quedan con
    // el zip mal armado por el exportador que los generó. Truncar un buffer
    // válido reproduce ese mismo tipo de fallo real de exceljs.
    const buf = await xlsxBuffer([["N°", "Tema", "Subtema"], [1, "Tema", "Subtema"]]);
    const dañado = buf.slice(0, Math.floor(buf.byteLength / 2));
    mockDescarga(dañado);
    await expect(listarPestanas("file-1")).rejects.toThrow(/dañado.*Ábrelo en Excel o Google Sheets/);
  });
});

describe("leerMallaDesdeXlsx", () => {
  it("mapea las columnas por encabezado (N°, Tema, Subtema, url video, kahoot) y extrae la URL del hipervínculo", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Subtemas");
    ws.addRow(["N°", "Tema", "Subtema", "url video", "kahoot "]);
    const row = ws.addRow([1, "Introducción a MS Excel", "Entorno de Excel, cinta de opciones.", null, "kahoot it"]);
    row.getCell(4).value = { text: "Ver video", hyperlink: "https://www.youtube.com/watch?v=eZPCVg4Jk00" };
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    mockDescarga(buf);

    const temas = await leerMallaDesdeXlsx("file-1");
    expect(temas).toEqual([
      {
        numero: 1,
        tema: "Introducción a MS Excel",
        subtemas: "Entorno de Excel, cinta de opciones.",
        url_video: "https://www.youtube.com/watch?v=eZPCVg4Jk00",
        archivo_kahoot: "kahoot it",
      },
    ]);
  });

  it("omite filas vacías/separadoras sin lanzar error", async () => {
    const buf = await xlsxBuffer([
      ["N°", "Tema", "Subtema"],
      [1, "Tema válido", "Subtema"],
      [null, null, null],
      [2, null, "Subtema sin tema"],
    ]);
    mockDescarga(buf);
    const temas = await leerMallaDesdeXlsx("file-1");
    expect(temas).toHaveLength(1);
    expect(temas[0].numero).toBe(1);
    expect(temas[0].url_video).toBeNull();
  });

  it("devuelve [] si la pestaña no tiene filas de datos (solo encabezado)", async () => {
    const buf = await xlsxBuffer([["N°", "Tema", "Subtema"]]);
    mockDescarga(buf);
    expect(await leerMallaDesdeXlsx("file-1")).toEqual([]);
  });

  it("lanza un error claro si faltan las columnas obligatorias en el encabezado", async () => {
    const buf = await xlsxBuffer([["nombre", "descripcion"], ["x", "y"]]);
    mockDescarga(buf);
    await expect(leerMallaDesdeXlsx("file-1")).rejects.toThrow(/columnas esperadas/);
  });

  it("lee una pestaña específica cuando el archivo tiene varias (uno por curso)", async () => {
    const wb = new ExcelJS.Workbook();
    const wsIA = wb.addWorksheet("Inteligencia Artificial");
    wsIA.addRow(["N°", "Tema", "Subtema"]);
    wsIA.addRow([1, "Tema de IA", "Subtema de IA"]);
    const wsPP = wb.addWorksheet("PowerPoint");
    wsPP.addRow(["N°", "Tema", "Subtema"]);
    wsPP.addRow([1, "Tema de PowerPoint", "Subtema de PowerPoint"]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    mockDescarga(buf);

    const temas = await leerMallaDesdeXlsx("file-1", "PowerPoint");
    expect(temas).toEqual([{ numero: 1, tema: "Tema de PowerPoint", subtemas: "Subtema de PowerPoint", url_video: null, archivo_kahoot: null }]);
  });

  it("lanza un error claro si se pide una pestaña que no existe", async () => {
    const buf = await xlsxBuffer([["N°", "Tema", "Subtema"]]);
    mockDescarga(buf);
    await expect(leerMallaDesdeXlsx("file-1", "No existe")).rejects.toThrow(/No existe/);
  });
});
