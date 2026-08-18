import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Registra (o marca manualmente) que una guía Estándar/DUA ya existe para una semana del calendario. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const calendarioClaseId = body?.calendarioClaseId as string | undefined;
  const tipo = body?.tipo as "estandar" | "dua" | undefined;
  const archivoPath = (body?.archivoPath as string | undefined) ?? null;

  if (!calendarioClaseId || (tipo !== "estandar" && tipo !== "dua")) {
    return NextResponse.json({ error: "Faltan calendarioClaseId o tipo." }, { status: 400 });
  }

  await sql`
    insert into guias (calendario_clase_id, tipo, estado, archivo_path, generado_en)
    values (${calendarioClaseId}, ${tipo}, 'generada', ${archivoPath}, now())
    on conflict (calendario_clase_id, tipo) do update set
      estado = 'generada', archivo_path = excluded.archivo_path, generado_en = now()
  `;
  return NextResponse.json({ ok: true });
}

/** Desmarca una guía (vuelve a quedar como pendiente) — la elimina del registro. */
export async function DELETE(request: NextRequest) {
  const calendarioClaseId = request.nextUrl.searchParams.get("calendarioClaseId");
  const tipo = request.nextUrl.searchParams.get("tipo");
  if (!calendarioClaseId || !tipo) {
    return NextResponse.json({ error: "Faltan calendarioClaseId o tipo." }, { status: 400 });
  }
  await sql`delete from guias where calendario_clase_id = ${calendarioClaseId} and tipo = ${tipo}`;
  return NextResponse.json({ ok: true });
}
