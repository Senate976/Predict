"""Génère l'artwork statique du Sceau d'Orgueil (« ENCORE RAISON »).

Produit un PNG transparent à haute résolution : triple cercle concentrique
(deux filets noirs, un filet or/ocre) façon tampon encreur officiel, avec une
légère texture granuleuse pour un rendu encré plutôt que vectoriel plat. Le
texte « ENCORE RAISON » est gravé dans l'image (fixe), mais l'espace sous ce
texte reste vide : la date (qui change à chaque prédiction) est superposée
dynamiquement par l'app React Native, pas gravée ici.

Le cercle occupe la quasi-totalité du canevas (peu de marge transparente) :
l'app affiche cette image telle quelle dans un carré de `STAMP_DIAMETER` px
(components/PredictionCard.tsx) et positionne la date par fraction de ce
diamètre — un cercle qui ne remplirait pas tout le canevas désalignerait
cette superposition.

Usage : python3 scripts/generate_stamp.py
"""

import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 1600  # haute résolution, downscalée à la fin pour l'anticrénelage
CENTER = SIZE / 2
HALF = SIZE / 2
INK = (17, 24, 39)  # colors.text
GOLD = (156, 88, 33)  # ocre chaud, proche de colors.goldTransition désaturé

FONT_PATH = "node_modules/@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf"

# Rayons/épaisseurs en fraction du demi-canevas — le cercle va jusqu'à 97 %
# du bord, la marge restante n'existe que pour laisser respirer le flou
# gaussien final sans le rogner.
OUTER_EDGE_FRAC = 0.97
OUTER_WIDTH_FRAC = 0.044
GAP1_FRAC = 0.02
MIDDLE_WIDTH_FRAC = 0.017
GAP2_FRAC = 0.018
GOLD_WIDTH_FRAC = 0.013


def ring(draw, radius, width, color):
    bbox = [CENTER - radius, CENTER - radius, CENTER + radius, CENTER + radius]
    draw.ellipse(bbox, outline=color + (255,), width=width)


def add_grain(layer, amount=14, seed=7):
    """Érosion légère de l'alpha : quelques pixels d'encre s'effacent au
    hasard, pour un tampon usé plutôt qu'un tracé numérique parfait."""
    random.seed(seed)
    alpha = layer.split()[3]
    px = alpha.load()
    w, h = alpha.size
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] > 0 and random.randint(0, 100) < amount:
                px[x, y] = max(0, px[x, y] - random.randint(60, 180))
    layer.putalpha(alpha)
    return layer


def main():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    outer_width = HALF * OUTER_WIDTH_FRAC
    outer_centerline = HALF * OUTER_EDGE_FRAC - outer_width / 2
    ring(draw, radius=outer_centerline, width=round(outer_width), color=INK)

    middle_outer_edge = HALF * OUTER_EDGE_FRAC - HALF * OUTER_WIDTH_FRAC - HALF * GAP1_FRAC
    middle_width = HALF * MIDDLE_WIDTH_FRAC
    middle_centerline = middle_outer_edge - middle_width / 2
    ring(draw, radius=middle_centerline, width=round(middle_width), color=INK)

    gold_outer_edge = middle_outer_edge - HALF * MIDDLE_WIDTH_FRAC - HALF * GAP2_FRAC
    gold_width = HALF * GOLD_WIDTH_FRAC
    gold_centerline = gold_outer_edge - gold_width / 2
    ring(draw, radius=gold_centerline, width=round(gold_width), color=GOLD)

    inner_content_radius = gold_outer_edge - HALF * GOLD_WIDTH_FRAC

    # « ENCORE RAISON » sur une seule ligne, dimensionné pour déborder
    # légèrement sur l'anneau intérieur à ses deux extrémités.
    text = "ENCORE RAISON"
    target_width = inner_content_radius * 2.08
    font_size = 260
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    while text_w > target_width and font_size > 10:
        font_size -= 2
        font = ImageFont.truetype(FONT_PATH, font_size)
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_y = CENTER - text_h * 1.35  # au-dessus du centre : laisse la place à la date
    draw.text(
        (CENTER - text_w / 2 - bbox[0], text_y - bbox[1]),
        text,
        font=font,
        fill=INK + (255,),
    )
    print(
        "font_size", font_size,
        "text_w", round(text_w), "text_h", round(text_h),
        "text_top_frac", round(text_y / SIZE, 4),
        "text_bottom_frac", round((text_y + text_h) / SIZE, 4),
        "inner_content_radius_frac", round(inner_content_radius / SIZE, 4),
    )

    img = add_grain(img)
    img = img.filter(ImageFilter.GaussianBlur(0.6))

    final = img.resize((400, 400), Image.LANCZOS)
    final.save("assets/images/stamp-encore-raison.png", optimize=True)
    print("saved", final.size)


if __name__ == "__main__":
    main()
