import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit tests del borde con Google Drive/Sheets: se mockea el SDK de
// googleapis (drive.files.list y sheets.spreadsheets.values.get) y se
// ejerce de verdad la lógica propia — matching de nombre de archivo por
// curso (y su ambigüedad), y el parseo de filas del Sheet a TemaDrive
// (mapeo de columnas por encabezado, filas vacías, numero inválido).

const filesList = vi.fn();
const valuesGet = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(function MockGoogleAuth() { return {}; }) },
    drive: vi.fn().mockImplementation(() => ({ files: { list: (...args: unknown[]) => filesList(...args) } })),
    sheets: vi.fn().mockImplementation(() => ({
      spreadsheets: { values: { get: (...args: unknown[]) => valuesGet(...args) } },
    })),
  },
}));

const { buscarMallaEnDrive, leerMallaDesdeSheet } = await import("@/lib/googleDrive");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: "x@y.iam.gserviceaccount.com", private_key: "x" });
  process.env.GOOGLE_DRIVE_MALLAS_FOLDER_ID = "folder-123";
});

describe("buscarMallaEnDrive", () => {
  it("lanza si falta GOOGLE_SERVICE_ACCOUNT_KEY, sin llamar a Drive", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    await expect(buscarMallaEnDrive("Microsoft Word")).rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_KEY/);
    expect(filesList).not.toHaveBeenCalled();
  });

  it("devuelve null si ningún archivo coincide con el nombre del curso", async () => {
    filesList.mockResolvedValue({ data: { files: [{ id: "1", name: "Malla Excel 2026" }] } });
    const resultado = await buscarMallaEnDrive("Microsoft Word");
    expect(resultado).toBeNull();
  });

  it("encuentra el Sheet aunque el nombre tenga tildes/mayúsculas distintas o texto extra", async () => {
    filesList.mockResolvedValue({
      data: { files: [{ id: "1", name: "Malla EXCEL 2026" }, { id: "2", name: "Malla Microsoft Word — 2026" }] },
    });
    const resultado = await buscarMallaEnDrive("Microsoft Word");
    expect(resultado).toEqual({ id: "2", name: "Malla Microsoft Word — 2026" });
  });

  it("consulta la carpeta correcta y solo Sheets no eliminados", async () => {
    filesList.mockResolvedValue({ data: { files: [] } });
    await buscarMallaEnDrive("Word");
    const llamada = filesList.mock.calls[0][0];
    expect(llamada.q).toContain("'folder-123' in parents");
    expect(llamada.q).toContain("mimeType='application/vnd.google-apps.spreadsheet'");
    expect(llamada.q).toContain("trashed=false");
  });

  it("lanza un error listando los candidatos si hay más de una coincidencia (ambigüedad real)", async () => {
    filesList.mockResolvedValue({
      data: { files: [{ id: "1", name: "Word Básico" }, { id: "2", name: "Word Avanzado" }] },
    });
    await expect(buscarMallaEnDrive("Word")).rejects.toThrow(/Word Básico.*Word Avanzado|Word Avanzado.*Word Básico/);
  });
});

describe("leerMallaDesdeSheet", () => {
  it("mapea las columnas por encabezado y convierte 'numero' a number", async () => {
    valuesGet.mockResolvedValue({
      data: {
        values: [
          ["numero", "tema", "subtemas", "url_video", "archivo_kahoot"],
          ["1", "Introducción", "A, B, C", "https://youtu.be/x", "kahoot it"],
        ],
      },
    });
    const temas = await leerMallaDesdeSheet("sheet-1");
    expect(temas).toEqual([
      { numero: 1, tema: "Introducción", subtemas: "A, B, C", url_video: "https://youtu.be/x", archivo_kahoot: "kahoot it" },
    ]);
  });

  it("omite filas vacías/separadoras (sin numero, tema o subtemas) sin lanzar error", async () => {
    valuesGet.mockResolvedValue({
      data: {
        values: [
          ["numero", "tema", "subtemas", "url_video", "archivo_kahoot"],
          ["1", "Tema válido", "Subtema", "", ""],
          ["", "", "", "", ""],
          ["2", "", "Subtema sin tema", "", ""],
        ],
      },
    });
    const temas = await leerMallaDesdeSheet("sheet-1");
    expect(temas).toHaveLength(1);
    expect(temas[0].numero).toBe(1);
    expect(temas[0].url_video).toBeNull();
  });

  it("devuelve [] si el Sheet no tiene filas de datos (solo encabezado o vacío)", async () => {
    valuesGet.mockResolvedValue({ data: { values: [["numero", "tema", "subtemas"]] } });
    expect(await leerMallaDesdeSheet("sheet-1")).toEqual([]);
  });

  it("lanza un error claro si faltan las columnas obligatorias en el encabezado", async () => {
    valuesGet.mockResolvedValue({ data: { values: [["nombre", "descripcion"], ["x", "y"]] } });
    await expect(leerMallaDesdeSheet("sheet-1")).rejects.toThrow(/columnas esperadas/);
  });

  it("tolera un encabezado con tildes/mayúsculas distintas (ej. 'Número')", async () => {
    valuesGet.mockResolvedValue({
      data: { values: [["Número", "Tema", "Subtemas"], ["3", "Tercer tema", "Subtema"]] },
    });
    const temas = await leerMallaDesdeSheet("sheet-1");
    expect(temas).toEqual([{ numero: 3, tema: "Tercer tema", subtemas: "Subtema", url_video: null, archivo_kahoot: null }]);
  });
});
