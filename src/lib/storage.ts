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
