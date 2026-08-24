import { redirect } from "next/navigation";
import { auth } from "@/auth";
import MallasEditor from "./MallasEditor";

// Gate de página: solo docentes con rol 'admin' llegan al editor de mallas.
// La protección real vive en las rutas API (POST/PUT/DELETE /api/temas) —
// esto es para que un docente sin permiso ni siquiera vea la pantalla.
export default async function AdminMallasPage() {
  const session = await auth();
  if (session?.user?.rol !== "admin") {
    redirect("/");
  }
  return <MallasEditor />;
}
