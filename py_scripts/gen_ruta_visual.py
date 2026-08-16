#!/usr/bin/env python3
"""
Genera una imagen original "ruta visual" que reemplaza el esquema en texto
(Courier New) de "Imagen Representativa:" en las guías. Muestra la ruta de
pestaña > grupo > opciones como una tira tipo cinta de opciones, usando los
mismos íconos-insignia institucionales ya generados — nunca una captura real
de Word/Excel/PowerPoint (evita marca registrada).

Uso:
    from gen_ruta_visual import build_ruta_visual
    build_ruta_visual(
        tab="Inicio", grupo="Alineación",
        opciones=[("alinear_izquierda", "Izquierda"), ("alinear_centro", "Centrar"),
                  ("combinar_centrar", "Combinar y centrar")],
        out_path="...png",
    )
"""
import os
from PIL import Image, ImageDraw, ImageFont

ICONOS_DIR = "/sessions/determined-sharp-johnson/mnt/GUIAS IECV 2026 CLAUDE/00_PLANTILLAS_REFERENCIA/iconos_pasos_institucionales"
ICONOS_NATIVOS_DIR = "/sessions/determined-sharp-johnson/mnt/GUIAS IECV 2026 CLAUDE/00_PLANTILLAS_REFERENCIA/iconos_pasos_nativos_ms"
FONT_DIR = "/usr/share/fonts/truetype/dejavu"

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
    """opciones: lista de (nombre_icono_sin_ext, etiqueta) o (nombre_icono_sin_ext, etiqueta, native)
    donde native=True usa el ícono real de Microsoft (iconos_pasos_nativos_ms) sin recolorear, en vez
    del badge institucional propio."""
    opciones = [(o[0], o[1], o[2] if len(o) > 2 else False) for o in opciones]
    icon_size = 64
    pad = 24
    chip_gap = 14

    f_tab = font("DejaVuSans-Bold.ttf", 22)
    f_grupo = font("DejaVuSans.ttf", 18)
    f_label = font("DejaVuSans.ttf", 16)
    f_chevron = font("DejaVuSans-Bold.ttf", 22)

    tmp = Image.new("RGB", (10, 10))
    d = ImageDraw.Draw(tmp)

    tab_w = d.textbbox((0, 0), tab, font=f_tab)[2] + 36
    grupo_w = d.textbbox((0, 0), grupo, font=f_grupo)[2] + 20
    chevron_w = 30

    opt_widths = [max(icon_size + 20, d.textbbox((0, 0), label, font=f_label)[2] + 16) for _, label, _ in opciones]
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
    for (name, label, native), opt_w in zip(opciones, opt_widths):
        base_dir = ICONOS_NATIVOS_DIR if native else ICONOS_DIR
        icon_path = os.path.join(base_dir, f"{name}.png")
        icon = Image.open(icon_path).convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
        img.paste(icon, (x + (opt_w - icon_size) // 2, y_mid - icon_size // 2), icon)
        lw = d.textbbox((0, 0), label, font=f_label)[2]
        d.text((x + (opt_w - lw) // 2, y_mid + icon_size // 2 + 6), label, font=f_label, fill=PALETTE["gris_texto"])
        x += opt_w + chip_gap

    img.save(out_path)
    print("Guardado:", out_path)
    return out_path


if __name__ == "__main__":
    OUT_DIR = "/sessions/determined-sharp-johnson/mnt/outputs/rutas_visuales"
    os.makedirs(OUT_DIR, exist_ok=True)
    build_ruta_visual(
        "Inicio", "Alineación",
        [("alinear_izquierda", "Izquierda"), ("alinear_centro", "Centrar"), ("combinar_centrar", "Combinar y centrar")],
        os.path.join(OUT_DIR, "muestra_alineacion.png"),
    )
