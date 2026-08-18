import ExcelJS from "exceljs";
import type { ContenidoKahoot, ParametrosGuia } from "./types";

// Puerto a TypeScript de py_scripts/build_cuestionario_kahoot.py (skill
// iecv-guia-formacion) — mismo formato exacto de importación de Kahoot,
// misma hoja de instrucciones, mismas reglas/límites.

const HEADERS = ["Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Time limit (sec)", "Correct answer(s)"];
const COLUMN_WIDTHS = [55, 18, 18, 18, 18, 14, 14];

/** Arma el .xlsx de importación de Kahoot y devuelve el Buffer listo para descargar. */
export async function buildKahootXlsx(params: ParametrosGuia, contenido: ContenidoKahoot): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import Questions");

  ws.addRow(HEADERS);
  for (const p of contenido.preguntas) {
    const [r1, r2, r3, r4] = [p.respuestas[0] ?? "", p.respuestas[1] ?? "", p.respuestas[2] ?? "", p.respuestas[3] ?? ""];
    ws.addRow([p.pregunta, r1, r2, r3, r4, p.tiempoSeg, p.correctas.join(",")]);
  }

  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B5B2A" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  for (let i = 2; i <= ws.rowCount; i++) {
    ws.getRow(i).eachCell((cell, colNumber) => {
      cell.font = { name: "Arial", size: 11 };
      cell.alignment = { horizontal: colNumber === 1 ? "left" : "center", vertical: "middle", wrapText: true };
    });
  }

  COLUMN_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ws2 = wb.addWorksheet("Instrucciones");
  const legend: Array<[string, boolean]> = [
    [`CUESTIONARIO - CLEI ${params.clei} - Guía ${params.guia} / Semana ${params.semana}`, true],
    ["", false],
    ["Cómo importar este archivo en Kahoot:", true],
    ["1. Ingresa a create.kahoot.it y haz clic en Crear > Kahoot > Lienzos en blanco.", false],
    ['2. Haz clic en "Añadir" > pestaña "Importar" > "Importar hoja de cálculo".', false],
    ['3. Sube este archivo .xlsx (hoja "Import Questions") y confirma con "Cargar".', false],
    ['4. Clic en "Añadir preguntas". Elimina la pregunta 1 en blanco que Kahoot deja por defecto.', false],
    ["5. Ponle título al kahoot, marca visibilidad Privado y Guarda.", false],
    ["", false],
    ["Reglas del formato (Kahoot):", true],
    ["- Máximo 95 caracteres por pregunta.", false],
    ["- Máximo 60 caracteres por respuesta.", false],
    ["- Cada pregunta necesita mínimo 2 respuestas.", false],
    ["- Tiempo permitido (seg): 5, 10, 20, 30, 60 o 120.", false],
    ['- "Correct answer(s)" indica el número de la(s) respuesta(s) correcta(s), separadas por coma.', false],
  ];
  legend.forEach(([text, bold], i) => {
    const cell = ws2.getCell(i + 1, 1);
    cell.value = text;
    cell.font = { name: "Arial", size: 11, bold };
  });
  ws2.getColumn(1).width = 100;

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}
