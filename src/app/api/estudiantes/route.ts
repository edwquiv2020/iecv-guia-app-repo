import { NextRequest, NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/** Roster del docente autenticado — el seguimiento es privado por docente (ver README, sección "Seguimiento de estudiantes"). */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  try {
    const estudiantes = await conReintento(() => sql`
      select e.id, e.nombre, e.activo, e.created_at,
        c.id as "cicloId", c.nombre as "cicloNombre",
        j.id as "jornadaId", j.nombre as "jornadaNombre"
      from estudiantes e
      left join ciclos c on c.id = e.ciclo_id
      left join jornadas j on j.id = e.jornada_id
      where e.docente_email = ${email}
      order by e.nombre
    `);
    return NextResponse.json({ estudiantes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido cargando los estudiantes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface EstudianteInput {
  nombre?: string;
  cicloId?: string | null;
  jornadaId?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = (await request.json()) as EstudianteInput;
  const nombre = body.nombre?.trim();
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  try {
    const [nuevo] = await sql`
      insert into estudiantes (nombre, ciclo_id, jornada_id, docente_email)
      values (${nombre}, ${body.cicloId || null}, ${body.jornadaId || null}, ${email})
      returning id, nombre, activo, created_at
    `;
    return NextResponse.json({ estudiante: nuevo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el estudiante.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
