"use client";

import { useEffect, useState } from "react";

interface Ciclo { id: string; nombre: string; grados: string[] }
interface Jornada { id: string; nombre: string; dias: string }
interface Curso { id: string; nombre: string }
interface Actividad { id: string; nombre: string }
interface ArchivoGuia { id: string; nombre: string }
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
  archivos: { estandar: ArchivoGuia[]; dua: ArchivoGuia[] };
}
interface FilaNueva {
  cursoId: string;
  semana: number;
  guia: number;
  fecha: string; // yyyy-mm-dd
  actividadId: string;
}
interface Conflicto { semana: number; fecha: string; guia: number }

export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(fechaIso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Celda de la columna "Guías" — si ya hay archivos reales guardados, los
 * lista como links de descarga directa; si no (guías marcadas a mano, de
 * antes de esta persistencia, o todavía pendientes), mantiene el botón
 * ✅/⏳ de marcar/desmarcar de siempre.
 */
function GuiaCelda({
  etiqueta, generada, archivos, onAlternar,
}: { etiqueta: string; generada: boolean; archivos: ArchivoGuia[]; onAlternar: () => void }) {
  if (generada && archivos.length > 0) {
    return (
      <div>
        <div className="flex items-center gap-1 text-emerald-700">
          <span>✅ {etiqueta}</span>
          <button type="button" className="text-gray-400 hover:text-red-600" onClick={onAlternar} title="Quitar registro y archivos guardados">
            ✕
          </button>
        </div>
        <div className="ml-4 flex flex-col">
          {archivos.map((a) => (
            <a key={a.id} href={`/api/guias/archivos/${a.id}`} className="text-xs text-blue-600 underline" target="_blank" rel="noreferrer">
              {a.nombre}
            </a>
          ))}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={generada ? "text-left text-emerald-700" : "text-left text-gray-400"}
      onClick={onAlternar}
      title="Clic para marcar/desmarcar"
    >
      {generada ? "✅" : "⏳"} {etiqueta}
    </button>
  );
}

export default function Horarios() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [jornadaId, setJornadaId] = useState("");
  const [filasExistentes, setFilasExistentes] = useState<FilaExistente[]>([]);
  // Jornadas "gemelas" (mismo día, ej. Sábado 1/Sábado 2) donde el mismo
  // ciclo también se dicta — se ofrece copiar el horario que se está
  // cargando aquí también a esas jornadas, en vez de repetir la carga.
  const [copiarAJornadas, setCopiarAJornadas] = useState<string[]>([]);

  const [modoAutomatico, setModoAutomatico] = useState(true);

  // Modo automático
  const [autoCursoId, setAutoCursoId] = useState("");
  const [autoFechaInicio, setAutoFechaInicio] = useState("");
  const [autoSemanaInicial, setAutoSemanaInicial] = useState(1);
  const [autoGuiaInicial, setAutoGuiaInicial] = useState(0);
  const [autoCantidad, setAutoCantidad] = useState(10);
  // Cada cuántos días se repite la clase — normalmente 7 (semanal), pero
  // algunos ciclos/cursos rotan cada 15 días, así que queda editable.
  const [autoIntervaloDias, setAutoIntervaloDias] = useState(7);
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
  // Conflictos por jornada destino (la principal + las copiadas) — cada una
  // puede tener sus propias filas 'ad_hoc' chocando o ninguna.
  const [conflictos, setConflictos] = useState<Record<string, Conflicto[]> | null>(null);

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

  // Al cambiar de ciclo/jornada, la selección de "copiar también a" ya no
  // aplica (las gemelas cambian) y la tabla de abajo queda obsoleta — se
  // limpian ambas en el mismo render en que cambia la clave, no en un
  // efecto, para no arrastrar datos del contexto anterior.
  const [filasKey, setFilasKey] = useState(`${cicloId}|${jornadaId}`);
  if (`${cicloId}|${jornadaId}` !== filasKey) {
    setFilasKey(`${cicloId}|${jornadaId}`);
    setCopiarAJornadas([]);
    setFilasExistentes([]);
  }

  function cargarExistentes() {
    if (!cicloId || !jornadaId) return;
    fetch(`/api/calendario?cicloId=${cicloId}&jornadaId=${jornadaId}`)
      .then((r) => r.json())
      .then((data: { filas: FilaExistente[] }) => setFilasExistentes(data.filas ?? []));
  }

  useEffect(cargarExistentes, [cicloId, jornadaId]);

  const jornadaActual = jornadas.find((j) => j.id === jornadaId);
  const jornadasGemelas = jornadaActual
    ? jornadas.filter((j) => j.id !== jornadaId && j.dias === jornadaActual.dias)
    : [];

  function alternarCopiarAJornada(id: string) {
    setCopiarAJornadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const previewAuto: FilaNueva[] = !modoAutomatico || !autoCursoId || !autoFechaInicio || !actividadClasesId
    ? []
    : Array.from({ length: autoCantidad }, (_, i) => ({
        cursoId: autoCursoId,
        semana: autoSemanaInicial + i,
        guia: autoGuiaInicial + i,
        fecha: sumarDias(autoFechaInicio, i * autoIntervaloDias),
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
    const filasFmt = filas.map((f) => ({ cursoId: f.cursoId || null, semana: f.semana, guia: f.guia, fecha: f.fecha, actividadId: f.actividadId }));
    // Jornada principal + las gemelas marcadas para copiar el mismo horario.
    // Se reintenta con confirmar=true en TODAS por igual — para las que ya
    // se guardaron bien en un intento previo, reenviar los mismos datos es
    // un upsert sin efecto, no hay riesgo de duplicar ni perder nada.
    const jornadasDestino = [jornadaId, ...copiarAJornadas];
    setGuardando(true);
    try {
      const conflictosNuevos: Record<string, Conflicto[]> = {};
      const guardadasPorJornada: Record<string, number> = {};
      let errorApi: string | null = null;

      for (const destinoId of jornadasDestino) {
        const res = await fetch("/api/calendario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cicloId, jornadaId: destinoId, confirmar, filas: filasFmt }),
        });
        const data = await res.json();
        if (res.status === 409) {
          conflictosNuevos[destinoId] = data.conflictos;
        } else if (!res.ok) {
          errorApi = data.error || "Error guardando el horario.";
          break;
        } else {
          guardadasPorJornada[destinoId] = data.filasGuardadas;
        }
      }

      if (errorApi) throw new Error(errorApi);

      if (Object.keys(conflictosNuevos).length > 0) {
        setConflictos(conflictosNuevos);
        return;
      }

      const nombreJornada = (id: string) => jornadas.find((j) => j.id === id)?.nombre ?? id;
      const [principal, ...copias] = jornadasDestino;
      let mensaje = `${guardadasPorJornada[principal] ?? 0} semanas guardadas en ${nombreJornada(principal)}`;
      if (copias.length > 0) mensaje += ` y copiadas a ${copias.map(nombreJornada).join(", ")}`;
      setExito(`${mensaje}.`);
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
        Carga las fechas que entrega rectoría por ciclo y jornada. La generación automática
        repite cada N días (7 para semanal, 15 para algunos ciclos que rotan quincenal) — ajusta
        el intervalo según lo que entregue rectoría. Si no sigue un patrón fijo, usa carga manual.
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
            Generar automático (secuencia regular)
          </label>

          {jornadasGemelas.length > 0 && (
            <fieldset className="mt-4 rounded border border-blue-200 bg-blue-50 p-4">
              <legend className="px-1 text-sm font-medium">
                Este ciclo también se dicta en {jornadaActual?.dias} en otra jornada
              </legend>
              <p className="text-xs text-gray-500">
                Si el horario es el mismo, marca la(s) jornada(s) donde también quieres cargarlo —
                se guarda ahí una copia idéntica, sin tener que repetir la carga.
              </p>
              <div className="mt-2 flex flex-wrap gap-4">
                {jornadasGemelas.map((j) => (
                  <label key={j.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={copiarAJornadas.includes(j.id)}
                      onChange={() => alternarCopiarAJornada(j.id)}
                    />
                    Copiar también a {j.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

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
                <label className="block">
                  <span className="text-sm">Cantidad de semanas</span>
                  <input type="number" min={1} max={40} className="mt-1 w-full rounded border px-3 py-2" value={autoCantidad} onChange={(e) => setAutoCantidad(Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="text-sm">Repetir cada (días)</span>
                  <input type="number" min={1} max={60} className="mt-1 w-full rounded border px-3 py-2" value={autoIntervaloDias} onChange={(e) => setAutoIntervaloDias(Number(e.target.value))} />
                  <span className="text-xs text-gray-400">7 = semanal, 15 = quincenal.</span>
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
              {Object.entries(conflictos).map(([destinoId, filas]) => (
                <div key={destinoId} className="mt-2">
                  <p className="text-xs font-medium uppercase text-amber-700">
                    {jornadas.find((j) => j.id === destinoId)?.nombre ?? destinoId}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {filas.map((c) => <li key={c.semana}>Semana {c.semana} — Guía {c.guia} — {c.fecha.slice(0, 10)}</li>)}
                  </ul>
                </div>
              ))}
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
                      <div className="flex flex-col gap-1.5">
                        <GuiaCelda
                          etiqueta="Estándar"
                          generada={f.guia_estandar_generada}
                          archivos={f.archivos.estandar}
                          onAlternar={() => alternarGuia(f.id, "estandar", f.guia_estandar_generada)}
                        />
                        <GuiaCelda
                          etiqueta="DUA"
                          generada={f.guia_dua_generada}
                          archivos={f.archivos.dua}
                          onAlternar={() => alternarGuia(f.id, "dua", f.guia_dua_generada)}
                        />
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
