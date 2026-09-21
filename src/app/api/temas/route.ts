import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { esNivel } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cursoId = request.nextUrl.searchParams.get("cursoId");
  if (!cursoId) {
    return NextResponse.json({ error: "Falta cursoId." }, { status: 400 });
  }
  // Sin ?nivel= se devuelve la malla básica (la de siempre): los flujos de
  // guías, exámenes y calendario siguen leyendo exactamente lo mismo que antes.
  const nivelParam = request.nextUrl.searchParams.get("nivel") ?? "basico";
  if (!esNivel(nivelParam)) {
    return NextResponse.json({ error: "Nivel inválido." }, { status: 400 });
  }
  const temas = await sql`
    select id, numero, tema, subtemas, url_video, archivo_kahoot
    from temas
    where curso_id = ${cursoId} and nivel = ${nivelParam} and activo
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
  nivel?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const body = (await request.json()) as TemaInput;
  const { cursoId, numero, tema, subtemas } = body;
  const nivel = body.nivel ?? "basico";
  if (!esNivel(nivel)) {
    return NextResponse.json({ error: "Nivel inválido." }, { status: 400 });
  }

  if (!cursoId || !numero || !tema?.trim() || !subtemas?.trim()) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios (curso, número, tema, subtemas)." },
      { status: 400 }
    );
  }

  try {
    const [nuevo] = await sql`
      insert into temas (curso_id, nivel, numero, tema, subtemas, url_video, archivo_kahoot)
      values (${cursoId}, ${nivel}, ${numero}, ${tema.trim()}, ${subtemas.trim()}, ${body.urlVideo || null}, ${body.archivoKahoot || null})
      returning id, numero, tema, subtemas, url_video, archivo_kahoot
    `;
    return NextResponse.json({ tema: nuevo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("temas_curso_nivel_numero_key") || message.includes("temas_curso_id_numero_key") || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: `Ya existe un tema con el número ${numero} en este curso y nivel.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No se pudo crear el tema." }, { status: 500 });
  }
}
