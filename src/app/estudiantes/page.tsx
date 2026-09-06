"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Fieldset, Input, Select } from "@/components/ui";
import { agruparPorAsignatura } from "@/lib/types";

interface Ciclo { id: string; nombre: string }
interface Jornada { id: string; nombre: string }
interface Curso { id: string; nombre: string; asignaturaNombre: string | null }

interface Estudiante {
  id: string;
  nombre: string;
  activo: boolean;
  cicloId: string | null;
  cicloNombre: string | null;
  jornadaId: string | null;
  jornadaNombre: string | null;
  cursoId: string | null;
  cursoNombre: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  fechaNacimiento: string | null;
  lugarNacimiento: string | null;
  genero: string | null;
  direccion: string | null;
  telefono: string | null;
  eps: string | null;
  rh: string | null;
  acudienteNombre: string | null;
  acudienteParentesco: string | null;
  acudienteTelefono: string | null;
  acudienteDireccion: string | null;
  fotoPath: string | null;
  fotoUrl: string | null;
}

function fichaVacia() {
  return {
    nombre: "",
    cicloId: "",
    jornadaId: "",
    cursoId: "",
    tipoDocumento: "",
    numeroDocumento: "",
    fechaNacimiento: "",
    lugarNacimiento: "",
    genero: "",
    direccion: "",
    telefono: "",
    eps: "",
    rh: "",
    acudienteNombre: "",
    acudienteParentesco: "",
    acudienteTelefono: "",
    acudienteDireccion: "",
  };
}

type Ficha = ReturnType<typeof fichaVacia>;

function fichaDesdeEstudiante(e: Estudiante): Ficha {
  return {
    nombre: e.nombre ?? "",
    cicloId: e.cicloId ?? "",
    jornadaId: e.jornadaId ?? "",
    cursoId: e.cursoId ?? "",
    tipoDocumento: e.tipoDocumento ?? "",
    numeroDocumento: e.numeroDocumento ?? "",
    fechaNacimiento: e.fechaNacimiento ? e.fechaNacimiento.slice(0, 10) : "",
    lugarNacimiento: e.lugarNacimiento ?? "",
    genero: e.genero ?? "",
    direccion: e.direccion ?? "",
    telefono: e.telefono ?? "",
    eps: e.eps ?? "",
    rh: e.rh ?? "",
    acudienteNombre: e.acudienteNombre ?? "",
    acudienteParentesco: e.acudienteParentesco ?? "",
    acudienteTelefono: e.acudienteTelefono ?? "",
    acudienteDireccion: e.acudienteDireccion ?? "",
  };
}

/** Lee un <input type="file"> como base64 puro (sin el prefijo "data:...;base64,") — lo que esperan las rutas API de estudiantes. */
function leerArchivoBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      const base64 = resultado.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("No se pudo leer la foto."));
    reader.readAsDataURL(file);
  });
}

// Registro de estudiantes es privado por docente, igual que /seguimiento
// (mismo roster, ver README sección "Estudiantes") — sin gate de rol aquí,
// la protección real vive en las rutas API (WHERE docente_email = sesión).
export default function EstudiantesPage() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha>(fichaVacia());
  const [guardando, setGuardando] = useState(false);

  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoMimeType, setFotoMimeType] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoEliminar, setFotoEliminar] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/catalogo").then((r) => r.json()),
      fetch("/api/estudiantes").then((r) => r.json()),
    ])
      .then(([cat, est]) => {
        setCiclos(cat.ciclos ?? []);
        setJornadas(cat.jornadas ?? []);
        setCursos(cat.cursos ?? []);
        setEstudiantes(est.estudiantes ?? []);
      })
      .catch(() => setError("No se pudo cargar la información inicial."))
      .finally(() => setCargando(false));
  }, []);

  function recargarEstudiantes() {
    fetch("/api/estudiantes")
      .then((r) => r.json())
      .then((data: { estudiantes: Estudiante[] }) => setEstudiantes(data.estudiantes ?? []));
  }

  const listaVisible = useMemo(
    () => estudiantes.filter((e) => mostrarInactivos || e.activo),
    [estudiantes, mostrarInactivos]
  );

  const cursosAgrupados = useMemo(() => agruparPorAsignatura(cursos), [cursos]);

  function limpiarFormulario() {
    setFicha(fichaVacia());
    setEditandoId(null);
    setFotoBase64(null);
    setFotoMimeType(null);
    setFotoPreview(null);
    setFotoEliminar(false);
  }

  function abrirNuevo() {
    limpiarFormulario();
    setMostrarForm(true);
    setError(null);
    setExito(null);
  }

  function abrirEdicion(e: Estudiante) {
    setFicha(fichaDesdeEstudiante(e));
    setEditandoId(e.id);
    setFotoBase64(null);
    setFotoMimeType(null);
    setFotoPreview(e.fotoUrl);
    setFotoEliminar(false);
    setMostrarForm(true);
    setError(null);
    setExito(null);
  }

  function cerrarFormulario() {
    setMostrarForm(false);
    limpiarFormulario();
  }

  async function onFotoSeleccionada(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo de la foto debe ser una imagen.");
      return;
    }
    try {
      const { base64, mimeType } = await leerArchivoBase64(file);
      setFotoBase64(base64);
      setFotoMimeType(mimeType);
      setFotoPreview(`data:${mimeType};base64,${base64}`);
      setFotoEliminar(false);
    } catch {
      setError("No se pudo leer la foto seleccionada.");
    }
  }

  function onQuitarFoto() {
    setFotoBase64(null);
    setFotoMimeType(null);
    setFotoPreview(null);
    setFotoEliminar(true);
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    const nombre = ficha.nombre.trim();
    if (!nombre) {
      setError("El nombre del estudiante es obligatorio.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        ...ficha,
        nombre,
        cicloId: ficha.cicloId || null,
        jornadaId: ficha.jornadaId || null,
        cursoId: ficha.cursoId || null,
        fechaNacimiento: ficha.fechaNacimiento || null,
      };
      if (fotoBase64 && fotoMimeType) {
        body.fotoBase64 = fotoBase64;
        body.fotoMimeType = fotoMimeType;
      }
      if (editandoId && fotoEliminar) body.fotoEliminar = true;

      const res = await fetch(editandoId ? `/api/estudiantes/${editandoId}` : "/api/estudiantes", {
        method: editandoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar la ficha del estudiante.");
        return;
      }
      setExito(editandoId ? `Ficha de ${nombre} actualizada.` : `${nombre} agregado.`);
      cerrarFormulario();
      recargarEstudiantes();
    } catch {
      setError("Error de conexión al guardar la ficha.");
    } finally {
      setGuardando(false);
    }
  }

  async function onCambiarActivo(est: Estudiante) {
    setError(null);
    try {
      const res = await fetch(`/api/estudiantes/${est.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !est.activo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar el estudiante.");
        return;
      }
      recargarEstudiantes();
    } catch {
      setError("Error de conexión al actualizar el estudiante.");
    }
  }

  if (cargando) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estudiantes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ficha de matrícula de cada estudiante: datos personales, del acudiente y académicos,
          con foto — es privado, solo tú ves y editas tus estudiantes.
        </p>
      </div>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
      {exito && <div className="mt-4"><Alert tone="success">{exito}</Alert></div>}

      <div className="mt-6 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
            className="rounded border-border"
          />
          Mostrar inactivos
        </label>
        <Button type="button" size="sm" onClick={mostrarForm ? cerrarFormulario : abrirNuevo}>
          {mostrarForm ? "Cancelar" : "+ Agregar estudiante"}
        </Button>
      </div>

      {mostrarForm && (
        <form onSubmit={onGuardar} className="mt-4 flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-medium text-foreground">
            {editandoId ? "Editar ficha del estudiante" : "Nuevo estudiante"}
          </h2>

          {/* Foto */}
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted">
              {fotoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoPreview} alt="Foto del estudiante" className="size-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">Sin foto</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onFotoSeleccionada(e.target.files?.[0])}
                className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-border/60"
              />
              {fotoPreview && (
                <button type="button" onClick={onQuitarFoto} className="w-fit text-xs text-danger underline">
                  Quitar foto
                </button>
              )}
            </div>
          </div>

          <Fieldset legend="Datos personales">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre completo" required>
                {(id) => (
                  <Input id={id} value={ficha.nombre} onChange={(e) => setFicha((f) => ({ ...f, nombre: e.target.value }))} required />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo de documento">
                  {(id) => (
                    <Select id={id} value={ficha.tipoDocumento} onChange={(e) => setFicha((f) => ({ ...f, tipoDocumento: e.target.value }))}>
                      <option value="">—</option>
                      <option value="RC">RC</option>
                      <option value="TI">TI</option>
                      <option value="CC">CC</option>
                      <option value="CE">CE</option>
                      <option value="PPT">PPT</option>
                    </Select>
                  )}
                </Field>
                <Field label="Número de documento">
                  {(id) => (
                    <Input id={id} value={ficha.numeroDocumento} onChange={(e) => setFicha((f) => ({ ...f, numeroDocumento: e.target.value }))} />
                  )}
                </Field>
              </div>
              <Field label="Fecha de nacimiento">
                {(id) => (
                  <Input id={id} type="date" value={ficha.fechaNacimiento} onChange={(e) => setFicha((f) => ({ ...f, fechaNacimiento: e.target.value }))} />
                )}
              </Field>
              <Field label="Lugar de nacimiento">
                {(id) => (
                  <Input id={id} value={ficha.lugarNacimiento} onChange={(e) => setFicha((f) => ({ ...f, lugarNacimiento: e.target.value }))} />
                )}
              </Field>
              <Field label="Género">
                {(id) => (
                  <Select id={id} value={ficha.genero} onChange={(e) => setFicha((f) => ({ ...f, genero: e.target.value }))}>
                    <option value="">—</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro">Otro</option>
                  </Select>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="EPS">
                  {(id) => <Input id={id} value={ficha.eps} onChange={(e) => setFicha((f) => ({ ...f, eps: e.target.value }))} />}
                </Field>
                <Field label="RH">
                  {(id) => (
                    <Select id={id} value={ficha.rh} onChange={(e) => setFicha((f) => ({ ...f, rh: e.target.value }))}>
                      <option value="">—</option>
                      {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((rh) => (
                        <option key={rh} value={rh}>{rh}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="Dirección">
                {(id) => <Input id={id} value={ficha.direccion} onChange={(e) => setFicha((f) => ({ ...f, direccion: e.target.value }))} />}
              </Field>
              <Field label="Teléfono / celular">
                {(id) => <Input id={id} value={ficha.telefono} onChange={(e) => setFicha((f) => ({ ...f, telefono: e.target.value }))} />}
              </Field>
            </div>
          </Fieldset>

          <Fieldset legend="Datos del acudiente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre del acudiente">
                {(id) => <Input id={id} value={ficha.acudienteNombre} onChange={(e) => setFicha((f) => ({ ...f, acudienteNombre: e.target.value }))} />}
              </Field>
              <Field label="Parentesco">
                {(id) => <Input id={id} value={ficha.acudienteParentesco} onChange={(e) => setFicha((f) => ({ ...f, acudienteParentesco: e.target.value }))} />}
              </Field>
              <Field label="Teléfono del acudiente">
                {(id) => <Input id={id} value={ficha.acudienteTelefono} onChange={(e) => setFicha((f) => ({ ...f, acudienteTelefono: e.target.value }))} />}
              </Field>
              <Field label="Dirección del acudiente">
                {(id) => <Input id={id} value={ficha.acudienteDireccion} onChange={(e) => setFicha((f) => ({ ...f, acudienteDireccion: e.target.value }))} />}
              </Field>
            </div>
          </Fieldset>

          <Fieldset legend="Datos académicos">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="CLEI">
                {(id) => (
                  <Select id={id} value={ficha.cicloId} onChange={(e) => setFicha((f) => ({ ...f, cicloId: e.target.value }))}>
                    <option value="">—</option>
                    {ciclos.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Jornada">
                {(id) => (
                  <Select id={id} value={ficha.jornadaId} onChange={(e) => setFicha((f) => ({ ...f, jornadaId: e.target.value }))}>
                    <option value="">—</option>
                    {jornadas.map((j) => (
                      <option key={j.id} value={j.id}>{j.nombre}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Curso">
                {(id) => (
                  <Select id={id} value={ficha.cursoId} onChange={(e) => setFicha((f) => ({ ...f, cursoId: e.target.value }))}>
                    <option value="">—</option>
                    {cursosAgrupados.map((grupo) => (
                      <optgroup key={grupo.asignatura} label={grupo.asignatura}>
                        {grupo.items.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={cerrarFormulario}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Agregar estudiante"}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="py-2 pr-3">Foto</th>
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Documento</th>
              <th className="py-2 pr-3">CLEI</th>
              <th className="py-2 pr-3">Jornada</th>
              <th className="py-2 pr-3">Curso</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {listaVisible.map((e) => (
              <tr key={e.id} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <div className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted">
                    {e.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.fotoUrl} alt={e.nombre} className="size-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{e.nombre.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3 font-medium text-foreground">{e.nombre}</td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {e.numeroDocumento ? `${e.tipoDocumento ?? ""} ${e.numeroDocumento}`.trim() : "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{e.cicloNombre ?? "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{e.jornadaNombre ?? "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{e.cursoNombre ?? "—"}</td>
                <td className="py-2 pr-3">
                  <Badge tone={e.activo ? "success" : "neutral"}>{e.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => abrirEdicion(e)}>Editar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onCambiarActivo(e)}>
                      {e.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {listaVisible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  No hay estudiantes {mostrarInactivos ? "" : "activos "}todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
