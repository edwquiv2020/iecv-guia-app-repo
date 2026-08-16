import subprocess, os, tempfile
from PIL import Image

FLUENT_BASE = "/sessions/determined-sharp-johnson/mnt/GUIAS IECV 2026 CLAUDE/00_PLANTILLAS_REFERENCIA/iconos_fluent"
OUT = "/sessions/determined-sharp-johnson/mnt/outputs/icons_native"
os.makedirs(OUT, exist_ok=True)

# (nombre_salida, carpeta_fluent, archivo_svg)
ICONS = [
    ("guardar",           "Save",                   "ic_fluent_save_24_filled.svg"),
    ("negrita",           "Text Bold",              "ic_fluent_text_bold_24_filled.svg"),
    ("cursiva",           "Text Italic",            "ic_fluent_text_italic_24_filled.svg"),
    ("subrayado",         "Text Underline",         "ic_fluent_text_underline_24_filled.svg"),
    ("alinear_izquierda", "Align Left",             "ic_fluent_align_left_24_filled.svg"),
    ("alinear_centro",    "Align Center Horizontal","ic_fluent_align_center_horizontal_24_filled.svg"),
    ("cuadro_texto",      "Text Box Settings",      "ic_fluent_text_box_settings_24_filled.svg"),
    ("insertar",          "TextBox",                "ic_fluent_textbox_24_filled.svg"),
]

SIZE = 320  # tamaño final más grande (antes 160/badge ~150; iconos nativos se insertan a ~28-30px en el doc)

for name, folder, svgfile in ICONS:
    svg_path = os.path.join(FLUENT_BASE, folder, "SVG", svgfile)
    if not os.path.exists(svg_path):
        print("FALTA:", svg_path)
        continue
    fd, tmp = tempfile.mkstemp(suffix=".png", dir="/tmp")
    os.close(fd)
    subprocess.run(["convert", "-background", "none", "-density", "600", svg_path,
                     "-resize", f"{SIZE}x{SIZE}", tmp], check=True, capture_output=True)
    img = Image.open(tmp).convert("RGBA")
    img.save(os.path.join(OUT, f"{name}.png"))
    print("OK", name)

print(os.listdir(OUT))
