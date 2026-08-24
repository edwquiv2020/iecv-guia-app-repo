import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TemaUpdateInput {
  numero?: number;
  tema?: string;
  subtemas?: string;
  urlVideo?: string | null;
  archivoKahoot?: string | null;
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as TemaUpdateInput;
  const { numero, tema, subtemas } = body;

  if (!numero || !tema?.trim() || !subtemas?.trim()) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios (número, tema, subtemas)." },
      { status: 400 }
    );
  }

  try {
    const [actualizado] = await sql`
      update temas
      set numero = ${numero},
          tema = ${tema.trim()},
          subtemas = ${subtemas.trim()},
          url_video = ${body.urlVideo || null},
          archivo_kahoot = ${body.archivoKahoot || null}
      where id = ${id} and activo
      returning id, numero, tema, subtemas, url_video, archivo_kahoot
    `;
    if (!actualizado) {
      return NextResponse.json({ error: "Tema no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ tema: actualizado });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("temas_curso_id_numero_key") || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: `Ya existe otro tema con el número ${numero} en este curso.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No se pudo actualizar el tema." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const [eliminado] = await sql`
    update temas set activo = false where id = ${id} and activo
    returning id
  `;
  if (!eliminado) {
    return NextResponse.json({ error: "Tema no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
