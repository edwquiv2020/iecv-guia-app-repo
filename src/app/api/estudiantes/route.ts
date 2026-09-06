import { NextRequest, NextResponse } from "next/server";
import { sql, conReintento } from "@/lib/db";
import { auth } from "@/auth";
import { subirFotoEstudiante, urlFirmadaFotoEstudiante } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Roster del docente autenticado, con la ficha completa (ver README, sección "Estudiantes") — privado por docente, igual que /seguimiento. */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  try {
    const estudiantes = await conReintento(() => sql`
      select e.id, e.nombre, e.activo, e.created_at,
        c.id as "cicloId", c.nombre as "cicloNombre",
        j.id as "jornadaId", j.nombre as "jornadaNombre",
        cu.id as "cursoId", cu.nombre as "cursoNombre",
        e.tipo_documento as "tipoDocumento", e.numero_documento as "numeroDocumento",
        e.fecha_nacimiento as "fechaNacimiento", e.lugar_nacimiento as "lugarNacimiento",
        e.genero, e.direccion, e.telefono, e.eps, e.rh,
        e.acudiente_nombre as "acudienteNombre", e.acudiente_parentesco as "acudienteParentesco",
        e.acudiente_telefono as "acudienteTelefono", e.acudiente_direccion as "acudienteDireccion",
        e.foto_path as "fotoPath"
      from estudiantes e
      left join ciclos c on c.id = e.ciclo_id
      left join jornadas j on j.id = e.jornada_id
      left join cursos cu on cu.id = e.curso_id
      where e.docente_email = ${email}
      order by e.nombre
    `);

    // Signed URLs cortas (1h) solo para quien tenga foto — en paralelo, no
    // bloquea el listado si una falla (foto borrada a mano del bucket, etc.).
    const conFoto = await Promise.all(
      estudiantes.map(async (est) => {
        if (!est.fotoPath) return { ...est, fotoUrl: null };
        try {
          const fotoUrl = await urlFirmadaFotoEstudiante(est.fotoPath as string);
          return { ...est, fotoUrl };
        } catch {
          return { ...est, fotoUrl: null };
        }
      })
    );

    return NextResponse.json({ estudiantes: conFoto });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido cargando los estudiantes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface EstudianteInput {
  nombre?: string;
  cicloId?: string | null;
  jornadaId?: string | null;
  cursoId?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  fechaNacimiento?: string | null; // yyyy-mm-dd
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
  /** Foto opcional, tal como la entrega un <input type="file"> leído con FileReader.readAsDataURL en el cliente (ya sin el prefijo "data:...;base64,"). */
  fotoBase64?: string | null;
  fotoMimeType?: string | null;
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
      insert into estudiantes (
        nombre, ciclo_id, jornada_id, curso_id, docente_email,
        tipo_documento, numero_documento, fecha_nacimiento, lugar_nacimiento, genero,
        direccion, telefono, eps, rh,
        acudiente_nombre, acudiente_parentesco, acudiente_telefono, acudiente_direccion
      )
      values (
        ${nombre}, ${body.cicloId || null}, ${body.jornadaId || null}, ${body.cursoId || null}, ${email},
        ${body.tipoDocumento || null}, ${body.numeroDocumento || null}, ${body.fechaNacimiento || null}, ${body.lugarNacimiento || null}, ${body.genero || null},
        ${body.direccion || null}, ${body.telefono || null}, ${body.eps || null}, ${body.rh || null},
        ${body.acudienteNombre || null}, ${body.acudienteParentesco || null}, ${body.acudienteTelefono || null}, ${body.acudienteDireccion || null}
      )
      returning id, nombre, activo, created_at
    `;

    // La foto va después del insert (necesita el id del estudiante para la
    // ruta en Storage) — si falla la subida, el estudiante ya quedó creado
    // sin foto en vez de perderse todo el formulario.
    if (body.fotoBase64 && body.fotoMimeType) {
      const fotoPath = await subirFotoEstudiante(nuevo.id, body.fotoBase64, body.fotoMimeType);
      await sql`update estudiantes set foto_path = ${fotoPath} where id = ${nuevo.id}`;
    }

    return NextResponse.json({ estudiante: nuevo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el estudiante.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
