import { NextRequest, NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";
import { auth } from "@/auth";
import { COLUMNAS_CRITERIOS } from "@/lib/seguimiento";

export const dynamic = "force-dynamic";

/** Historial completo de un estudiante (todas sus clases registradas), más reciente primero. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const estudianteId = new URL(request.url).searchParams.get("estudianteId");
  if (!estudianteId) return NextResponse.json({ error: "Falta estudianteId." }, { status: 400 });

  try {
    const registros = await conReintento(() => sql`
      select r.* from seguimiento_registros r
      join estudiantes e on e.id = r.estudiante_id
      where r.estudiante_id = ${estudianteId} and e.docente_email = ${email}
      order by r.fecha desc, r.created_at desc
    `);
    return NextResponse.json({ registros });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido cargando el historial.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface RegistroInput {
  estudianteId?: string;
  periodo?: string;
  fecha?: string;
  nota?: string;
  puntualidad?: unknown;
  presentacion?: unknown;
  asistencia?: unknown;
  responsabilidad?: unknown;
  participacion?: unknown;
  comunicacion?: unknown;
  convivencia?: unknown;
  conducto?: unknown;
  relacionamiento?: unknown;
  pertenencia?: unknown;
}

function criterioValido(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null;
  if (n == null || !Number.isFinite(n)) return null;
  const redondeado = Math.round(n);
  return redondeado >= 1 && redondeado <= 5 ? redondeado : null;
}

/** Guarda UN registro de clase (puede traer solo algunos de los 10 criterios — es el flujo normal, "una clase a la vez"). */
export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = (await request.json()) as RegistroInput;
  const estudianteId = body.estudianteId;
  const periodo = body.periodo?.trim();
  const fecha = body.fecha;
  if (!estudianteId || !periodo || !fecha) {
    return NextResponse.json({ error: "Faltan estudianteId, periodo o fecha." }, { status: 400 });
  }

  const valores: Record<string, number | null> = {};
  for (const id of COLUMNAS_CRITERIOS) {
    valores[id] = criterioValido((body as Record<string, unknown>)[id]);
  }
  if (!Object.values(valores).some((v) => v != null)) {
    return NextResponse.json({ error: "Califica al menos un criterio antes de guardar." }, { status: 400 });
  }

  try {
    const [propio] = await sql`select 1 from estudiantes where id = ${estudianteId} and docente_email = ${email}`;
    if (!propio) return NextResponse.json({ error: "Estudiante no encontrado." }, { status: 404 });

    const [nuevo] = await sql`
      insert into seguimiento_registros (
        estudiante_id, periodo, fecha, docente_email, nota,
        puntualidad, presentacion, asistencia, responsabilidad, participacion,
        comunicacion, convivencia, conducto, relacionamiento, pertenencia
      ) values (
        ${estudianteId}, ${periodo}, ${fecha}, ${email}, ${body.nota?.trim() || null},
        ${valores.puntualidad}, ${valores.presentacion}, ${valores.asistencia}, ${valores.responsabilidad}, ${valores.participacion},
        ${valores.comunicacion}, ${valores.convivencia}, ${valores.conducto}, ${valores.relacionamiento}, ${valores.pertenencia}
      )
      returning *
    `;
    return NextResponse.json({ registro: nuevo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el registro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
