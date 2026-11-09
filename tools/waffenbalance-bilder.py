"""Aktuelle unveränderte Waffenbilder als Kontaktbögen und Dateibefunde erfassen."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/waffenbalance-2026-11-09'
ASSETS = ROOT / 'src/client/assets'
MAN = json.loads((ASSETS / 'weapon-sprites/manifest.json').read_text())
CURRENT = [w['current'] for w in json.loads((OUT / 'messung-150.json').read_text())['weapons']]
ATLASES = {k: Image.open(ASSETS / 'weapon-sprites' / v['datei']).convert('RGBA') for k, v in MAN['atlanten'].items()}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(FONT, 14)
small = ImageFont.truetype(FONT, 11)


def metrics(im):
    a = im.getchannel('A')
    return {'width': im.width, 'height': im.height, 'alphaBBox': a.getbbox(),
            'opaqueFraction': round(sum(p == 255 for p in a.getdata()) / (im.width * im.height), 4),
            'visibleFraction': round(sum(p > 0 for p in a.getdata()) / (im.width * im.height), 4),
            'pixelHash': hashlib.sha256(im.tobytes()).hexdigest()}


def crop(entry):
    a = ATLASES[entry['atlas']]
    x, y, w, h = (entry[k] for k in ['x', 'y', 'w', 'h'])
    assert x >= 0 and y >= 0 and x + w <= a.width and y + h <= a.height
    return a.crop((x, y, x + w, y + h))


OUT.mkdir(parents=True, exist_ok=True)
rows = []
for start in range(0, len(CURRENT), 15):
    page = start // 15 + 1
    im = Image.new('RGB', (1350, 1190), '#1c2028')
    d = ImageDraw.Draw(im)
    d.text((12, 8), f'Waffenprüfung {page}/10 · Menü 24/64 · Atlas-Icon · Hand mit Griff/Spitze · Geschoss', font=font, fill='white')
    for local, weapon in enumerate(CURRENT[start:start + 15]):
        ident = weapon['id']
        sprite = MAN['waffen'][ident]
        x, y = (local % 3) * 450, 40 + (local // 3) * 230
        d.rectangle((x, y, x + 449, y + 229), outline='#54606b')
        d.text((x + 8, y + 6), f"{ident} · {weapon['displayName']}", font=font, fill='white')
        d.text((x + 8, y + 27), f"{weapon['category']} · {weapon['special'] or 'Standard'}", font=small, fill='#c4c9d1')
        menu_path = ASSETS / 'icons' / (Path(weapon['icon']).stem + '_icon.png')
        menu = Image.open(menu_path).convert('RGBA')
        row = {'id': ident, 'menu': metrics(menu), 'menuFileHash': hashlib.sha256(menu_path.read_bytes()).hexdigest(), 'roles': {}}
        im.paste(menu, (x + 8, y + 66), menu)
        tiny = menu.resize((24, 24), Image.Resampling.LANCZOS)
        im.paste(tiny, (x + 28, y + 155), tiny)
        d.text((x + 8, y + 190), 'Menü 64 / 24', font=small, fill='#aeb7c2')
        for role, bx, size in [('icon', 84, 96), ('held', 188, 128), ('projectile', 342, 64)]:
            entry = sprite.get(role)
            if not entry:
                d.text((x + bx, y + 110), '—', font=font, fill='#aeb7c2')
                continue
            cell = crop(entry)
            row['roles'][role] = metrics(cell)
            shown = cell.resize((size, size), Image.Resampling.NEAREST if role == 'projectile' else Image.Resampling.LANCZOS)
            py = y + 53
            im.paste(shown, (x + bx, py), shown)
            if role == 'held':
                for key, color in [('grip', '#4cff7d'), ('muzzle', '#ff5b63')]:
                    p = sprite['anchor'][key]
                    px, sy = x + bx + p['x'], py + p['y']
                    d.ellipse((px - 3, sy - 3, px + 3, sy + 3), outline=color, width=2)
            d.text((x + bx, y + 190), f'{role} {cell.width}', font=small, fill='#aeb7c2')
        row['anchors'] = sprite['anchor']
        rows.append(row)
    im.save(OUT / f'sichtpruefung-{page:02}.jpg', quality=91)

duplicates = []
for kind in ['menu', 'held', 'icon', 'projectile']:
    groups = {}
    for row in rows:
        m = row['menu'] if kind == 'menu' else row['roles'].get(kind)
        if m:
            groups.setdefault(m['pixelHash'], []).append(row['id'])
    duplicates.extend({'role': kind, 'ids': ids} for ids in groups.values() if len(ids) > 1)
(OUT / 'bilddaten-150.json').write_text(json.dumps({'weapons': rows, 'pixelDuplicates': duplicates}, indent=2) + '\n')
print(f'{len(rows)} Waffen, 10 Kontaktbögen, {len(duplicates)} Gruppen pixelgleicher Rollenbilder')
