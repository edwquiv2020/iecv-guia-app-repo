import postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

const schema = await readFile(path.join(__dirname, "schema.sql"), "utf8");

try {
  await sql.unsafe(schema);
  console.log("Esquema aplicado correctamente.");
} finally {
  await sql.end();
}
