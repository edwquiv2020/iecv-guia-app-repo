import postgres from "postgres";

declare global {
  var _sql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  global._sql ??
  postgres(process.env.DATABASE_URL!, { ssl: "require", max: 5 });

if (process.env.NODE_ENV !== "production") global._sql = sql;
