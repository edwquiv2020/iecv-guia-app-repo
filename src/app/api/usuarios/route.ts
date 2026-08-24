import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/** Lista completa de docentes autorizados — solo admin puede ver/gestionar esta tabla. */
export async function GET() {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin." }, { status: 403 });
  }

  const usuarios = await sql`
    select email, nombre, activo, rol, created_at
    from usuarios_autorizados
    order by created_at
  `;
  return NextResponse.json({ usuarios });
}

interface UsuarioInput {
  email?: string;
  nombre?: string | null;
  rol?: "docente" | "admin";
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

  try {
    const [nuevo] = await sql`
      insert into usuarios_autorizados (email, nombre, rol)
      values (${email}, ${body.nombre?.trim() || null}, ${rol})
      returning email, nombre, activo, rol, created_at
    `;
    return NextResponse.json({ usuario: nuevo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("usuarios_autorizados_pkey") || message.includes("duplicate key")) {
      return NextResponse.json({ error: `Ya existe un docente con el correo ${email}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el docente." }, { status: 500 });
  }
}
