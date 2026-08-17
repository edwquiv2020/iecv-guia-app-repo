import postgres from "postgres";
import { readFile } from "node:fs/promises";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const temas = JSON.parse(await readFile(new URL("./malla_computadores.json", import.meta.url), "utf8"));

const [curso] = await sql`select id from cursos where slug = 'computadores'`;
if (!curso) throw new Error("No existe el curso 'computadores' — corre db/seed.mjs primero.");

for (const t of temas) {
  await sql`
    insert into temas (curso_id, numero, tema, subtemas, url_video, archivo_kahoot)
    values (${curso.id}, ${t.numero}, ${t.tema}, ${t.subtemas}, ${t.url_video}, ${t.archivo_kahoot})
    on conflict (curso_id, numero) do update set
      tema = excluded.tema, subtemas = excluded.subtemas,
      url_video = excluded.url_video, archivo_kahoot = excluded.archivo_kahoot
  `;
}

console.log(`${temas.length} temas cargados para 'computadores'.`);
await sql.end();
