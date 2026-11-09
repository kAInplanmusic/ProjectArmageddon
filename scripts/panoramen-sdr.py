"""SDR-AVIF aus den unveränderten UHD-WebP-Quellen erzeugen (Pillow 13.0.0).
Aufruf aus der Repo-Wurzel: python3 scripts/panoramen-sdr.py
Die Bildgeometrie und das vorhandene Tonemapping bleiben gleich.
"""
from pathlib import Path
from PIL import Image

for name in ('snow_field', 'factory_yard', 'small_cave'):
    basis = Path('src/client/assets/panoramen')
    with Image.open(basis / (name + '.webp')) as bild:
        bild.save(basis / (name + '-sdr.avif'), format='AVIF', quality=50, speed=6)
