# Generador de Guía de Formación — IECV

App web que reemplaza el flujo manual de la skill `iecv-guia-formacion`: el
docente entra con su cuenta de Google, arma el calendario del curso y desde
ahí genera los documentos (Guía de Formación, versión DUA, exámenes,
cuestionario Kahoot) llamando a la API de Anthropic para redactar el
contenido pedagógico, igual que hacía la skill en el chat.

## Qué hace hoy

- **Login con Google** (`src/auth.ts`, Auth.js v5) — cualquier cuenta de
  Google puede intentar entrar, pero solo pasa si su correo está activo en
  la tabla `usuarios_autorizados`. Sin sesión válida, `src/proxy.ts`
  redirige a todo el sitio al login.
- **Catálogo académico** en Postgres: cursos, ciclos, temas por curso (la
  malla, cargada vía `/admin/mallas` o los scripts de `db/`), jornadas y
  bloques de horario.
- **Calendario del curso** (`/horarios`): arma o edita semana a semana qué
  curso/tema/actividad corresponde a cada fecha, por ciclo y jornada, con
  detección de conflictos contra filas creadas al vuelo desde el generador.
- **Generación de Guía de Formación** (`/`, `src/app/api/generar-guia/route.ts`):
  - Contenido pedagógico con la API de Anthropic (`src/lib/anthropic.ts`):
    saludo, introducción, competencia/desempeño, reflexión inicial,
    explicación por subtema, talleres, rúbrica específica y bibliografía —
    con tool use para forzar salida estructurada, y un reintento si el
    modelo omite algún campo.
  - Imagen de INICIO (foto + frase motivacional), generada por el script
    Python original de la skill sin reescribir su lógica
    (`py_scripts/gen_imagen_motivacional_v2.py`, invocado desde
    `src/lib/images.ts`).
  - Ensamblado del `.docx` (`src/lib/buildGuia.ts`): encabezado, tabla de
    datos del estudiante, tabla de cargue, íconos reales de Microsoft en
    los pasos de procedimiento, estilo de rúbrica y una "ruta visual" por
    subtema (tira pestaña > grupo > opciones de la cinta real de
    Word/Excel/PowerPoint, generada por
    `py_scripts/gen_ruta_visual.py` vía `src/lib/rutaVisual.ts`) para los
    subtemas que son un procedimiento concreto — si falla, ese subtema
    simplemente no la trae, nunca bloquea la guía completa.
  - Versión **DUA** (adaptada/accesible) encadenada a partir del subtema A
    de la Estándar, para que ambas queden consistentes.
  - Cuestionario **Kahoot** (`.xlsx`, `src/lib/buildKahoot.ts`) generado
    siempre junto con la guía Estándar.
  - **Kit de subida manual** (`src/lib/buildKit.ts`) con las instrucciones
    para subir a Moodle/Kahoot a mano — la app no sube nada automáticamente.
- **Generación de exámenes** (`/examenes`,
  `src/app/api/generar-examen/route.ts`): diagnóstico, intermedio y final,
  con las mismas ideas de contenido vía IA + ensamblado en
  `src/lib/buildExamen.ts` + su propio kit de subida.
- **Persistencia real**: cada guía/examen generado se guarda en Postgres
  (metadata + el `contenido` pedagógico de la IA, auditable sin volver a
  llamarla) y los binarios en Supabase Storage (bucket privado), con
  descarga vía signed URL de corta duración
  (`src/app/api/guias/archivos/[id]/route.ts`).
- **Administración de mallas** (`/admin/mallas`): alta/edición/baja de
  temas por curso, sin tocar código ni JSON a mano — restringido a docentes
  con rol `admin` (ver "Control de acceso por rol" abajo); el resto solo
  puede leer el catálogo, no editarlo.
- **Administración de docentes** (`/admin/usuarios`, también admin-only):
  agregar un docente nuevo, activar/desactivar su acceso y cambiar su rol,
  sin tocar la base de datos a mano. Con guardia explícita: nadie puede
  desactivarse ni quitarse el rol admin a sí mismo, para no bloquear el
  acceso por accidente.
- **Sincronización de mallas desde Google Drive** (botón "Sincronizar
  desde Drive" en `/admin/mallas`, ver sección propia abajo): trae la
  malla de un curso desde el Sheet correspondiente en
  `01_MALLAS_CONTENIDO/` hacia Postgres, bajo demanda — el resto de la app
  sigue leyendo de Postgres como siempre.

Todo lo anterior está probado de punta a punta (generación real de guía,
DUA, examen y Kahoot, conversión a PDF para revisión visual) y pasando en
CI: lint, typecheck, tests y build en cada push/PR (`.github/workflows/ci.yml`).

## Qué falta (deliberadamente fuera de esta versión)

1. **Guardar el `.docx`/`.xlsx` generado de vuelta en Drive.** Hoy se
   guarda en Supabase Storage; no se sube a
   `02_GUIAS_GENERADAS/` en Drive.
2. **Subida automática a Kahoot/Moodle.** Fuera de alcance a propósito —
   la app entrega el kit de subida manual, nunca sube nada por su cuenta.

Nota: el borrado de filas del calendario (`DELETE /api/calendario`) sigue
abierto a cualquier docente autorizado — es parte del flujo normal de
`/horarios` (corregir su propia carga), no una acción de administración de
catálogo como editar la malla.

## Cómo correrlo

```bash
npm install
cp .env.example .env.local   # y completa las variables (ver abajo)
npm run dev
```

Abre `http://localhost:3000`.

### Variables de entorno (`.env.local`)

| Variable | Para qué |
| --- | --- |
| `ANTHROPIC_API_KEY` | Generación de contenido pedagógico (guías, DUA, exámenes, Kahoot). |
| `DATABASE_URL` | Conexión a Postgres (catálogo, calendario, guías). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Cliente server-side de Supabase Storage (binarios generados). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | OAuth de Google para el login (Auth.js). |
| `AUTH_SECRET` | Firma de sesión de Auth.js. |
| `FONT_DIR` | Carpeta de fuentes DejaVu que usan los scripts Python de la imagen motivacional y la ruta visual (por defecto `/usr/share/fonts/truetype/dejavu`, ya instalado en el `Dockerfile`; en Mac local usa `assets/fonts/dejavu`, ver `.env.local`). |
| `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_DRIVE_MALLAS_FOLDER_ID` | Cuenta de servicio y carpeta de Drive para "Sincronizar desde Drive" en `/admin/mallas` (ver sección propia abajo). |
| `LIMITE_GENERACIONES_DIA` | Tope de generaciones con IA por docente cada 24h en `/api/generar-guia` y `/api/generar-examen` (protección de costo). Opcional — por defecto 30. |

### Base de datos

```bash
node db/migrate.mjs          # esquema completo (drop + create) — solo para un entorno nuevo
node db/migrate_auth.mjs     # migración aditiva: tabla usuarios_autorizados
node db/migrate_guia_archivos.mjs  # migración aditiva: persistencia de guías/exámenes
node db/migrate_roles.mjs    # migración aditiva: columna rol (docente/admin)
node db/migrate_rate_limit.mjs  # migración aditiva: tabla generaciones_log (límite diario)
node db/seed.mjs             # jornadas y ciclos base
node db/seed_horarios.mjs    # bloques de horario por jornada
node db/seed_temas.mjs <curso-slug> db/malla_<curso>.json  # malla de un curso
node db/verify.mjs           # conteo de filas por tabla, para verificar la carga
```

Después de cargar la base, agrega manualmente en `usuarios_autorizados` el
primer docente admin (ver abajo) — desde ahí ya puede agregar al resto
desde `/admin/usuarios`.

### Control de acceso por rol

`usuarios_autorizados.rol` distingue dos niveles:

- `docente` (default): puede generar guías, exámenes y cargar horarios.
  Solo puede **leer** el catálogo de mallas, no editarlo.
- `admin`: además puede crear/editar/eliminar temas en `/admin/mallas` y
  gestionar otros docentes en `/admin/usuarios` (agregar, activar/
  desactivar, cambiar rol).

Un docente sin rol `admin` que visite `/admin/mallas` o `/admin/usuarios`
es redirigido a `/` (gate a nivel de página), y las rutas mutantes de
`/api/temas` y `/api/usuarios` devuelven `403` si intenta llamarlas
directo — el gate real vive ahí, no en la UI. `GET /api/temas` sigue
abierto a cualquier docente autenticado (lo necesita el formulario de
generar guía). En `/admin/usuarios`, nadie puede desactivarse ni quitarse
el rol admin a sí mismo (ni desde la UI ni pegándole directo a la API) —
evita que un admin se bloquee el acceso por accidente.

Para promover el primer admin después de correr `migrate_roles.mjs` (los
siguientes ya se agregan desde `/admin/usuarios`):

```sql
update usuarios_autorizados set rol = 'admin' where email = 'tu-correo@gmail.com';
```

### Sincronización de mallas desde Google Drive

`/admin/mallas` tiene un botón "Sincronizar desde Drive" (por curso) que
trae la malla desde el Sheet correspondiente en la carpeta de Drive
`01_MALLAS_CONTENIDO/` hacia Postgres. No es lectura en vivo en cada
request — es una sincronización bajo demanda que dispara el admin; el
resto de la app (formulario de guía, exámenes, etc.) sigue leyendo
siempre de Postgres, nunca de Drive directamente.

**Autenticación**: cuenta de servicio de Google Cloud (no el login de los
docentes) — la carpeta se comparte UNA vez como lectora con el
`client_email` de esa cuenta, y la app nunca guarda ni renueva un token
por docente. Variables en `.env.local`:

- `GOOGLE_SERVICE_ACCOUNT_KEY`: el JSON completo descargado al crear la
  cuenta de servicio, en una sola línea.
- `GOOGLE_DRIVE_MALLAS_FOLDER_ID`: el id de la carpeta
  `01_MALLAS_CONTENIDO/` (de su URL en Drive).

**Cómo empareja archivo↔curso**: un Google Sheet por curso (mismo
esquema de columnas que ya usa la app: `numero | tema | subtemas |
url_video | archivo_kahoot`, encabezado en la fila 1, mapeado por nombre
de columna, no por posición). El nombre del curso en Postgres (`cursos.nombre`)
se compara contra el nombre del archivo en Drive (sin tildes/mayúsculas,
por contención en cualquier sentido — ej. curso "Microsoft Word" matchea
un archivo "Malla Microsoft Word 2026"). Si hay más de un Sheet que
coincide, la sincronización falla con un error explícito en vez de
adivinar cuál usar — hay que renombrar el archivo ambiguo en Drive.

**No destructivo**: solo inserta/actualiza temas por `(curso, numero)`
(`src/lib/googleDrive.ts`, `src/app/api/mallas/sincronizar-drive/route.ts`)
— nunca desactiva un tema que ya no esté en el Sheet. Si se borra una fila
en Drive, hay que desactivar ese tema a mano desde `/admin/mallas`.

### Límite diario de generaciones con IA

`/api/generar-guia` y `/api/generar-examen` llevan un tope de
generaciones por docente cada 24 horas (`src/lib/rateLimit.ts`), configurable
con `LIMITE_GENERACIONES_DIA` (por defecto 30). Cada intento queda
registrado en `generaciones_log` **antes** de llamar a Anthropic y cuenta
aunque termine en error — los reintentos internos de `anthropic.ts`
también cuestan. Al alcanzar el tope, la ruta responde `429` con un
mensaje claro en vez de seguir llamando a la API. Es una protección
adicional, no reemplaza un tope de gasto configurado en la consola de
Anthropic.

### Prueba sin gastar API de Anthropic

`test_build.ts` genera un `.docx` de ejemplo con contenido fijo (sin llamar
a la API), útil para probar cambios en el formato del documento o en la
imagen motivacional:

```bash
npx tsx test_build.ts   # genera /tmp/guia_prueba.docx
```

### Tests y CI

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Los mismos cuatro pasos corren en GitHub Actions en cada push/PR a `main`.
Además de las utilidades puras (`sumarDias`, tipos) y los smoke tests de
`buildGuia`/`buildKahoot`, hay dos capas de tests sobre la generación con IA:

- **Integración de las rutas** — `POST /api/generar-guia` y
  `POST /api/generar-examen`
  (`src/app/api/generar-guia/__tests__/route.test.ts`,
  `src/app/api/generar-examen/__tests__/route.test.ts`). Mockean los bordes
  externos (Anthropic, los scripts Python de imagen motivacional/ruta
  visual y Postgres) y ejercen de verdad el ensamblado de los
  `.docx`/`.xlsx` (incluida la variante multipart con imágenes subidas por
  el docente) — una regresión en la orquestación o en el armado real de los
  documentos rompe el CI en vez de descubrirse generando una guía real.
- **Unit tests de `anthropic.ts`** (`src/lib/__tests__/anthropic.test.ts`) —
  mockean solo `client.messages.create` del SDK (nunca llaman la API real)
  y ejercen la lógica propia del archivo: extracción de `tool_use`,
  validación de contenido incompleto, el reintento (hasta 2 intentos) y el
  enriquecimiento posterior a la respuesta del modelo (bibliografía
  teórica, foto motivacional por rotación de semana, etc.) para las 5
  funciones exportadas (guía, DUA, Kahoot, diagnóstico, examen).
- **Unit tests de `googleDrive.ts`** (`src/lib/__tests__/googleDrive.test.ts`)
  — mockean `drive.files.list`/`sheets.spreadsheets.values.get` del SDK de
  `googleapis` y ejercen el matching de archivo↔curso (incluida la
  ambigüedad de más de una coincidencia) y el parseo de filas del Sheet
  (mapeo de columnas por encabezado, filas vacías, encabezado inválido).
- **Unit tests de `rateLimit.ts`** (`src/lib/__tests__/rateLimit.test.ts`)
  — el cálculo dentro/fuera de límite, el override por
  `LIMITE_GENERACIONES_DIA` y su caída al valor por defecto si no es un
  número válido. Las rutas de generar-guia/generar-examen también prueban
  el `429` real y que no llamen al modelo cuando el tope ya se alcanzó.

## Despliegue

Este proyecto necesita Python3 + Pillow además de Node (para la imagen
motivacional), así que **Vercel no sirve tal cual** (sus funciones
serverless no traen Python). Usa el `Dockerfile` incluido en un host que
soporte contenedores personalizados — Railway o Render son los más directos.

## Estructura

```
src/app/page.tsx                       formulario de guía
src/app/examenes/page.tsx              formulario de exámenes
src/app/horarios/page.tsx              calendario del curso
src/app/admin/mallas/page.tsx          gate de rol admin (server) + renderiza MallasEditor
src/app/admin/mallas/MallasEditor.tsx  administración de temas por curso (client)
src/app/admin/usuarios/page.tsx        gate de rol admin (server) + renderiza UsuariosEditor
src/app/admin/usuarios/UsuariosEditor.tsx  alta/activo/rol de docentes autorizados (client)
src/app/acceso-denegado/page.tsx       pantalla de correo no autorizado
src/app/error.tsx                      error boundary de page/examenes/horarios/admin
src/app/global-error.tsx               error boundary del layout raíz (falla auth/SessionProvider)
src/app/not-found.tsx                  pantalla para rutas que no existen
src/auth.ts                            configuración de Auth.js (Google + whitelist + rol)
src/types/next-auth.d.ts               tipos de sesión/JWT extendidos con el rol
src/proxy.ts                           protege todo el sitio salvo /api/auth y estáticos
src/app/api/generar-guia/route.ts      orquesta guía Estándar + DUA + Kahoot + kit
src/app/api/generar-examen/route.ts    orquesta diagnóstico/intermedio/final + kit
src/app/api/guias/route.ts             registra guías/exámenes generados (Postgres + Storage)
src/app/api/guias/archivos/[id]/route.ts  descarga vía signed URL de Supabase
src/app/api/calendario/route.ts        CRUD del calendario del curso
src/app/api/temas/route.ts             CRUD de temas (malla) por curso
src/app/api/mallas/sincronizar-drive/route.ts  trae la malla de un curso desde Drive hacia Postgres
src/app/api/usuarios/route.ts          lista/alta de docentes autorizados (admin-only)
src/app/api/catalogo/route.ts          ciclos, cursos, jornadas, actividades
src/lib/types.ts                       tipos compartidos
src/lib/anthropic.ts                   generación de contenido con IA (guías, DUA, exámenes, Kahoot)
src/lib/images.ts                      wrapper Node -> Python (imagen motivacional)
src/lib/rutaVisual.ts                  wrapper Node -> Python (ruta visual por subtema)
src/lib/buildGuia.ts                   ensamblado del .docx de la guía (Estándar y DUA)
src/lib/buildExamen.ts                 ensamblado del .docx de exámenes/diagnóstico
src/lib/buildKahoot.ts                 ensamblado del .xlsx del cuestionario Kahoot
src/lib/buildKit.ts                    ensamblado del kit de subida manual
src/lib/db.ts                          cliente Postgres compartido
src/lib/storage.ts                     cliente Supabase Storage compartido
src/lib/googleDrive.ts                 lectura de mallas desde Drive (cuenta de servicio)
src/lib/rateLimit.ts                   límite diario de generaciones con IA por docente
db/                                    schema.sql, migraciones aditivas, seeds y mallas por curso
py_scripts/                            scripts Python de la skill original en uso (imagen motivacional, ruta visual)
assets/logo_comfenalco.jpg             logo real (bajado de Drive)
assets/banco_fotos/                    banco de 20 fotos reales (bajadas de Drive)
assets/iconos/                         íconos reales de Microsoft usados en pasos de procedimiento
reference_build_guia.js.txt            script original de la skill, como referencia
```
