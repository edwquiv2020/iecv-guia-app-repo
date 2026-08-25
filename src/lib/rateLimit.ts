import { sql } from "./db";

/**
 * Límite diario de generaciones con IA por docente, para no depender de
 * un tope de gasto configurado aparte en la consola de Anthropic — protege
 * contra un costo disparado por un bug de reintento en bucle o una cuenta
 * comprometida. Configurable por env var para no tocar código si el equipo
 * de docentes crece.
 */
const LIMITE_POR_DEFECTO = 30;

function limiteDiario(): number {
  const valor = Number(process.env.LIMITE_GENERACIONES_DIA);
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_POR_DEFECTO;
}

/** true si el docente todavía tiene cupo hoy para esta ruta (últimas 24h, no "desde medianoche"). */
export async function dentroDelLimiteDiario(email: string, ruta: string): Promise<boolean> {
  const [fila] = await sql`
    select count(*)::int as total from generaciones_log
    where email = ${email} and ruta = ${ruta} and created_at >= now() - interval '24 hours'
  `;
  return (fila?.total ?? 0) < limiteDiario();
}

/** Registra un intento de generación (se llama antes de generar, sin importar si termina en éxito o error). */
export async function registrarGeneracion(email: string, ruta: string): Promise<void> {
  await sql`insert into generaciones_log (email, ruta) values (${email}, ${ruta})`;
}

export function mensajeLimiteAlcanzado(): string {
  return `Alcanzaste el límite de ${limiteDiario()} generaciones en las últimas 24 horas. Si de verdad necesitas más, pídele a un admin que ajuste LIMITE_GENERACIONES_DIA.`;
}
