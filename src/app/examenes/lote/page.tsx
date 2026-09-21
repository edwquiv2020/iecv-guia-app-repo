"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Alert, Badge, Button, Field, Fieldset, Input } from "@/components/ui";
import { ETIQUETA_NIVEL, esNivel } from "@/lib/types";
import { cleiDesdeCiclo, motivoNoGenerable, paramsExamenIntermedio, rutaEnZip, type FilaLote } from "@/lib/loteExamenes";

interface Ciclo { id: string; nombre: string; grados: string[] }
interface Jornada { id: string; nombre: string; dias: string }
interface FilaApi {
  id: string;
  semana: number;
  fecha: string;
  actividad_nombre: string;
  curso_id: string | null;
  curso_nombre: string | null;
  nivel: string;
  examen_generado: boolean;
}

type Estado =
  | { tipo: "pendiente" }
  | { tipo: "generando" }
  | { tipo: "listo"; advertencia?: string; guardado: boolean }
  | { tipo: "error"; mensaje: string };

const ACTIVIDAD_INTERMEDIO = "EXAMEN INTERMEDIO";

function descargar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function LoteIntermedios() {
  const [filas, setFilas] = useState<FilaLote[]>([]);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [sede, setSede] = useState("CALI");
  const [docente, setDocente] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [ejecutando, setEjecutando] = useState(false);
  const [archivosZip, setArchivosZip] = useState(0);
  const cancelar = useRef(false);
  const zipRef = useRef<JSZip>(new JSZip());

  useEffect(() => {
    async function cargar() {
      try {
        const cat = (await (await fetch("/api/catalogo")).json()) as {
          ciclos: Ciclo[]; jornadas: Jornada[]; usuario?: { nombre: string };
        };
        if (cat.usuario?.nombre) setDocente(cat.usuario.nombre);
        const ciclos = cat.ciclos.filter((c) => cleiDesdeCiclo(c.nombre) !== null);
        const combos = ciclos.flatMap((c) => cat.jornadas.map((j) => ({ c, j })));
        const respuestas = await Promise.all(
          combos.map(async ({ c, j }) => {
            const r = await fetch(`/api/calendario?cicloId=${c.id}&jornadaId=${j.id}`);
            const data = (await r.json()) as { filas?: FilaApi[] };
            return { c, j, filas: (data.filas ?? []).filter((f) => f.actividad_nombre === ACTIVIDAD_INTERMEDIO) };
          })
        );
        const lote: FilaLote[] = [];
        const sinProgramar: string[] = [];
        for (const { c, j, filas: fs } of respuestas) {
          if (fs.length === 0) sinProgramar.push(`${c.nombre} — ${j.nombre}`);
          for (const f of fs) {
            lote.push({
              id: f.id, semana: f.semana, fecha: f.fecha.slice(0, 10), cursoId: f.curso_id, cursoNombre: f.curso_nombre,
              nivel: f.nivel, examenGenerado: f.examen_generado,
              cicloId: c.id, cicloNombre: c.nombre, cicloGrados: c.grados, jornadaId: j.id, jornadaNombre: j.nombre, jornadaDias: j.dias,
            });
          }
        }
        setFilas(lote);
        setFaltantes(sinProgramar);
        // Por defecto: lo que aún no se ha generado y se puede generar.
        setSeleccion(new Set(lote.filter((f) => !f.examenGenerado && !motivoNoGenerable(f)).map((f) => f.id)));
      } catch {
        setError("No se pudo cargar el calendario.");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  // Evita cerrar la pestaña sin querer mientras se está generando.
  useEffect(() => {
    if (!ejecutando) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [ejecutando]);

  const seleccionadas = useMemo(() => filas.filter((f) => seleccion.has(f.id)), [filas, seleccion]);
  const hechas = Object.values(estados).filter((e) => e.tipo === "listo").length;
  const conError = Object.values(estados).filter((e) => e.tipo === "error").length;

  function alternar(id: string) {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function descargarZip() {
    zipRef.current.generateAsync({ type: "blob" }).then((blob) => descargar("Examenes_Intermedios.zip", blob));
  }

  async function generar() {
    setError(null);
    setAviso(null);
    if (!docente.trim() || !sede.trim()) {
      setError("Completa la sede y el docente.");
      return;
    }
    const cola = filas.filter((f) => seleccion.has(f.id));
    if (cola.length === 0) return;

    cancelar.current = false;
    zipRef.current = new JSZip();
    setArchivosZip(0);
    setEstados(Object.fromEntries(cola.map((f) => [f.id, { tipo: "pendiente" } as Estado])));
    setEjecutando(true);
    let interrumpido: string | null = null;
    const generadosOk = new Set<string>();

    for (const fila of cola) {
      if (cancelar.current) { interrumpido = "Cancelado: lo que falta queda pendiente."; break; }
      setEstados((prev) => ({ ...prev, [fila.id]: { tipo: "generando" } }));
      try {
        const params = paramsExamenIntermedio(fila, { sede: sede.trim(), docente: docente.trim() });
        const res = await fetch("/api/generar-examen", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
        });
        const data = await res.json().catch(() => null);
        if (res.status === 429) {
          setEstados((prev) => ({ ...prev, [fila.id]: { tipo: "pendiente" } }));
          interrumpido = data?.error || "Se alcanzó el límite diario de generaciones: lo que falta queda pendiente para mañana.";
          break;
        }
        if (!res.ok || !data) throw new Error(data?.error || "Error generando el examen.");

        const archivos: Array<{ nombre: string; contenidoBase64: string }> = data.archivos;
        for (const a of archivos) {
          zipRef.current.file(rutaEnZip(fila.cicloNombre, fila.jornadaNombre, a.nombre), a.contenidoBase64, { base64: true });
        }
        setArchivosZip((n) => n + archivos.length);

        // Registro en el sistema (Storage + "generado" en Horarios), igual que al generarlo uno por uno.
        let guardado = true;
        try {
          const g = await fetch("/api/guias", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calendarioClaseId: fila.id, tipo: "intermedio", archivoPath: archivos[0]?.nombre, archivos, contenido: data.contenido }),
          });
          guardado = g.ok;
        } catch {
          guardado = false;
        }
        generadosOk.add(fila.id);
        const advertencia = Array.isArray(data.advertencias) && data.advertencias.length > 0 ? String(data.advertencias[0]) : undefined;
        setEstados((prev) => ({ ...prev, [fila.id]: { tipo: "listo", advertencia, guardado } }));
      } catch (e) {
        setEstados((prev) => ({ ...prev, [fila.id]: { tipo: "error", mensaje: e instanceof Error ? e.message : "Error inesperado." } }));
      }
    }

    setEjecutando(false);
    if (interrumpido) setAviso(interrumpido);
    if (generadosOk.size > 0) {
      zipRef.current.generateAsync({ type: "blob" }).then((blob) => descargar("Examenes_Intermedios.zip", blob));
      setFilas((prev) => prev.map((f) => (generadosOk.has(f.id) ? { ...f, examenGenerado: true } : f)));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/examenes" className="text-sm text-brand underline underline-offset-2">← Volver a Exámenes</Link>
      <h1 className="mt-3 text-2xl font-bold text-foreground">Exámenes Intermedios — todos los ciclos y jornadas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Genera de una vez el Intermedio de cada semana programada en Horarios. Cada examen se guarda en el sistema y al terminar se
        descarga un ZIP ordenado por ciclo y jornada. Mantén esta pestaña abierta mientras genera (cada examen tarda ~20-60 s).
      </p>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
      {aviso && <div className="mt-4"><Alert tone="warning">{aviso}</Alert></div>}
      {cargando && <p className="mt-4 text-sm text-muted-foreground">Leyendo el calendario de todos los ciclos y jornadas…</p>}

      {!cargando && (
        <>
          {faltantes.length > 0 && (
            <div className="mt-4">
              <Alert tone="info">
                Sin Intermedio programado en Horarios: <strong>{faltantes.join("; ")}</strong>. Si alguno de esos sí debe tener examen,
                prográmalo primero en <Link href="/horarios" className="underline">Horarios</Link> (curso, semana y fecha) y aparecerá aquí.
              </Alert>
            </div>
          )}

          <Fieldset className="mt-6" legend="Datos que llevan todos los exámenes">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Sede">{(id) => <Input id={id} value={sede} onChange={(e) => setSede(e.target.value)} disabled={ejecutando} />}</Field>
              <Field label="Docente / Evaluador">{(id) => <Input id={id} value={docente} onChange={(e) => setDocente(e.target.value)} disabled={ejecutando} />}</Field>
            </div>
          </Fieldset>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="p-3"></th>
                  <th className="p-3 text-left font-medium">Ciclo</th>
                  <th className="p-3 text-left font-medium">Jornada</th>
                  <th className="p-3 text-left font-medium">Semana</th>
                  <th className="p-3 text-left font-medium">Fecha</th>
                  <th className="p-3 text-left font-medium">Curso</th>
                  <th className="p-3 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={7} className="p-3 text-muted-foreground">No hay exámenes Intermedios programados.</td></tr>}
                {filas.map((f) => {
                  const motivo = motivoNoGenerable(f);
                  const est = estados[f.id];
                  return (
                    <tr key={f.id} className="border-t border-border align-top">
                      <td className="p-3">
                        <input type="checkbox" checked={seleccion.has(f.id)} disabled={ejecutando || !!motivo} onChange={() => alternar(f.id)} aria-label={`Generar ${f.cicloNombre} ${f.jornadaNombre}`} />
                      </td>
                      <td className="p-3 text-foreground">{f.cicloNombre}</td>
                      <td className="p-3 text-foreground">{f.jornadaNombre}</td>
                      <td className="p-3 text-foreground">{f.semana}</td>
                      <td className="p-3 text-foreground">{f.fecha}</td>
                      <td className="p-3 text-foreground">
                        {f.cursoNombre ?? "—"}
                        {esNivel(f.nivel) && f.nivel !== "basico" && <span className="ml-2 text-xs text-muted-foreground">({ETIQUETA_NIVEL[f.nivel]})</span>}
                      </td>
                      <td className="p-3">
                        {est?.tipo === "generando" && <Badge tone="info">Generando…</Badge>}
                        {est?.tipo === "listo" && (
                          <div className="space-y-1">
                            <Badge tone="success">Listo</Badge>
                            {!est.guardado && <div className="text-xs text-warning">Generado, pero no se pudo guardar en el sistema (está en el ZIP).</div>}
                            {est.advertencia && <div className="text-xs text-warning">⚠ Sin temas registrados en el calendario para este curso: revisa las preguntas.</div>}
                          </div>
                        )}
                        {est?.tipo === "error" && <div className="text-xs text-danger">{est.mensaje}</div>}
                        {(!est || est.tipo === "pendiente") && (
                          motivo ? <Badge tone="warning">{motivo}</Badge>
                            : f.examenGenerado ? <Badge tone="neutral">Ya generado (se regenerará si lo marcas)</Badge>
                              : <Badge tone="neutral">Pendiente</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" onClick={generar} disabled={ejecutando || seleccionadas.length === 0}>
              {ejecutando ? `Generando… ${hechas + conError} de ${seleccionadas.length}` : `Generar ${seleccionadas.length} examen(es) Intermedio`}
            </Button>
            {ejecutando && <Button type="button" variant="outline" onClick={() => { cancelar.current = true; }}>Cancelar (termina el actual)</Button>}
            {!ejecutando && archivosZip > 0 && <Button type="button" variant="outline" onClick={descargarZip}>Descargar ZIP otra vez ({archivosZip} archivos)</Button>}
            {(hechas > 0 || conError > 0) && (
              <span className="text-sm text-muted-foreground">{hechas} listo(s){conError > 0 ? `, ${conError} con error` : ""}</span>
            )}
          </div>
        </>
      )}
    </main>
  );
}
