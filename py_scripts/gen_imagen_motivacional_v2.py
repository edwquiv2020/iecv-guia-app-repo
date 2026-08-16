#!/usr/bin/env python3
"""
Genera la imagen de INICIO de cada guía: una foto real (animal/paisaje, banco
libre de Pexels) + una frase motivacional/dicho superpuesta en un banner
inferior semitransparente, en la paleta institucional. Reemplaza tanto la
ilustración técnica original como la versión "ícono plano dibujado" — el
docente decidió que quiere fotos reales, no dibujos, para dar más vida a la
guía.

Banco de fotos: 00_PLANTILLAS_REFERENCIA/banco_imagenes_motivacionales/*.png
(20 fotos reales, licencia Pexels — uso libre comercial/educativo sin
atribución obligatoria). Se reutilizan cíclicamente semana a semana.

Uso: from gen_imagen_motivacional_v2 import build_from_bank
     build_from_bank("tortuga", out_path)  # usa la frase ya asignada
  o  build_from_bank("tortuga", out_path, frase="...", autor="...")  # override
"""
import os
import sys
import json
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# NOTA (app web): BANCO_DIR apunta por defecto a assets/banco_fotos dentro del
# proyecto, que hoy contiene PLACEHOLDERS generados (no las 20 fotos reales de
# Pexels de la carpeta de Drive "GUIAS IECV 2026 CLAUDE/00_PLANTILLAS_REFERENCIA/
# banco_imagenes_motivacionales"). Reemplaza esos archivos por las fotos reales
# (mismo nombre de archivo, ej. tortuga.png) o apunta BANCO_DIR a esa carpeta
# sincronizada, y esta función sigue funcionando igual.
BANCO_DIR = os.environ.get(
    "BANCO_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "banco_fotos"),
)
FONT_DIR = os.environ.get("FONT_DIR", "/usr/share/fonts/truetype/dejavu")

PALETTE = {
    "verde_oscuro": (27, 91, 42),
    "amarillo": (240, 190, 60),
    "crema": (250, 247, 238),
}

W_TARGET = 1000  # ancho final de la imagen en el documento

# Banco de 20 fotos con su frase/dicho ya asignado (rotación por defecto).
# Puedes usar una frase distinta pasando frase= al llamar build_from_bank().
BANCO = {
    "tortuga":          ("La constancia vence lo que la dicha no alcanza.", "Dicho popular"),
    "buho":             ("La sabiduría no llega sola: se construye con cada pregunta que te atreves a hacer.", None),
    "leon":             ("No se trata de la fuerza que tienes, sino del coraje que muestras al actuar.", None),
    "elefante":         ("Los grandes logros piden tiempo, paciencia y no olvidar por qué empezaste.", None),
    "aguila":           ("Vuela alto quien se atreve a mirar más allá de lo conocido.", None),
    "delfin":           ("No es la especie más fuerte la que sobrevive, sino la que mejor se adapta al cambio.", "Charles Darwin"),
    "lobo":             ("Solo se llega rápido; acompañado se llega más lejos.", "Proverbio africano"),
    "montana_amanecer": ("No hay viento favorable para el que no sabe a dónde va.", "Séneca"),
    "sendero_bosque":   ("Se hace camino al andar.", "Antonio Machado"),
    "oceano_rocas":     ("La gota de agua horada la piedra, no por su fuerza, sino por su constancia.", "Ovidio"),
    "desierto":         ("Después de la dificultad viene el alivio.", "Dicho popular"),
    "cascada":          ("La fuerza tranquila también transforma el camino.", None),
    "girasoles":        ("Gira siempre hacia la luz, incluso en los días nublados.", None),
    "mariposa":         ("No temas a los cambios: a veces son el inicio de algo mejor.", None),
    "colibri":          ("Hago lo que puedo, que es lo que puedo hacer.", "Fábula del colibrí"),
    "caballo":          ("La libertad se conquista con esfuerzo, paso a paso.", None),
    "estrellas":        ("Apunta a las estrellas: aunque falles, caerás entre ellas.", None),
    "brujula":          ("Quien tiene un porqué encuentra siempre un cómo.", "Viktor Frankl"),
    "atardecer_playa":  ("Cada final del día es un nuevo comienzo mañana.", None),
    "bosque_pino":      ("Un bosque crece árbol por árbol; un futuro se construye día a día.", None),
}


def font(path, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, path), size)


def build_from_bank(clave, out_path, frase=None, autor=None, banner_ratio=0.30):
    """clave: nombre del archivo en el banco (sin .png), ej. 'tortuga'."""
    src = os.path.join(BANCO_DIR, f"{clave}.png")
    if not os.path.exists(src):
        raise FileNotFoundError(f"No existe la foto '{clave}' en el banco: {src}")
    if frase is None:
        if clave not in BANCO:
            raise ValueError(f"'{clave}' no tiene frase asignada por defecto; pasa frase= explícitamente.")
        frase, autor = BANCO[clave]

    img = Image.open(src).convert("RGB")
    w, h = img.size
    new_h = int(w_target_h := round(W_TARGET * h / w))
    img = img.resize((W_TARGET, new_h), Image.LANCZOS)

    banner_h = int(new_h * banner_ratio)
    draw = ImageDraw.Draw(img, "RGBA")

    # scrim degradado oscuro en la parte inferior para que el texto siempre
    # sea legible, cualquiera sea la foto de fondo
    scrim = Image.new("RGBA", (W_TARGET, banner_h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(scrim)
    for y in range(banner_h):
        alpha = int(190 * (y / banner_h))
        sdraw.line([(0, y), (W_TARGET, y)], fill=(20, 40, 25, alpha))
    img.paste(Image.alpha_composite(img.crop((0, new_h - banner_h, W_TARGET, new_h)).convert("RGBA"), scrim),
              (0, new_h - banner_h))

    # franja superior amarilla (identidad institucional)
    draw.rectangle([0, 0, W_TARGET, 10], fill=PALETTE["amarillo"])

    f_frase = font("DejaVuSerif-Italic.ttf", 30)
    f_autor = font("DejaVuSans.ttf", 20)
    wrapped = textwrap.fill(f'"{frase}"', width=52)
    lines = wrapped.split("\n")
    line_h = 38
    total_h = len(lines) * line_h + (28 if autor else 0)
    y = new_h - banner_h + (banner_h - total_h) // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=f_frase)
        tw = bbox[2] - bbox[0]
        # sombra sutil para legibilidad extra
        draw.text(((W_TARGET - tw) / 2 + 1, y + 1), line, font=f_frase, fill=(0, 0, 0, 160))
        draw.text(((W_TARGET - tw) / 2, y), line, font=f_frase, fill=PALETTE["crema"])
        y += line_h
    if autor:
        atext = f"— {autor}"
        bbox = draw.textbbox((0, 0), atext, font=f_autor)
        tw = bbox[2] - bbox[0]
        draw.text(((W_TARGET - tw) / 2, y + 4), atext, font=f_autor, fill=PALETTE["amarillo"])

    img.save(out_path)
    print(f"Guardado: {out_path}  (foto={clave}, frase='{frase[:40]}...')")
    return out_path


if __name__ == "__main__":
    # CLI para uso desde el backend Node (child_process):
    #   python3 gen_imagen_motivacional_v2.py '{"clave":"tortuga","out_path":"/tmp/x.png"}'
    # Sin argumentos: genera 5 muestras (comportamiento original de la skill).
    if len(sys.argv) > 1:
        try:
            args = json.loads(sys.argv[1])
            out_path = build_from_bank(
                args["clave"], args["out_path"],
                frase=args.get("frase"), autor=args.get("autor"),
            )
            print(json.dumps({"ok": True, "out_path": out_path}))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.exit(1)
    else:
        OUT_DIR = "/tmp/imagenes_motivacionales_v2"
        os.makedirs(OUT_DIR, exist_ok=True)
        for clave in ["tortuga", "buho", "montana_amanecer", "brujula", "sendero_bosque"]:
            build_from_bank(clave, os.path.join(OUT_DIR, f"muestra_{clave}.png"))
