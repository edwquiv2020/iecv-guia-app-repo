"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Fieldset, Input, Select } from "@/components/ui";

interface Asignatura {
  id: string;
  slug: string;
  nombre: string;
  activa: boolean;
  cursosActivos: number;
}

interface Curso {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  asignaturaId: string | null;
  asignaturaNombre: string | null;
  temas: number;
}

async function llamar(url: string, metodo: "POST" | "PUT", cuerpo: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export default function CatalogoEditor() {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Asignaturas
  const [nuevaAsignatura, setNuevaAsignatura] = useState("");
  const [editandoAsignaturaId, setEditandoAsignaturaId] = useState<string | null>(null);
  const [nombreAsignatura, setNombreAsignatura] = useState("");

  // Cursos
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [nuevoCursoAsignaturaId, setNuevoCursoAsignaturaId] = useState("");
  const [nuevoCursoDescripcion, setNuevoCursoDescripcion] = useState("");
  const [filtroAsignaturaId, setFiltroAsignaturaId] = useState("");
  const [editandoCursoId, setEditandoCursoId] = useState<string | null>(null);
  const [formCurso, setFormCurso] = useState({ nombre: "", asignaturaId: "", descripcion: "" });

  const recargar = useCallback(async () => {
    try {
      const [ra, rc] = await Promise.all([fetch("/api/admin/asignaturas"), fetch("/api/admin/cursos")]);
      const da = await ra.json();
      const dc = await rc.json();
      if (!ra.ok || !rc.ok) throw new Error(da.error || dc.error || "Error cargando el catálogo.");
      setAsignaturas(da.asignaturas);
      setCursos(dc.cursos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el catálogo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial al montar la pantalla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recargar();
  }, [recargar]);

  const asignaturasActivas = asignaturas.filter((a) => a.activa);

  function limpiarMensajes() {
    setError(null);
    setExito(null);
  }

  async function crearAsignatura(e: React.FormEvent) {
    e.preventDefault();
    limpiarMensajes();
    setOcupado(true);
    const { ok, data } = await llamar("/api/admin/asignaturas", "POST", { nombre: nuevaAsignatura });
    setOcupado(false);
    if (!ok) return setError((data.error as string) || "No se pudo crear la asignatura.");
    setExito(`Asignatura "${nuevaAsignatura.trim()}" creada. Asígnala a los docentes en Docentes para que vean sus cursos.`);
    setNuevaAsignatura("");
    recargar();
  }

  async function guardarAsignatura(a: Asignatura) {
    limpiarMensajes();
    setOcupado(true);
    const { ok, data } = await llamar(`/api/admin/asignaturas/${a.id}`, "PUT", { nombre: nombreAsignatura });
    setOcupado(false);
    if (!ok) return setError((data.error as string) || "No se pudo guardar la asignatura.");
    setExito("Asignatura actualizada.");
    setEditandoAsignaturaId(null);
    recargar();
  }

  async function alternarAsignatura(a: Asignatura) {
    limpiarMensajes();
    setOcupado(true);
    const { ok, data } = await llamar(`/api/admin/asignaturas/${a.id}`, "PUT", { activa: !a.activa });
    setOcupado(false);
    if (!ok) return setError((data.error as string) || "No se pudo cambiar el estado.");
    setExito(a.activa ? `"${a.nombre}" desactivada.` : `"${a.nombre}" reactivada.`);
    recargar();
  }

  async function crearCurso(e: React.FormEvent) {
    e.preventDefault();
    limpiarMensajes();
    if (!nuevoCursoAsignaturaId) return setError("Elige la asignatura a la que pertenece el curso.");
    setOcupado(true);
    const { ok, data } = await llamar("/api/admin/cursos", "POST", {
      nombre: nuevoCurso, asignaturaId: nuevoCursoAsignaturaId, descripcion: nuevoCursoDescripcion,
    });
    setOcupado(false);
    if (!ok) return setError((data.error as string) || "No se pudo crear el curso.");
    setExito(`Curso "${nuevoCurso.trim()}" creado. Ahora crea su malla en Mallas.`);
    setNuevoCurso("");
    setNuevoCursoDescripcion("");
    recargar();
  }

  function abrirEditarCurso(c: Curso) {
    limpiarMensajes();
    setEditandoCursoId(c.id);
    setFormCurso({ nombre: c.nombre, asignaturaId: c.asignaturaId ?? "", descripcion: c.descripcion ?? "" });
  }

  async function guardarCurso(c: Curso) {
    limpiarMensajes();
    if (!formCurso.asignaturaId) return setError("Elige la asignatura del curso.");
    setOcupado(true);
    const { ok, data } = await llamar(`/api/admin/cursos/${c.id}`, "PUT", formCurso);
    setOcupado(false);
    if (!ok) return setError((data.error as string) || "No se pudo guardar el curso.");
    setExito("Curso actualizado.");
    setEditandoCursoId(null);
    recargar();
  }

  async function alternarCurso(c: Curso) {
    limpiarMensajes();
    setOcupado(true);
    const { ok, data } = await llamar(`/api/admin/cursos/${c.id}`, "PUT", { activo: !c.activo });
    setOcupado(false);
    if (!ok) return setError((data.error as string) || "No se pudo cambiar el estado.");
    setExito(c.activo ? `"${c.nombre}" desactivado: ya no aparece en los selectores.` : `"${c.nombre}" reactivado.`);
    recargar();
  }

  const cursosVisibles = cursos.filter((c) => !filtroAsignaturaId || c.asignaturaId === filtroAsignaturaId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-foreground">Catálogo — asignaturas y cursos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Una <strong>asignatura</strong> (o área, como Tecnología e Informática) agrupa sus <strong>cursos</strong> (Excel, Word, Canva…).
        Cada docente ve los cursos de las asignaturas que se le asignan en Docentes. Nada se borra: se desactiva.
      </p>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
      {exito && <div className="mt-4"><Alert tone="success">{exito}</Alert></div>}
      {cargando && <p className="mt-4 text-sm text-muted-foreground">Cargando catálogo…</p>}

      <Fieldset className="mt-6" legend="Asignaturas">
        <form onSubmit={crearAsignatura} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nueva asignatura" className="flex-1">
            {(id) => <Input id={id} value={nuevaAsignatura} onChange={(e) => setNuevaAsignatura(e.target.value)} placeholder="ej. Matemáticas" />}
          </Field>
          <Button type="submit" size="sm" disabled={ocupado || !nuevaAsignatura.trim()}>+ Agregar asignatura</Button>
        </form>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Asignatura</th>
                <th className="p-3 text-left font-medium">Cursos activos</th>
                <th className="p-3 text-left font-medium">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {asignaturas.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-3 font-medium text-foreground">
                    {editandoAsignaturaId === a.id ? (
                      <Input size="sm" value={nombreAsignatura} onChange={(e) => setNombreAsignatura(e.target.value)} aria-label="Nombre de la asignatura" />
                    ) : (
                      <span className={a.activa ? "" : "text-muted-foreground line-through"}>{a.nombre}</span>
                    )}
                  </td>
                  <td className="p-3 text-foreground">{a.cursosActivos}</td>
                  <td className="p-3">{a.activa ? <Badge tone="success">Activa</Badge> : <Badge>Desactivada</Badge>}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {editandoAsignaturaId === a.id ? (
                      <>
                        <button type="button" className="mr-3 text-brand underline underline-offset-2" disabled={ocupado} onClick={() => guardarAsignatura(a)}>Guardar</button>
                        <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => setEditandoAsignaturaId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="mr-3 text-brand underline underline-offset-2" onClick={() => { limpiarMensajes(); setEditandoAsignaturaId(a.id); setNombreAsignatura(a.nombre); }}>Renombrar</button>
                        <button type="button" className={`${a.activa ? "text-danger" : "text-brand"} underline underline-offset-2`} disabled={ocupado} onClick={() => alternarAsignatura(a)}>
                          {a.activa ? "Desactivar" : "Reactivar"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fieldset>

      <Fieldset className="mt-6" legend="Cursos">
        <form onSubmit={crearCurso} className="space-y-3 rounded-xl border border-brand/25 bg-brand-subtle/60 p-4">
          <p className="text-sm font-medium text-brand-subtle-foreground">Nuevo curso</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre del curso">
              {(id) => <Input id={id} value={nuevoCurso} onChange={(e) => setNuevoCurso(e.target.value)} placeholder="ej. Fundamentos de Álgebra" />}
            </Field>
            <Field label="Asignatura a la que pertenece">
              {(id) => (
                <Select id={id} value={nuevoCursoAsignaturaId} onChange={(e) => setNuevoCursoAsignaturaId(e.target.value)}>
                  <option value="">— Selecciona una asignatura —</option>
                  {asignaturasActivas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Descripción" hint="(opcional)">
            {(id) => <Input id={id} value={nuevoCursoDescripcion} onChange={(e) => setNuevoCursoDescripcion(e.target.value)} />}
          </Field>
          <Button type="submit" size="sm" disabled={ocupado || !nuevoCurso.trim()}>+ Agregar curso</Button>
        </form>

        <div className="mt-4 max-w-xs">
          <Field label="Ver cursos de">
            {(id) => (
              <Select id={id} value={filtroAsignaturaId} onChange={(e) => setFiltroAsignaturaId(e.target.value)}>
                <option value="">Todas las asignaturas</option>
                {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Curso</th>
                <th className="p-3 text-left font-medium">Asignatura</th>
                <th className="p-3 text-left font-medium">Malla</th>
                <th className="p-3 text-left font-medium">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {cursosVisibles.length === 0 && !cargando && (
                <tr><td colSpan={5} className="p-3 text-muted-foreground">No hay cursos para mostrar.</td></tr>
              )}
              {cursosVisibles.map((c) =>
                editandoCursoId === c.id ? (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="p-3" colSpan={4}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input size="sm" value={formCurso.nombre} onChange={(e) => setFormCurso({ ...formCurso, nombre: e.target.value })} aria-label="Nombre del curso" />
                        <Select size="sm" value={formCurso.asignaturaId} onChange={(e) => setFormCurso({ ...formCurso, asignaturaId: e.target.value })} aria-label="Asignatura del curso">
                          <option value="">— Asignatura —</option>
                          {asignaturasActivas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </Select>
                        <Input size="sm" value={formCurso.descripcion} onChange={(e) => setFormCurso({ ...formCurso, descripcion: e.target.value })} placeholder="Descripción" aria-label="Descripción" />
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <button type="button" className="mr-3 text-brand underline underline-offset-2" disabled={ocupado} onClick={() => guardarCurso(c)}>Guardar</button>
                      <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => setEditandoCursoId(null)}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium text-foreground">
                      <span className={c.activo ? "" : "text-muted-foreground line-through"}>{c.nombre}</span>
                    </td>
                    <td className="p-3 text-foreground">{c.asignaturaNombre ?? <span className="text-muted-foreground">Sin asignatura</span>}</td>
                    <td className="p-3">
                      {c.temas > 0 ? <span className="text-foreground">{c.temas} tema(s)</span> : (
                        <Link href="/admin/mallas" className="text-warning underline underline-offset-2">Sin malla — crearla</Link>
                      )}
                    </td>
                    <td className="p-3">{c.activo ? <Badge tone="success">Activo</Badge> : <Badge>Desactivado</Badge>}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <button type="button" className="mr-3 text-brand underline underline-offset-2" onClick={() => abrirEditarCurso(c)}>Editar</button>
                      <button type="button" className={`${c.activo ? "text-danger" : "text-brand"} underline underline-offset-2`} disabled={ocupado} onClick={() => alternarCurso(c)}>
                        {c.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Fieldset>
    </main>
  );
}
