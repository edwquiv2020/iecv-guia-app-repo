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
  insert into cursos (slug, nombre) values
    ('computadores', 'Computadores'),
    ('windows-11', 'Windows 11'),
    ('inteligencia-artificial', 'Inteligencia Artificial'),
    ('word', 'Microsoft Word'),
    ('excel', 'Microsoft Excel'),
    ('powerpoint', 'Microsoft PowerPoint'),
    ('canva', 'Canva')
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

console.log("Seed inicial aplicado: jornadas, ciclos, cursos, actividades.");
await sql.end();
