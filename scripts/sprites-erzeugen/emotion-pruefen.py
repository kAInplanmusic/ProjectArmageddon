#!/usr/bin/env python3
"""Prüft die Emotions-Sheets auf Identität und schreibt die brauchbaren Zellen ins Manifest.

Die KI hat in manchen Blättern aus einem Tier einen Menschen gemacht (z. B. Igel -> Junge). Gemessen
wird der Farbabstand jeder Zelle (Farbverteilung der Vordergrundpixel, 4 Stufen je Kanal) zum
Seitenbild der Figur (`characters-side`), das die Figur festlegt. Eine Zelle ist brauchbar, wenn sie
nicht schlechter ist als die beste Zelle desselben Blatts plus `SPIELRAUM` und nicht über `OBERGRENZE`
liegt. Das beweist die Identität, nicht die Pose: Eine brauchbare Zelle kann trotzdem nur stehen.

Schreibt `figuren` im Manifest als Wörterbuch: Schlüssel `<fraktion>/<figur>`, Wert
`{"datei": ..., "gueltig": [Zellen], "abstand": [je Zelle]}`.

Aufruf (Wurzel des Repos): python3 scripts/sprites-erzeugen/emotion-pruefen.py
"""
import glob
import json
import os

import numpy as np
from PIL import Image

SEITE = 'src/client/assets/characters-side/'
EMO = 'src/client/assets/sprite-sheets-emotion/'
SPIELRAUM = 0.035
OBERGRENZE = 0.45
# Sichtprüfung am Kontaktbogen (2026-10-27) für neu erzeugte Zellen (emotion-neu.py): Ersatz für die Farbprüfung dieser Zellen.
# Die Zellennummern gelten als gültig (Freigabe) bzw. werden gesperrt (Sperre), sonst entscheidet das Farbhistogramm.
SICHTPRUEFUNG = {
    'beasts/00_pikamon': {'frei': [1, 5, 6], 'sperre': []},
    'beasts/01_shrew-quakes': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'beasts/02_storm-talon': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03: Zellen 2 und 4 aus Zelle 1 abgeleitet, Magenta-Schatten entfernt
    'beasts/10_flame-jaws': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'beasts/11_ember-tails': {'frei': [1, 4, 5, 6], 'sperre': []},
    'beasts/12_magma-plate': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'beasts/21_cosmic-meditate': {'frei': [1, 4, 5], 'sperre': []},
    'beasts/22_sonic-blossom': {'frei': [1, 3, 5], 'sperre': []},
    'datacult/00_nullpointer-exception': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'datacult/01_datapath-replicant': {'frei': [3, 4], 'sperre': []},
    'datacult/02_chrome-code-shifter': {'frei': [5, 6], 'sperre': []},
    'datacult/11_synapse-streamer': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 ganzes Blatt neu (N-01)
    'datacult/12_arcology-agent': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'datacult/21_hyper-link-hound': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'datacult/22_ethereo': {'frei': [1, 6], 'sperre': []},
    'machina/00_chassis-endo-t8': {'frei': [1, 5], 'sperre': []},
    'machina/01_slasher-cyber-jax': {'frei': [3, 4, 6], 'sperre': []},
    'machina/02_hydra-titan-mech': {'frei': [3], 'sperre': []},
    'machina/11_heavy-battery-moerser-bot': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 3-D-Verfahren 2026-11-03
    'machina/12_ordnance-rail-viper': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 3-D-Verfahren 2026-11-03
    'machina/20_grid-drifter-datastream': {'frei': [1, 3, 5], 'sperre': []},
    'machina/21_proxy-glitch-hack': {'frei': [5], 'sperre': []},
    'machina/22_overlord-kernel-panic': {'frei': [1, 3, 5], 'sperre': []},
    'pirates/00_captain-sven': {'frei': [1, 3, 5, 6], 'sperre': []},
    'pirates/01_swashbuckler-piet': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pirates/02_iron-hook-harry': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pirates/10_cannoneer-klaus': {'frei': [1], 'sperre': []},
    'pirates/11_sniper-marie': {'frei': [1, 5, 6], 'sperre': []},
    'pirates/12_bombard-billy': {'frei': [1, 3, 4, 5], 'sperre': []},
    'pirates/20_voodoo-witch-morgana': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pirates/21_storm-schamane-hooky': {'frei': [3, 4], 'sperre': []},
    'pirates/22_chanteyman-drake': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/00_nullpointer-exception': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/01_pyrofox-a': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/02_pyrofox-b': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/10_arcershorn-a': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/11_pyrowand-a': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/12_shieldmon': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'pixel/20_phantomal-a': {'frei': [1, 3, 4], 'sperre': []},
    'pixel/21_arcanus-a': {'frei': [1], 'sperre': []},
    'pixel/22_arcanus-b': {'frei': [1], 'sperre': []},
    'rodentia/00_commander-chewk': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'rodentia/01_berzerker-fang': {'frei': [1, 3, 4, 5], 'sperre': []},
    'rodentia/02_vanguard-captain-rix': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'rodentia/10_sharpshooter-quill': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'rodentia/11_grenadier-skitter': {'frei': [1, 3, 4, 5], 'sperre': []},
    'rodentia/12_volley-captain-spark': {'frei': [1, 3, 4, 5], 'sperre': []},
    'rodentia/20_alchemage-nibble': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'rodentia/21_technomancer-squeak': {'frei': [3, 4, 6], 'sperre': []},
    'rodentia/22_grand-conduit-vex': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'shinobi/00_shred-katana-hanzmon': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'shinobi/01_kunoichi-wind-flapper': {'frei': [1, 3, 5, 6], 'sperre': []},
    'shinobi/02_tetsubo-oni-brute': {'frei': [5], 'sperre': []},
    'shinobi/10_dazzler-werner': {'frei': [1, 4, 5], 'sperre': []},
    # 2026-11-03 Pilot 3-D (N-03): Modell aus dem Seitenbild (HF-Space trellis-community/TRELLIS), acht Posen gerendert
    # (Kippen, Stauchen, Turm nicken/heben/schwenken, Scheinwerfer aus); Panzer bleibt erkennbar, alle acht freigegeben.
    'shinobi/11_rauch-meister-genzi': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'shinobi/12_blowpipe-koga': {'frei': [3, 4, 5, 6], 'sperre': [1]},
    'shinobi/20_ninjutsu-master-goemon': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'shinobi/21_talisman-sorcerer-jun': {'frei': [3], 'sperre': []},
    'shinobi/22_vixen-kitsune': {'frei': [3, 4, 6], 'sperre': []},
    'undead/02_grim-reaper-silas': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 ganzes Blatt neu (N-01)
    'undead/10_archer-mortis': {'frei': [4, 5, 6], 'sperre': []},
    'undead/12_vessel-plague-skull': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'undead/20_lich-king-alistair': {'frei': [3, 4, 5], 'sperre': [1]},
    'undead/21_scribe-necro-silas': {'frei': [1, 4, 5], 'sperre': []},
    'undead/22_banshee-beatrice': {'frei': [1], 'sperre': []},
    'xeno/01_stalker-predax': {'frei': [5], 'sperre': [4]},
    'xeno/02_vortex-grabber': {'frei': [1, 3, 5, 6], 'sperre': []},
    'xeno/10_drone-theta': {'frei': [5], 'sperre': [1]},
    'xeno/11_desintegrator-kael': {'frei': [1, 3, 5, 6], 'sperre': []},
    'xeno/20_harbinger-zeta': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'xeno/21_dark-matter-witch': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    'xeno/22_null-entity-quark': {'frei': [1, 3, 4, 5, 6], 'sperre': []},
    # 2026-11-03 (N-01): ganze Blätter neu (gpt-image-2, Magenta-Grund statt Grün; die grünen Figuren waren mit dem
    # Grün-Schlüssel in Splitter zerfallen), alle acht Zellen per Sichtprüfung freigegeben.
    'datacult/20_buffer-flow-swarm': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'undead/00_bone-racker-karl': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'undead/11_pitcher-igor': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
}


# Zellen, die `blick-aus-teilen.py` aus dem Seitenbild dreht (Blick hoch 5, Blick runter 6).
AUS_TEILEN = {
    'datacult/02_chrome-code-shifter': (5, 6),
    'shinobi/12_blowpipe-koga': (5, 6), 'xeno/10_drone-theta': (5,),
}


def hist(bild):
    a = np.asarray(bild.convert('RGBA')).astype(int)
    m = a[..., 3] > 40
    if m.sum() < 400:
        return None
    px = a[m][:, :3] // 64
    h = np.bincount(px[:, 0] * 16 + px[:, 1] * 4 + px[:, 2], minlength=64).astype(float)
    return h / h.sum()


def zelle(bild, c):
    w, h = bild.size
    return bild.crop(((c % 4) * w // 4, (c // 4) * h // 2, ((c % 4) + 1) * w // 4, ((c // 4) + 1) * h // 2))


def main():
    figuren = {}
    for f in sorted(glob.glob(EMO + '*/*.webp')):
        fak = f.split('/')[-2]
        name = os.path.basename(f).replace('__emotion.webp', '')
        seite = f'{SEITE}{fak}/{name}.png'
        basis = hist(Image.open(seite)) if os.path.exists(seite) else None
        if basis is None:
            continue
        sheet = Image.open(f).convert('RGBA')
        abstand = []
        for c in range(8):
            h = hist(zelle(sheet, c))
            abstand.append(None if h is None else round(1 - float(np.minimum(h, basis).sum()), 3))
        sicht = SICHTPRUEFUNG.get(f'{fak}/{name}')
        # Zellen aus Teilen des Seitenbilds (`blick-aus-teilen.py`) liegen dem Seitenbild so nahe, dass sie `beste` auf nahe 0 ziehen und
        # alle KI-Zellen aus dem Spielraum drängen: Für `beste` zählen nur die übrigen Zellen.
        teile = AUS_TEILEN.get(f'{fak}/{name}', ())
        gemessen = [d for c, d in enumerate(abstand) if d is not None and c not in teile]
        beste = min(gemessen) if gemessen else 1
        gueltig = [c for c, d in enumerate(abstand) if d is not None and d <= beste + SPIELRAUM and d <= OBERGRENZE]
        if sicht:
            gueltig = sorted((set(gueltig) | set(sicht['frei'])) - set(sicht['sperre']))
        figuren[f'{fak}/{name}'] = {'datei': f'{fak}/{name}__emotion.webp', 'gueltig': gueltig, 'abstand': abstand}
    pfad = EMO + 'manifest.json'
    m = json.load(open(pfad))
    m['version'] = 2
    m['hinweis'] = ('8 Posen (4x2, Zelle 256): Angst, Blinzeln, Schulterzucken, Jubel, Zittern, Kopf hoch, Kopf runter, Waffenwechsel. '
                    '"gueltig" = Zellen, deren Farbverteilung zum Seitenbild der Figur passt (Identität, nicht Pose); '
                    'erzeugt mit scripts/sprites-erzeugen/emotion-pruefen.py')
    m['figuren'] = figuren
    json.dump(m, open(pfad, 'w'), indent=1, ensure_ascii=False)
    open(pfad, 'a').write('\n')
    zahlen = [len(v['gueltig']) for v in figuren.values()]
    print(f'{len(figuren)} Figuren; brauchbare Zellen im Mittel {sum(zahlen) / len(zahlen):.1f} von 8; '
          f'keine: {zahlen.count(0)}, alle acht: {zahlen.count(8)}')


if __name__ == '__main__':
    main()
