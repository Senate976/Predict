"""Prépare l'artwork du Sceau d'Orgueil (« ENCORE RAISON ») à partir de la
vraie photo de référence fournie par l'utilisateur.

`assets/images/stamp-encore-raison-source.png` est la photo telle quelle
(anneaux, texture, texte ET une date d'exemple « 26 NOVEMBRE 2024 » qui n'a
aucune signification — c'est un simple gabarit). Ce script :
1. Recadre la photo en carré (elle est légèrement rectangulaire).
2. Efface la date d'exemple en la recouvrant d'un aplat de papier prélevé
   juste au-dessus (préserve le grain plutôt qu'un aplat uni), sans toucher
   aux anneaux ni au texte « ENCORE RAISON ».
3. Enregistre le résultat dans `assets/images/stamp-encore-raison.png` — la
   vraie date (différente pour chaque prédiction) est superposée
   dynamiquement par l'app par-dessus cet artwork, jamais gravée ici.

Les coordonnées ci-dessous sont mesurées à la main sur la photo source
(454×460 px) ; à ne recalculer que si la source change.

Usage : python3 scripts/erase_stamp_date.py
"""

from PIL import Image

SOURCE = "assets/images/stamp-encore-raison-source.png"
OUTPUT = "assets/images/stamp-encore-raison.png"

# Recadrage en carré : la source est 454×460, on retire l'excédent en haut
# et en bas à parts égales plutôt que de déformer l'image.
CROP_TOP = 3
CROP_SIZE = 454

# Zone de la date d'exemple à effacer, mesurée sur l'image déjà recadrée.
ERASE_LEFT, ERASE_RIGHT = 75, 380
ERASE_TOP, ERASE_BOTTOM = 278, 322

# Bande de papier propre juste au-dessus de la date, réutilisée pour combler
# la zone effacée.
PATCH_TOP, PATCH_BOTTOM = 259, 277


def main():
    img = Image.open(SOURCE).convert("RGBA")
    img = img.crop((0, CROP_TOP, CROP_SIZE, CROP_TOP + CROP_SIZE))

    patch = img.crop((ERASE_LEFT, PATCH_TOP, ERASE_RIGHT, PATCH_BOTTOM))
    y = ERASE_TOP
    while y < ERASE_BOTTOM:
        h = min(patch.height, ERASE_BOTTOM - y)
        img.paste(patch.crop((0, 0, patch.width, h)), (ERASE_LEFT, y))
        y += h

    img.save(OUTPUT, optimize=True)

    date_center_frac = (ERASE_TOP + ERASE_BOTTOM) / 2 / CROP_SIZE
    print("saved", img.size)
    print("date_top_fraction ~=", round((ERASE_TOP + 4) / CROP_SIZE, 4))
    print("date_center_fraction ~=", round(date_center_frac, 4))
    print("date_rule_top_fraction ~=", round((ERASE_BOTTOM - 6) / CROP_SIZE, 4))


if __name__ == "__main__":
    main()
