import { NextRequest, NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";
import { auth } from "@/auth";
import { agregarRegistros } from "@/lib/seguimiento";

export const dynamic = "force-dynamic";

interface FilaResumen {
  estudianteId: string;
  nombre: string;
  activo: boolean;
  cicloNombre: string | null;
  jornadaNombre: string | null;
  filas: Record<string, unknown>[];
}

/**
 * Nota definitiva de cada estudiante para UN período — agrega todos los
 * registros de clase de ese período (ver agregarRegistros en
 * src/lib/seguimiento.ts). Usada tanto por el panel de /seguimiento como
 * por la exportación a CSV: trae también las filas crudas por estudiante
 * (`registros`) para que el CSV de detalle no necesite otra consulta.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const periodo = new URL(request.url).searchParams.get("periodo");
  if (!periodo) return NextResponse.json({ error: "Falta periodo." }, { status: 400 });

  try {
    const filas = (await conReintento(() => sql`
      select e.id as "estudianteId", e.nombre, e.activo,
        c.nombre as "cicloNombre", j.nombre as "jornadaNombre",
        r.id as "registroId", r.*
      from estudiantes e
      left join ciclos c on c.id = e.ciclo_id
      left join jornadas j on j.id = e.jornada_id
      left join seguimiento_registros r on r.estudiante_id = e.id and r.periodo = ${periodo}
      where e.docente_email = ${email}
      order by e.nombre, r.fecha
    `)) as Record<string, unknown>[];

    const porEstudiante = new Map<string, FilaResumen>();
    for (const fila of filas) {
      const key = fila.estudianteId as string;
      let entrada = porEstudiante.get(key);
      if (!entrada) {
        entrada = {
          estudianteId: key,
          nombre: fila.nombre as string,
          activo: fila.activo as boolean,
          cicloNombre: (fila.cicloNombre as string | null) ?? null,
          jornadaNombre: (fila.jornadaNombre as string | null) ?? null,
          filas: [],
        };
        porEstudiante.set(key, entrada);
      }
      if (fila.registroId) entrada.filas.push(fila);
    }

    const resumen = [...porEstudiante.values()].map((e) => ({
      estudianteId: e.estudianteId,
      nombre: e.nombre,
      activo: e.activo,
      cicloNombre: e.cicloNombre,
      jornadaNombre: e.jornadaNombre,
      agregado: agregarRegistros(e.filas),
      registros: e.filas,
    }));

    return NextResponse.json({ periodo, resumen });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido calculando el resumen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
