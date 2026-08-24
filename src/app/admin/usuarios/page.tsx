import { redirect } from "next/navigation";
import { auth } from "@/auth";
import UsuariosEditor from "./UsuariosEditor";

// Gate de página: solo docentes con rol 'admin' llegan al editor de
// usuarios autorizados. La protección real vive en las rutas API
// (GET/POST/PUT /api/usuarios) — esto es para que un docente sin permiso
// ni siquiera vea la pantalla.
export default async function AdminUsuariosPage() {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    redirect("/");
  }
  return <UsuariosEditor sesionEmail={session.user.email ?? ""} />;
}
