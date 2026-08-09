"""Fonctions partagées par les scripts `erase_stamp_*.py` (Sceau d'Orgueil).

Chaque tampon (« ENCORE RAISON », « FAIL », ...) part d'une vraie photo de
référence sur fond de papier opaque, avec une date d'exemple gravée dedans.
Ce module fournit les deux traitements communs : effacer une zone (la date
d'exemple, recouverte par un aplat de papier prélevé ailleurs sur la photo)
et détourer le fond de papier en transparence.
"""

TRANSPARENT_ABOVE_LUMA = 230
OPAQUE_BELOW_LUMA = 200


def erase_region(img, erase_box, patch_box):
    """Recouvre `erase_box` (left, top, right, bottom) par des copies
    verticales de `patch_box` — une bande de papier propre prélevée ailleurs
    sur la même photo, pour conserver son grain plutôt qu'un aplat uni."""
    left, top, right, bottom = erase_box
    patch = img.crop(patch_box)
    y = top
    while y < bottom:
        h = min(patch.height, bottom - y)
        img.paste(patch.crop((0, 0, patch.width, h)), (left, y))
        y += h
    return img


def erase_region_flat(img, erase_box, color_sample_box):
    """Comme `erase_region`, mais avec un aplat de la couleur moyenne
    prélevée dans `color_sample_box` — pour les mises en page trop exiguës
    (texte incliné, anneau qui frôle la zone) où aucune bande de papier
    propre n'est assez grande à copier verticalement."""
    from PIL import ImageDraw

    sample = img.crop(color_sample_box).getdata()
    n = len(sample)
    avg = tuple(sum(c[i] for c in sample) // n for i in range(4))
    ImageDraw.Draw(img).rectangle(erase_box, fill=avg)
    return img


def make_background_transparent(img):
    """Détoure le fond de papier (luminance haute) en transparence, avec
    une rampe plutôt qu'un seuil net pour préserver l'anticrénelage des
    traits et le grain du tampon (une variation de luminance intermédiaire)."""
    px = img.load()
    w, h = img.size
    span = TRANSPARENT_ABOVE_LUMA - OPAQUE_BELOW_LUMA
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            if luma >= TRANSPARENT_ABOVE_LUMA:
                px[x, y] = (r, g, b, 0)
            elif luma > OPAQUE_BELOW_LUMA:
                factor = (TRANSPARENT_ABOVE_LUMA - luma) / span
                px[x, y] = (r, g, b, round(a * factor))
    return img
