"use client";

import { useEffect, useState } from "react";
import JSZip from "jszip";
import { useSession } from "next-auth/react";
import type { Clei } from "@/lib/types";
import { Alert, Button, Field, Fieldset, Input, Select, Textarea } from "@/components/ui";

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
interface Jornada { id: string; slug: string; nombre: string }
interface Actividad { id: string; nombre: string }
interface FilaCalendario {
  id: string;
  semana: number;
  guia: number;
  fecha: string;
  origen: "horario" | "ad_hoc";
  curso_id: string | null;
  tema_id: string | null;
  actividad_nombre: string;
  curso_nombre: string | null;
  tema_numero: number | null;
  tema_nombre: string | null;
  guia_estandar_generada: boolean;
  guia_dua_generada: boolean;
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
  const { data: session } = useSession();
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [jornadaId, setJornadaId] = useState("");
  const [cursoId, setCursoId] = useState("");
  const [temaId, setTemaId] = useState("");
  const [pendingTemaId, setPendingTemaId] = useState<string | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  const [calendarioFilas, setCalendarioFilas] = useState<FilaCalendario[]>([]);
  const [semanaProgramadaId, setSemanaProgramadaId] = useState("");
  const [notaActividad, setNotaActividad] = useState<string | null>(null);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);

  const [clei, setClei] = useState<Clei>("III");
  const [jornada, setJornada] = useState("SEMANAL 1");
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

  // Catálogo: ciclos, cursos, jornadas, actividades (curso_ciclos aún no
  // tiene filas, así que los cursos no se filtran por ciclo todavía).
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

  // Temas del curso elegido — se resetean en el mismo render en que cambia
  // cursoId (no en un efecto) para no mostrar de refilón la malla del curso
  // anterior mientras llega la nueva.
  const [temasCursoId, setTemasCursoId] = useState(cursoId);
  if (cursoId !== temasCursoId) {
    setTemasCursoId(cursoId);
    setTemas([]);
    if (!cursoId) setTemaId("");
  }

  // Si veníamos de elegir una semana programada, aplicamos el tema
  // pendiente apenas llega la malla de ese curso.
  useEffect(() => {
    if (!cursoId) return;
    fetch(`/api/temas?cursoId=${cursoId}`)
      .then((r) => r.json())
      .then((data: { temas: Tema[] }) => setTemas(data.temas))
      .catch(() => setCatalogoError("No se pudo cargar la malla de temas de ese curso."));
  }, [cursoId]);

  useEffect(() => {
    if (!pendingTemaId || temas.length === 0) return;
    if (temas.some((t) => t.id === pendingTemaId)) {
      onTemaChange(pendingTemaId);
    }
    // Consume-y-limpia un valor de un solo uso una vez aplicado — no es un
    // reset derivado de props, así que no encaja en el patrón de "ajustar
    // estado durante el render"; se queda en el efecto a propósito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingTemaId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temas, pendingTemaId]);

  // Calendario ya cargado para el ciclo/jornada elegidos (ver /horarios) —
  // mismo patrón que los temas: el reset va en el render, el fetch en el efecto.
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

  function onCicloChange(id: string) {
    setCicloId(id);
    const c = ciclos.find((x) => x.id === id);
    const codigo = c ? cleiDesdeCiclo(c.nombre) : null;
    if (codigo) setClei(codigo);
  }

  function onJornadaChange(id: string) {
    setJornadaId(id);
    const j = jornadas.find((x) => x.id === id);
    if (j) setJornada(j.nombre.toUpperCase());
  }

  function onSemanaProgramadaChange(filaId: string) {
    setSemanaProgramadaId(filaId);
    setNotaActividad(null);
    setConfirmarRegenerar(false);
    if (!filaId) return; // "crear una clase nueva"
    const fila = calendarioFilas.find((f) => f.id === filaId);
    if (!fila) return;

    setSemana(fila.semana);
    setGuia(fila.guia);
    setFechaClaseIso(fila.fecha.slice(0, 10));

    if (fila.actividad_nombre !== "CLASES") {
      setNotaActividad(
        `Esta semana está marcada como "${fila.actividad_nombre}" — la generación de ese tipo de documento todavía no está implementada. Puedes seguir y ajustar tema/subtemas a mano si de verdad quieres una guía estándar para esta semana.`
      );
    }
    if (fila.curso_id) {
      setCursoId(fila.curso_id);
      setPendingTemaId(fila.tema_id);
    }
  }

  /** "Información general": repite el patrón regular (+7 días, +1 semana/guía) desde la última clase cargada de este mismo curso, cuando la semana que necesitas no está en la lista. */
  function usarPatronGeneral() {
    const delMismoCurso = calendarioFilas
      .filter((f) => f.curso_id === cursoId)
      .sort((a, b) => b.semana - a.semana);
    const ultima = delMismoCurso[0];
    if (!ultima) return;
    setSemana(ultima.semana + 1);
    setGuia(ultima.guia + 1);
    const d = new Date(ultima.fecha.slice(0, 10) + "T00:00:00");
    d.setDate(d.getDate() + 7);
    setFechaClaseIso(d.toISOString().slice(0, 10));
  }

  // "GRUPO/CLEI/JORNADA" tal como debe quedar dentro de la guía — se deriva
  // siempre del ciclo y la jornada elegidos, nunca se escribe a mano (define
  // qué guía es, tiene que ser exacto).
  const cicloElegido = ciclos.find((x) => x.id === cicloId);
  const grupoCleiJornada = cicloElegido
    ? `${gradosATexto(cicloElegido.grados)}/${cleiDesdeCiclo(cicloElegido.nombre)}/${jornada}`
    : "";

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

    if (hayQueConfirmarRegeneracion && !confirmarRegenerar) {
      setError(`La guía ${tiposYaGenerados.join(" y ")} de esta semana ya se generó antes — marca "sí, generar de nuevo" si de verdad quieres reemplazarla.`);
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
        cursoId: cursoId || undefined,
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

      // El navegador bloquea descargas múltiples disparadas por JavaScript
      // (solo deja pasar la primera) — con 2+ archivos, se empaquetan en un
      // solo .zip para que sea una única descarga.
      if (archivos.length === 1) {
        const archivo = archivos[0];
        const bytes = Uint8Array.from(atob(archivo.contenidoBase64), (c) => c.charCodeAt(0));
        const mime = archivo.nombre.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        descargar(archivo.nombre, new Blob([bytes], { type: mime }));
      } else if (archivos.length > 1) {
        const zip = new JSZip();
        for (const archivo of archivos) {
          zip.file(archivo.nombre, archivo.contenidoBase64, { base64: true });
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        descargar(`Guia_Semana${semana}_CLEI${clei}.zip`, zipBlob);
      }

      // Registra esta clase en el calendario (si esa semana ya existe, no la
      // toca — nunca pisa una fila oficial ni otra manual ya guardada) y
      // marca en `guias` qué se acaba de generar, para no perder el rastro.
      let mensajeCalendario = "";
      if (cicloId && jornadaId) {
        try {
          let calendarioClaseId = filaSeleccionada?.id ?? null;

          if (!calendarioClaseId) {
            const actividadClasesId = actividades.find((a) => a.nombre === "CLASES")?.id;
            if (actividadClasesId) {
              const resCal = await fetch("/api/calendario", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cicloId, jornadaId, origen: "ad_hoc",
                  filas: [{ cursoId: cursoId || null, semana: Number(semana), guia: Number(guia), fecha: fechaClaseIso, actividadId: actividadClasesId, temaId: temaId || null }],
                }),
              });
              const dataCal = await resCal.json().catch(() => null);
              calendarioClaseId = dataCal?.idsPorSemana?.[Number(semana)] ?? null;
              if (dataCal?.filasGuardadas > 0) mensajeCalendario = " (clase registrada en el calendario)";
            }
          }

          if (calendarioClaseId) {
            // Todo lo de la Estándar (guía + kahoot + kit) va bajo tipo
            // 'estandar' — solo el archivo de la DUA lleva "_ADAPTADA".
            const archivosEstandar = archivos.filter((a) => !a.nombre.includes("_ADAPTADA"));
            const archivosDua = archivos.filter((a) => a.nombre.includes("_ADAPTADA"));
            if (quiereEstandar && archivosEstandar.length > 0) {
              await fetch("/api/guias", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  calendarioClaseId, tipo: "estandar",
                  archivoPath: archivosEstandar[0].nombre, talleresTipos: data.talleresTipos,
                  archivos: archivosEstandar, contenido: data.contenido, kahootContenido: data.cuestionarioKahoot,
                }),
              });
            }
            if (quiereDua && archivosDua.length > 0) {
              await fetch("/api/guias", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  calendarioClaseId, tipo: "dua",
                  archivoPath: archivosDua[0].nombre, archivos: archivosDua, contenido: data.contenidoDua,
                }),
              });
            }
          }
        } catch {
          // No bloquea la generación si esto falla — es solo un registro adicional.
        }
      }

      setExito(`Guía(s) generada(s): ${archivos.map((a) => a.nombre).join(" · ")}${mensajeCalendario}`);
      setConfirmarRegenerar(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  const subtemasList = subtemasTexto.split("\n").map((s) => s.trim()).filter(Boolean);

  const filaSeleccionada = semanaProgramadaId ? calendarioFilas.find((f) => f.id === semanaProgramadaId) : undefined;
  const tiposYaGenerados: string[] = [];
  if (filaSeleccionada?.guia_estandar_generada && quiereEstandar) tiposYaGenerados.push("Estándar");
  if (filaSeleccionada?.guia_dua_generada && quiereDua) tiposYaGenerados.push("DUA");
  const hayQueConfirmarRegeneracion = tiposYaGenerados.length > 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Generador de Guía de Formación — IECV</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tecnología e Informática · CLEI III–VI · FTO-EDU-FOR-96 V3
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <a href="/examenes" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">Generar exámenes →</a>
          <a href="/horarios" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">Cargar horarios →</a>
          {session?.user?.rol === "admin" && (
            <>
              <a href="/admin/mallas" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">Administrar mallas →</a>
              <a href="/admin/usuarios" className="text-sm text-brand underline underline-offset-2 hover:text-brand-hover">Gestionar docentes →</a>
            </>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {catalogoError && <Alert tone="warning">{catalogoError}</Alert>}

        <Fieldset legend="Ciclo y jornada">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ciclo" required>
              {(id) => (
                <Select id={id} value={cicloId} onChange={(e) => onCicloChange(e.target.value)} required>
                  <option value="" disabled>Selecciona un ciclo…</option>
                  {ciclos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.grados.join("-")})</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Jornada" required>
              {(id) => (
                <Select id={id} value={jornadaId} onChange={(e) => onJornadaChange(e.target.value)} required>
                  <option value="" disabled>Selecciona una jornada…</option>
                  {jornadas.map((j) => (
                    <option key={j.id} value={j.id}>{j.nombre}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Fieldset>

        {cicloId && jornadaId && (
          <Fieldset legend="Semana programada">
            <Select value={semanaProgramadaId} onChange={(e) => onSemanaProgramadaChange(e.target.value)}>
              <option value="">
                {calendarioFilas.length === 0 ? "No hay horario cargado para este ciclo/jornada — crea la clase abajo" : "— Crear una clase nueva (no está en el horario) —"}
              </option>
              {calendarioFilas.map((f) => (
                <option key={f.id} value={f.id}>
                  Semana {f.semana} — {f.fecha.slice(0, 10)} — {f.actividad_nombre}
                  {f.curso_nombre ? ` — ${f.curso_nombre}` : ""}
                  {f.origen === "ad_hoc" ? " (manual)" : ""}
                  {f.guia_estandar_generada ? " · Estándar ✅" : ""}
                  {f.guia_dua_generada ? " · DUA ✅" : ""}
                </option>
              ))}
            </Select>
            {notaActividad && <p className="mt-2 text-xs text-warning">{notaActividad}</p>}

            {hayQueConfirmarRegeneracion && (
              <div className="mt-3">
                <Alert tone="warning">
                  <span className="block">La guía {tiposYaGenerados.join(" y ")} de esta semana ya se generó antes.</span>
                  <label className="mt-2 flex items-center gap-2 text-xs font-normal">
                    <input type="checkbox" checked={confirmarRegenerar} onChange={(e) => setConfirmarRegenerar(e.target.checked)} />
                    Sí, generar de nuevo (reemplaza el registro anterior)
                  </label>
                </Alert>
              </div>
            )}
          </Fieldset>
        )}

        <Fieldset legend="Catálogo (curso → tema)">
          <Field label="Curso" required>
            {(id) => (
              <>
                <Select id={id} value={cursoId} onChange={(e) => setCursoId(e.target.value)} required>
                  <option value="" disabled>Selecciona un curso…</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </Select>
                {!semanaProgramadaId && cursoId && calendarioFilas.some((f) => f.curso_id === cursoId) && (
                  <Button type="button" variant="outline" size="sm" onClick={usarPatronGeneral} className="mt-2">
                    Usar información general (+7 días desde la última clase de este curso)
                  </Button>
                )}
              </>
            )}
          </Field>

          <Field label="Tema de la malla" required className="mt-4">
            {(id) => (
              <>
                <Select
                  id={id}
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
                </Select>
                {archivoKahoot && (
                  <span className="mt-1 block text-xs text-muted-foreground">Kahoot sugerido: {archivoKahoot}</span>
                )}
              </>
            )}
          </Field>
        </Fieldset>

        <Field label="CLEI">{(id) => <Input id={id} value={clei} disabled />}</Field>

        <Field label="Grupo / CLEI / Jornada (como aparece en la tabla)" hint="(automático — depende del ciclo y la jornada elegidos)">
          {(id) => <Input id={id} value={grupoCleiJornada || "Elige ciclo y jornada arriba"} disabled />}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Semana No">
            {(id) => (
              <Input id={id} type="number" min={1} value={semana} onChange={(e) => setSemana(Number(e.target.value))} />
            )}
          </Field>
          <Field label="Guía No">
            {(id) => (
              <Input id={id} type="number" min={1} value={guia} onChange={(e) => setGuia(Number(e.target.value))} />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha de la clase" required>
            {(id) => (
              <Input id={id} type="date" value={fechaClaseIso} onChange={(e) => setFechaClaseIso(e.target.value)} required />
            )}
          </Field>
          <Field label="Fecha de cargue en Moodle" hint="Si la dejas vacía, se usa la misma fecha de clase.">
            {(id) => (
              <Input id={id} type="date" value={fechaCargueIso} onChange={(e) => setFechaCargueIso(e.target.value)} />
            )}
          </Field>
        </div>

        <Field label="Tema de la semana" hint="(autocompletado desde el tema elegido, editable)" required>
          {(id) => (
            <Input
              id={id}
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="INTRODUCCIÓN A INTERNET"
              required
            />
          )}
        </Field>

        <Field label="Subtemas (uno por línea, en orden)" hint="(autocompletado, edítalo si quieres dividirlo en varios A/B/C)" required>
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              value={subtemasTexto}
              onChange={(e) => setSubtemasTexto(e.target.value)}
              placeholder={"Navegadores web\nBuscadores\nCorreo electrónico"}
              required
            />
          )}
        </Field>

        {subtemasList.length > 0 && (
          <Fieldset legend="Imágenes por subtema (opcional — captura real u otra ilustración)">
            <div className="space-y-4">
              {subtemasList.map((titulo, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">{i + 1}. {titulo}</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    className="mt-2 w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-border"
                    onChange={(e) =>
                      setSubtemaImagenes((prev) => ({ ...prev, [i]: Array.from(e.target.files ?? []) }))
                    }
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
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
          </Fieldset>
        )}

        <Fieldset legend="Video de apoyo (URL autocompletada — verifica título/canal/duración tú antes de enviarlo)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título" required>
              {(id) => <Input id={id} value={videoTitulo} onChange={(e) => setVideoTitulo(e.target.value)} required />}
            </Field>
            <Field label="Canal" required>
              {(id) => <Input id={id} value={videoCanal} onChange={(e) => setVideoCanal(e.target.value)} required />}
            </Field>
            <Field label="Duración (m:ss)" required>
              {(id) => (
                <Input id={id} value={videoDuracion} onChange={(e) => setVideoDuracion(e.target.value)} placeholder="4:32" required />
              )}
            </Field>
            <Field label="URL de YouTube" required>
              {(id) => (
                <Input
                  id={id}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              )}
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Tipo de guía a generar">
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={quiereEstandar}
                onChange={(e) => setQuiereEstandar(e.target.checked)}
              />
              Estándar
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={quiereDua}
                onChange={(e) => setQuiereDua(e.target.checked)}
              />
              DUA (accesible/adaptada)
            </label>
          </div>
          {quiereDua && (
            <p className="mt-2 text-xs text-muted-foreground">
              La versión DUA toma el subtema A ya generado y lo convierte en un procedimiento de 4 repeticiones con apoyo decreciente — reutiliza las imágenes que subas para ese subtema.
            </p>
          )}
        </Fieldset>

        <Field label="Hora máxima de entrega">
          {(id) => (
            <div className="w-40">
              <Input id={id} value={horaMaxima} onChange={(e) => setHoraMaxima(e.target.value)} />
            </div>
          )}
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}
        {exito && <Alert tone="success">{exito}</Alert>}

        <Button type="submit" size="xl" disabled={enviando} className="w-full">
          {enviando ? "Generando guía… (puede tardar ~20-30s)" : "Generar guía en Word"}
        </Button>
      </form>
    </main>
  );
}
