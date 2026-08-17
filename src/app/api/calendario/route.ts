import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface FilaHorario {
  cursoId: string;
  semana: number;
  guia: number;
  fecha: string; // yyyy-mm-dd
}

export async function GET(request: NextRequest) {
  const cicloId = request.nextUrl.searchParams.get("cicloId");
  const jornadaId = request.nextUrl.searchParams.get("jornadaId");
  if (!cicloId || !jornadaId) {
    return NextResponse.json({ error: "Faltan cicloId y jornadaId." }, { status: 400 });
  }
  const filas = await sql`
    select cc.id, cc.semana_academica as semana, cc.guia_numero as guia, cc.fecha_clase as fecha,
           c.nombre as curso_nombre, t.numero as tema_numero, t.tema as tema_nombre
    from calendario_clases cc
    join cursos c on c.id = cc.curso_id
    left join temas t on t.id = cc.tema_id
    where cc.ciclo_id = ${cicloId} and cc.jornada_id = ${jornadaId}
    order by cc.semana_academica
  `;
  return NextResponse.json({ filas });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const cicloId = body?.cicloId as string | undefined;
  const jornadaId = body?.jornadaId as string | undefined;
  const filas = body?.filas as FilaHorario[] | undefined;

  if (!cicloId || !jornadaId || !Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: "Faltan cicloId, jornadaId o filas." }, { status: 400 });
  }

  try {
    // Posición dentro del lote, por curso, para resolver el tema en orden de malla.
    const contadorPorCurso = new Map<string, number>();

    for (const fila of filas) {
      const posicion = (contadorPorCurso.get(fila.cursoId) ?? 0) + 1;
      contadorPorCurso.set(fila.cursoId, posicion);

      const [tema] = await sql`
        select id from temas where curso_id = ${fila.cursoId} and numero = ${posicion} and activo
      `;

      await sql`
        insert into calendario_clases (fecha_clase, semana_academica, guia_numero, ciclo_id, jornada_id, curso_id, tema_id)
        values (${fila.fecha}, ${fila.semana}, ${fila.guia}, ${cicloId}, ${jornadaId}, ${fila.cursoId}, ${tema?.id ?? null})
        on conflict (ciclo_id, jornada_id, semana_academica) do update set
          fecha_clase = excluded.fecha_clase, guia_numero = excluded.guia_numero,
          curso_id = excluded.curso_id, tema_id = excluded.tema_id
      `;
    }
    return NextResponse.json({ ok: true, filasGuardadas: filas.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido guardando el horario.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  await sql`delete from calendario_clases where id = ${id}`;
  return NextResponse.json({ ok: true });
}
