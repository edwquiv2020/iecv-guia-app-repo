import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listarPestanas } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";

/** Pestañas de un archivo de Drive — la UI solo muestra el selector de pestaña cuando hay más de una. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const { fileId } = await ctx.params;
  try {
    const pestanas = await listarPestanas(fileId);
    return NextResponse.json({ pestanas });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido leyendo las pestañas del archivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
