"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Usuario {
  email: string;
  nombre: string | null;
  activo: boolean;
  rol: "docente" | "admin";
  created_at: string;
}

interface FormState {
  email: string;
  nombre: string;
  rol: "docente" | "admin";
}

const FORM_VACIO: FormState = { email: "", nombre: "", rol: "docente" };

export default function UsuariosEditor({ sesionEmail }: { sesionEmail: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);

  const [guardando, setGuardando] = useState(false);
  const [actualizandoEmail, setActualizandoEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function cargarUsuarios() {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((data: { usuarios: Usuario[] }) => setUsuarios(data.usuarios))
      .catch(() => setError("No se pudo cargar la lista de docentes."))
      .finally(() => setCargando(false));
  }

  // Arranca en cargando=true (estado inicial) — recargarUsuarios() después
  // de agregar/actualizar no vuelve a mostrar el spinner, igual que
  // recargarTemas() en MallasEditor.
  useEffect(cargarUsuarios, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);

    const email = form.email.trim().toLowerCase();
    if (!email.includes("@")) {
      setError("Ingresa un correo válido.");
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nombre: form.nombre.trim() || null, rol: form.rol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo agregar el docente.");
        return;
      }
      setExito(`Docente ${email} agregado.`);
      setForm(FORM_VACIO);
      setMostrarForm(false);
      cargarUsuarios();
    } catch {
      setError("Error de conexión al agregar el docente.");
    } finally {
      setGuardando(false);
    }
  }

  async function actualizar(email: string, cambios: Partial<Pick<Usuario, "activo" | "rol">>) {
    setError(null);
    setExito(null);
    setActualizandoEmail(email);
    try {
      const res = await fetch(`/api/usuarios/${encodeURIComponent(email)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar el docente.");
        return;
      }
      setUsuarios((prev) => prev.map((u) => (u.email === email ? data.usuario : u)));
    } catch {
      setError("Error de conexión al actualizar el docente.");
    } finally {
      setActualizandoEmail(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Docentes autorizados — IECV</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quién puede entrar con Google y quién tiene rol admin (puede
            administrar mallas y esta misma pantalla).
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link href="/" className="text-sm text-emerald-700 underline">← Generar guía</Link>
          <Link href="/admin/mallas" className="text-sm text-emerald-700 underline">Administrar mallas →</Link>
        </div>
      </div>

      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {exito && <p className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">Lista de docentes</h2>
        {!mostrarForm && (
          <button
            type="button"
            onClick={() => setMostrarForm(true)}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white"
          >
            + Agregar docente
          </button>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded border border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm font-medium">Nuevo docente</p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm">Correo (Google)</span>
              <input
                type="email"
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="docente@gmail.com"
              />
            </label>
            <label className="block">
              <span className="text-sm">Nombre (opcional)</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm">Rol</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as "docente" | "admin" })}
            >
              <option value="docente">Docente (solo lectura de mallas)</option>
              <option value="admin">Admin (puede administrar mallas y docentes)</option>
            </select>
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Agregar docente"}
            </button>
            <button
              type="button"
              onClick={() => { setMostrarForm(false); setForm(FORM_VACIO); }}
              className="rounded border px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cargando && <p className="mt-4 text-sm text-gray-500">Cargando…</p>}

      {!cargando && usuarios.length > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-2 font-normal">Correo</th>
              <th className="py-2 pr-2 font-normal">Nombre</th>
              <th className="py-2 pr-2 font-normal">Rol</th>
              <th className="py-2 pr-2 font-normal">Activo</th>
              <th className="py-2 pr-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const esUnoMismo = u.email.toLowerCase() === sesionEmail.toLowerCase();
              const actualizando = actualizandoEmail === u.email;
              return (
                <tr key={u.email} className="border-b align-top">
                  <td className="py-2 pr-2 font-medium">
                    {u.email}
                    {esUnoMismo && <span className="ml-1 text-xs text-gray-400">(tú)</span>}
                  </td>
                  <td className="py-2 pr-2 text-gray-600">{u.nombre || "—"}</td>
                  <td className="py-2 pr-2">
                    <select
                      className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                      value={u.rol}
                      disabled={esUnoMismo || actualizando}
                      onChange={(e) => actualizar(u.email, { rol: e.target.value as "docente" | "admin" })}
                    >
                      <option value="docente">Docente</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    {u.activo ? (
                      <span className="text-emerald-700">✓ activo</span>
                    ) : (
                      <span className="text-gray-400">inactivo</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={esUnoMismo || actualizando}
                      onClick={() => actualizar(u.email, { activo: !u.activo })}
                      className="text-emerald-700 underline disabled:opacity-50 disabled:no-underline"
                      title={esUnoMismo ? "No puedes desactivarte a ti mismo." : undefined}
                    >
                      {actualizando ? "..." : u.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
