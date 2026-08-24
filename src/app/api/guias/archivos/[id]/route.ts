import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { signedUrlArchivoGuia } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Descarga un archivo guardado — redirige a una signed URL de corta duración de Supabase Storage. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [archivo] = await sql`select storage_path, nombre_archivo from guia_archivos where id = ${id}`;
  if (!archivo) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });

  try {
    const url = await signedUrlArchivoGuia(archivo.storage_path as string, archivo.nombre_archivo as string);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error generando el link de descarga.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
