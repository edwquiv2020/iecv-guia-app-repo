import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import type { IconoPaso } from "./types";

const execFileAsync = promisify(execFile);

const PY_SCRIPTS_DIR = path.join(process.cwd(), "py_scripts");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

/**
 * Genera la "ruta visual" (tira pestaña > grupo > íconos de la cinta) de un
 * subtema, llamando al script Python existente de la skill
 * (py_scripts/gen_ruta_visual.py), mismo contrato que
 * generarImagenMotivacional() en images.ts. Devuelve el PNG como Buffer.
 */
export async function generarRutaVisual(
  tab: string,
  grupo: string,
  opciones: Array<{ icono: IconoPaso; etiqueta: string }>
): Promise<Buffer> {
  const outPath = path.join(os.tmpdir(), `ruta_visual_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
  const scriptPath = path.join(PY_SCRIPTS_DIR, "gen_ruta_visual.py");
  const argJson = JSON.stringify({ tab, grupo, opciones, out_path: outPath });

  let stdout: string, stderr: string;
  try {
    ({ stdout, stderr } = await execFileAsync(PYTHON_BIN, [scriptPath, argJson]));
  } catch (err) {
    // Mismo punto ciego que generarImagenMotivacional() en images.ts: si
    // python3 termina con código de error, execFile rechaza directo con un
    // .message genérico ("Command failed: ...") — el stderr/stdout real
    // hay que rescatarlo de las propiedades del error.
    const e = err as ExecFileException & { stdout?: string; stderr?: string };
    throw new Error(
      `No se pudo ejecutar el generador de ruta visual (${tab} > ${grupo}): ${e.stderr || e.stdout || e.message}`
    );
  }
  let result: { ok: boolean; out_path?: string; error?: string };
  try {
    result = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  } catch {
    throw new Error(`No se pudo interpretar la salida del generador de ruta visual: ${stdout} ${stderr}`);
  }
  if (!result.ok) {
    throw new Error(`Fallo generando la ruta visual (${tab} > ${grupo}): ${result.error || stderr}`);
  }

  const buf = await fs.readFile(outPath);
  await fs.unlink(outPath).catch(() => {});
  return buf;
}
