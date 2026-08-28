import { NextRequest, NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/** Lista completa de docentes autorizados — solo admin puede ver/gestionar esta tabla. */
export async function GET() {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  try {
    // Solo lectura — un reintento es seguro (ver conReintento en lib/db.ts).
    const usuarios = await conReintento(() => sql`
      select
        u.email, u.nombre, u.activo, u.rol, u.created_at,
        coalesce(array_agg(da.asignatura_id) filter (where da.asignatura_id is not null), '{}') as "asignaturaIds"
      from usuarios_autorizados u
      left join docente_asignaturas da on da.email = u.email
      group by u.email, u.nombre, u.activo, u.rol, u.created_at
      order by u.created_at
    `);
    return NextResponse.json({ usuarios });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido cargando los docentes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface UsuarioInput {
  email?: string;
  nombre?: string | null;
  rol?: "docente" | "admin";
  asignaturaIds?: string[];
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const body = (await request.json()) as UsuarioInput;
  const email = body.email?.trim().toLowerCase();
  const rol = body.rol === "admin" ? "admin" : "docente";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
  }

  const asignaturaIds = body.asignaturaIds ?? [];

  try {
    const [nuevo] = await sql`
      insert into usuarios_autorizados (email, nombre, rol)
      values (${email}, ${body.nombre?.trim() || null}, ${rol})
      returning email, nombre, activo, rol, created_at
    `;
    if (asignaturaIds.length > 0) {
      await sql`
        insert into docente_asignaturas (email, asignatura_id)
        select ${email}, unnest(${asignaturaIds}::uuid[])
      `;
    }
    return NextResponse.json({ usuario: { ...nuevo, asignaturaIds } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("usuarios_autorizados_pkey") || message.includes("duplicate key")) {
      return NextResponse.json({ error: `Ya existe un docente con el correo ${email}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el docente." }, { status: 500 });
  }
}
