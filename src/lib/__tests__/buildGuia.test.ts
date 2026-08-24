import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { buildGuiaDocx } from "@/lib/buildGuia";
import type { ContenidoGuia, ParametrosGuia } from "@/lib/types";

// Smoke test del ensamblado del .docx — mismo fixture que test_build.ts (el
// script manual para revisión visual), pero sin invocar Python: usa una
// imagen real del banco de fotos directo en vez de generarla, para que
// corra rápido y sin dependencias externas en CI.

const params: ParametrosGuia = {
  clei: "III",
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  semana: 21,
  guia: 21,
  fechaClase: "15/07/26",
  fechaClaseLarga: "15/07/2026",
  tema: "INTRODUCCIÓN A INTERNET",
  subtemas: ["Navegadores web", "Buscadores", "Correo electrónico"],
  fechaCargue: "15/07/2026",
  horaMaxima: "23:59",
  videoApoyo: {
    titulo: "¿Qué es Internet?",
    canal: "Canal de prueba",
    duracion: "3:45",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
};

const contenido: ContenidoGuia = {
  saludoMotivacion: "¡Bienvenido de nuevo!",
  introduccion: "Internet se ha vuelto una herramienta indispensable.",
  competencia: "Utiliza Internet de forma segura y eficiente.",
  desempeno: "Navega, busca información confiable y gestiona un correo.",
  objetivoGuia: ["abrir un navegador", "usar un buscador", "enviar un correo"],
  reflexionInicial: "¿Alguna vez has necesitado buscar información urgente?",
  parteDeLoQueYaSabes: "Ya saben pedir consejo a otras personas para resolver dudas.",
  subtemas: [
    { titulo: "Navegadores web", funcion: "Programa que permite acceder a páginas de Internet." },
    { titulo: "Buscadores", funcion: "Herramienta para encontrar información." },
    {
      titulo: "Correo electrónico", funcion: "Servicio para enviar y recibir mensajes.",
      pasos: [
        { texto: "Abra el navegador y escriba gmail.com.", icono: "ninguno" },
        { texto: "Escriba el mensaje y aplique negrita al asunto.", icono: "negrita" },
      ],
    },
  ],
  talleres: [
    { tipo: "cuestionario", instrucciones: "Responde.", items: ["¿Qué es un navegador?"] },
  ],
  rubricaCriteriosEspecificos: [
    { criterio: "Uso del navegador", superior: "Navega con fluidez.", alto: "Con apoyo mínimo.", basico: "Con apoyo constante.", bajo: "No logra navegar." },
  ],
  listaVerificacion: ["Abrí el navegador y visité una página web."],
  antesDeCerrarPregunta: "¿En qué momento vas a usar Internet esta semana?",
  fichaResumen: [{ concepto: "Navegadores web", resumen: "Acceden a páginas de Internet." }],
  bibliografia: [{ autor: "Comfenalco Valle", anio: "2026", titulo: "Manual de Tecnología e Informática" }],
  fotoMotivacionalClave: "tortuga",
};

describe("buildGuiaDocx", () => {
  it("arma un .docx válido (zip) sin lanzar excepción", async () => {
    const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
    const ilustracionBuf = await fs.readFile(path.join(process.cwd(), "assets", "banco_fotos", "tortuga.png"));

    const docxBuf = await buildGuiaDocx(params, contenido, { logoBuf, ilustracionBuf });

    // Un .docx es un .zip — todo zip empieza con la firma "PK".
    expect(docxBuf.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(docxBuf.length).toBeGreaterThan(10_000);
  });
});
