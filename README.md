# Generador de Guía de Formación — IECV

App web que reemplaza el flujo manual de la skill `iecv-guia-formacion`: el
docente llena un formulario con los parámetros de la semana y la app genera
el `.docx` de la Guía de Formación (FTO-EDU-FOR-96 V3), llamando a la API de
Anthropic para redactar el contenido pedagógico igual que hacía la skill en
el chat.

## Qué SÍ funciona hoy (v1 — probado de punta a punta)

- Formulario (`src/app/page.tsx`): CLEI, jornada, semana/guía, fechas, tema,
  subtemas, video de apoyo.
- Generación de contenido pedagógico con la API de Anthropic
  (`src/lib/anthropic.ts`): saludo, introducción, competencia/desempeño,
  reflexión inicial, explicación por subtema, talleres, rúbrica específica y
  bibliografía — usando tool use para forzar una salida estructurada.
- Imagen de INICIO (foto + frase motivacional), reutilizando el script
  Python original de la skill sin reescribir su lógica
  (`py_scripts/gen_imagen_motivacional_v2.py`, invocado desde
  `src/lib/images.ts`).
- Ensamblado del `.docx` (`src/lib/buildGuia.ts`), puerto a TypeScript de
  `scripts/build_guia.js` de la skill: mismo encabezado, tabla de datos del
  estudiante, tabla de cargue y estilo de rúbrica ya validados contra los
  documentos reales del docente.
- Endpoint `POST /api/generar-guia` que orquesta todo y devuelve el `.docx`
  para descarga directa desde el navegador.

Verificado generando una guía de ejemplo (CLEI III, tema "Introducción a
Internet") y convirtiéndola a PDF para revisión visual — el encabezado, logo,
tablas y contenido salen correctos.

## Qué falta (deliberadamente fuera de esta v1, por alcance acordado)

1. **Login de docentes.** Hoy la app no tiene autenticación. El plan
   acordado es login con Google (esto además resuelve el acceso a Drive en
   el mismo paso). Sugerido: `next-auth` con el proveedor de Google.
2. **Lectura en vivo desde Google Drive.** La app hoy NO lee la malla de
   contenidos (`01_MALLAS_CONTENIDO/`) ni el banco de fotos real desde la
   carpeta de Drive `GUIAS IECV 2026 CLAUDE` — el docente escribe el tema y
   los subtemas directamente en el formulario. Conectar Drive requiere el
   login de Google del punto anterior + la librería `googleapis`.
3. **Banco de fotos real.** `assets/banco_fotos/` contiene 20 imágenes
   PLACEHOLDER (fondos de color generados, NO las fotos reales de Pexels).
   Para usar las reales: descarga las 20 fotos de
   `00_PLANTILLAS_REFERENCIA/banco_imagenes_motivacionales/` en Drive y
   reemplaza los archivos en `assets/banco_fotos/` con el mismo nombre
   (`tortuga.png`, `buho.png`, etc.) — el código no necesita ningún cambio.
4. **Ruta visual por subtema** (la tira de íconos "pestaña > grupo >
   opciones"). El script `py_scripts/gen_ruta_visual.py` ya está copiado en
   el proyecto (igual que `gen_icons_native.py` y
   `build_cuestionario_kahoot.py`, para el Kahoot de v2) pero ninguno de los
   tres está conectado todavía a `buildGuia.ts` / `route.ts` — se omitió en
   v1 para no depender de tener los íconos institucionales bien poblados; el
   subtema igual queda completo solo con el texto de "Función".
5. **Guía de Refuerzo, Examen Intermedio/Final, Kahoot.** Alcance v2, tal
   como se acordó ("empezamos solo con la guía semanal").
6. **Guardar el `.docx` generado de vuelta en Drive**
   (`02_GUIAS_GENERADAS/`). Hoy solo se descarga al navegador.

## Cómo correrlo

```bash
npm install
cp .env.example .env.local   # y pega tu ANTHROPIC_API_KEY
npm run dev
```

Abre `http://localhost:3000`.

### Prueba sin gastar API de Anthropic

`test_build.ts` genera un `.docx` de ejemplo con contenido fijo (sin llamar
a la API), útil para probar cambios en el formato del documento o en la
imagen motivacional:

```bash
npx tsx test_build.ts   # genera /tmp/guia_prueba.docx
```

## Despliegue

Este proyecto necesita Python3 + Pillow además de Node (para la imagen
motivacional), así que **Vercel no sirve tal cual** (sus funciones
serverless no traen Python). Usa el `Dockerfile` incluido en un host que
soporte contenedores personalizados — Railway o Render son los más directos.

## Estructura

```
src/app/page.tsx                 formulario
src/app/api/generar-guia/route.ts endpoint que orquesta todo
src/lib/types.ts                 tipos compartidos
src/lib/anthropic.ts             generación de contenido con IA
src/lib/images.ts                wrapper Node -> Python (imagen motivacional)
src/lib/buildGuia.ts             ensamblado del .docx (puerto de build_guia.js)
py_scripts/                      scripts Python originales de la skill (reutilizados)
assets/logo_comfenalco.jpg       logo real (bajado de Drive)
assets/banco_fotos/              banco de fotos — HOY SON PLACEHOLDERS, ver punto 3 arriba
reference_build_guia.js.txt      script original de la skill, como referencia
```
