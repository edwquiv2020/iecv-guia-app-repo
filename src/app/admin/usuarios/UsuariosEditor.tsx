"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Input, Select } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Usuario {
  email: string;
  nombre: string | null;
  activo: boolean;
  rol: "docente" | "admin";
  created_at: string;
  asignaturaIds: string[];
}

interface Asignatura {
  id: string;
  nombre: string;
}

interface FormState {
  email: string;
  nombre: string;
  rol: "docente" | "admin";
  asignaturaIds: string[];
}

const FORM_VACIO: FormState = { email: "", nombre: "", rol: "docente", asignaturaIds: [] };

/** Checkboxes de asignaturas, reusado en el form de alta y en el diálogo de edición. */
function SelectorAsignaturas({
  asignaturas,
  seleccionadas,
  onToggle,
  cargando,
  error,
  onReintentar,
}: {
  asignaturas: Asignatura[];
  seleccionadas: string[];
  onToggle: (asignaturaId: string) => void;
  cargando?: boolean;
  error?: string | null;
  onReintentar?: () => void;
}) {
  if (cargando) {
    return <p className="text-sm text-muted-foreground">Cargando asignaturas…</p>;
  }
  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-danger">{error}</p>
        {onReintentar && (
          <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  if (asignaturas.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay asignaturas en el catálogo todavía.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {asignaturas.map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={seleccionadas.includes(a.id)}
            onChange={() => onToggle(a.id)}
          />
          {a.nombre}
        </label>
      ))}
    </div>
  );
}

export default function UsuariosEditor({ sesionEmail }: { sesionEmail: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [cargandoAsignaturas, setCargandoAsignaturas] = useState(true);
  const [errorAsignaturas, setErrorAsignaturas] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);

  const [guardando, setGuardando] = useState(false);
  const [actualizandoEmail, setActualizandoEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Docente cuyas asignaturas se están editando en el diálogo — null = cerrado.
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [asignaturasEnEdicion, setAsignaturasEnEdicion] = useState<string[]>([]);

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

  // El catálogo completo de asignaturas para las casillas (no se filtra por
  // docente — eso solo aplica a los cursos que desbloquea cada asignatura).
  // El pooler de la base a veces da una conexión zombie (ver lib/db.ts) —
  // si /api/catalogo falla, se distingue de "no hay asignaturas" con un
  // mensaje y botón de reintentar, en vez de dejar las casillas vacías en
  // silencio (eso fue justo lo que pasó: pareció que no había nada que
  // asignar, y guardar así mandó una lista vacía).
  function cargarAsignaturas() {
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((data: { asignaturas?: Asignatura[]; error?: string }) => {
        if (!data.asignaturas) throw new Error(data.error || "Respuesta inválida del catálogo.");
        setAsignaturas(data.asignaturas);
      })
      .catch(() => setErrorAsignaturas("No se pudo cargar el catálogo de asignaturas."))
      .finally(() => setCargandoAsignaturas(false));
  }
  useEffect(cargarAsignaturas, []);

  // Handler del botón "Reintentar" — a diferencia de la carga inicial (que
  // ya arranca en cargando=true/error=null por el estado inicial), acá sí
  // hay que resetear a mano antes de repetir el fetch.
  function reintentarAsignaturas() {
    setCargandoAsignaturas(true);
    setErrorAsignaturas(null);
    cargarAsignaturas();
  }

  function nombresAsignaturas(asignaturaIds: string[]): string[] {
    return asignaturaIds
      .map((id) => asignaturas.find((a) => a.id === id)?.nombre)
      .filter((n): n is string => !!n);
  }

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
        body: JSON.stringify({
          email,
          nombre: form.nombre.trim() || null,
          rol: form.rol,
          asignaturaIds: form.asignaturaIds,
        }),
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

  async function actualizar(
    email: string,
    cambios: Partial<Pick<Usuario, "activo" | "rol">> & { asignaturaIds?: string[] }
  ) {
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

  function abrirEdicionAsignaturas(u: Usuario) {
    setEditando(u);
    setAsignaturasEnEdicion(u.asignaturaIds);
  }

  async function guardarAsignaturas() {
    if (!editando) return;
    await actualizar(editando.email, { asignaturaIds: asignaturasEnEdicion });
    setEditando(null);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Docentes autorizados — IECV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quién puede entrar con Google, qué rol tiene, y a qué asignaturas
          está asociado (Español, Matemáticas, Tecnología e Informática...).
          Hoy solo Tecnología e Informática tiene cursos para generar fichas.
        </p>
      </div>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
      {exito && <div className="mt-4"><Alert tone="success">{exito}</Alert></div>}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Lista de docentes</h2>
        {!mostrarForm && (
          <Button type="button" size="sm" onClick={() => setMostrarForm(true)}>
            + Agregar docente
          </Button>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-xl border border-brand/25 bg-brand-subtle/60 p-5">
          <p className="text-sm font-medium text-brand-subtle-foreground">Nuevo docente</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Correo (Google)">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="docente@gmail.com"
                />
              )}
            </Field>
            <Field label="Nombre (opcional)">
              {(id) => <Input id={id} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />}
            </Field>
          </div>
          <Field label="Rol">
            {(id) => (
              <Select id={id} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as "docente" | "admin" })}>
                <option value="docente">Docente (solo lectura de mallas)</option>
                <option value="admin">Admin (puede administrar mallas y docentes)</option>
              </Select>
            )}
          </Field>
          <Field label="Asignaturas" hint="(a qué asignaturas está asociado este docente)">
            {() => (
              <SelectorAsignaturas
                asignaturas={asignaturas}
                seleccionadas={form.asignaturaIds}
                cargando={cargandoAsignaturas}
                error={errorAsignaturas}
                onReintentar={reintentarAsignaturas}
                onToggle={(asignaturaId) =>
                  setForm((prev) => ({
                    ...prev,
                    asignaturaIds: prev.asignaturaIds.includes(asignaturaId)
                      ? prev.asignaturaIds.filter((id) => id !== asignaturaId)
                      : [...prev.asignaturaIds, asignaturaId],
                  }))
                }
              />
            )}
          </Field>
          <div className="flex gap-3">
            <Button type="submit" size="sm" disabled={guardando}>
              {guardando ? "Guardando…" : "Agregar docente"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setMostrarForm(false); setForm(FORM_VACIO); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {cargando && <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>}

      {!cargando && usuarios.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Correo</th>
                <th className="p-3 text-left font-medium">Nombre</th>
                <th className="p-3 text-left font-medium">Rol</th>
                <th className="p-3 text-left font-medium">Asignaturas</th>
                <th className="p-3 text-left font-medium">Activo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esUnoMismo = u.email.toLowerCase() === sesionEmail.toLowerCase();
                const actualizando = actualizandoEmail === u.email;
                const nombresDelUsuario = nombresAsignaturas(u.asignaturaIds);
                return (
                  <tr key={u.email} className="border-t border-border align-top">
                    <td className="p-3 font-medium text-foreground">
                      {u.email}
                      {esUnoMismo && <span className="ml-1 text-xs text-muted-foreground">(tú)</span>}
                    </td>
                    <td className="p-3 text-foreground">{u.nombre || "—"}</td>
                    <td className="p-3">
                      <Select
                        size="sm"
                        value={u.rol}
                        disabled={esUnoMismo || actualizando}
                        onChange={(e) => actualizar(u.email, { rol: e.target.value as "docente" | "admin" })}
                      >
                        <option value="docente">Docente</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </td>
                    <td className="p-3">
                      <div className="flex max-w-56 flex-wrap items-center gap-1">
                        {nombresDelUsuario.length === 0 ? (
                          <span className="text-xs text-muted-foreground">— ninguna —</span>
                        ) : (
                          nombresDelUsuario.map((nombre) => (
                            <Badge key={nombre} tone="brand">{nombre}</Badge>
                          ))
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={actualizando}
                        onClick={() => abrirEdicionAsignaturas(u)}
                        className="mt-1 text-xs text-brand underline underline-offset-2 hover:text-brand-hover disabled:opacity-50"
                      >
                        Editar
                      </button>
                    </td>
                    <td className="p-3">
                      {u.activo ? <Badge tone="success">✓ activo</Badge> : <Badge tone="neutral">inactivo</Badge>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={esUnoMismo || actualizando}
                        onClick={() => actualizar(u.email, { activo: !u.activo })}
                        className="text-brand underline underline-offset-2 hover:text-brand-hover disabled:opacity-50 disabled:no-underline"
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
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignaturas de {editando?.email}</DialogTitle>
            <DialogDescription>
              Solo podrá generar fichas de los cursos que pertenezcan a estas asignaturas.
            </DialogDescription>
          </DialogHeader>
          <SelectorAsignaturas
            asignaturas={asignaturas}
            seleccionadas={asignaturasEnEdicion}
            cargando={cargandoAsignaturas}
            error={errorAsignaturas}
            onReintentar={reintentarAsignaturas}
            onToggle={(asignaturaId) =>
              setAsignaturasEnEdicion((prev) =>
                prev.includes(asignaturaId) ? prev.filter((id) => id !== asignaturaId) : [...prev, asignaturaId]
              )
            }
          />
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={guardarAsignaturas}
              disabled={actualizandoEmail === editando?.email || cargandoAsignaturas || !!errorAsignaturas}
              title={errorAsignaturas ? "Espera a que cargue el catálogo antes de guardar." : undefined}
            >
              {actualizandoEmail === editando?.email ? "Guardando…" : "Guardar asignaturas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
