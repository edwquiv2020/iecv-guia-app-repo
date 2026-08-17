import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cursoId = request.nextUrl.searchParams.get("cursoId");
  if (!cursoId) {
    return NextResponse.json({ error: "Falta cursoId." }, { status: 400 });
  }
  const temas = await sql`
    select id, numero, tema, subtemas, url_video, archivo_kahoot
    from temas
    where curso_id = ${cursoId} and activo
    order by numero
  `;
  return NextResponse.json({ temas });
}
