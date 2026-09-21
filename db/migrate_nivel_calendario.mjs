// Migración ADITIVA — el nivel de la malla (básico/intermedio/avanzado) se
// elige al programar un curso en Horarios, así que cada fila del calendario
// guarda su nivel (también las de examen, que no tienen tema). Las filas
// existentes quedan como 'basico' (default), igual que las mallas que ya
// existían. No borra ni modifica ninguna fila. Compatible con el código
// anterior (la columna tiene default).
// Uso: node --env-file=.env.local db/migrate_nivel_calendario.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
try {
  await sql.unsafe(`
    alter table calendario_clases add column if not exists nivel text not null default 'basico';
    do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'calendario_clases_nivel_check') then
        alter table calendario_clases add constraint calendario_clases_nivel_check check (nivel in ('basico', 'intermedio', 'avanzado'));
      end if;
    end $$;
  `);
  console.log("calendario_clases.nivel agregado.");
  console.log(await sql`select nivel, count(*) from calendario_clases group by nivel`);
} finally {
  await sql.end();
}
