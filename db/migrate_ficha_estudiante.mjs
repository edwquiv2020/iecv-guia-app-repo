// Migración ADITIVA — amplía `estudiantes` (creada por
// migrate_seguimiento.mjs) con la ficha completa de matrícula: datos
// personales, datos del acudiente, curso (además del ciclo/jornada que ya
// tenía) y una foto (se guarda solo la ruta en Storage, ver
// src/lib/storage.ts, bucket fotos-estudiantes). Todas las columnas nuevas
// son opcionales (nullable) — no rompe estudiantes ya creados solo con
// nombre/ciclo/jornada.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

try {
  await sql.unsafe(`
    alter table estudiantes
      add column if not exists tipo_documento text,
      add column if not exists numero_documento text,
      add column if not exists fecha_nacimiento date,
      add column if not exists lugar_nacimiento text,
      add column if not exists genero text,
      add column if not exists direccion text,
      add column if not exists telefono text,
      add column if not exists eps text,
      add column if not exists rh text,
      add column if not exists acudiente_nombre text,
      add column if not exists acudiente_parentesco text,
      add column if not exists acudiente_telefono text,
      add column if not exists acudiente_direccion text,
      add column if not exists curso_id uuid references cursos(id),
      add column if not exists foto_path text;
  `);

  await sql.unsafe(`create index if not exists estudiantes_curso_idx on estudiantes (curso_id);`);

  console.log("Listo: ficha completa de estudiantes (columnas + índice) creada (o ya existía).");
} finally {
  await sql.end();
}
