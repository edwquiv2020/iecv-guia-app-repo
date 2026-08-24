"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import type { Clei, TipoExamen } from "@/lib/types";
import { cantidadPreguntasPorJornada } from "@/lib/types";

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Generador de Exámenes — IECV</h1>
          <p className="mt-1 text-sm text-gray-500">Diagnóstico · Intermedio · Final — Tecnología e Informática</p>
        </div>
        <Link href="/" className="text-sm text-emerald-700 underline">← Generar guía</Link>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {catalogoError && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{catalogoError}</p>}

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Ciclo y jornada</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm">Ciclo</span>
              <select className="mt-1 w-full rounded border px-3 py-2" value={cicloId} onChange={(e) => onCicloChange(e.target.value)} required>
                <option value="" disabled>Selecciona un ciclo…</option>
                {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.grados.join("-")})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm">Jornada</span>
              <select className="mt-1 w-full rounded border px-3 py-2" value={jornadaId} onChange={(e) => onJornadaChange(e.target.value)} required>
                <option value="" disabled>Selecciona una jornada…</option>
                {jornadas.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Tipo de examen</legend>
          <div className="flex gap-6">
            {(["diagnostico", "intermedio", "final"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="radio" name="tipo" checked={tipo === t} onChange={() => onTipoChange(t)} />
                {ETIQUETA_TIPO[t]}
              </label>
            ))}
          </div>
          {tipo === "diagnostico" && (
            <p className="mt-2 text-xs text-gray-500">Conocimiento general de Tecnología e Informática, al inicio del período — no evalúa un curso puntual.</p>
          )}
        </fieldset>

        {(tipo === "intermedio" || tipo === "final") && (
          <label className="block">
            <span className="text-sm font-medium">Curso a evaluar</span>
            <select className="mt-1 w-full rounded border px-3 py-2" value={cursoId} onChange={(e) => setCursoId(e.target.value)} required>
              <option value="" disabled>Selecciona un curso…</option>
              {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}

        {cicloId && jornadaId && filasDelTipo.length > 0 && (
          <fieldset className="rounded border p-4">
            <legend className="px-1 text-sm font-medium">Semana programada ({ACTIVIDAD_POR_TIPO[tipo]})</legend>
            <select className="w-full rounded border px-3 py-2" value={semanaProgramadaId} onChange={(e) => onSemanaProgramadaChange(e.target.value)}>
              <option value="">— Crear una fecha nueva (no está en el horario) —</option>
              {filasDelTipo.map((f) => (
                <option key={f.id} value={f.id}>
                  Semana {f.semana} — {f.fecha.slice(0, 10)}{f.curso_nombre ? ` — ${f.curso_nombre}` : ""}{f.origen === "ad_hoc" ? " (manual)" : ""}
                </option>
              ))}
            </select>
          </fieldset>
        )}

        <label className="block">
          <span className="text-sm font-medium">Grupo / CLEI / Jornada</span>
          <input className="mt-1 w-full rounded border bg-gray-50 px-3 py-2" value={grupoCleiJornada || "Elige ciclo y jornada arriba"} disabled />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Semana No</span>
            <input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={semana} onChange={(e) => setSemana(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Fecha de aplicación</span>
            <input type="date" className="mt-1 w-full rounded border px-3 py-2" value={fechaAplicacionIso} onChange={(e) => setFechaAplicacionIso(e.target.value)} required />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Sede</span>
            <input className="mt-1 w-full rounded border px-3 py-2" value={sede} onChange={(e) => setSede(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Docente/Evaluador</span>
            <input className="mt-1 w-full rounded border px-3 py-2" value={docente} onChange={(e) => setDocente(e.target.value)} />
          </label>
        </div>

        <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {cantidadPreguntas} preguntas · valoración {valoracionPregunta} c/u
          {jornadaActual ? "" : " (elige la jornada para calcular esto)"}
        </div>

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Imágenes de apoyo por pregunta (opcional)</legend>
          <p className="mb-3 text-xs text-gray-500">
            Si una pregunta necesita una captura de pantalla como contexto (ej. una tabla de Excel), súbela aquí y describe qué muestra — la IA redacta esa pregunta a partir de tu descripción para que coincidan exactamente. Las preguntas sin imagen se redactan libremente.
          </p>
          <div className="space-y-3">
            {Array.from({ length: cantidadPreguntas }, (_, idx) => idx + 1).map((n) => (
              <div key={n} className="rounded border p-3">
                <p className="text-sm font-medium">Pregunta {n}</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="mt-2 w-full text-sm"
                  onChange={(e) => setPreguntaImagenes((prev) => ({ ...prev, [n]: e.target.files?.[0] ?? null }))}
                />
                <input
                  className="mt-2 w-full rounded border px-3 py-2 text-sm"
                  placeholder="Qué muestra la imagen (ej. tabla de Excel con columnas Producto, Cantidad, Precio)"
                  value={preguntaDescripciones[n] ?? ""}
                  onChange={(e) => setPreguntaDescripciones((prev) => ({ ...prev, [n]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </fieldset>

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {exito && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{exito}</p>}

        <button type="submit" disabled={enviando} className="w-full rounded bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50">
          {enviando ? "Generando examen… (puede tardar ~20-30s)" : `Generar ${ETIQUETA_TIPO[tipo]}`}
        </button>
      </form>
    </main>
  );
}
