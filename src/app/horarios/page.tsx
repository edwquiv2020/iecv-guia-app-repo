"use client";

import { useEffect, useState } from "react";

interface Ciclo { id: string; nombre: string; grados: string[] }
interface Jornada { id: string; nombre: string }
interface Curso { id: string; nombre: string }
interface FilaExistente {
  id: string;
  semana: number;
  guia: number;
  fecha: string;
  curso_nombre: string;
  tema_numero: number | null;
  tema_nombre: string | null;
}
interface FilaNueva {
  cursoId: string;
  semana: number;
  guia: number;
  fecha: string; // yyyy-mm-dd
}

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(fechaIso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function Horarios() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [jornadaId, setJornadaId] = useState("");
  const [filasExistentes, setFilasExistentes] = useState<FilaExistente[]>([]);

  const [modoAutomatico, setModoAutomatico] = useState(true);

  // Modo automático
  const [autoCursoId, setAutoCursoId] = useState("");
  const [autoFechaInicio, setAutoFechaInicio] = useState("");
  const [autoSemanaInicial, setAutoSemanaInicial] = useState(1);
  const [autoGuiaInicial, setAutoGuiaInicial] = useState(1);
  const [autoCantidad, setAutoCantidad] = useState(10);

  // Modo manual
  const [filasManual, setFilasManual] = useState<FilaNueva[]>([
    { cursoId: "", semana: 1, guia: 1, fecha: "" },
  ]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((data: { ciclos: Ciclo[]; cursos: Curso[]; jornadas: Jornada[] }) => {
        setCiclos(data.ciclos);
        setCursos(data.cursos);
        setJornadas(data.jornadas);
      });
  }, []);

  function cargarExistentes() {
    if (!cicloId || !jornadaId) {
      setFilasExistentes([]);
      return;
    }
    fetch(`/api/calendario?cicloId=${cicloId}&jornadaId=${jornadaId}`)
      .then((r) => r.json())
      .then((data: { filas: FilaExistente[] }) => setFilasExistentes(data.filas ?? []));
  }

  useEffect(cargarExistentes, [cicloId, jornadaId]);

  const previewAuto: FilaNueva[] = !modoAutomatico || !autoCursoId || !autoFechaInicio
    ? []
    : Array.from({ length: autoCantidad }, (_, i) => ({
        cursoId: autoCursoId,
        semana: autoSemanaInicial + i,
        guia: autoGuiaInicial + i,
        fecha: sumarDias(autoFechaInicio, i * 7),
      }));

  function agregarFilaManual() {
    setFilasManual((prev) => [...prev, { cursoId: "", semana: (prev.at(-1)?.semana ?? 0) + 1, guia: (prev.at(-1)?.guia ?? 0) + 1, fecha: "" }]);
  }
  function quitarFilaManual(i: number) {
    setFilasManual((prev) => prev.filter((_, idx) => idx !== i));
  }
  function actualizarFilaManual(i: number, campo: keyof FilaNueva, valor: string | number) {
    setFilasManual((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)));
  }

  async function guardar() {
    setError(null);
    setExito(null);
    if (!cicloId || !jornadaId) {
      setError("Elige ciclo y jornada primero.");
      return;
    }
    const filas = modoAutomatico ? previewAuto : filasManual;
    if (filas.length === 0 || filas.some((f) => !f.cursoId || !f.fecha)) {
      setError("Completa curso y fecha en todas las filas antes de guardar.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cicloId, jornadaId, filas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error guardando el horario.");
      setExito(`${data.filasGuardadas} semanas guardadas.`);
      cargarExistentes();
      setFilasManual([{ cursoId: "", semana: 1, guia: 1, fecha: "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarFila(id: string) {
    await fetch(`/api/calendario?id=${id}`, { method: "DELETE" });
    cargarExistentes();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Horarios — carga de calendario académico</h1>
      <p className="mt-1 text-sm text-gray-500">
        Carga las fechas que entrega rectoría por ciclo y jornada. Semanal 1 suele ser regular
        (cada 7 días); Sábado 1/2 rota entre cursos, así que normalmente necesita carga manual.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">Ciclo</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={cicloId} onChange={(e) => setCicloId(e.target.value)}>
            <option value="" disabled>Selecciona un ciclo…</option>
            {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.grados.join("-")})</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Jornada</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={jornadaId} onChange={(e) => setJornadaId(e.target.value)}>
            <option value="" disabled>Selecciona una jornada…</option>
            {jornadas.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
          </select>
        </label>
      </div>

      {cicloId && jornadaId && (
        <>
          <label className="mt-8 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={modoAutomatico} onChange={(e) => setModoAutomatico(e.target.checked)} />
            Generar automático (secuencia regular cada 7 días)
          </label>

          {modoAutomatico ? (
            <fieldset className="mt-4 rounded border p-4">
              <legend className="px-1 text-sm font-medium">Generación automática</legend>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm">Curso</span>
                  <select className="mt-1 w-full rounded border px-3 py-2" value={autoCursoId} onChange={(e) => setAutoCursoId(e.target.value)}>
                    <option value="" disabled>Selecciona un curso…</option>
                    {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm">Fecha de inicio</span>
                  <input type="date" className="mt-1 w-full rounded border px-3 py-2" value={autoFechaInicio} onChange={(e) => setAutoFechaInicio(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm">Semana inicial No</span>
                  <input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={autoSemanaInicial} onChange={(e) => setAutoSemanaInicial(Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="text-sm">Guía inicial No</span>
                  <input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={autoGuiaInicial} onChange={(e) => setAutoGuiaInicial(Number(e.target.value))} />
                </label>
                <label className="block col-span-2">
                  <span className="text-sm">Cantidad de semanas</span>
                  <input type="number" min={1} max={40} className="mt-1 w-full rounded border px-3 py-2" value={autoCantidad} onChange={(e) => setAutoCantidad(Number(e.target.value))} />
                </label>
              </div>

              {previewAuto.length > 0 && (
                <div className="mt-4 max-h-60 overflow-y-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr><th className="p-2 text-left">Semana</th><th className="p-2 text-left">Guía</th><th className="p-2 text-left">Fecha</th></tr></thead>
                    <tbody>
                      {previewAuto.map((f, i) => (
                        <tr key={i} className="border-t"><td className="p-2">{f.semana}</td><td className="p-2">{f.guia}</td><td className="p-2">{f.fecha}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </fieldset>
          ) : (
            <fieldset className="mt-4 rounded border p-4">
              <legend className="px-1 text-sm font-medium">Carga manual, fila por fila</legend>
              <div className="space-y-2">
                {filasManual.map((f, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <select className="col-span-5 rounded border px-2 py-1 text-sm" value={f.cursoId} onChange={(e) => actualizarFilaManual(i, "cursoId", e.target.value)}>
                      <option value="" disabled>Curso…</option>
                      {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input type="number" className="col-span-2 rounded border px-2 py-1 text-sm" value={f.semana} onChange={(e) => actualizarFilaManual(i, "semana", Number(e.target.value))} placeholder="Semana" />
                    <input type="number" className="col-span-2 rounded border px-2 py-1 text-sm" value={f.guia} onChange={(e) => actualizarFilaManual(i, "guia", Number(e.target.value))} placeholder="Guía" />
                    <input type="date" className="col-span-2 rounded border px-2 py-1 text-sm" value={f.fecha} onChange={(e) => actualizarFilaManual(i, "fecha", e.target.value)} />
                    <button type="button" className="col-span-1 text-red-600" onClick={() => quitarFilaManual(i)}>✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarFilaManual} className="mt-3 rounded border px-3 py-1 text-sm">+ agregar fila</button>
            </fieldset>
          )}

          {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{exito}</p>}

          <button
            type="button"
            disabled={guardando}
            onClick={guardar}
            className="mt-4 w-full rounded bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar horario"}
          </button>

          <h2 className="mt-10 text-lg font-semibold">Ya cargado para este ciclo/jornada</h2>
          {filasExistentes.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Todavía no hay nada cargado.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead className="bg-gray-50">
                <tr><th className="p-2 text-left">Semana</th><th className="p-2 text-left">Guía</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Curso</th><th className="p-2 text-left">Tema</th><th></th></tr>
              </thead>
              <tbody>
                {filasExistentes.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="p-2">{f.semana}</td>
                    <td className="p-2">{f.guia}</td>
                    <td className="p-2">{f.fecha.slice(0, 10)}</td>
                    <td className="p-2">{f.curso_nombre}</td>
                    <td className="p-2">{f.tema_numero ? `${f.tema_numero}. ${f.tema_nombre}` : <span className="text-amber-600">sin tema</span>}</td>
                    <td className="p-2"><button className="text-red-600" onClick={() => borrarFila(f.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
