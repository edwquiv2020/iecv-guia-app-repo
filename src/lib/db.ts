import postgres from "postgres";

declare global {
  var _sql: ReturnType<typeof postgres> | undefined;
}

// idle_timeout/max_lifetime: reciclan conexiones periódicamente para que
// nunca queden "zombie" (parecen vivas pero no responden) después de que la
// máquina se suspende o cambia de red — sin esto, una consulta puede quedar
// colgada para siempre en vez de fallar con un error visible.
// connect_timeout: si abrir una conexión nueva falla, falla rápido.
// statement_timeout: se conecta al pooler de Supabase (pgbouncer, puerto
// 6543) — cuando el POSTGRES REAL sí llega a ejecutar la consulta pero se
// demora, esto la mata a los 10s. No cubre el caso confirmado abajo (el
// pooler nunca llega a pasarle la consulta a un backend), por eso se
// complementa con el timeout de aplicación.
const rawSql =
  global._sql ??
  postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 5,
    idle_timeout: 20,
    // Bajado de 30 min: si una conexión del pool queda zombie a mitad de
    // consulta, idle_timeout no la toca (no está "sin uso", está "colgada
    // esperando"), así que la única forma de que se autorrepare es que
    // termine su vida y se reemplace. 5 min acota cuánto puede durar el
    // problema en vez de arrastrarse toda la vida del contenedor.
    max_lifetime: 60 * 5,
    connect_timeout: 10,
    connection: { statement_timeout: 10_000 },
  });

if (process.env.NODE_ENV !== "production") global._sql = rawSql;

const TIMEOUT_CONSULTA_MS = 15_000;

/**
 * Pasó de verdad: un login se quedó colgado 5 minutos hasta que Railway
 * cortó la conexión (HTTP 499) — el pooler de Supabase aceptó la conexión
 * pero nunca llegó a pasarle la consulta a un backend real, así que ni
 * `statement_timeout` (que solo cuenta tiempo de ejecución) ni
 * `idle_timeout` (que solo recicla conexiones sin uso) se enteraron. postgres.js
 * no trae un timeout por consulta — este Proxy envuelve cada llamada
 * `` sql`...` `` en una carrera contra un timeout de aplicación, para que
 * cualquier ruta que use la base falle rápido y visible en vez de colgar al
 * usuario varios minutos. Envuelve solo la LLAMADA como template tag
 * (`sql\`...\``, el 99% del uso real en este proyecto); sql.json/sql.unsafe/
 * sql.begin siguen intactos vía el `get` trap por defecto del Proxy.
 */
export const sql = new Proxy(rawSql, {
  apply(target, thisArg, args: Parameters<typeof rawSql>) {
    const query = Reflect.apply(target, thisArg, args);
    return Promise.race([
      query,
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`La base de datos no respondió en ${TIMEOUT_CONSULTA_MS / 1000}s (posible conexión zombie con el pooler) — vuelve a intentarlo.`)),
          TIMEOUT_CONSULTA_MS
        );
      }),
    ]);
  },
}) as typeof rawSql;

/**
 * Reintenta UNA vez si falla — para operaciones de SOLO LECTURA (o
 * escrituras ya protegidas con `on conflict`, donde repetir es inofensivo).
 * Confirmado en producción: cuando el pooler da una conexión zombie, la
 * siguiente casi siempre sale limpia. No usar para escrituras no
 * idempotentes (ej. un insert sin `on conflict` que no tenga una
 * restricción única detrás) — ahí un reintento después de un timeout
 * ambiguo (¿de verdad no se guardó, o solo no llegó la confirmación?)
 * podría duplicar la fila.
 */
export async function conReintento<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}
