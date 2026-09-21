// Niveles de malla (básico / intermedio / avanzado): un mismo curso puede
// tener varias mallas. Se hace en DOS fases para no romper la app en medio del
// despliegue:
//   fase 1 (ADITIVA, por defecto): agrega temas.nivel (default 'basico', así
//     las mallas existentes quedan como nivel básico) y un índice único nuevo
//     (curso_id, nivel, numero). La restricción vieja (curso_id, numero) sigue,
//     así que el código anterior sigue funcionando.
//   fase 2 (--fase=2, DESPUÉS de desplegar el código nuevo): quita la
//     restricción vieja, que impediría repetir un número en otro nivel.
// No borra ni modifica ninguna fila existente.
// Uso: node --env-file=.env.local db/migrate_niveles.mjs [--fase=2]
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
const fase2 = process.argv.includes("--fase=2");

try {
  if (!fase2) {
    await sql.unsafe(`
      alter table temas add column if not exists nivel text not null default 'basico';
      do $$ begin
        if not exists (select 1 from pg_constraint where conname = 'temas_nivel_check') then
          alter table temas add constraint temas_nivel_check check (nivel in ('basico', 'intermedio', 'avanzado'));
        end if;
      end $$;
      create unique index if not exists temas_curso_nivel_numero_key on temas (curso_id, nivel, numero);
    `);
    console.log("Fase 1 aplicada: temas.nivel + índice único (curso_id, nivel, numero).");
  } else {
    await sql.unsafe(`alter table temas drop constraint if exists temas_curso_id_numero_key;`);
    console.log("Fase 2 aplicada: restricción vieja (curso_id, numero) eliminada.");
  }
  console.log(await sql`select nivel, count(*) from temas group by nivel`);
} finally {
  await sql.end();
}
