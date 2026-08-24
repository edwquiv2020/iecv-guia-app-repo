// Migración ADITIVA — agrega la tabla de control de acceso (login con
// Google) sin tocar nada existente. Mismo patrón que migrate_guia_archivos.mjs.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const migracion = `
create table if not exists usuarios_autorizados (
  email text primary key,
  nombre text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
`;

try {
  await sql.unsafe(migracion);
  console.log("Migración aditiva aplicada: tabla usuarios_autorizados.");
} finally {
  await sql.end();
}
