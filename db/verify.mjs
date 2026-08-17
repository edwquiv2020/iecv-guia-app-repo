import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const counts = await sql`
  select 'jornadas' as tabla, count(*) from jornadas
  union all select 'horario_bloques', count(*) from horario_bloques
  union all select 'ciclos', count(*) from ciclos
  union all select 'cursos', count(*) from cursos
  union all select 'curso_ciclos', count(*) from curso_ciclos
  union all select 'temas', count(*) from temas
  union all select 'calendario_clases', count(*) from calendario_clases
  union all select 'guias', count(*) from guias
`;
console.table(counts);
await sql.end();
