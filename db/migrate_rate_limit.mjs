// Migración ADITIVA — agrega generaciones_log, para el límite diario de
// generaciones por docente en /api/generar-guia y /api/generar-examen (ver
// src/lib/rateLimit.ts). Mismo patrón que migrate_auth.mjs y
// migrate_roles.mjs. No borra ni toca ninguna fila existente.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const migracion = `
create table if not exists generaciones_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ruta text not null,
  created_at timestamptz not null default now()
);
create index if not exists generaciones_log_email_ruta_idx on generaciones_log (email, ruta, created_at);
`;

try {
  await sql.unsafe(migracion);
  console.log("Tabla 'generaciones_log' agregada correctamente.");
} finally {
  await sql.end();
}
