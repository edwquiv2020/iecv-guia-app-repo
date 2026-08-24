import postgres from "postgres";

declare global {
  var _sql: ReturnType<typeof postgres> | undefined;
}

// idle_timeout/max_lifetime: reciclan conexiones periódicamente para que
// nunca queden "zombie" (parecen vivas pero no responden) después de que la
// máquina se suspende o cambia de red — sin esto, una consulta puede quedar
// colgada para siempre en vez de fallar con un error visible.
// connect_timeout: si abrir una conexión nueva falla, falla rápido.
export const sql =
  global._sql ??
  postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") global._sql = sql;
