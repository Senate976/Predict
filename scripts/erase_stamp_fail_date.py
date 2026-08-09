"""Prépare l'artwork du tampon « FAIL » (verdict manqué) à partir de la
vraie photo de référence fournie par l'utilisateur.

Même principe que erase_stamp_date.py (voir ce fichier pour le détail) :
`assets/images/stamp-fail-source.png` est la photo telle quelle, avec une
date d'exemple sans signification. Seule différence de mise en page : le
trait doré est ici gravé AU-DESSUS de la date (pas en dessous comme pour
« ENCORE RAISON ») — on le laisse tel quel dans l'artwork, seule la date
elle-même est effacée puis superposée dynamiquement par l'app.

Usage : python3 scripts/erase_stamp_fail_date.py
"""

from PIL import Image

from stamp_lib import erase_region_flat, make_background_transparent

SOURCE = "assets/images/stamp-fail-source.png"
OUTPUT = "assets/images/stamp-fail.png"

# Recadrage en carré : la source est 463×459, on retire l'excédent en
# largeur à parts égales plutôt que de déformer l'image.
CROP_LEFT = 2
CROP_SIZE = 459

# Zone de la date d'exemple à effacer (le trait doré au-dessus reste intact).
# Contrairement à « ENCORE RAISON », le texte est ici légèrement incliné et
# l'anneau intérieur frôle la date de près : aucune bande de papier propre
# assez grande à copier, on utilise donc un aplat (`erase_region_flat`)
# plutôt qu'une texture copiée.
ERASE_LEFT, ERASE_RIGHT = 145, 365
ERASE_TOP, ERASE_BOTTOM = 303, 363

# Coin propre, loin de toute encre, dont la couleur moyenne comble la zone
# effacée.
COLOR_SAMPLE_BOX = (5, 5, 60, 60)


def main():
    img = Image.open(SOURCE).convert("RGBA")
    img = img.crop((CROP_LEFT, 0, CROP_LEFT + CROP_SIZE, CROP_SIZE))

    img = erase_region_flat(
        img,
        (ERASE_LEFT, ERASE_TOP, ERASE_RIGHT, ERASE_BOTTOM),
        COLOR_SAMPLE_BOX,
    )
    img = make_background_transparent(img)

    img.save(OUTPUT, optimize=True)

    date_center_frac = (ERASE_TOP + ERASE_BOTTOM) / 2 / CROP_SIZE
    print("saved", img.size)
    print("date_top_fraction ~=", round((ERASE_TOP + 4) / CROP_SIZE, 4))
    print("date_center_fraction ~=", round(date_center_frac, 4))


if __name__ == "__main__":
    main()
