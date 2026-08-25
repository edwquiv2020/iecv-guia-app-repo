"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Field, Fieldset, Input, Select, Textarea } from "@/components/ui";

interface Curso {
  id: string;
  nombre: string;
}

interface Tema {
  id: string;
  numero: number;
  tema: string;
  subtemas: string;
  url_video: string | null;
  archivo_kahoot: string | null;
}

interface FormState {
  numero: string;
  tema: string;
  subtemas: string; // un subtema por línea, igual que en el generador de guías
  urlVideo: string;
  archivoKahoot: string;
}

interface ArchivoDrive {
  id: string;
  name: string;
}

const FORM_VACIO: FormState = {
  numero: "",
  tema: "",
  subtemas: "",
  urlVideo: "",
  archivoKahoot: "",
};

export default function MallasEditor() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoId, setCursoId] = useState("");
  const [temas, setTemas] = useState<Tema[]>([]);
  const [cargandoTemas, setCargandoTemas] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Sincronización desde Drive: no se adivina el archivo por nombre del
  // curso (la carpeta real no tiene una convención confiable — ver
  // src/lib/googleDrive.ts), el admin elige archivo y, si aplica, pestaña.
  const [mostrarSyncDrive, setMostrarSyncDrive] = useState(false);
  const [archivosDrive, setArchivosDrive] = useState<ArchivoDrive[]>([]);
  const [cargandoArchivos, setCargandoArchivos] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState("");
  const [pestanasDrive, setPestanasDrive] = useState<string[]>([]);
  const [pestanaSeleccionada, setPestanaSeleccionada] = useState("");
  const [cargandoPestanas, setCargandoPestanas] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((data: { cursos: Curso[] }) => setCursos(data.cursos))
      .catch(() => setError("No se pudo cargar el catálogo de cursos."));
  }, []);

  // Se limpia la malla anterior en el mismo render en que cambia cursoId
  // (no en un efecto), para no mostrarla de refilón mientras carga la nueva.
  const [temasCursoId, setTemasCursoId] = useState(cursoId);
  if (cursoId !== temasCursoId) {
    setTemasCursoId(cursoId);
    setTemas([]);
  }

  useEffect(() => {
    if (!cursoId) return;
    // Arranca el loading justo al lanzar el fetch — es el propio efecto el
    // que decide cuándo empieza, no hay equivalente limpio en render-time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargandoTemas(true);
    setError(null);
    fetch(`/api/temas?cursoId=${cursoId}`)
      .then((r) => r.json())
      .then((data: { temas: Tema[] }) => setTemas(data.temas))
      .catch(() => setError("No se pudieron cargar los temas de este curso."))
      .finally(() => setCargandoTemas(false));
  }, [cursoId]);

  const siguienteNumero = useMemo(() => {
    if (temas.length === 0) return 1;
    return Math.max(...temas.map((t) => t.numero)) + 1;
  }, [temas]);

  function recargarTemas() {
    if (!cursoId) return;
    fetch(`/api/temas?cursoId=${cursoId}`)
      .then((r) => r.json())
      .then((data: { temas: Tema[] }) => setTemas(data.temas));
  }

  function abrirSyncDrive() {
    setError(null);
    setExito(null);
    setMostrarSyncDrive(true);
    setArchivoSeleccionado("");
    setPestanasDrive([]);
    setPestanaSeleccionada("");
    setCargandoArchivos(true);
    fetch("/api/mallas/drive-archivos")
      .then((r) => r.json())
      .then((data: { archivos?: ArchivoDrive[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setArchivosDrive(data.archivos ?? []);
      })
      .catch(() => setError("No se pudo listar los archivos de Drive."))
      .finally(() => setCargandoArchivos(false));
  }

  function cerrarSyncDrive() {
    setMostrarSyncDrive(false);
  }

  function onSeleccionarArchivoDrive(fileId: string) {
    setArchivoSeleccionado(fileId);
    setPestanasDrive([]);
    setPestanaSeleccionada("");
    if (!fileId) return;
    setCargandoPestanas(true);
    fetch(`/api/mallas/drive-archivos/${fileId}/pestanas`)
      .then((r) => r.json())
      .then((data: { pestanas?: string[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const pestanas = data.pestanas ?? [];
        setPestanasDrive(pestanas);
        if (pestanas.length > 0) setPestanaSeleccionada(pestanas[0]);
      })
      .catch(() => setError("No se pudieron leer las pestañas de ese archivo."))
      .finally(() => setCargandoPestanas(false));
  }

  async function confirmarSincronizacion() {
    if (!cursoId || !archivoSeleccionado) return;
    setError(null);
    setExito(null);
    setSincronizando(true);
    try {
      const res = await fetch("/api/mallas/sincronizar-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cursoId,
          fileId: archivoSeleccionado,
          pestana: pestanaSeleccionada || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo sincronizar desde Drive.");
        return;
      }
      setExito(`Sincronizado: ${data.filas} tema(s).`);
      setMostrarSyncDrive(false);
      recargarTemas();
    } catch {
      setError("Error de conexión al sincronizar desde Drive.");
    } finally {
      setSincronizando(false);
    }
  }

  function abrirNuevo() {
    setEditandoId(null);
    setForm({ ...FORM_VACIO, numero: String(siguienteNumero) });
    setMostrarForm(true);
    setError(null);
    setExito(null);
  }

  function abrirEditar(t: Tema) {
    setEditandoId(t.id);
    setForm({
      numero: String(t.numero),
      tema: t.tema,
      subtemas: t.subtemas,
      urlVideo: t.url_video || "",
      archivoKahoot: t.archivo_kahoot || "",
    });
    setMostrarForm(true);
    setError(null);
    setExito(null);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditandoId(null);
    setForm(FORM_VACIO);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);

    const numero = parseInt(form.numero, 10);
    if (!numero || !form.tema.trim() || !form.subtemas.trim()) {
      setError("Completa número, tema y al menos un subtema.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        cursoId,
        numero,
        tema: form.tema,
        subtemas: form.subtemas,
        urlVideo: form.urlVideo.trim() || null,
        archivoKahoot: form.archivoKahoot.trim() || null,
      };
      const res = await fetch(
        editandoId ? `/api/temas/${editandoId}` : "/api/temas",
        {
          method: editandoId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el tema.");
        return;
      }
      setExito(editandoId ? "Tema actualizado." : "Tema creado.");
      cerrarForm();
      recargarTemas();
    } catch {
      setError("Error de conexión al guardar el tema.");
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(t: Tema) {
    if (!confirm(`¿Eliminar el tema "${t.numero}. ${t.tema}"? Esta acción lo oculta de la malla.`)) {
      return;
    }
    setBorrandoId(t.id);
    setError(null);
    setExito(null);
    try {
      const res = await fetch(`/api/temas/${t.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar el tema.");
        return;
      }
      setExito("Tema eliminado.");
      recargarTemas();
    } catch {
      setError("Error de conexión al eliminar el tema.");
    } finally {
      setBorrandoId(null);
    }
  }

  const subtemasList = form.subtemas.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Administrar mallas — IECV</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige un curso para ver, crear, editar o eliminar sus temas.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Link href="/" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">← Generar guía</Link>
          <Link href="/horarios" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">Cargar horarios →</Link>
          <Link href="/admin/usuarios" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">Gestionar docentes →</Link>
        </div>
      </div>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
      {exito && <div className="mt-4"><Alert tone="success">{exito}</Alert></div>}

      <Fieldset className="mt-6" legend="Curso">
        <Select
          value={cursoId}
          onChange={(e) => {
            setCursoId(e.target.value);
            cerrarForm();
          }}
        >
          <option value="">— Selecciona un curso —</option>
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </Select>
      </Fieldset>

      {cursoId && (
        <div className="mt-6">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-medium text-foreground">Temas de la malla</h2>
            {!mostrarForm && !mostrarSyncDrive && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={abrirSyncDrive}
                  title="Elige un archivo de la carpeta de Drive 01_MALLAS_CONTENIDO/ para traer sus temas (inserta/actualiza por número, nunca elimina)."
                >
                  Sincronizar desde Drive
                </Button>
                <Button type="button" size="sm" onClick={abrirNuevo}>
                  + Agregar tema
                </Button>
              </div>
            )}
          </div>

          {mostrarSyncDrive && (
            <div className="mt-4 space-y-4 rounded-xl border border-brand/25 bg-brand-subtle/60 p-5">
              <p className="text-sm font-medium text-brand-subtle-foreground">Sincronizar desde Drive</p>
              <p className="text-xs text-brand-subtle-foreground/80">
                La carpeta no tiene un archivo por curso con nombre predecible —
                elige tú cuál corresponde, para no arriesgarte a traer la malla
                equivocada.
              </p>

              {cargandoArchivos && <p className="text-sm text-muted-foreground">Cargando archivos de Drive…</p>}

              {!cargandoArchivos && (
                <Field label="Archivo">
                  {(id) => (
                    <Select id={id} value={archivoSeleccionado} onChange={(e) => onSeleccionarArchivoDrive(e.target.value)}>
                      <option value="">— Selecciona un archivo —</option>
                      {archivosDrive.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              {cargandoPestanas && <p className="text-sm text-muted-foreground">Leyendo pestañas del archivo…</p>}

              {!cargandoPestanas && pestanasDrive.length > 1 && (
                <Field label="Pestaña">
                  {(id) => (
                    <Select id={id} value={pestanaSeleccionada} onChange={(e) => setPestanaSeleccionada(e.target.value)}>
                      {pestanasDrive.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmarSincronizacion}
                  disabled={!archivoSeleccionado || sincronizando}
                >
                  {sincronizando ? "Sincronizando…" : "Sincronizar este archivo"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={cerrarSyncDrive}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {cargandoTemas && <p className="mt-3 text-sm text-muted-foreground">Cargando temas…</p>}

          {!cargandoTemas && temas.length === 0 && !mostrarForm && (
            <p className="mt-3 text-sm text-muted-foreground">Este curso todavía no tiene temas cargados.</p>
          )}

          {mostrarForm && (
            <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-xl border border-brand/25 bg-brand-subtle/60 p-5">
              <p className="text-sm font-medium text-brand-subtle-foreground">
                {editandoId ? "Editar tema" : "Nuevo tema"}
              </p>
              <div className="grid grid-cols-4 gap-4">
                <Field label="Número" className="col-span-1">
                  {(id) => (
                    <Input id={id} type="number" min={1} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                  )}
                </Field>
                <Field label="Tema" className="col-span-3">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.tema}
                      onChange={(e) => setForm({ ...form, tema: e.target.value })}
                      placeholder="ej. FUNCIÓN LÓGICA SI"
                    />
                  )}
                </Field>
              </div>

              <Field label="Subtemas" hint="(uno por línea)">
                {(id) => (
                  <>
                    <Textarea
                      id={id}
                      rows={4}
                      value={form.subtemas}
                      onChange={(e) => setForm({ ...form, subtemas: e.target.value })}
                      placeholder={"Sintaxis de la función SI\nCondiciones simples\nComparaciones lógicas"}
                    />
                    {subtemasList.length > 0 && (
                      <span className="mt-1 block text-xs text-muted-foreground">{subtemasList.length} subtema(s)</span>
                    )}
                  </>
                )}
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Video de apoyo (URL)">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.urlVideo}
                      onChange={(e) => setForm({ ...form, urlVideo: e.target.value })}
                      placeholder="https://youtube.com/..."
                    />
                  )}
                </Field>
                <Field label="Archivo Kahoot">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.archivoKahoot}
                      onChange={(e) => setForm({ ...form, archivoKahoot: e.target.value })}
                      placeholder="Kahoot_S6.xlsx"
                    />
                  )}
                </Field>
              </div>

              <div className="flex gap-3">
                <Button type="submit" size="sm" disabled={guardando}>
                  {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear tema"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={cerrarForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {temas.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">#</th>
                    <th className="p-3 text-left font-medium">Tema</th>
                    <th className="p-3 text-left font-medium">Subtemas</th>
                    <th className="p-3 text-left font-medium">Video</th>
                    <th className="p-3 text-left font-medium">Kahoot</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {temas.map((t) => (
                    <tr key={t.id} className="border-t border-border align-top">
                      <td className="p-3 text-foreground">{t.numero}</td>
                      <td className="p-3 font-medium text-foreground">{t.tema}</td>
                      <td className="p-3 text-muted-foreground">
                        {t.subtemas.split("\n").filter(Boolean).length} subtema(s)
                      </td>
                      <td className="p-3">{t.url_video ? <span className="text-success">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3">{t.archivo_kahoot ? <span className="text-success">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => abrirEditar(t)}
                          className="mr-3 text-brand underline underline-offset-2 hover:text-brand-hover"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onEliminar(t)}
                          disabled={borrandoId === t.id}
                          className="text-danger underline underline-offset-2 disabled:opacity-50"
                        >
                          {borrandoId === t.id ? "..." : "Eliminar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
