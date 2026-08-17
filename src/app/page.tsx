"use client";

import { useEffect, useState } from "react";
import type { Clei } from "@/lib/types";

function formatearFechas(iso: string): { corta: string; larga: string } {
  if (!iso) return { corta: "", larga: "" };
  const [y, m, d] = iso.split("-");
  return { corta: `${d}/${m}/${y.slice(2)}`, larga: `${d}/${m}/${y}` };
}

interface Ciclo {
  id: string;
  slug: string;
  nombre: string; // "Ciclo III"
  grados: string[];
}
interface Curso {
  id: string;
  slug: string;
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

/** "Ciclo III" -> "III". Los ciclos que no calzan con el tipo Clei (hoy solo Ciclo II) se filtran fuera. */
function cleiDesdeCiclo(nombreCiclo: string): Clei | null {
  const codigo = nombreCiclo.replace("Ciclo", "").trim();
  return (["III", "IV", "V", "VI"] as const).includes(codigo as Clei) ? (codigo as Clei) : null;
}

/** ['8°','9°'] -> "8-9". Quita el símbolo de grado y une con guion. */
function gradosATexto(grados: string[]): string {
  return grados.map((g) => g.replace("°", "")).join("-");
}

export default function Home() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [cursoId, setCursoId] = useState("");
  const [temaId, setTemaId] = useState("");
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  const [clei, setClei] = useState<Clei>("III");
  const [jornada, setJornada] = useState("SEMANAL 1");
  const [grupoCleiJornada, setGrupoCleiJornada] = useState("");
  const [semana, setSemana] = useState(1);
  const [guia, setGuia] = useState(1);
  const [fechaClaseIso, setFechaClaseIso] = useState("");
  const [tema, setTema] = useState("");
  const [subtemasTexto, setSubtemasTexto] = useState("");
  const [archivoKahoot, setArchivoKahoot] = useState<string | null>(null);
  const [fechaCargueIso, setFechaCargueIso] = useState("");
  const [horaMaxima, setHoraMaxima] = useState("23:59");
  const [videoTitulo, setVideoTitulo] = useState("");
  const [videoCanal, setVideoCanal] = useState("");
  const [videoDuracion, setVideoDuracion] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [quiereEstandar, setQuiereEstandar] = useState(true);
  const [quiereDua, setQuiereDua] = useState(false);
  const [subtemaImagenes, setSubtemaImagenes] = useState<Record<number, File[]>>({});
  const [subtemaEsCaptura, setSubtemaEsCaptura] = useState<Record<number, boolean>>({});

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Catálogo: ciclos y cursos (curso_ciclos aún no tiene filas, así que los
  // cursos no se filtran por ciclo todavía — se listan todos los activos).
  useEffect(() => {
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((data: { ciclos: Ciclo[]; cursos: Curso[] }) => {
        setCiclos(data.ciclos.filter((c) => cleiDesdeCiclo(c.nombre) !== null));
        setCursos(data.cursos);
      })
      .catch(() => setCatalogoError("No se pudo cargar el catálogo de ciclos/cursos desde la base de datos."));
  }, []);

  // Temas del curso elegido.
  useEffect(() => {
    setTemaId("");
    setTemas([]);
    if (!cursoId) return;
    fetch(`/api/temas?cursoId=${cursoId}`)
      .then((r) => r.json())
      .then((data: { temas: Tema[] }) => setTemas(data.temas))
      .catch(() => setCatalogoError("No se pudo cargar la malla de temas de ese curso."));
  }, [cursoId]);

  function onCicloChange(id: string) {
    setCicloId(id);
    const c = ciclos.find((x) => x.id === id);
    const codigo = c ? cleiDesdeCiclo(c.nombre) : null;
    if (codigo) setClei(codigo);
  }

  // "GRUPO/CLEI/JORNADA" tal como debe quedar dentro de la guía — se deriva
  // siempre del ciclo y la jornada elegidos, nunca se escribe a mano (define
  // qué guía es, tiene que ser exacto).
  useEffect(() => {
    const c = ciclos.find((x) => x.id === cicloId);
    if (!c) {
      setGrupoCleiJornada("");
      return;
    }
    const codigo = cleiDesdeCiclo(c.nombre);
    setGrupoCleiJornada(`${gradosATexto(c.grados)}/${codigo}/${jornada}`);
  }, [cicloId, jornada, ciclos]);

  function onTemaChange(id: string) {
    setTemaId(id);
    const t = temas.find((x) => x.id === id);
    if (!t) return;
    setTema(t.tema.toUpperCase());
    setSubtemasTexto(t.subtemas);
    setVideoUrl(t.url_video ?? "");
    setArchivoKahoot(t.archivo_kahoot);
    setSemana(t.numero);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (!quiereEstandar && !quiereDua) {
      setError("Elige al menos un tipo de guía: Estándar, DUA, o ambas.");
      return;
    }

    const subtemas = subtemasTexto
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (subtemas.length === 0) {
      setError("Agrega al menos un subtema (uno por línea).");
      return;
    }

    const fechaClase = formatearFechas(fechaClaseIso);
    const fechaCargue = formatearFechas(fechaCargueIso || fechaClaseIso).larga;

    const tipos: Array<"estandar" | "dua"> = [
      ...(quiereEstandar ? (["estandar"] as const) : []),
      ...(quiereDua ? (["dua"] as const) : []),
    ];

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append("params", JSON.stringify({
        clei,
        jornada,
        grupoCleiJornada,
        semana: Number(semana),
        guia: Number(guia),
        fechaClase: fechaClase.corta,
        fechaClaseLarga: fechaClase.larga,
        tema: tema.toUpperCase(),
        subtemas,
        fechaCargue,
        horaMaxima,
        videoApoyo: { titulo: videoTitulo, canal: videoCanal, duracion: videoDuracion, url: videoUrl },
        tipos,
      }));
      subtemas.forEach((_, i) => {
        (subtemaImagenes[i] ?? []).forEach((file) => formData.append(`subtemaImg_${i}`, file));
        formData.append(`subtemaImgEsCaptura_${i}`, String(!!subtemaEsCaptura[i]));
      });

      const res = await fetch("/api/generar-guia", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        throw new Error(data?.error || "Error generando la guía.");
      }

      const archivos: Array<{ nombre: string; contenidoBase64: string }> = data.archivos;
      for (const archivo of archivos) {
        const bytes = Uint8Array.from(atob(archivo.contenidoBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = archivo.nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      setExito(`Guía(s) generada(s): ${archivos.map((a) => a.nombre).join(" · ")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  const subtemasList = subtemasTexto.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold">Generador de Guía de Formación — IECV</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tecnología e Informática · CLEI III–VI · FTO-EDU-FOR-96 V3
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {catalogoError && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{catalogoError}</p>}

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Catálogo (ciclo → curso → tema)</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm">Ciclo</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={cicloId}
                onChange={(e) => onCicloChange(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona un ciclo…</option>
                {ciclos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} ({c.grados.join("-")})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm">Curso</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={cursoId}
                onChange={(e) => setCursoId(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona un curso…</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-sm">Tema de la malla</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={temaId}
              onChange={(e) => onTemaChange(e.target.value)}
              disabled={temas.length === 0}
              required
            >
              <option value="" disabled>
                {cursoId ? (temas.length ? "Selecciona un tema…" : "Este curso no tiene malla cargada todavía") : "Elige primero un curso"}
              </option>
              {temas.map((t) => (
                <option key={t.id} value={t.id}>{t.numero}. {t.tema}</option>
              ))}
            </select>
            {archivoKahoot && (
              <span className="mt-1 block text-xs text-gray-400">Kahoot sugerido: {archivoKahoot}</span>
            )}
          </label>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">CLEI</span>
            <input className="mt-1 w-full rounded border bg-gray-50 px-3 py-2" value={clei} disabled />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Jornada</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={jornada}
              onChange={(e) => setJornada(e.target.value)}
            >
              <option value="SEMANAL 1">SEMANAL 1</option>
              <option value="SABADO 1">SABADO 1</option>
              <option value="SABADO 2">SABADO 2</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Grupo / CLEI / Jornada (como aparece en la tabla)</span>
          <span className="ml-1 text-xs text-gray-400">(automático — depende del ciclo y la jornada elegidos)</span>
          <input
            className="mt-1 w-full rounded border bg-gray-50 px-3 py-2"
            value={grupoCleiJornada || "Elige ciclo y jornada arriba"}
            disabled
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Semana No</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded border px-3 py-2"
              value={semana}
              onChange={(e) => setSemana(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Guía No</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded border px-3 py-2"
              value={guia}
              onChange={(e) => setGuia(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Fecha de la clase</span>
            <input
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={fechaClaseIso}
              onChange={(e) => setFechaClaseIso(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Fecha de cargue en Moodle</span>
            <input
              type="date"
              className="mt-1 w-full rounded border px-3 py-2"
              value={fechaCargueIso}
              onChange={(e) => setFechaCargueIso(e.target.value)}
            />
            <span className="text-xs text-gray-400">Si la dejas vacía, se usa la misma fecha de clase.</span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Tema de la semana</span>
          <span className="ml-1 text-xs text-gray-400">(autocompletado desde el tema elegido, editable)</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="INTRODUCCIÓN A INTERNET"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Subtemas (uno por línea, en orden)</span>
          <span className="ml-1 text-xs text-gray-400">(autocompletado, edítalo si quieres dividirlo en varios A/B/C)</span>
          <textarea
            className="mt-1 w-full rounded border px-3 py-2"
            rows={4}
            value={subtemasTexto}
            onChange={(e) => setSubtemasTexto(e.target.value)}
            placeholder={"Navegadores web\nBuscadores\nCorreo electrónico"}
            required
          />
        </label>

        {subtemasList.length > 0 && (
          <fieldset className="rounded border p-4">
            <legend className="px-1 text-sm font-medium">Imágenes por subtema (opcional — captura real u otra ilustración)</legend>
            <div className="space-y-4">
              {subtemasList.map((titulo, i) => (
                <div key={i} className="rounded border p-3">
                  <p className="text-sm font-medium">{i + 1}. {titulo}</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    className="mt-2 w-full text-sm"
                    onChange={(e) =>
                      setSubtemaImagenes((prev) => ({ ...prev, [i]: Array.from(e.target.files ?? []) }))
                    }
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!subtemaEsCaptura[i]}
                      onChange={(e) => setSubtemaEsCaptura((prev) => ({ ...prev, [i]: e.target.checked }))}
                    />
                    Es captura real de Office (agrega el crédito de Microsoft automáticamente)
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Video de apoyo (URL autocompletada — verifica título/canal/duración tú antes de enviarlo)</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm">Título</span>
              <input className="mt-1 w-full rounded border px-3 py-2" value={videoTitulo} onChange={(e) => setVideoTitulo(e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-sm">Canal</span>
              <input className="mt-1 w-full rounded border px-3 py-2" value={videoCanal} onChange={(e) => setVideoCanal(e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-sm">Duración (m:ss)</span>
              <input className="mt-1 w-full rounded border px-3 py-2" value={videoDuracion} onChange={(e) => setVideoDuracion(e.target.value)} placeholder="4:32" required />
            </label>
            <label className="block">
              <span className="text-sm">URL de YouTube</span>
              <input className="mt-1 w-full rounded border px-3 py-2" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Tipo de guía a generar</legend>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={quiereEstandar}
                onChange={(e) => setQuiereEstandar(e.target.checked)}
              />
              Estándar
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={quiereDua}
                onChange={(e) => setQuiereDua(e.target.checked)}
              />
              DUA (accesible/adaptada)
            </label>
          </div>
          {quiereDua && (
            <p className="mt-2 text-xs text-gray-500">
              La versión DUA toma el subtema A ya generado y lo convierte en un procedimiento de 4 repeticiones con apoyo decreciente — reutiliza las imágenes que subas para ese subtema.
            </p>
          )}
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium">Hora máxima de entrega</span>
          <input className="mt-1 w-40 rounded border px-3 py-2" value={horaMaxima} onChange={(e) => setHoraMaxima(e.target.value)} />
        </label>

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {exito && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{exito}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {enviando ? "Generando guía… (puede tardar ~20-30s)" : "Generar guía en Word"}
        </button>
      </form>
    </main>
  );
}
