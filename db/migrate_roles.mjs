// Migración ADITIVA — agrega el campo `rol` a usuarios_autorizados (control
// de acceso: 'admin' puede administrar mallas, 'docente' solo leerlas).
// Mismo patrón que migrate_auth.mjs y migrate_guia_archivos.mjs. No borra ni
// toca ninguna fila existente — todas quedan en 'docente' por defecto, hay
// que promover el/los admin a mano (ver README.md).
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const migracion = `
alter table usuarios_autorizados
  add column if not exists rol text not null default 'docente'
  check (rol in ('docente', 'admin'));
`;

try {
  await sql.unsafe(migracion);
  console.log("Columna 'rol' agregada correctamente.");
} finally {
  await sql.end();
}
