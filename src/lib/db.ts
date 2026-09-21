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
function crearCliente() {
  return postgres(process.env.DATABASE_URL!, {
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
}

let cliente = global._sql ?? crearCliente();
if (process.env.NODE_ENV !== "production") global._sql = cliente;

// Bajado de 15s a 8s: con el pooler de Supabase inestable, cada intento
// individual necesita fallar rápido para que 2-3 intentos sigan siendo una
// espera razonable para quien usa la app.
const TIMEOUT_CONSULTA_MS = 8_000;

/**
 * Autorreparación del pool: cuando una consulta se cuelga por completo, es
 * casi seguro que TODAS las conexiones del pool quedaron zombie a la vez
 * (pasó de verdad en producción: 100% de fallos hasta reiniciar el
 * contenedor, mientras una conexión nueva desde afuera respondía en <100ms).
 * En vez de esperar al reinicio manual, se destruye el cliente viejo y se
 * crea uno nuevo con conexiones frescas. `usado` evita que varias
 * consultas colgadas a la vez reinicien el pool en cadena.
 */
function reiniciarPool(usado: typeof cliente) {
  if (cliente !== usado) return;
  cliente = crearCliente();
  if (process.env.NODE_ENV !== "production") global._sql = cliente;
  usado.end({ timeout: 0 }).catch(() => {});
}

/**
 * Pasó de verdad: un login se quedó colgado 5 minutos hasta que Railway
 * cortó la conexión (HTTP 499) — el pooler de Supabase aceptó la conexión
 * pero nunca llegó a pasarle la consulta a un backend real, así que ni
 * `statement_timeout` (que solo cuenta tiempo de ejecución) ni
 * `idle_timeout` (que solo recicla conexiones sin uso) se enteraron.
 * postgres.js no trae un timeout por consulta — este Proxy envuelve cada
 * llamada `` sql`...` `` en una carrera contra un timeout de aplicación, y
 * si vence reinicia el pool (ver reiniciarPool). El resto de miembros
 * (sql.json/unsafe/begin...) se reenvían al cliente vigente.
 */
export const sql = new Proxy(function () {} as unknown as typeof cliente, {
  apply(_target, thisArg, args: unknown[]) {
    const usado = cliente;
    const query = Reflect.apply(usado as unknown as (...a: unknown[]) => unknown, thisArg, args) as
      | (Promise<unknown> & { then: Promise<unknown>["then"] })
      | unknown;
    // IMPORTANTE: se devuelve el MISMO objeto Query de postgres.js (no una
    // Promise nueva). Las consultas también se usan como fragmentos dentro de
    // otras (`sql\`... ${sql\`...\`}\``) y postgres.js los reconoce con
    // `instanceof Query` — una Promise envolvente los volvía parámetros ($1)
    // y rompía /api/calendario y /api/generar-guia. El timeout se aplica solo
    // cuando la consulta se ESPERA, reemplazando su `then` (await/catch/
    // finally pasan todos por ahí).
    if (query && typeof (query as Promise<unknown>).then === "function") {
      const q = query as Promise<unknown>;
      const thenOriginal = q.then.bind(q);
      q.then = ((onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
        let timer: ReturnType<typeof setTimeout>;
        const limite = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reiniciarPool(usado);
            reject(new Error(`La base de datos no respondió en ${TIMEOUT_CONSULTA_MS / 1000}s (posible conexión zombie con el pooler) — vuelve a intentarlo.`));
          }, TIMEOUT_CONSULTA_MS);
        });
        return Promise.race([thenOriginal(), limite])
          .finally(() => clearTimeout(timer))
          .then(onOk, onErr);
      }) as typeof q.then;
    }
    return query;
  },
  get(_target, prop) {
    const valor = Reflect.get(cliente, prop);
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
}) as typeof cliente;

/**
 * Reintenta si falla (2 intentos extra, con una pequeña espera creciente
 * entre cada uno para no golpear un pooler ya saturado en el mismo
 * instante) — para operaciones de SOLO LECTURA (o escrituras ya protegidas
 * con `on conflict`, donde repetir es inofensivo). Confirmado en
 * producción: normalmente un solo reintento basta, pero con un incidente
 * activo del pooler (ver status.supabase.com) a veces hace falta más de
 * uno. No usar para escrituras no idempotentes (ej. un insert sin
 * `on conflict` que no tenga una restricción única detrás) — ahí un
 * reintento después de un timeout ambiguo (¿de verdad no se guardó, o solo
 * no llegó la confirmación?) podría duplicar la fila.
 */
export async function conReintento<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimoError: unknown;
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 300 * i));
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
    }
  }
  throw ultimoError;
}
