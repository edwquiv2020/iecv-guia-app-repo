import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listarArchivosDrive } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";

/** Lista los archivos tipo hoja de cálculo en 01_MALLAS_CONTENIDO/, para que el admin elija cuál sincronizar. */
export async function GET() {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  try {
    const archivos = await listarArchivosDrive();
    return NextResponse.json({ archivos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido listando archivos de Drive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
