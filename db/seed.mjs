import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

await sql`
  insert into jornadas (slug, nombre, dias, hora_inicio, hora_fin) values
    ('semanal-1', 'Semanal 1', 'Lunes a viernes', '07:40', '12:00'),
    ('sabado-1', 'Sábado 1', 'Sábado', '07:00', '12:40'),
    ('sabado-2', 'Sábado 2', 'Sábado', '13:30', '18:20')
  on conflict (slug) do nothing
`;

await sql`
  insert into ciclos (slug, nombre, grados) values
    ('ciclo-2', 'Ciclo II', array['4°','5°']),
    ('ciclo-3', 'Ciclo III', array['6°','7°']),
    ('ciclo-4', 'Ciclo IV', array['8°','9°']),
    ('ciclo-5', 'Ciclo V', array['10°']),
    ('ciclo-6', 'Ciclo VI', array['11°'])
  on conflict (slug) do nothing
`;

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

// Los cursos (temas/módulos generables) casi todos son de Tecnología e
// Informática todavía — "Fundamentos de Matemáticas" es el primer curso de
// otra asignatura, con temas cargados vía
// `node db/seed_temas.mjs fundamentos-matematicas db/malla_fundamentos_matematicas.json`
// (esa malla es un borrador de IA: url_video/archivo_kahoot llegan en null,
// pendientes de que un humano los complete antes de usarse con estudiantes).
await sql`
  insert into cursos (slug, nombre, asignatura_id) values
    ('computadores', 'Computadores', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('windows-11', 'Windows 11', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('inteligencia-artificial', 'Inteligencia Artificial', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('word', 'Microsoft Word', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('excel', 'Microsoft Excel', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('powerpoint', 'Microsoft PowerPoint', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('canva', 'Canva', (select id from asignaturas where slug = 'tecnologia-e-informatica')),
    ('fundamentos-matematicas', 'Fundamentos de Matemáticas', (select id from asignaturas where slug = 'matematicas'))
  on conflict (slug) do nothing
`;

await sql`
  insert into actividades (nombre) values
    ('CLASES'), ('SEMANA DIAGNÓSTICO'), ('GUÍA DE REPASO'),
    ('EXAMEN INTERMEDIO'), ('EXAMEN FINAL'), ('DÍA DEL EMPRENDIMIENTO'),
    ('BIENESTAR ESTUDIANTIL'), ('DÍA DEL PROFESOR'),
    ('RACE / PLANES DE MEJORA'), ('GRADOS'), ('CLAUSURA'), ('MATRÍCULAS')
  on conflict (nombre) do nothing
`;

console.log("Seed inicial aplicado: jornadas, ciclos, asignaturas, cursos, actividades.");
await sql.end();
