import { createClient } from "@supabase/supabase-js";

function crearClienteSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

declare global {
  var _supabaseStorage: ReturnType<typeof crearClienteSupabase> | undefined;
}

// Cliente server-side (service_role) para el bucket privado donde se
// guardan los binarios reales de guías/exámenes generados — nunca se usa
// desde el navegador, solo desde rutas API.
//
// Perezoso a propósito (se crea en el primer uso real, no al cargar el
// módulo): Next.js importa las rutas API durante `next build` para
// recolectar metadata de las páginas, y createClient() de Supabase lanza
// de inmediato si la URL viene vacía — en un build de Docker las env vars
// de Railway solo están disponibles en runtime, no durante `npm run
// build`, así que instanciar el cliente a nivel de módulo rompía el build.
function supabase() {
  if (global._supabaseStorage) return global._supabaseStorage;
  const cliente = crearClienteSupabase();
  if (process.env.NODE_ENV !== "production") global._supabaseStorage = cliente;
  return cliente;
}

export const BUCKET_GUIAS = "guia-archivos";

function mimeTypePorNombre(nombre: string): string {
  return nombre.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

/** Sube un archivo generado (base64) al bucket, bajo `{tipo}/{guiaId}/{nombre}`. */
export async function subirArchivoGuia(
  guiaId: string,
  tipo: string,
  nombre: string,
  contenidoBase64: string
): Promise<{ storagePath: string; mimeType: string }> {
  const storagePath = `${tipo}/${guiaId}/${nombre}`;
  const bytes = Buffer.from(contenidoBase64, "base64");
  const mimeType = mimeTypePorNombre(nombre);
  const { error } = await supabase().storage.from(BUCKET_GUIAS).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Error subiendo ${nombre} a Storage: ${error.message}`);
  return { storagePath, mimeType };
}

/** Borra todos los archivos previos de una guía (por si se regenera) antes de subir los nuevos. */
export async function borrarArchivosPrevios(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase().storage.from(BUCKET_GUIAS).remove(paths);
  if (error) throw new Error(`Error borrando archivos previos de Storage: ${error.message}`);
}

/** Signed URL de corta duración para descargar un archivo guardado, forzando el nombre original. */
export async function signedUrlArchivoGuia(storagePath: string, nombreArchivo: string): Promise<string> {
  const { data, error } = await supabase().storage.from(BUCKET_GUIAS).createSignedUrl(storagePath, 60, { download: nombreArchivo });
  if (error || !data) throw new Error(`Error generando signed URL: ${error?.message}`);
  return data.signedUrl;
}

// Fotos de estudiantes (ficha de matrícula, ver /estudiantes) — bucket
// aparte de BUCKET_GUIAS por ser datos personales de menores de edad, no
// contenido pedagógico. El bucket debe crearse manualmente una vez en el
// dashboard de Supabase (Storage → New bucket → "fotos-estudiantes",
// privado) antes de usar esta función — igual que guia-archivos, este
// proyecto no crea buckets por código.
export const BUCKET_FOTOS_ESTUDIANTES = "fotos-estudiantes";

function extensionPorMime(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg"; // image/jpeg y cualquier otro caso por defecto
}

/** Sube la foto de un estudiante (base64) bajo `{estudianteId}/{timestamp}.{ext}` — el nombre único evita el caché de un signed URL viejo al reemplazar la foto. */
export async function subirFotoEstudiante(
  estudianteId: string,
  contenidoBase64: string,
  mimeType: string
): Promise<string> {
  const storagePath = `${estudianteId}/${Date.now()}.${extensionPorMime(mimeType)}`;
  const bytes = Buffer.from(contenidoBase64, "base64");
  const { error } = await supabase().storage.from(BUCKET_FOTOS_ESTUDIANTES).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Error subiendo la foto a Storage: ${error.message}`);
  return storagePath;
}

/** Borra la foto anterior de un estudiante (al reemplazarla o al eliminar el estudiante). No falla el flujo si ya no existe. */
export async function borrarFotoEstudiante(storagePath: string): Promise<void> {
  const { error } = await supabase().storage.from(BUCKET_FOTOS_ESTUDIANTES).remove([storagePath]);
  if (error) throw new Error(`Error borrando la foto anterior de Storage: ${error.message}`);
}

/** Signed URL de corta duración para mostrar la foto en el navegador (no fuerza descarga). */
export async function urlFirmadaFotoEstudiante(storagePath: string): Promise<string> {
  const { data, error } = await supabase().storage.from(BUCKET_FOTOS_ESTUDIANTES).createSignedUrl(storagePath, 3600);
  if (error || !data) throw new Error(`Error generando signed URL de la foto: ${error?.message}`);
  return data.signedUrl;
}
