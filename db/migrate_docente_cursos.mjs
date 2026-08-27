// Migración ADITIVA — agrega la tabla docente_cursos (qué asignaturas puede
// generar cada docente). Mismo patrón que migrate_roles.mjs. No borra ni
// toca ninguna fila existente; todos los docentes quedan sin asignaturas
// asignadas hasta que un admin las asigne desde /admin/usuarios.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const migracion = `
create table if not exists docente_cursos (
  email text not null references usuarios_autorizados(email) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email, curso_id)
);
`;

try {
  await sql.unsafe(migracion);
  console.log("Tabla 'docente_cursos' creada correctamente.");
} finally {
  await sql.end();
}
