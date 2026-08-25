import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const execFileAsync = promisify(execFile);

const PY_SCRIPTS_DIR = path.join(process.cwd(), "py_scripts");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

/**
 * Genera la imagen de INICIO (foto + frase motivacional) llamando al script
 * Python existente de la skill (py_scripts/gen_imagen_motivacional_v2.py),
 * sin reescribir su lógica. Devuelve el PNG como Buffer.
 *
 * NOTA: hoy el banco de fotos (assets/banco_fotos) contiene PLACEHOLDERS
 * generados, no las 20 fotos reales de Pexels de la carpeta de Drive del
 * docente. Ver README.md — "Reemplazar el banco de fotos" para el paso
 * pendiente de sincronizar las fotos reales.
 */
export async function generarImagenMotivacional(claveBanco: string): Promise<Buffer> {
  const outPath = path.join(os.tmpdir(), `motivacional_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
  const scriptPath = path.join(PY_SCRIPTS_DIR, "gen_imagen_motivacional_v2.py");
  const argJson = JSON.stringify({ clave: claveBanco, out_path: outPath });

  let stdout: string, stderr: string;
  try {
    ({ stdout, stderr } = await execFileAsync(PYTHON_BIN, [scriptPath, argJson]));
  } catch (err) {
    // execFile rechaza directo (sin llegar al parseo de abajo) cuando
    // python3 termina con código de error — el .message por defecto es
    // "Command failed: ..." sin ningún detalle real; el stderr/stdout de
    // verdad va en propiedades aparte del error, hay que rescatarlo a mano.
    const e = err as ExecFileException & { stdout?: string; stderr?: string };
    throw new Error(
      `No se pudo ejecutar el generador de imagen motivacional (${claveBanco}): ${e.stderr || e.stdout || e.message}`
    );
  }
  let result: { ok: boolean; out_path?: string; error?: string };
  try {
    result = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  } catch {
    throw new Error(`No se pudo interpretar la salida del generador de imagen: ${stdout} ${stderr}`);
  }
  if (!result.ok) {
    throw new Error(`Fallo generando imagen motivacional (${claveBanco}): ${result.error || stderr}`);
  }

  const buf = await fs.readFile(outPath);
  await fs.unlink(outPath).catch(() => {});
  return buf;
}
