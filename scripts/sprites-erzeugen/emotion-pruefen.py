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
    'pixel/22_arcanus-b': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4 8-Bit-Blatt (Runware gpt-image-2); Zelle 4 (Zittern) faellt nur farblich, sichtgeprueft
    'beasts/00_pikamon': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'beasts/01_shrew-quakes': {'frei': [1, 2, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'beasts/02_storm-talon': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03: Zellen 2 und 4 aus Zelle 1 abgeleitet, Magenta-Schatten entfernt
    'beasts/10_flame-jaws': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'beasts/11_ember-tails': {'frei': [0, 1, 2, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'beasts/12_magma-plate': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'beasts/21_cosmic-meditate': {'frei': [0, 1, 2, 4, 5], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'beasts/22_sonic-blossom': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'datacult/00_nullpointer-exception': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'datacult/01_datapath-replicant': {'frei': [0, 2, 3, 4], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'datacult/02_chrome-code-shifter': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 abgeleitet (emotion-ableiten.py)
    'datacult/11_synapse-streamer': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 ganzes Blatt neu (N-01)
    'datacult/12_arcology-agent': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 abgeleitet (emotion-ableiten.py)
    'datacult/21_hyper-link-hound': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'datacult/22_ethereo': {'frei': [0, 1, 2, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'machina/00_chassis-endo-t8': {'frei': [0, 1, 2, 4, 5], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'machina/01_slasher-cyber-jax': {'frei': [0, 2, 3, 4, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'machina/02_hydra-titan-mech': {'frei': [3], 'sperre': []},
    'machina/11_heavy-battery-moerser-bot': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 3-D-Verfahren 2026-11-03
    'machina/12_ordnance-rail-viper': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 3-D-Verfahren 2026-11-03
    'machina/20_grid-drifter-datastream': {'frei': [0, 1, 2, 3, 5, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'machina/21_proxy-glitch-hack': {'frei': [0, 5], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'machina/22_overlord-kernel-panic': {'frei': [0, 1, 3, 5, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'pirates/00_captain-sven': {'frei': [0, 1, 2, 3, 5, 6, 7], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; 2026-11-03 Restposen per FLUX
    'pirates/01_swashbuckler-piet': {'frei': [0, 1, 2, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; 2026-11-03 Restposen per FLUX
    'pirates/02_iron-hook-harry': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; bisher farbgeprüfte Zellen sichtgeprüft
    'pirates/10_cannoneer-klaus': {'frei': [1], 'sperre': []},
    'pirates/11_sniper-marie': {'frei': [1, 2, 5, 6, 7], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; 2026-11-03 Restposen per FLUX
    'pirates/12_bombard-billy': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'pirates/20_voodoo-witch-morgana': {'frei': [0, 1, 2, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'pirates/21_storm-schamane-hooky': {'frei': [1, 2, 3, 4], 'sperre': []},  # 2026-11-03 Restposen per FLUX; bisher farbgeprüfte Zellen sichtgeprüft
    'pirates/22_chanteyman-drake': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 abgeleitet (emotion-ableiten.py); bisher farbgeprüfte Zellen sichtgeprüft
    'pixel/00_nullpointer-exception': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/01_pyrofox-a': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/02_pyrofox-b': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/10_arcershorn-a': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/11_pyrowand-a': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/12_shieldmon': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/20_phantomal-a': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'pixel/21_arcanus-a': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 SPR-4: 8-Bit-Blatt neu (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'rodentia/00_commander-chewk': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'rodentia/01_berzerker-fang': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'rodentia/02_vanguard-captain-rix': {'frei': [0, 1, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'rodentia/10_sharpshooter-quill': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'rodentia/11_grenadier-skitter': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'rodentia/12_volley-captain-spark': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'rodentia/20_alchemage-nibble': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'rodentia/21_technomancer-squeak': {'frei': [0, 2, 3, 4, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'rodentia/22_grand-conduit-vex': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'shinobi/00_shred-katana-hanzmon': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; 2026-11-03 Restposen per FLUX
    'shinobi/01_kunoichi-wind-flapper': {'frei': [0, 1, 2, 3, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'shinobi/02_tetsubo-oni-brute': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'shinobi/10_dazzler-werner': {'frei': [0, 1, 2, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    # 2026-11-03 Pilot 3-D (N-03): Modell aus dem Seitenbild (HF-Space trellis-community/TRELLIS), acht Posen gerendert
    # (Kippen, Stauchen, Turm nicken/heben/schwenken, Scheinwerfer aus); Panzer bleibt erkennbar, alle acht freigegeben.
    'shinobi/11_rauch-meister-genzi': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'shinobi/12_blowpipe-koga': {'frei': [0, 1, 2, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'shinobi/20_ninjutsu-master-goemon': {'frei': [0, 1, 2, 3, 4, 5, 6], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'shinobi/21_talisman-sorcerer-jun': {'frei': [2, 3], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'shinobi/22_vixen-kitsune': {'frei': [0, 3, 4, 6, 7], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'undead/02_grim-reaper-silas': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 ganzes Blatt neu (N-01)
    'undead/10_archer-mortis': {'frei': [1, 2, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; nach Saumentfernung farbgeprüft gefallen, sichtgeprüft
    'undead/12_vessel-plague-skull': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 B3: Blatt neu aus der neuen Seitenansicht (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'undead/20_lich-king-alistair': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 B3: Blatt neu aus der neuen Seitenansicht (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'undead/21_scribe-necro-silas': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 B3: Blatt neu aus der neuen Seitenansicht (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'undead/22_banshee-beatrice': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-10 B3: Blatt neu aus der neuen Seitenansicht (Runware gpt-image-2), alle acht Zellen sichtgeprueft
    'xeno/01_stalker-predax': {'frei': [0, 4, 5], 'sperre': []},  # 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft; 2026-11-03 Restposen per FLUX
    'xeno/02_vortex-grabber': {'frei': [0, 1, 3, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'xeno/10_drone-theta': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Nachauftrag: ganzes Blatt im 3-D-Verfahren (TRELLIS, yaw 35, Neigung 5), schwebende Drohne
    'xeno/11_desintegrator-kael': {'frei': [1, 2, 3, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'xeno/20_harbinger-zeta': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'xeno/21_dark-matter-witch': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    'xeno/22_null-entity-quark': {'frei': [1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX
    # 2026-11-03 (N-01): ganze Blätter neu (gpt-image-2, Magenta-Grund statt Grün; die grünen Figuren waren mit dem
    # Grün-Schlüssel in Splitter zerfallen), alle acht Zellen per Sichtprüfung freigegeben.
    'datacult/20_buffer-flow-swarm': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'undead/00_bone-racker-karl': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'undead/11_pitcher-igor': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},
    'machina/10_recon-luchs-01': {'frei': [1, 3, 5, 6, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'xeno/12_plasma-maw-zorg': {'frei': [0, 1, 2, 4, 5, 7], 'sperre': []},  # 2026-11-03 Restposen per FLUX; 2026-11-03 bisher farbgeprüfte Zellen sichtgeprüft
    'datacult/10_quantum-qubit-knight': {'frei': [0, 1, 2, 3, 4, 5, 6, 7], 'sperre': []},  # 2026-11-03 Nachauftrag: ganzes Blatt neu, grün wie das Seitenbild (FLUX, Schwänze per Kontext-Bearbeitung entfernt)
}


# Zellen, die `blick-aus-teilen.py` aus dem Seitenbild dreht (Blick hoch 5, Blick runter 6).
AUS_TEILEN = {
    'datacult/02_chrome-code-shifter': (5, 6),
    'shinobi/12_blowpipe-koga': (5, 6),
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
