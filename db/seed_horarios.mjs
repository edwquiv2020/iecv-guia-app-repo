import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

async function jornadaId(slug) {
  const [j] = await sql`select id from jornadas where slug = ${slug}`;
  if (!j) throw new Error(`No existe la jornada '${slug}' — corre db/seed.mjs primero.`);
  return j.id;
}

async function bloques(slug, filas) {
  const id = await jornadaId(slug);
  await sql`delete from horario_bloques where jornada_id = ${id}`;
  for (const f of filas) {
    await sql`
      insert into horario_bloques (jornada_id, numero_bloque, hora_inicio, hora_fin, tipo, duracion_min)
      values (${id}, ${f.numero_bloque}, ${f.hora_inicio}, ${f.hora_fin}, ${f.tipo}, ${f.duracion_min})
    `;
  }
  console.log(`${filas.length} bloques cargados para '${slug}'.`);
}

// Semanal 1: 07:40-12:00, 4 bloques de 60min, descanso 20min a las 09:40.
await bloques("semanal-1", [
  { numero_bloque: 1, hora_inicio: "07:40", hora_fin: "08:40", tipo: "clase", duracion_min: 60 },
  { numero_bloque: 2, hora_inicio: "08:40", hora_fin: "09:40", tipo: "clase", duracion_min: 60 },
  { numero_bloque: 3, hora_inicio: "09:40", hora_fin: "10:00", tipo: "descanso", duracion_min: 20 },
  { numero_bloque: 4, hora_inicio: "10:00", hora_fin: "11:00", tipo: "clase", duracion_min: 60 },
  { numero_bloque: 5, hora_inicio: "11:00", hora_fin: "12:00", tipo: "clase", duracion_min: 60 },
]);

// Sábado 1: 07:00-12:40, 9 bloques de 35min, descanso 25min a las 09:20.
await bloques("sabado-1", [
  { numero_bloque: 1, hora_inicio: "07:00", hora_fin: "07:35", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 2, hora_inicio: "07:35", hora_fin: "08:10", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 3, hora_inicio: "08:10", hora_fin: "08:45", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 4, hora_inicio: "08:45", hora_fin: "09:20", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 5, hora_inicio: "09:20", hora_fin: "09:45", tipo: "descanso", duracion_min: 25 },
  { numero_bloque: 6, hora_inicio: "09:45", hora_fin: "10:20", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 7, hora_inicio: "10:20", hora_fin: "10:55", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 8, hora_inicio: "10:55", hora_fin: "11:30", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 9, hora_inicio: "11:30", hora_fin: "12:05", tipo: "clase", duracion_min: 35 },
  { numero_bloque: 10, hora_inicio: "12:05", hora_fin: "12:40", tipo: "clase", duracion_min: 35 },
]);

// Sábado 2: 13:30-18:20, 9 bloques de 30min, descanso 20min a las 16:00.
await bloques("sabado-2", [
  { numero_bloque: 1, hora_inicio: "13:30", hora_fin: "14:00", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 2, hora_inicio: "14:00", hora_fin: "14:30", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 3, hora_inicio: "14:30", hora_fin: "15:00", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 4, hora_inicio: "15:00", hora_fin: "15:30", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 5, hora_inicio: "15:30", hora_fin: "16:00", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 6, hora_inicio: "16:00", hora_fin: "16:20", tipo: "descanso", duracion_min: 20 },
  { numero_bloque: 7, hora_inicio: "16:20", hora_fin: "16:50", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 8, hora_inicio: "16:50", hora_fin: "17:20", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 9, hora_inicio: "17:20", hora_fin: "17:50", tipo: "clase", duracion_min: 30 },
  { numero_bloque: 10, hora_inicio: "17:50", hora_fin: "18:20", tipo: "clase", duracion_min: 30 },
]);

await sql.end();
