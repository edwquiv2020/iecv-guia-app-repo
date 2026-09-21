import { redirect } from "next/navigation";
import { auth } from "@/auth";
import CatalogoEditor from "./CatalogoEditor";

// Gate de página: solo docentes con rol 'admin' llegan al editor del
// catálogo. La protección real vive en las rutas API (/api/admin/asignaturas
// y /api/admin/cursos) — esto es para que un docente sin permiso ni siquiera
// vea la pantalla.
export default async function AdminCatalogoPage() {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    redirect("/");
  }
  return <CatalogoEditor />;
}
