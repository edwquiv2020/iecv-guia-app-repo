import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/auth";
import { borrarFotoEstudiante, subirFotoEstudiante, urlFirmadaFotoEstudiante } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Ficha completa de UN estudiante — precarga el formulario de edición en /estudiantes. */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { id } = await params;

  try {
    const [estudiante] = await sql`
      select id, nombre, activo, created_at,
        ciclo_id as "cicloId", jornada_id as "jornadaId", curso_id as "cursoId",
        tipo_documento as "tipoDocumento", numero_documento as "numeroDocumento",
        fecha_nacimiento as "fechaNacimiento", lugar_nacimiento as "lugarNacimiento",
        genero, direccion, telefono, eps, rh,
        acudiente_nombre as "acudienteNombre", acudiente_parentesco as "acudienteParentesco",
        acudiente_telefono as "acudienteTelefono", acudiente_direccion as "acudienteDireccion",
        foto_path as "fotoPath"
      from estudiantes
      where id = ${id} and docente_email = ${email}
    `;
    if (!estudiante) return NextResponse.json({ error: "Estudiante no encontrado." }, { status: 404 });

    const fotoUrl = estudiante.fotoPath ? await urlFirmadaFotoEstudiante(estudiante.fotoPath as string).catch(() => null) : null;
    return NextResponse.json({ estudiante: { ...estudiante, fotoUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar el estudiante.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface FichaCompletaInput {
  nombre?: string;
  cicloId?: string | null;
  jornadaId?: string | null;
  cursoId?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  fechaNacimiento?: string | null;
  lugarNacimiento?: string | null;
  genero?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  eps?: string | null;
  rh?: string | null;
  acudienteNombre?: string | null;
  acudienteParentesco?: string | null;
  acudienteTelefono?: string | null;
  acudienteDireccion?: string | null;
  /** Presente solo si el docente subió una foto nueva en este guardado. */
  fotoBase64?: string | null;
  fotoMimeType?: string | null;
  /** true = el docente pidió quitar la foto sin reemplazarla. */
  fotoEliminar?: boolean;
}

/** Guarda la ficha completa (todas las secciones del formulario de /estudiantes en un solo submit). Distinto del PATCH de abajo, que es solo para las acciones rápidas del roster de /seguimiento. */
export async function PUT(request: NextRequest, { params }: Params) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { id } = await params;

  const body = (await request.json()) as FichaCompletaInput;
  const nombre = body.nombre?.trim();
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  try {
    const [actual] = await sql`select foto_path as "fotoPath" from estudiantes where id = ${id} and docente_email = ${email}`;
    if (!actual) return NextResponse.json({ error: "Estudiante no encontrado." }, { status: 404 });

    let fotoPath = actual.fotoPath as string | null;
    if (body.fotoBase64 && body.fotoMimeType) {
      const nueva = await subirFotoEstudiante(id, body.fotoBase64, body.fotoMimeType);
      if (fotoPath) await borrarFotoEstudiante(fotoPath).catch(() => {});
      fotoPath = nueva;
    } else if (body.fotoEliminar && fotoPath) {
      await borrarFotoEstudiante(fotoPath).catch(() => {});
      fotoPath = null;
    }

    const [actualizado] = await sql`
      update estudiantes set
        nombre = ${nombre},
        ciclo_id = ${body.cicloId || null},
        jornada_id = ${body.jornadaId || null},
        curso_id = ${body.cursoId || null},
        tipo_documento = ${body.tipoDocumento || null},
        numero_documento = ${body.numeroDocumento || null},
        fecha_nacimiento = ${body.fechaNacimiento || null},
        lugar_nacimiento = ${body.lugarNacimiento || null},
        genero = ${body.genero || null},
        direccion = ${body.direccion || null},
        telefono = ${body.telefono || null},
        eps = ${body.eps || null},
        rh = ${body.rh || null},
        acudiente_nombre = ${body.acudienteNombre || null},
        acudiente_parentesco = ${body.acudienteParentesco || null},
        acudiente_telefono = ${body.acudienteTelefono || null},
        acudiente_direccion = ${body.acudienteDireccion || null},
        foto_path = ${fotoPath}
      where id = ${id} and docente_email = ${email}
      returning id, nombre, activo
    `;
    return NextResponse.json({ estudiante: actualizado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo actualizar la ficha del estudiante.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface EstudianteUpdate {
  activo?: boolean;
  nombre?: string;
  cicloId?: string | null;
  jornadaId?: string | null;
}

/**
 * Dos usos en un solo verbo, según qué trae el body: `{ activo }` solo
 * (activar/desactivar, acción de un clic) o `{ nombre, cicloId?, jornadaId? }`
 * (editar los datos del estudiante) — nunca mezclados, para no necesitar un
 * update parcial con coalesce.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { id } = await params;

  const body = (await request.json()) as EstudianteUpdate;

  try {
    let actualizado;
    if (typeof body.activo === "boolean" && body.nombre === undefined) {
      [actualizado] = await sql`
        update estudiantes set activo = ${body.activo}
        where id = ${id} and docente_email = ${email}
        returning id, nombre, activo
      `;
    } else {
      const nombre = body.nombre?.trim();
      if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
      [actualizado] = await sql`
        update estudiantes set nombre = ${nombre}, ciclo_id = ${body.cicloId || null}, jornada_id = ${body.jornadaId || null}
        where id = ${id} and docente_email = ${email}
        returning id, nombre, activo
      `;
    }
    if (!actualizado) return NextResponse.json({ error: "Estudiante no encontrado." }, { status: 404 });
    return NextResponse.json({ estudiante: actualizado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo actualizar el estudiante.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
