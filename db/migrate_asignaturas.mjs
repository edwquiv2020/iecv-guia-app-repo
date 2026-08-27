// Migración ADITIVA — corrige el modelo introducido por la (ya retirada)
// migrate_docente_cursos.mjs: lo que se llamaba "asignaturas" ahí en
// realidad eran temas/módulos de Tecnología e Informática (Canva, Excel,
// Word...), no asignaturas reales (Español, Inglés, Matemáticas...).
//
// Esta migración:
//   1. crea `asignaturas` (catálogo real: Español, Inglés, Matemáticas...)
//   2. agrega `cursos.asignatura_id` y lo llena con "Tecnología e
//      Informática" para todos los cursos existentes (hoy todos lo son)
//   3. elimina `docente_cursos` (quedó vacía, nunca se usó en producción)
//      y crea `docente_asignaturas` en su lugar
//
// No borra ni toca ninguna fila de usuarios_autorizados, cursos, ni ningún
// otro catálogo — solo agrega columnas/tablas nuevas y backfillea la
// columna nueva.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

try {
  await sql.unsafe(`
    create table if not exists asignaturas (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      nombre text not null,
      activa boolean not null default true,
      created_at timestamptz not null default now()
    );
  `);

  await sql`
    insert into asignaturas (slug, nombre) values
      ('espanol', 'Español'),
      ('ingles', 'Inglés'),
      ('matematicas', 'Matemáticas'),
      ('fisica', 'Física'),
      ('quimica', 'Química'),
      ('biologia', 'Biología'),
      ('ciencias-sociales', 'Ciencias Sociales'),
      ('etica-y-valores', 'Ética y Valores'),
      ('educacion-religiosa', 'Educación Religiosa'),
      ('educacion-fisica', 'Educación Física'),
      ('educacion-artistica', 'Educación Artística'),
      ('filosofia', 'Filosofía'),
      ('tecnologia-e-informatica', 'Tecnología e Informática')
    on conflict (slug) do nothing
  `;

  await sql.unsafe(`
    alter table cursos add column if not exists asignatura_id uuid references asignaturas(id);
  `);

  const [{ id: tecnologiaId }] = await sql`
    select id from asignaturas where slug = 'tecnologia-e-informatica'
  `;
  const backfill = await sql`
    update cursos set asignatura_id = ${tecnologiaId} where asignatura_id is null
  `;

  await sql.unsafe(`drop table if exists docente_cursos cascade;`);

  await sql.unsafe(`
    create table if not exists docente_asignaturas (
      email text not null references usuarios_autorizados(email) on delete cascade,
      asignatura_id uuid not null references asignaturas(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (email, asignatura_id)
    );
  `);

  console.log(`Listo: asignaturas creadas/seedeadas, ${backfill.count} curso(s) asociados a Tecnología e Informática, docente_cursos reemplazada por docente_asignaturas.`);
} finally {
  await sql.end();
}
