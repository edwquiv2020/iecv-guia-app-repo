import { NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Todo lo que necesita la pantalla del lote de Intermedios en UNA sola
 * respuesta: las semanas "EXAMEN INTERMEDIO" de todos los ciclos y jornadas,
 * y todas las combinaciones ciclo × jornada (para avisar cuáles no tienen
 * Intermedio programado). Pedir el calendario ciclo por ciclo, en paralelo,
 * saturaba la conexión a la base (timeouts de 8 s) — por eso va junto.
 */
export async function GET() {
  try {
    const [filas, combos] = await conReintento(() =>
      Promise.all([
        sql`
          select cc.id, cc.semana_academica as semana, cc.fecha_clase as fecha, cc.nivel,
                 cc.curso_id, cu.nombre as curso_nombre,
                 ci.id as ciclo_id, ci.nombre as ciclo_nombre, ci.grados as ciclo_grados,
                 j.id as jornada_id, j.nombre as jornada_nombre, j.dias as jornada_dias,
                 exists(select 1 from guias g where g.calendario_clase_id = cc.id and g.tipo = 'intermedio' and g.estado = 'generada') as examen_generado
          from calendario_clases cc
          join actividades a on a.id = cc.actividad_id
          join ciclos ci on ci.id = cc.ciclo_id
          join jornadas j on j.id = cc.jornada_id
          left join cursos cu on cu.id = cc.curso_id
          where a.nombre = 'EXAMEN INTERMEDIO' and ci.activo
          order by ci.nombre, j.nombre, cc.semana_academica
        `,
        sql`
          select ci.id as ciclo_id, ci.nombre as ciclo_nombre, j.id as jornada_id, j.nombre as jornada_nombre
          from ciclos ci cross join jornadas j
          where ci.activo and j.activa
          order by ci.nombre, j.nombre
        `,
      ])
    );
    return NextResponse.json({ filas, combos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cargando los exámenes Intermedios programados.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
