"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

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

  async function sincronizarDesdeDrive() {
    if (!cursoId) return;
    setError(null);
    setExito(null);
    setSincronizando(true);
    try {
      const res = await fetch("/api/mallas/sincronizar-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursoId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo sincronizar desde Drive.");
        return;
      }
      setExito(`Sincronizado desde "${data.archivo}": ${data.filas} tema(s).`);
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Administrar mallas — IECV</h1>
          <p className="mt-1 text-sm text-gray-500">
            Elige un curso para ver, crear, editar o eliminar sus temas.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link href="/" className="text-sm text-emerald-700 underline">← Generar guía</Link>
          <Link href="/horarios" className="text-sm text-emerald-700 underline">Cargar horarios →</Link>
          <Link href="/admin/usuarios" className="text-sm text-emerald-700 underline">Gestionar docentes →</Link>
        </div>
      </div>

      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {exito && <p className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

      <fieldset className="mt-6 rounded border p-4">
        <legend className="px-1 text-sm font-medium">Curso</legend>
        <select
          className="mt-1 w-full rounded border px-3 py-2"
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
        </select>
      </fieldset>

      {cursoId && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Temas de la malla</h2>
            {!mostrarForm && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={sincronizarDesdeDrive}
                  disabled={sincronizando}
                  className="rounded border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700 disabled:opacity-50"
                  title="Trae los temas desde el Sheet de este curso en la carpeta de Drive 01_MALLAS_CONTENIDO/ (inserta/actualiza por número, nunca elimina)."
                >
                  {sincronizando ? "Sincronizando…" : "Sincronizar desde Drive"}
                </button>
                <button
                  type="button"
                  onClick={abrirNuevo}
                  className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white"
                >
                  + Agregar tema
                </button>
              </div>
            )}
          </div>

          {cargandoTemas && <p className="mt-3 text-sm text-gray-500">Cargando temas…</p>}

          {!cargandoTemas && temas.length === 0 && !mostrarForm && (
            <p className="mt-3 text-sm text-gray-500">Este curso todavía no tiene temas cargados.</p>
          )}

          {mostrarForm && (
            <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="text-sm font-medium">
                {editandoId ? "Editar tema" : "Nuevo tema"}
              </p>
              <div className="grid grid-cols-4 gap-4">
                <label className="col-span-1 block">
                  <span className="text-sm">Número</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  />
                </label>
                <label className="col-span-3 block">
                  <span className="text-sm">Tema</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={form.tema}
                    onChange={(e) => setForm({ ...form, tema: e.target.value })}
                    placeholder="ej. FUNCIÓN LÓGICA SI"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm">Subtemas</span>
                <span className="ml-1 text-xs text-gray-400">(uno por línea)</span>
                <textarea
                  className="mt-1 w-full rounded border px-3 py-2"
                  rows={4}
                  value={form.subtemas}
                  onChange={(e) => setForm({ ...form, subtemas: e.target.value })}
                  placeholder={"Sintaxis de la función SI\nCondiciones simples\nComparaciones lógicas"}
                />
                {subtemasList.length > 0 && (
                  <span className="mt-1 block text-xs text-gray-400">{subtemasList.length} subtema(s)</span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm">Video de apoyo (URL)</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={form.urlVideo}
                    onChange={(e) => setForm({ ...form, urlVideo: e.target.value })}
                    placeholder="https://youtube.com/..."
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Archivo Kahoot</span>
                  <input
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={form.archivoKahoot}
                    onChange={(e) => setForm({ ...form, archivoKahoot: e.target.value })}
                    placeholder="Kahoot_S6.xlsx"
                  />
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear tema"}
                </button>
                <button
                  type="button"
                  onClick={cerrarForm}
                  className="rounded border px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {temas.length > 0 && (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2 font-normal">#</th>
                  <th className="py-2 pr-2 font-normal">Tema</th>
                  <th className="py-2 pr-2 font-normal">Subtemas</th>
                  <th className="py-2 pr-2 font-normal">Video</th>
                  <th className="py-2 pr-2 font-normal">Kahoot</th>
                  <th className="py-2 pr-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {temas.map((t) => (
                  <tr key={t.id} className="border-b align-top">
                    <td className="py-2 pr-2">{t.numero}</td>
                    <td className="py-2 pr-2 font-medium">{t.tema}</td>
                    <td className="py-2 pr-2 text-gray-500">
                      {t.subtemas.split("\n").filter(Boolean).length} subtema(s)
                    </td>
                    <td className="py-2 pr-2 text-gray-400">{t.url_video ? "✓" : "—"}</td>
                    <td className="py-2 pr-2 text-gray-400">{t.archivo_kahoot ? "✓" : "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => abrirEditar(t)}
                        className="mr-3 text-emerald-700 underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onEliminar(t)}
                        disabled={borrandoId === t.id}
                        className="text-red-600 underline disabled:opacity-50"
                      >
                        {borrandoId === t.id ? "..." : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}
