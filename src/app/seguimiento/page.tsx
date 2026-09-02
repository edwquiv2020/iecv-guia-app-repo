"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Fieldset, Input, Select, Textarea } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import {
  CRITERIOS_SEGUIMIENTO,
  ETIQUETAS_ESCALA,
  agregarRegistros,
  type FilaRegistro,
  type ResumenAgregado,
} from "@/lib/seguimiento";

interface Ciclo { id: string; nombre: string }
interface Jornada { id: string; nombre: string }

interface Estudiante {
  id: string;
  nombre: string;
  activo: boolean;
  cicloId: string | null;
  cicloNombre: string | null;
  jornadaId: string | null;
  jornadaNombre: string | null;
}

interface ResumenEstudiante {
  estudianteId: string;
  nombre: string;
  activo: boolean;
  cicloNombre: string | null;
  jornadaNombre: string | null;
  agregado: ResumenAgregado;
  registros: FilaRegistro[];
}

function formClaseVacio() {
  return {
    periodo: "",
    fecha: new Date().toISOString().slice(0, 10),
    nota: "",
    valores: Object.fromEntries(
      CRITERIOS_SEGUIMIENTO.map((c) => [c.id, null as number | null])
    ) as Record<string, number | null>,
  };
}

function tonoNota(v: number | null): BadgeTone {
  if (v == null) return "neutral";
  if (v < 3) return "danger";
  if (v < 4) return "warning";
  return "success";
}

function formatNota(v: number | null): string {
  return v == null ? "—" : v.toFixed(1);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Seguimiento de estudiantes es privado por docente: no hay gate de rol
// aquí (a diferencia de /admin/mallas) — cualquier docente autenticado
// entra, pero solo ve y edita sus propios estudiantes y registros. La
// protección real vive en las rutas API (WHERE docente_email = sesión),
// ver README, sección "Seguimiento de estudiantes".
export default function SeguimientoPage() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [estudianteId, setEstudianteId] = useState<string | null>(null);

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState({ nombre: "", cicloId: "", jornadaId: "" });
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const [formClase, setFormClase] = useState(formClaseVacio);
  const [guardandoClase, setGuardandoClase] = useState(false);

  const [historial, setHistorial] = useState<FilaRegistro[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  const [periodoResumen, setPeriodoResumen] = useState("");
  const [resumen, setResumen] = useState<ResumenEstudiante[] | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/catalogo").then((r) => r.json()),
      fetch("/api/estudiantes").then((r) => r.json()),
    ])
      .then(([cat, est]) => {
        setCiclos(cat.ciclos ?? []);
        setJornadas(cat.jornadas ?? []);
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

  const estudiante = useMemo(
    () => estudiantes.find((e) => e.id === estudianteId) ?? null,
    [estudiantes, estudianteId]
  );

  const listaVisible = useMemo(
    () => estudiantes.filter((e) => mostrarInactivos || e.activo),
    [estudiantes, mostrarInactivos]
  );

  // El historial anterior se limpia en el mismo render en que cambia
  // estudianteId (no en un efecto), para no mostrarlo de refilón mientras
  // carga el nuevo — mismo patrón que temasCursoId en MallasEditor.
  const [historialEstudianteId, setHistorialEstudianteId] = useState(estudianteId);
  if (estudianteId !== historialEstudianteId) {
    setHistorialEstudianteId(estudianteId);
    setHistorial([]);
  }

  useEffect(() => {
    if (!estudianteId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargandoHistorial(true);
    fetch(`/api/seguimiento?estudianteId=${estudianteId}`)
      .then((r) => r.json())
      .then((data: { registros: FilaRegistro[] }) => setHistorial(data.registros ?? []))
      .catch(() => setError("No se pudo cargar el historial de este estudiante."))
      .finally(() => setCargandoHistorial(false));
  }, [estudianteId]);

  function recargarHistorial() {
    if (!estudianteId) return;
    fetch(`/api/seguimiento?estudianteId=${estudianteId}`)
      .then((r) => r.json())
      .then((data: { registros: FilaRegistro[] }) => setHistorial(data.registros ?? []));
  }

  function seleccionarEstudiante(id: string) {
    setEstudianteId(id);
    setFormClase(formClaseVacio());
    setError(null);
    setExito(null);
  }

  async function onCrearEstudiante(e: React.FormEvent) {
    e.preventDefault();
    const nombre = formNuevo.nombre.trim();
    if (!nombre) {
      setError("El nombre del estudiante es obligatorio.");
      return;
    }
    setGuardandoNuevo(true);
    setError(null);
    try {
      const res = await fetch("/api/estudiantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          cicloId: formNuevo.cicloId || null,
          jornadaId: formNuevo.jornadaId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear el estudiante.");
        return;
      }
      setExito(`${nombre} agregado.`);
      setFormNuevo({ nombre: "", cicloId: "", jornadaId: "" });
      setMostrarNuevo(false);
      recargarEstudiantes();
    } catch {
      setError("Error de conexión al crear el estudiante.");
    } finally {
      setGuardandoNuevo(false);
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

  function onValorCriterio(id: string, valor: number) {
    setFormClase((f) => ({
      ...f,
      valores: { ...f.valores, [id]: f.valores[id] === valor ? null : valor },
    }));
  }

  const criteriosCalificados = useMemo(
    () => Object.values(formClase.valores).filter((v) => v != null).length,
    [formClase.valores]
  );

  async function onGuardarClase(e: React.FormEvent) {
    e.preventDefault();
    if (!estudianteId) return;
    setError(null);
    setExito(null);
    if (!formClase.periodo.trim() || !formClase.fecha) {
      setError("Completa el período y la fecha de la clase.");
      return;
    }
    if (criteriosCalificados === 0) {
      setError("Califica al menos un criterio antes de guardar.");
      return;
    }
    setGuardandoClase(true);
    try {
      const res = await fetch("/api/seguimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estudianteId,
          periodo: formClase.periodo.trim(),
          fecha: formClase.fecha,
          nota: formClase.nota.trim() || null,
          ...formClase.valores,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el registro.");
        return;
      }
      setExito("Registro de clase guardado.");
      // Se conservan período y fecha — es normal registrar varios estudiantes
      // seguidos en la misma clase — pero se limpian las calificaciones y la nota.
      setFormClase({ ...formClaseVacio(), periodo: formClase.periodo, fecha: formClase.fecha });
      recargarHistorial();
    } catch {
      setError("Error de conexión al guardar el registro.");
    } finally {
      setGuardandoClase(false);
    }
  }

  async function onBorrarRegistro(id: string) {
    if (!confirm("¿Eliminar este registro de clase? Esta acción no se puede deshacer.")) return;
    setBorrandoId(id);
    setError(null);
    try {
      const res = await fetch(`/api/seguimiento/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar el registro.");
        return;
      }
      recargarHistorial();
    } catch {
      setError("Error de conexión al eliminar el registro.");
    } finally {
      setBorrandoId(null);
    }
  }

  const historialPorPeriodo = useMemo(() => {
    const grupos = new Map<string, FilaRegistro[]>();
    for (const r of historial) {
      const p = String(r.periodo);
      if (!grupos.has(p)) grupos.set(p, []);
      grupos.get(p)!.push(r);
    }
    return [...grupos.entries()].map(([periodo, filas]) => ({
      periodo,
      filas,
      agregado: agregarRegistros(filas),
    }));
  }, [historial]);

  async function onCalcularResumen(e: React.FormEvent) {
    e.preventDefault();
    if (!periodoResumen.trim()) {
      setError("Escribe el período que quieres calcular.");
      return;
    }
    setCargandoResumen(true);
    setError(null);
    try {
      const res = await fetch(`/api/seguimiento/resumen?periodo=${encodeURIComponent(periodoResumen.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo calcular el resumen.");
        return;
      }
      setResumen(data.resumen ?? []);
    } catch {
      setError("Error de conexión al calcular el resumen.");
    } finally {
      setCargandoResumen(false);
    }
  }

  function onExportarCsv() {
    if (!resumen || resumen.length === 0) return;
    const encabezados = [
      "Estudiante", "Ciclo", "Jornada", "Clases registradas",
      ...CRITERIOS_SEGUIMIENTO.map((c) => c.etiqueta),
      "Personal", "Social", "Nota definitiva",
    ];
    const filas = resumen.map((r) => [
      r.nombre, r.cicloNombre ?? "", r.jornadaNombre ?? "", r.agregado.registros,
      ...CRITERIOS_SEGUIMIENTO.map((c) => formatNota(r.agregado.porCriterio[c.id])),
      formatNota(r.agregado.personal), formatNota(r.agregado.social), formatNota(r.agregado.definitiva),
    ]);
    const csv = [encabezados, ...filas].map((fila) => fila.map(csvEscape).join(",")).join("\n");
    // BOM al inicio para que Excel reconozca UTF-8 (tildes/eñes) sin pedirlo.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seguimiento_${periodoResumen.trim().replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <h1 className="text-2xl font-bold text-foreground">Seguimiento de estudiantes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registra aspectos personales y sociales clase a clase. Al cierre de cada período,
          la nota definitiva se calcula automáticamente promediando lo registrado — es privado:
          solo tú ves y editas tus estudiantes.
        </p>
      </div>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
      {exito && <div className="mt-4"><Alert tone="success">{exito}</Alert></div>}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
        {/* Roster */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">Estudiantes</h2>
            <Button type="button" size="sm" onClick={() => setMostrarNuevo((v) => !v)}>
              {mostrarNuevo ? "Cancelar" : "+ Agregar"}
            </Button>
          </div>

          {mostrarNuevo && (
            <form
              onSubmit={onCrearEstudiante}
              className="mt-3 space-y-3 rounded-xl border border-brand/25 bg-brand-subtle/60 p-4"
            >
              <Field label="Nombre">
                {(id) => (
                  <Input
                    id={id}
                    value={formNuevo.nombre}
                    onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
                    placeholder="Nombre del estudiante"
                  />
                )}
              </Field>
              <Field label="Ciclo" hint="(opcional)">
                {(id) => (
                  <Select id={id} value={formNuevo.cicloId} onChange={(e) => setFormNuevo({ ...formNuevo, cicloId: e.target.value })}>
                    <option value="">— Sin asignar —</option>
                    {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Jornada" hint="(opcional)">
                {(id) => (
                  <Select id={id} value={formNuevo.jornadaId} onChange={(e) => setFormNuevo({ ...formNuevo, jornadaId: e.target.value })}>
                    <option value="">— Sin asignar —</option>
                    {jornadas.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
                  </Select>
                )}
              </Field>
              <Button type="submit" size="sm" disabled={guardandoNuevo}>
                {guardandoNuevo ? "Guardando…" : "Crear estudiante"}
              </Button>
            </form>
          )}

          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={mostrarInactivos}
              onChange={(e) => setMostrarInactivos(e.target.checked)}
            />
            Mostrar inactivos
          </label>

          <ul className="mt-3 space-y-1">
            {listaVisible.length === 0 && (
              <li className="text-sm text-muted-foreground">Todavía no tienes estudiantes cargados.</li>
            )}
            {listaVisible.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => seleccionarEstudiante(e.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    estudianteId === e.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  <span className={e.activo ? "" : "opacity-60 line-through"}>{e.nombre}</span>
                  {(e.cicloNombre || e.jornadaNombre) && (
                    <span className="block text-xs opacity-75">
                      {[e.cicloNombre, e.jornadaNombre].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Panel principal */}
        <div>
          {!estudiante && (
            <p className="text-sm text-muted-foreground">
              Selecciona un estudiante para registrar una clase o ver su historial.
            </p>
          )}

          {estudiante && (
            <div className="space-y-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-foreground">{estudiante.nombre}</h2>
                  {(estudiante.cicloNombre || estudiante.jornadaNombre) && (
                    <p className="text-xs text-muted-foreground">
                      {[estudiante.cicloNombre, estudiante.jornadaNombre].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onCambiarActivo(estudiante)}>
                  {estudiante.activo ? "Marcar inactivo" : "Marcar activo"}
                </Button>
              </div>

              {/* Registrar clase */}
              <form onSubmit={onGuardarClase} className="space-y-4 rounded-xl border border-border p-5">
                <p className="text-sm font-medium text-foreground">Registrar clase</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Período">
                    {(id) => (
                      <Input
                        id={id}
                        value={formClase.periodo}
                        onChange={(e) => setFormClase({ ...formClase, periodo: e.target.value })}
                        placeholder="ej. Período 1"
                      />
                    )}
                  </Field>
                  <Field label="Fecha">
                    {(id) => (
                      <Input
                        id={id}
                        type="date"
                        value={formClase.fecha}
                        onChange={(e) => setFormClase({ ...formClase, fecha: e.target.value })}
                      />
                    )}
                  </Field>
                </div>

                <Fieldset legend="Aspectos personales">
                  <div className="space-y-3">
                    {CRITERIOS_SEGUIMIENTO.filter((c) => c.categoria === "personal").map((c) => (
                      <CriterioInput
                        key={c.id}
                        criterio={c}
                        valor={formClase.valores[c.id]}
                        onChange={(v) => onValorCriterio(c.id, v)}
                      />
                    ))}
                  </div>
                </Fieldset>

                <Fieldset legend="Aspectos sociales">
                  <div className="space-y-3">
                    {CRITERIOS_SEGUIMIENTO.filter((c) => c.categoria === "social").map((c) => (
                      <CriterioInput
                        key={c.id}
                        criterio={c}
                        valor={formClase.valores[c.id]}
                        onChange={(v) => onValorCriterio(c.id, v)}
                      />
                    ))}
                  </div>
                </Fieldset>

                <Field label="Nota" hint="(opcional)">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={formClase.nota}
                      onChange={(e) => setFormClase({ ...formClase, nota: e.target.value })}
                      placeholder="Observación puntual de esta clase…"
                    />
                  )}
                </Field>

                <div className="flex items-center gap-3">
                  <Button type="submit" size="sm" disabled={guardandoClase}>
                    {guardandoClase ? "Guardando…" : "Guardar registro"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {criteriosCalificados} de {CRITERIOS_SEGUIMIENTO.length} criterios calificados
                  </span>
                </div>
              </form>

              {/* Historial */}
              <div>
                <p className="text-sm font-medium text-foreground">Historial por período</p>
                {cargandoHistorial && <p className="mt-2 text-sm text-muted-foreground">Cargando historial…</p>}
                {!cargandoHistorial && historialPorPeriodo.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">Sin registros todavía.</p>
                )}
                <div className="mt-3 space-y-4">
                  {historialPorPeriodo.map((grupo) => (
                    <div key={grupo.periodo} className="rounded-lg border border-border">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted px-4 py-2">
                        <span className="text-sm font-medium text-foreground">{grupo.periodo}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {grupo.filas.length} clase(s)
                          <Badge tone={tonoNota(grupo.agregado.definitiva)}>
                            Definitiva: {formatNota(grupo.agregado.definitiva)}
                          </Badge>
                        </span>
                      </div>
                      <ul className="divide-y divide-border">
                        {grupo.filas.map((r) => (
                          <li key={String(r.id)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                            <div>
                              <span className="text-foreground">{String(r.fecha).slice(0, 10)}</span>
                              {typeof r.nota === "string" && r.nota && (
                                <span className="ml-2 text-muted-foreground">— {r.nota}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => onBorrarRegistro(String(r.id))}
                              disabled={borrandoId === String(r.id)}
                              className="text-danger underline underline-offset-2 disabled:opacity-50"
                            >
                              {borrandoId === String(r.id) ? "..." : "Eliminar"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resumen del período */}
      <div className="mt-10 border-t border-border pt-8">
        <h2 className="text-lg font-medium text-foreground">Nota definitiva por período</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Promedia todas las clases registradas de cada estudiante en el período indicado.
        </p>
        <form onSubmit={onCalcularResumen} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Período" className="w-56">
            {(id) => (
              <Input id={id} value={periodoResumen} onChange={(e) => setPeriodoResumen(e.target.value)} placeholder="ej. Período 1" />
            )}
          </Field>
          <Button type="submit" size="sm" disabled={cargandoResumen}>
            {cargandoResumen ? "Calculando…" : "Calcular"}
          </Button>
          {resumen && resumen.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onExportarCsv}>
              Exportar CSV
            </Button>
          )}
        </form>

        {resumen && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">Estudiante</th>
                  <th className="p-3 text-left font-medium">Clases</th>
                  <th className="p-3 text-left font-medium">Personal</th>
                  <th className="p-3 text-left font-medium">Social</th>
                  <th className="p-3 text-left font-medium">Definitiva</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.estudianteId} className="border-t border-border">
                    <td className="p-3 text-foreground">
                      <span className={r.activo ? "" : "opacity-60 line-through"}>{r.nombre}</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{r.agregado.registros}</td>
                    <td className="p-3 text-foreground">{formatNota(r.agregado.personal)}</td>
                    <td className="p-3 text-foreground">{formatNota(r.agregado.social)}</td>
                    <td className="p-3">
                      <Badge tone={tonoNota(r.agregado.definitiva)}>{formatNota(r.agregado.definitiva)}</Badge>
                    </td>
                  </tr>
                ))}
                {resumen.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-muted-foreground">
                      Ningún estudiante tiene registros en este período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function CriterioInput({
  criterio,
  valor,
  onChange,
}: {
  criterio: (typeof CRITERIOS_SEGUIMIENTO)[number];
  valor: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-foreground" title={criterio.ayuda}>
        {criterio.etiqueta}
      </span>
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            title={ETIQUETAS_ESCALA[n]}
            className={`flex size-8 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
              valor === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-surface-muted"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
