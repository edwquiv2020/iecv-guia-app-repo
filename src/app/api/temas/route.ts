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

interface TemaInput {
  cursoId?: string;
  numero?: number;
  tema?: string;
  subtemas?: string;
  urlVideo?: string | null;
  archivoKahoot?: string | null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as TemaInput;
  const { cursoId, numero, tema, subtemas } = body;

  if (!cursoId || !numero || !tema?.trim() || !subtemas?.trim()) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios (curso, número, tema, subtemas)." },
      { status: 400 }
    );
  }

  try {
    const [nuevo] = await sql`
      insert into temas (curso_id, numero, tema, subtemas, url_video, archivo_kahoot)
      values (${cursoId}, ${numero}, ${tema.trim()}, ${subtemas.trim()}, ${body.urlVideo || null}, ${body.archivoKahoot || null})
      returning id, numero, tema, subtemas, url_video, archivo_kahoot
    `;
    return NextResponse.json({ tema: nuevo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("temas_curso_id_numero_key") || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: `Ya existe un tema con el número ${numero} en este curso.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No se pudo crear el tema." }, { status: 500 });
  }
}
