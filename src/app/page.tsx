"use client";

import { useState } from "react";
import type { Clei } from "@/lib/types";

function formatearFechas(iso: string): { corta: string; larga: string } {
  if (!iso) return { corta: "", larga: "" };
  const [y, m, d] = iso.split("-");
  return { corta: `${d}/${m}/${y.slice(2)}`, larga: `${d}/${m}/${y}` };
}

export default function Home() {
  const [clei, setClei] = useState<Clei>("III");
  const [jornada, setJornada] = useState("SEMANAL 1");
  const [grupoCleiJornada, setGrupoCleiJornada] = useState("6-7/III/SEMANAL 1");
  const [semana, setSemana] = useState(1);
  const [guia, setGuia] = useState(1);
  const [fechaClaseIso, setFechaClaseIso] = useState("");
  const [tema, setTema] = useState("");
  const [subtemasTexto, setSubtemasTexto] = useState("");
  const [fechaCargueIso, setFechaCargueIso] = useState("");
  const [horaMaxima, setHoraMaxima] = useState("23:59");
  const [videoTitulo, setVideoTitulo] = useState("");
  const [videoCanal, setVideoCanal] = useState("");
  const [videoDuracion, setVideoDuracion] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);

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

    setEnviando(true);
    try {
      const res = await fetch("/api/generar-guia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error generando la guía." }));
        throw new Error(data.error || "Error generando la guía.");
      }

      const blob = await res.blob();
      const nombre =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `Guia_Semana${semana}_${clei}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExito(`Guía generada: ${nombre}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold">Generador de Guía de Formación — IECV</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tecnología e Informática · CLEI III–VI · FTO-EDU-FOR-96 V3
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">CLEI</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={clei}
              onChange={(e) => setClei(e.target.value as Clei)}
            >
              <option value="III">III</option>
              <option value="IV">IV</option>
              <option value="V">V</option>
              <option value="VI">VI</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Jornada</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={jornada}
              onChange={(e) => setJornada(e.target.value)}
              placeholder="SEMANAL 1 / SABADO 1"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Grupo / CLEI / Jornada (como aparece en la tabla)</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={grupoCleiJornada}
            onChange={(e) => setGrupoCleiJornada(e.target.value)}
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
          <textarea
            className="mt-1 w-full rounded border px-3 py-2"
            rows={4}
            value={subtemasTexto}
            onChange={(e) => setSubtemasTexto(e.target.value)}
            placeholder={"Navegadores web\nBuscadores\nCorreo electrónico"}
            required
          />
        </label>

        <fieldset className="rounded border p-4">
          <legend className="px-1 text-sm font-medium">Video de apoyo (verifícalo tú antes de enviarlo)</legend>
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
