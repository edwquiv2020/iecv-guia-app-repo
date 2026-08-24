// Migración ADITIVA — a diferencia de migrate.mjs (que corre schema.sql
// completo, con `drop table cascade` de todo), este script solo agrega lo
// nuevo para persistencia real de guías/exámenes. No borra ni toca ninguna
// tabla ni fila existente — seguro de correr contra la base en producción.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const migracion = `
alter table guias add column if not exists contenido jsonb;
alter table guias add column if not exists kahoot_contenido jsonb;

create table if not exists guia_archivos (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references guias(id) on delete cascade,
  nombre_archivo text not null,
  mime_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists guia_archivos_guia_idx on guia_archivos (guia_id);
`;

try {
  await sql.unsafe(migracion);
  console.log("Migración aditiva aplicada: guias.contenido/kahoot_contenido + tabla guia_archivos.");
} finally {
  await sql.end();
}
