"use client";

import { useEffect, useState } from "react";

interface Ciclo { id: string; nombre: string; grados: string[] }
interface Jornada { id: string; nombre: string }
interface Curso { id: string; nombre: string }
interface Actividad { id: string; nombre: string }
interface FilaExistente {
  id: string;
  semana: number;
  guia: number;
  fecha: string;
  actividad_nombre: string;
  origen: "horario" | "ad_hoc";
  curso_nombre: string | null;
  tema_numero: number | null;
  tema_nombre: string | null;
  guia_estandar_generada: boolean;
  guia_dua_generada: boolean;
}
interface FilaNueva {
  cursoId: string;
  semana: number;
  guia: number;
  fecha: string; // yyyy-mm-dd
  actividadId: string;
}
interface Conflicto { semana: number; fecha: string; guia: number }

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(fechaIso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function Horarios() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [jornadaId, setJornadaId] = useState("");
  const [filasExistentes, setFilasExistentes] = useState<FilaExistente[]>([]);

  const [modoAutomatico, setModoAutomatico] = useState(true);

  // Modo automático
  const [autoCursoId, setAutoCursoId] = useState("");
  const [autoFechaInicio, setAutoFechaInicio] = useState("");
  const [autoSemanaInicial, setAutoSemanaInicial] = useState(1);
  const [autoGuiaInicial, setAutoGuiaInicial] = useState(0);
  const [autoCantidad, setAutoCantidad] = useState(10);
  // Actividad por fila (índice dentro del lote) — cada semana puede ser
  // distinta (CLASES, GUÍA DE REPASO, EXAMEN...), no todas iguales.
  const [autoActividadesPorFila, setAutoActividadesPorFila] = useState<Record<number, string>>({});

  // Modo manual
  const [filasManual, setFilasManual] = useState<FilaNueva[]>([
    { cursoId: "", semana: 1, guia: 0, fecha: "", actividadId: "" },
  ]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [conflictos, setConflictos] = useState<Conflicto[] | null>(null);

  useEffect(() => {
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((data: { ciclos: Ciclo[]; cursos: Curso[]; jornadas: Jornada[]; actividades: Actividad[] }) => {
        setCiclos(data.ciclos);
        setCursos(data.cursos);
        setJornadas(data.jornadas);
        setActividades(data.actividades);
        const clases = data.actividades.find((a) => a.nombre === "CLASES");
        if (clases) {
          setFilasManual([{ cursoId: "", semana: 1, guia: 0, fecha: "", actividadId: clases.id }]);
        }
      });
  }, []);

  const actividadClasesId = actividades.find((a) => a.nombre === "CLASES")?.id ?? "";

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

  const previewAuto: FilaNueva[] = !modoAutomatico || !autoCursoId || !autoFechaInicio || !actividadClasesId
    ? []
    : Array.from({ length: autoCantidad }, (_, i) => ({
        cursoId: autoCursoId,
        semana: autoSemanaInicial + i,
        guia: autoGuiaInicial + i,
        fecha: sumarDias(autoFechaInicio, i * 7),
        actividadId: autoActividadesPorFila[i] ?? actividadClasesId,
      }));

  function agregarFilaManual() {
    setFilasManual((prev) => [...prev, {
      cursoId: "", semana: (prev.at(-1)?.semana ?? 0) + 1, guia: (prev.at(-1)?.guia ?? 0) + 1,
      fecha: "", actividadId: actividadClasesId,
    }]);
  }
  function quitarFilaManual(i: number) {
    setFilasManual((prev) => prev.filter((_, idx) => idx !== i));
  }
  function actualizarFilaManual(i: number, campo: keyof FilaNueva, valor: string | number) {
    setFilasManual((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)));
  }

  async function guardar(confirmar = false) {
    setError(null);
    setExito(null);
    if (!confirmar) setConflictos(null);
    if (!cicloId || !jornadaId) {
      setError("Elige ciclo y jornada primero.");
      return;
    }
    const filas = modoAutomatico ? previewAuto : filasManual;
    if (filas.length === 0 || filas.some((f) => !f.fecha || !f.actividadId)) {
      setError("Completa la fecha y el tipo de actividad en todas las filas antes de guardar.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cicloId, jornadaId, confirmar,
          filas: filas.map((f) => ({ cursoId: f.cursoId || null, semana: f.semana, guia: f.guia, fecha: f.fecha, actividadId: f.actividadId })),
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setConflictos(data.conflictos);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Error guardando el horario.");
      setExito(`${data.filasGuardadas} semanas guardadas.`);
      setConflictos(null);
      cargarExistentes();
      setFilasManual([{ cursoId: "", semana: 1, guia: 0, fecha: "", actividadId: actividadClasesId }]);
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

  /** Marca/desmarca manualmente que una guía Estándar/DUA ya existe para esta semana — para las guías hechas antes de esta app. */
  async function alternarGuia(calendarioClaseId: string, tipo: "estandar" | "dua", generada: boolean) {
    if (generada) {
      await fetch(`/api/guias?calendarioClaseId=${calendarioClaseId}&tipo=${tipo}`, { method: "DELETE" });
    } else {
      await fetch("/api/guias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarioClaseId, tipo }),
      });
    }
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
                  <input type="number" min={0} className="mt-1 w-full rounded border px-3 py-2" value={autoGuiaInicial} onChange={(e) => setAutoGuiaInicial(Number(e.target.value))} />
                  <span className="text-xs text-gray-400">0 si la primera semana es de inducción/diagnóstico, sin guía.</span>
                </label>
                <label className="block col-span-2">
                  <span className="text-sm">Cantidad de semanas</span>
                  <input type="number" min={1} max={40} className="mt-1 w-full rounded border px-3 py-2" value={autoCantidad} onChange={(e) => setAutoCantidad(Number(e.target.value))} />
                </label>
              </div>

              {previewAuto.length > 0 && (
                <div className="mt-4 max-h-72 overflow-y-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr><th className="p-2 text-left">Semana</th><th className="p-2 text-left">Guía</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Actividad (edítala por semana)</th></tr></thead>
                    <tbody>
                      {previewAuto.map((f, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{f.semana}</td>
                          <td className="p-2">{f.guia}</td>
                          <td className="p-2">{f.fecha}</td>
                          <td className="p-2">
                            <select
                              className="w-full rounded border px-2 py-1"
                              value={f.actividadId}
                              onChange={(e) => setAutoActividadesPorFila((prev) => ({ ...prev, [i]: e.target.value }))}
                            >
                              {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                          </td>
                        </tr>
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
                    <select className="col-span-3 rounded border px-2 py-1 text-sm" value={f.cursoId} onChange={(e) => actualizarFilaManual(i, "cursoId", e.target.value)}>
                      <option value="">Curso (opcional)…</option>
                      {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input type="number" className="col-span-1 rounded border px-2 py-1 text-sm" value={f.semana} onChange={(e) => actualizarFilaManual(i, "semana", Number(e.target.value))} placeholder="Semana" />
                    <input type="number" className="col-span-1 rounded border px-2 py-1 text-sm" value={f.guia} onChange={(e) => actualizarFilaManual(i, "guia", Number(e.target.value))} placeholder="Guía" />
                    <input type="date" className="col-span-2 rounded border px-2 py-1 text-sm" value={f.fecha} onChange={(e) => actualizarFilaManual(i, "fecha", e.target.value)} />
                    <select className="col-span-4 rounded border px-2 py-1 text-sm" value={f.actividadId} onChange={(e) => actualizarFilaManual(i, "actividadId", e.target.value)}>
                      <option value="" disabled>Actividad…</option>
                      {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                    <button type="button" className="col-span-1 text-red-600" onClick={() => quitarFilaManual(i)}>✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarFilaManual} className="mt-3 rounded border px-3 py-1 text-sm">+ agregar fila</button>
            </fieldset>
          )}

          {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{exito}</p>}

          {conflictos && (
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">
                Estas semanas ya tienen una clase creada manualmente desde el generador de guías
                (sin horario oficial todavía). Si guardas, se reemplaza con estos datos nuevos:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {conflictos.map((c) => <li key={c.semana}>Semana {c.semana} — Guía {c.guia} — {c.fecha.slice(0, 10)}</li>)}
              </ul>
              <button type="button" onClick={() => guardar(true)} className="mt-2 rounded bg-amber-700 px-3 py-1 text-white">
                Sí, reemplazar y guardar
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={guardando}
            onClick={() => guardar(false)}
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
                <tr><th className="p-2 text-left">Semana</th><th className="p-2 text-left">Guía</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Actividad</th><th className="p-2 text-left">Curso</th><th className="p-2 text-left">Tema</th><th className="p-2 text-left">Guías</th><th></th></tr>
              </thead>
              <tbody>
                {filasExistentes.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="p-2">{f.semana}</td>
                    <td className="p-2">{f.guia}</td>
                    <td className="p-2">{f.fecha.slice(0, 10)}</td>
                    <td className="p-2">
                      {f.actividad_nombre}
                      {f.origen === "ad_hoc" && <span className="ml-1 text-xs text-amber-600">(manual)</span>}
                    </td>
                    <td className="p-2">{f.curso_nombre ?? "—"}</td>
                    <td className="p-2">{f.tema_numero ? `${f.tema_numero}. ${f.tema_nombre}` : <span className="text-gray-400">—</span>}</td>
                    <td className="p-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className={f.guia_estandar_generada ? "text-left text-emerald-700" : "text-left text-gray-400"}
                          onClick={() => alternarGuia(f.id, "estandar", f.guia_estandar_generada)}
                          title="Clic para marcar/desmarcar"
                        >
                          {f.guia_estandar_generada ? "✅" : "⏳"} Estándar
                        </button>
                        <button
                          type="button"
                          className={f.guia_dua_generada ? "text-left text-emerald-700" : "text-left text-gray-400"}
                          onClick={() => alternarGuia(f.id, "dua", f.guia_dua_generada)}
                          title="Clic para marcar/desmarcar"
                        >
                          {f.guia_dua_generada ? "✅" : "⏳"} DUA
                        </button>
                      </div>
                    </td>
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
