"use client";

import { useEffect, useState } from "react";
import JSZip from "jszip";
import type { Clei, TipoExamen } from "@/lib/types";
import { cantidadPreguntasPorJornada } from "@/lib/types";
import { Alert, Button, Field, Fieldset, Input, Select } from "@/components/ui";

function formatearFechaLarga(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface Ciclo { id: string; slug: string; nombre: string; grados: string[] }
interface Curso { id: string; slug: string; nombre: string }
interface Jornada { id: string; slug: string; nombre: string; dias: string }
interface Actividad { id: string; nombre: string }
interface FilaCalendario {
  id: string;
  semana: number;
  fecha: string;
  origen: "horario" | "ad_hoc";
  curso_id: string | null;
  actividad_nombre: string;
  curso_nombre: string | null;
}

const ACTIVIDAD_POR_TIPO: Record<TipoExamen, string> = {
  diagnostico: "SEMANA DIAGNÓSTICO",
  intermedio: "EXAMEN INTERMEDIO",
  final: "EXAMEN FINAL",
};

const ETIQUETA_TIPO: Record<TipoExamen, string> = {
  diagnostico: "Diagnóstico de Presaberes",
  intermedio: "Examen Intermedio",
  final: "Examen Final",
};

function cleiDesdeCiclo(nombreCiclo: string): Clei | null {
  const codigo = nombreCiclo.replace("Ciclo", "").trim();
  return (["III", "IV", "V", "VI"] as const).includes(codigo as Clei) ? (codigo as Clei) : null;
}
function gradosATexto(grados: string[]): string {
  return grados.map((g) => g.replace("°", "")).join("-");
}

export default function Examenes() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  const [cicloId, setCicloId] = useState("");
  const [jornadaId, setJornadaId] = useState("");
  const [clei, setClei] = useState<Clei>("III");
  const [jornadaNombre, setJornadaNombre] = useState("SEMANAL 1");

  const [tipo, setTipo] = useState<TipoExamen>("diagnostico");
  const [cursoId, setCursoId] = useState("");

  const [calendarioFilas, setCalendarioFilas] = useState<FilaCalendario[]>([]);
  const [semanaProgramadaId, setSemanaProgramadaId] = useState("");
  const [semana, setSemana] = useState(1);
  const [fechaAplicacionIso, setFechaAplicacionIso] = useState("");
  const [sede, setSede] = useState("CALI");
  const [docente, setDocente] = useState("EDWARD QUIÑONES VALENZUELA");

  const [preguntaImagenes, setPreguntaImagenes] = useState<Record<number, File | null>>({});
  const [preguntaDescripciones, setPreguntaDescripciones] = useState<Record<number, string>>({});

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((data: { ciclos: Ciclo[]; cursos: Curso[]; jornadas: Jornada[]; actividades: Actividad[] }) => {
        setCiclos(data.ciclos.filter((c) => cleiDesdeCiclo(c.nombre) !== null));
        setCursos(data.cursos);
        setJornadas(data.jornadas);
        setActividades(data.actividades);
      })
      .catch(() => setCatalogoError("No se pudo cargar el catálogo desde la base de datos."));
  }, []);

  // El reset va en el mismo render en que cambia ciclo/jornada (no en un
  // efecto), el fetch async se queda en el efecto.
  const [calendarioKey, setCalendarioKey] = useState(`${cicloId}|${jornadaId}`);
  if (`${cicloId}|${jornadaId}` !== calendarioKey) {
    setCalendarioKey(`${cicloId}|${jornadaId}`);
    setCalendarioFilas([]);
    setSemanaProgramadaId("");
  }

  useEffect(() => {
    if (!cicloId || !jornadaId) return;
    fetch(`/api/calendario?cicloId=${cicloId}&jornadaId=${jornadaId}`)
      .then((r) => r.json())
      .then((data: { filas: FilaCalendario[] }) => setCalendarioFilas(data.filas ?? []));
  }, [cicloId, jornadaId]);

  // "GRUPO/CLEI/JORNADA" tal como debe quedar en el examen — se deriva
  // siempre del ciclo y la jornada elegidos, nunca se escribe a mano.
  const cicloElegido = ciclos.find((x) => x.id === cicloId);
  const grupoCleiJornada = cicloElegido
    ? `${gradosATexto(cicloElegido.grados)}/${cleiDesdeCiclo(cicloElegido.nombre)}/${jornadaNombre}`
    : "";

  function onCicloChange(id: string) {
    setCicloId(id);
    const c = ciclos.find((x) => x.id === id);
    const codigo = c ? cleiDesdeCiclo(c.nombre) : null;
    if (codigo) setClei(codigo);
  }

  function onJornadaChange(id: string) {
    setJornadaId(id);
    const j = jornadas.find((x) => x.id === id);
    if (j) setJornadaNombre(j.nombre.toUpperCase());
  }

  const jornadaActual = jornadas.find((j) => j.id === jornadaId);
  const cantidadPreguntas = jornadaActual ? cantidadPreguntasPorJornada(jornadaActual.dias) : 10;
  const valoracionPregunta = Math.round((5 / cantidadPreguntas) * 100) / 100;

  const filasDelTipo = calendarioFilas.filter((f) => f.actividad_nombre === ACTIVIDAD_POR_TIPO[tipo]);

  function onSemanaProgramadaChange(filaId: string) {
    setSemanaProgramadaId(filaId);
    if (!filaId) return;
    const fila = filasDelTipo.find((f) => f.id === filaId);
    if (!fila) return;
    setSemana(fila.semana);
    setFechaAplicacionIso(fila.fecha.slice(0, 10));
    if (fila.curso_id) setCursoId(fila.curso_id);
  }

  function onTipoChange(t: TipoExamen) {
    setTipo(t);
    setSemanaProgramadaId("");
    setPreguntaImagenes({});
    setPreguntaDescripciones({});
    if (t === "diagnostico") setCursoId("");
  }

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);

    if ((tipo === "intermedio" || tipo === "final") && !cursoId) {
      setError("Elige el curso a evaluar.");
      return;
    }
    if (!fechaAplicacionIso) {
      setError("Elige la fecha de aplicación.");
      return;
    }

    setEnviando(true);
    try {
      const curso = cursos.find((c) => c.id === cursoId);
      const params = {
        tipo, clei, grupoCleiJornada, jornada: jornadaNombre,
        cantidadPreguntas, valoracionPregunta,
        semana: Number(semana),
        fechaAplicacion: formatearFechaLarga(fechaAplicacionIso),
        sede, docente,
        cicloId, jornadaId,
        cursoId: cursoId || undefined,
        cursoNombre: curso?.nombre,
      };

      const formData = new FormData();
      formData.append("params", JSON.stringify(params));
      for (let i = 1; i <= cantidadPreguntas; i++) {
        const file = preguntaImagenes[i];
        if (file) formData.append(`preguntaImg_${i}`, file);
        const desc = preguntaDescripciones[i];
        if (desc) formData.append(`preguntaDesc_${i}`, desc);
      }

      const res = await fetch("/api/generar-examen", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || "Error generando el examen.");

      const archivos: Array<{ nombre: string; contenidoBase64: string }> = data.archivos;
      if (archivos.length === 1) {
        const archivo = archivos[0];
        const bytes = Uint8Array.from(atob(archivo.contenidoBase64), (c) => c.charCodeAt(0));
        descargar(archivo.nombre, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      } else {
        const zip = new JSZip();
        for (const archivo of archivos) zip.file(archivo.nombre, archivo.contenidoBase64, { base64: true });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        descargar(`${ETIQUETA_TIPO[tipo].replace(/\s+/g, "_")}_Semana${semana}_CLEI${clei}.zip`, zipBlob);
      }

      // Registra la semana en el calendario (si no venía ya de /horarios) y
      // marca en `guias` que este examen se generó — mismo patrón que las guías.
      let mensajeCalendario = "";
      if (cicloId && jornadaId) {
        try {
          let calendarioClaseId = semanaProgramadaId
            ? filasDelTipo.find((f) => f.id === semanaProgramadaId)?.id ?? null
            : null;

          if (!calendarioClaseId) {
            const actividadId = actividades.find((a) => a.nombre === ACTIVIDAD_POR_TIPO[tipo])?.id;
            if (actividadId) {
              const resCal = await fetch("/api/calendario", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cicloId, jornadaId, origen: "ad_hoc",
                  filas: [{ cursoId: cursoId || null, semana: Number(semana), guia: Number(semana), fecha: fechaAplicacionIso, actividadId }],
                }),
              });
              const dataCal = await resCal.json().catch(() => null);
              calendarioClaseId = dataCal?.idsPorSemana?.[Number(semana)] ?? null;
              if (dataCal?.filasGuardadas > 0) mensajeCalendario = " (semana registrada en el calendario)";
            }
          }

          if (calendarioClaseId) {
            await fetch("/api/guias", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ calendarioClaseId, tipo, archivoPath: archivos[0]?.nombre, archivos, contenido: data.contenido }),
            });
          }
        } catch {
          // No bloquea la generación si esto falla — es solo un registro adicional.
        }
      }

      setExito(`${ETIQUETA_TIPO[tipo]} generado: ${archivos.map((a) => a.nombre).join(" · ")}${mensajeCalendario}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Generador de Exámenes — IECV</h1>
        <p className="mt-1 text-sm text-muted-foreground">Diagnóstico · Intermedio · Final — Tecnología e Informática</p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {catalogoError && <Alert tone="warning">{catalogoError}</Alert>}

        <Fieldset legend="Ciclo y jornada">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ciclo" required>
              {(id) => (
                <Select id={id} value={cicloId} onChange={(e) => onCicloChange(e.target.value)} required>
                  <option value="" disabled>Selecciona un ciclo…</option>
                  {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.grados.join("-")})</option>)}
                </Select>
              )}
            </Field>
            <Field label="Jornada" required>
              {(id) => (
                <Select id={id} value={jornadaId} onChange={(e) => onJornadaChange(e.target.value)} required>
                  <option value="" disabled>Selecciona una jornada…</option>
                  {jornadas.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Tipo de examen">
          <div className="flex flex-wrap gap-6">
            {(["diagnostico", "intermedio", "final"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-foreground">
                <input type="radio" name="tipo" checked={tipo === t} onChange={() => onTipoChange(t)} />
                {ETIQUETA_TIPO[t]}
              </label>
            ))}
          </div>
          {tipo === "diagnostico" && (
            <p className="mt-2 text-xs text-muted-foreground">Conocimiento general de Tecnología e Informática, al inicio del período — no evalúa un curso puntual.</p>
          )}
        </Fieldset>

        {(tipo === "intermedio" || tipo === "final") && (
          <Field label="Curso a evaluar" required>
            {(id) => (
              <Select id={id} value={cursoId} onChange={(e) => setCursoId(e.target.value)} required>
                <option value="" disabled>Selecciona un curso…</option>
                {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            )}
          </Field>
        )}

        {cicloId && jornadaId && filasDelTipo.length > 0 && (
          <Fieldset legend={`Semana programada (${ACTIVIDAD_POR_TIPO[tipo]})`}>
            <Select value={semanaProgramadaId} onChange={(e) => onSemanaProgramadaChange(e.target.value)}>
              <option value="">— Crear una fecha nueva (no está en el horario) —</option>
              {filasDelTipo.map((f) => (
                <option key={f.id} value={f.id}>
                  Semana {f.semana} — {f.fecha.slice(0, 10)}{f.curso_nombre ? ` — ${f.curso_nombre}` : ""}{f.origen === "ad_hoc" ? " (manual)" : ""}
                </option>
              ))}
            </Select>
          </Fieldset>
        )}

        <Field label="Grupo / CLEI / Jornada">
          {(id) => <Input id={id} value={grupoCleiJornada || "Elige ciclo y jornada arriba"} disabled />}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Semana No">
            {(id) => <Input id={id} type="number" min={1} value={semana} onChange={(e) => setSemana(Number(e.target.value))} />}
          </Field>
          <Field label="Fecha de aplicación" required>
            {(id) => (
              <Input id={id} type="date" value={fechaAplicacionIso} onChange={(e) => setFechaAplicacionIso(e.target.value)} required />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sede">
            {(id) => <Input id={id} value={sede} onChange={(e) => setSede(e.target.value)} />}
          </Field>
          <Field label="Docente/Evaluador">
            {(id) => <Input id={id} value={docente} onChange={(e) => setDocente(e.target.value)} />}
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-muted-foreground">
          {cantidadPreguntas} preguntas · valoración {valoracionPregunta} c/u
          {jornadaActual ? "" : " (elige la jornada para calcular esto)"}
        </div>

        <details className="group rounded-xl border border-border bg-surface p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground marker:hidden">
            <span>
              Imágenes de apoyo por pregunta{" "}
              <span className="font-normal text-muted-foreground">({cantidadPreguntas})</span>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              <span className="group-open:hidden">Opcional — clic para mostrar</span>
              <span className="hidden group-open:inline">Clic para ocultar</span>
            </span>
          </summary>
          <p className="mb-3 mt-3 text-xs text-muted-foreground">
            Si una pregunta necesita una captura de pantalla como contexto (ej. una tabla de Excel), súbela aquí y describe qué muestra — la IA redacta esa pregunta a partir de tu descripción para que coincidan exactamente. Las preguntas sin imagen se redactan libremente.
          </p>
          <div className="space-y-3">
            {Array.from({ length: cantidadPreguntas }, (_, idx) => idx + 1).map((n) => (
              <div key={n} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Pregunta {n}</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="mt-2 w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-border"
                  onChange={(e) => setPreguntaImagenes((prev) => ({ ...prev, [n]: e.target.files?.[0] ?? null }))}
                />
                <Input
                  size="sm"
                  className="mt-2"
                  placeholder="Qué muestra la imagen (ej. tabla de Excel con columnas Producto, Cantidad, Precio)"
                  value={preguntaDescripciones[n] ?? ""}
                  onChange={(e) => setPreguntaDescripciones((prev) => ({ ...prev, [n]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </details>

        {error && <Alert tone="danger">{error}</Alert>}
        {exito && <Alert tone="success">{exito}</Alert>}

        <Button type="submit" size="xl" disabled={enviando} className="w-full">
          {enviando ? "Generando examen… (puede tardar ~20-30s)" : `Generar ${ETIQUETA_TIPO[tipo]}`}
        </Button>
      </form>
    </main>
  );
}
