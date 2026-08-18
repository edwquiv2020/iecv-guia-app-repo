import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface FilaHorario {
  cursoId: string | null;
  semana: number;
  guia: number;
  fecha: string; // yyyy-mm-dd
  actividadId: string;
  /** Si se pasa, se usa directo (ya se sabe qué tema se generó) en vez de resolverlo por posición en el lote. */
  temaId?: string | null;
}

export async function GET(request: NextRequest) {
  const cicloId = request.nextUrl.searchParams.get("cicloId");
  const jornadaId = request.nextUrl.searchParams.get("jornadaId");
  if (!cicloId || !jornadaId) {
    return NextResponse.json({ error: "Faltan cicloId y jornadaId." }, { status: 400 });
  }
  const filas = await sql`
    select cc.id, cc.semana_academica as semana, cc.guia_numero as guia, cc.fecha_clase as fecha,
           cc.origen, cc.curso_id, cc.tema_id, a.nombre as actividad_nombre,
           c.nombre as curso_nombre, t.numero as tema_numero, t.tema as tema_nombre,
           exists(select 1 from guias g where g.calendario_clase_id = cc.id and g.tipo = 'estandar' and g.estado = 'generada') as guia_estandar_generada,
           exists(select 1 from guias g where g.calendario_clase_id = cc.id and g.tipo = 'dua' and g.estado = 'generada') as guia_dua_generada
    from calendario_clases cc
    join actividades a on a.id = cc.actividad_id
    left join cursos c on c.id = cc.curso_id
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

  const confirmar = body?.confirmar === true;
  // 'ad_hoc' = creación al vuelo desde el generador de guías: nunca pisa una
  // fila existente (cualquiera sea su origen), solo inserta si esa semana
  // todavía no existe. No pasa por el flujo de conflictos (ese es solo para
  // cargas oficiales desde /horarios).
  const origen = body?.origen === "ad_hoc" ? "ad_hoc" : "horario";

  try {
    if (origen === "horario" && !confirmar) {
      // Si alguna semana del lote ya tiene una fila 'ad_hoc' (creada al vuelo
      // desde el generador de guías), no la sobrescribimos en silencio —
      // avisamos primero y esperamos confirmación explícita.
      const semanas = filas.map((f) => f.semana);
      const conflictos = await sql`
        select semana_academica as semana, fecha_clase as fecha, guia_numero as guia
        from calendario_clases
        where ciclo_id = ${cicloId} and jornada_id = ${jornadaId}
          and origen = 'ad_hoc' and semana_academica in ${sql(semanas)}
      `;
      if (conflictos.length > 0) {
        return NextResponse.json({ conflictos }, { status: 409 });
      }
    }

    // Posición dentro del lote, por curso, para resolver el tema en orden de
    // malla — solo cuando la fila no trae ya su temaId resuelto.
    const contadorPorCurso = new Map<string, number>();
    let filasInsertadas = 0;
    const idsPorSemana: Record<number, string> = {};

    for (const fila of filas) {
      let temaId: string | null = fila.temaId ?? null;
      if (temaId === null && fila.cursoId) {
        const posicion = (contadorPorCurso.get(fila.cursoId) ?? 0) + 1;
        contadorPorCurso.set(fila.cursoId, posicion);
        const [tema] = await sql`
          select id from temas where curso_id = ${fila.cursoId} and numero = ${posicion} and activo
        `;
        temaId = tema?.id ?? null;
      }

      if (origen === "ad_hoc") {
        const insertados = await sql`
          insert into calendario_clases (fecha_clase, semana_academica, guia_numero, ciclo_id, jornada_id, curso_id, tema_id, actividad_id, origen)
          values (${fila.fecha}, ${fila.semana}, ${fila.guia}, ${cicloId}, ${jornadaId}, ${fila.cursoId}, ${temaId}, ${fila.actividadId}, 'ad_hoc')
          on conflict (ciclo_id, jornada_id, semana_academica) do nothing
          returning id
        `;
        filasInsertadas += insertados.length;
        // Tanto si se insertó como si ya existía, resolvemos el id definitivo.
        const [fila_db] = await sql`
          select id from calendario_clases where ciclo_id = ${cicloId} and jornada_id = ${jornadaId} and semana_academica = ${fila.semana}
        `;
        if (fila_db) idsPorSemana[fila.semana] = fila_db.id;
      } else {
        const [fila_db] = await sql`
          insert into calendario_clases (fecha_clase, semana_academica, guia_numero, ciclo_id, jornada_id, curso_id, tema_id, actividad_id, origen)
          values (${fila.fecha}, ${fila.semana}, ${fila.guia}, ${cicloId}, ${jornadaId}, ${fila.cursoId}, ${temaId}, ${fila.actividadId}, 'horario')
          on conflict (ciclo_id, jornada_id, semana_academica) do update set
            fecha_clase = excluded.fecha_clase, guia_numero = excluded.guia_numero,
            curso_id = excluded.curso_id, tema_id = excluded.tema_id, actividad_id = excluded.actividad_id,
            origen = 'horario'
          returning id
        `;
        filasInsertadas += 1;
        if (fila_db) idsPorSemana[fila.semana] = fila_db.id;
      }
    }
    return NextResponse.json({ ok: true, filasGuardadas: filasInsertadas, idsPorSemana });
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
