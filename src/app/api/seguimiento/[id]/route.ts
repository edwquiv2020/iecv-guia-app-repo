import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Corregir un registro de clase equivocado es borrarlo y crear uno nuevo — no hay edición in-place (ver README). */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { id } = await params;

  try {
    const [borrado] = await sql`
      delete from seguimiento_registros r using estudiantes e
      where r.id = ${id} and r.estudiante_id = e.id and e.docente_email = ${email}
      returning r.id
    `;
    if (!borrado) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar el registro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
