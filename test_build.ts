// Script de prueba manual: genera un .docx de ejemplo SIN llamar a la API de
// Anthropic (usa contenido de ejemplo fijo), para validar que el ensamblado
// del documento y la imagen motivacional funcionan de punta a punta.
// Ejecutar con: npx tsx test_build.ts
import fs from "node:fs/promises";
import path from "node:path";
import { buildGuiaDocx } from "./src/lib/buildGuia";
import { generarImagenMotivacional } from "./src/lib/images";
import type { ParametrosGuia, ContenidoGuia } from "./src/lib/types";

const params: ParametrosGuia = {
  asignatura: "Tecnología e Informática",
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
  saludoMotivacion: "¡Bienvenido de nuevo! Sabemos que llegar hasta aquí después de un día de trabajo no es fácil, y valoramos tu esfuerzo por seguir aprendiendo.",
  introduccion: "Internet se ha vuelto una herramienta indispensable para trámites, trabajo y comunicación diaria.",
  competencia: "Utiliza Internet de forma segura y eficiente para resolver necesidades cotidianas de información y comunicación.",
  desempeno: "Navega, busca información confiable y gestiona un correo electrónico básico.",
  objetivoGuia: [
    "abrir un navegador y explicar para qué sirve",
    "usar un buscador para encontrar información confiable",
    "enviar un correo electrónico básico",
  ],
  reflexionInicial: "¿Alguna vez has necesitado buscar información urgente y no supiste por dónde empezar?",
  parteDeLoQueYaSabes: "Ya saben preguntar y buscar consejo con otras personas para resolver dudas — un buscador hace lo mismo, pero con información en Internet.",
  subtemas: [
    { titulo: "Navegadores web", funcion: "Programa que permite acceder a páginas de Internet." },
    { titulo: "Buscadores", funcion: "Herramienta para encontrar información mediante palabras clave." },
    {
      titulo: "Correo electrónico", funcion: "Servicio para enviar y recibir mensajes digitales.",
      pasos: [
        { texto: "Abra el navegador y escriba gmail.com.", icono: "ninguno" },
        { texto: "Escriba el mensaje y aplique negrita al asunto.", icono: "negrita" },
        { texto: "Guarde el borrador antes de enviarlo.", icono: "guardar" },
        { texto: "Copie el texto y péguelo en el campo de asunto.", icono: "copiar" },
      ],
    },
  ],
  talleres: [
    { tipo: "cuestionario", instrucciones: "Responde las siguientes preguntas.", items: ["¿Qué es un navegador?", "Nombra dos buscadores."] },
    { tipo: "ejercicio guiado", instrucciones: "Crea una cuenta de correo siguiendo los pasos.", items: ["Ingresa a gmail.com", "Completa el formulario"] },
  ],
  rubricaCriteriosEspecificos: [
    { criterio: "Uso del navegador", superior: "Navega con fluidez.", alto: "Navega con apoyo mínimo.", basico: "Navega con apoyo constante.", bajo: "No logra navegar." },
  ],
  listaVerificacion: [
    "Abrí el navegador y visité una página web.",
    "Encontré información usando un buscador.",
    "Envié un correo electrónico de prueba.",
  ],
  antesDeCerrarPregunta: "¿En qué momento de esta semana vas a usar Internet para resolver algo de tu casa o tu trabajo?",
  fichaResumen: [
    { concepto: "Navegadores web", resumen: "Programa para acceder a páginas de Internet." },
    { concepto: "Buscadores", resumen: "Encuentran información con palabras clave." },
    { concepto: "Correo electrónico", resumen: "Enviar y recibir mensajes digitales." },
  ],
  bibliografia: [{ autor: "Comfenalco Valle", anio: "2026", titulo: "Manual de Tecnología e Informática" }],
  fotoMotivacionalClave: "tortuga",
};

async function main() {
  const logoBuf = await fs.readFile(path.join(process.cwd(), "assets", "logo_comfenalco.jpg"));
  const ilustracionBuf = await generarImagenMotivacional(contenido.fotoMotivacionalClave);
  const docxBuf = await buildGuiaDocx(params, contenido, { logoBuf, ilustracionBuf });
  const outPath = "/tmp/guia_prueba.docx";
  await fs.writeFile(outPath, docxBuf);
  console.log("OK ->", outPath, docxBuf.length, "bytes");
}

main().catch((err) => {
  console.error("FALLÓ:", err);
  process.exit(1);
});
