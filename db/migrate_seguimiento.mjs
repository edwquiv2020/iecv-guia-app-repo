// Migración ADITIVA — crea el seguimiento de estudiantes (aspectos
// personales y sociales por fuera de lo cognitivo, ver
// src/lib/seguimiento.ts): tabla `estudiantes` y `seguimiento_registros`
// (una fila por clase registrada, no por período completo). Privado por
// docente vía `docente_email` en ambas tablas. No toca ninguna fila
// existente de otras tablas.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

try {
  await sql.unsafe(`
    create table if not exists estudiantes (
      id uuid primary key default gen_random_uuid(),
      nombre text not null,
      ciclo_id uuid references ciclos(id),
      jornada_id uuid references jornadas(id),
      docente_email text not null references usuarios_autorizados(email) on delete cascade,
      activo boolean not null default true,
      created_at timestamptz not null default now()
    );
  `);

  await sql.unsafe(`
    create table if not exists seguimiento_registros (
      id uuid primary key default gen_random_uuid(),
      estudiante_id uuid not null references estudiantes(id) on delete cascade,
      periodo text not null,
      fecha date not null,
      docente_email text not null references usuarios_autorizados(email) on delete cascade,
      puntualidad smallint check (puntualidad between 1 and 5),
      presentacion smallint check (presentacion between 1 and 5),
      asistencia smallint check (asistencia between 1 and 5),
      responsabilidad smallint check (responsabilidad between 1 and 5),
      participacion smallint check (participacion between 1 and 5),
      comunicacion smallint check (comunicacion between 1 and 5),
      convivencia smallint check (convivencia between 1 and 5),
      conducto smallint check (conducto between 1 and 5),
      relacionamiento smallint check (relacionamiento between 1 and 5),
      pertenencia smallint check (pertenencia between 1 and 5),
      nota text,
      created_at timestamptz not null default now(),
      constraint seguimiento_registros_algun_criterio check (
        num_nonnulls(
          puntualidad, presentacion, asistencia, responsabilidad, participacion,
          comunicacion, convivencia, conducto, relacionamiento, pertenencia
        ) > 0
      )
    );
  `);

  await sql.unsafe(`create index if not exists estudiantes_docente_idx on estudiantes (docente_email);`);
  await sql.unsafe(`create index if not exists seguimiento_registros_estudiante_periodo_idx on seguimiento_registros (estudiante_id, periodo);`);
  await sql.unsafe(`create index if not exists seguimiento_registros_docente_idx on seguimiento_registros (docente_email);`);

  console.log("Listo: estudiantes y seguimiento_registros creadas (o ya existían).");
} finally {
  await sql.end();
}
