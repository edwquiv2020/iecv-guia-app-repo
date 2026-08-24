#!/usr/bin/env python3
"""
Genera una imagen original "ruta visual" que reemplaza el esquema en texto
(Courier New) de "Imagen Representativa:" en las guías. Muestra la ruta de
pestaña > grupo > opciones como una tira tipo cinta de opciones, usando los
mismos íconos reales de Microsoft ya usados en los pasos numerados (ver
assets/iconos/ y src/lib/buildGuia.ts) — nunca una captura real de
Word/Excel/PowerPoint (evita marca registrada).

Uso (llamado desde Node vía src/lib/rutaVisual.ts, mismo contrato que
gen_imagen_motivacional_v2.py):
    python3 gen_ruta_visual.py '{"tab":"Inicio","grupo":"Alineación",
        "opciones":[{"icono":"alinear_izquierda","etiqueta":"Izquierda"},
                    {"icono":"alinear_centro","etiqueta":"Centrar"}],
        "out_path":"/tmp/x.png"}'

Uso directo en Python:
    from gen_ruta_visual import build_ruta_visual
    build_ruta_visual(
        tab="Inicio", grupo="Alineación",
        opciones=[("alinear_izquierda", "Izquierda"), ("alinear_centro", "Centrar")],
        out_path="...png",
    )
"""
import os
import sys
import json
from PIL import Image, ImageDraw, ImageFont

# ICONOS_DIR apunta por defecto a assets/iconos dentro del proyecto — el
# mismo set de íconos reales de Microsoft que usan los pasos numerados de la
# guía (src/lib/buildGuia.ts). A diferencia de la versión original de la
# skill, acá no existe una distinción institucional/nativo: todo el set ya
# es real, así que la "ruta visual" siempre usa estos mismos archivos.
ICONOS_DIR = os.environ.get(
    "ICONOS_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "iconos"),
)
FONT_DIR = os.environ.get("FONT_DIR", "/usr/share/fonts/truetype/dejavu")

PALETTE = {
    "verde_oscuro": (27, 91, 42),
    "verde_oliva": (150, 190, 60),
    "gris_claro": (235, 235, 235),
    "gris_texto": (90, 90, 90),
    "blanco": (255, 255, 255),
}


def font(path, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, path), size)


def build_ruta_visual(tab, grupo, opciones, out_path, height=190):
    """opciones: lista de (nombre_icono_sin_ext, etiqueta), tomados del mismo
    set cerrado que usan los pasos numerados (ver types.ts: ICONOS_PASOS)."""
    icon_size = 64
    pad = 24
    chip_gap = 14

    # Solo DejaVuSans.ttf regular — a diferencia de gen_imagen_motivacional_v2.py,
    # este set de fuentes (assets/fonts/dejavu/) no trae la variante Bold, así
    # que no se usa acá (evita depender de un archivo de fuente que no está en
    # el repo).
    f_tab = font("DejaVuSans.ttf", 22)
    f_grupo = font("DejaVuSans.ttf", 18)
    f_label = font("DejaVuSans.ttf", 16)
    f_chevron = font("DejaVuSans.ttf", 22)

    tmp = Image.new("RGB", (10, 10))
    d = ImageDraw.Draw(tmp)

    tab_w = d.textbbox((0, 0), tab, font=f_tab)[2] + 36
    grupo_w = d.textbbox((0, 0), grupo, font=f_grupo)[2] + 20
    chevron_w = 30

    opt_widths = [max(icon_size + 20, d.textbbox((0, 0), label, font=f_label)[2] + 16) for _, label in opciones]
    opts_total_w = sum(opt_widths) + (len(opciones) - 1) * chip_gap

    W = pad * 2 + tab_w + chevron_w + grupo_w + chevron_w + opts_total_w
    H = height

    img = Image.new("RGB", (W, H), PALETTE["gris_claro"])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=PALETTE["verde_oscuro"])

    x = pad
    y_mid = H // 2 - 10

    # chip "Inicio" (pestaña activa)
    d.rounded_rectangle([x, y_mid - 22, x + tab_w, y_mid + 22], radius=10, fill=PALETTE["verde_oscuro"])
    d.text((x + 18, y_mid - 13), tab, font=f_tab, fill=PALETTE["blanco"])
    x += tab_w

    d.text((x + 2, y_mid - 14), "›", font=f_chevron, fill=PALETTE["gris_texto"])
    x += chevron_w

    # chip grupo
    d.rounded_rectangle([x, y_mid - 18, x + grupo_w, y_mid + 18], radius=8, outline=PALETTE["verde_oliva"], width=3)
    d.text((x + 10, y_mid - 11), grupo, font=f_grupo, fill=PALETTE["verde_oscuro"])
    x += grupo_w

    d.text((x + 2, y_mid - 14), "›", font=f_chevron, fill=PALETTE["gris_texto"])
    x += chevron_w

    # íconos de opciones con etiqueta debajo
    for (name, label), opt_w in zip(opciones, opt_widths):
        icon_path = os.path.join(ICONOS_DIR, f"{name}.png")
        icon = Image.open(icon_path).convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
        img.paste(icon, (x + (opt_w - icon_size) // 2, y_mid - icon_size // 2), icon)
        lw = d.textbbox((0, 0), label, font=f_label)[2]
        d.text((x + (opt_w - lw) // 2, y_mid + icon_size // 2 + 6), label, font=f_label, fill=PALETTE["gris_texto"])
        x += opt_w + chip_gap

    img.save(out_path)
    print("Guardado:", out_path)
    return out_path


if __name__ == "__main__":
    # CLI para uso desde el backend Node (child_process), mismo contrato que
    # gen_imagen_motivacional_v2.py — un solo argumento JSON, salida JSON en
    # stdout con {"ok": true, "out_path": ...} o {"ok": false, "error": ...}.
    if len(sys.argv) > 1:
        try:
            args = json.loads(sys.argv[1])
            opciones = [(o["icono"], o["etiqueta"]) for o in args["opciones"]]
            out_path = build_ruta_visual(args["tab"], args["grupo"], opciones, args["out_path"])
            print(json.dumps({"ok": True, "out_path": out_path}))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.exit(1)
    else:
        OUT_DIR = "/tmp/rutas_visuales"
        os.makedirs(OUT_DIR, exist_ok=True)
        build_ruta_visual(
            "Inicio", "Alineación",
            [("alinear_izquierda", "Izquierda"), ("alinear_centro", "Centrar"), ("alinear_derecha", "Derecha")],
            os.path.join(OUT_DIR, "muestra_alineacion.png"),
        )
