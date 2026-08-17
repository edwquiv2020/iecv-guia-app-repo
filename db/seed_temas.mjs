// Uso: node db/seed_temas.mjs <curso-slug> <archivo.json>
import postgres from "postgres";
import { readFile } from "node:fs/promises";

const [, , cursoSlug, archivoJson] = process.argv;
if (!cursoSlug || !archivoJson) {
  console.error("Uso: node db/seed_temas.mjs <curso-slug> <archivo.json>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const temas = JSON.parse(await readFile(archivoJson, "utf8"));

const [curso] = await sql`select id from cursos where slug = ${cursoSlug}`;
if (!curso) throw new Error(`No existe el curso '${cursoSlug}'.`);

for (const t of temas) {
  await sql`
    insert into temas (curso_id, numero, tema, subtemas, url_video, archivo_kahoot)
    values (${curso.id}, ${t.numero}, ${t.tema}, ${t.subtemas}, ${t.url_video}, ${t.archivo_kahoot})
    on conflict (curso_id, numero) do update set
      tema = excluded.tema, subtemas = excluded.subtemas,
      url_video = excluded.url_video, archivo_kahoot = excluded.archivo_kahoot
  `;
}

console.log(`${temas.length} temas cargados para '${cursoSlug}'.`);
await sql.end();
