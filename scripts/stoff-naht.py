#!/usr/bin/env python3
"""Naht-Prüfung und Naht-Reparatur der Stofftexturen (N-28).

Die Stofftexturen (`src/client/assets/stoff-texturen/` und `stoff-texturen-neu/`, je 512 px)
werden im Spiel alle 512 px wiederholt. Passt die rechte Kante nicht zur linken (oder die
untere nicht zur oberen), entsteht ein Gitter aus Nahtlinien.

Maß „Kantenverhältnis“ (je Achse, das größere zählt):
    Sprung über die Kachelkante  = Mittel |Spalte 511 - Spalte 0|        (Helligkeit)
    Sprung im Inneren            = Median über i der Mittel |Spalte i+1 - Spalte i|
    Verhältnis                   = Sprung über die Kante / Sprung im Inneren
Eine nahtlose Textur liegt um 1; ab der Schwelle gilt sie als genäht.

Reparatur (`kacheln`): Offset-Blend mit Schnittpfad. Das Bild wird um eine halbe Kachel
gerollt (die Kanten wandern in die Mitte, außen ist es dann nahtlos); das Nahtkreuz in der
Mitte wird mit dem ungerollten Bild überdeckt, das dort durchgehend ist. Die Grenze zwischen
beiden folgt je Seite dem Pfad mit dem kleinsten Bildunterschied (dynamische Programmierung
wie beim Image Quilting), danach wenige Pixel weich überblendet. So entsteht kein flächiger
Doppelbild-Schleier wie bei reinem Überblenden. Optional (`--abflachen`) wird vorher eine
Randabdunklung (Vignette) über einen großen, kachelnden Weichzeichner ausgeglichen. Zum
Schluss wird zurückgerollt, damit das Motiv an seiner Stelle bleibt. Gespeichert wird im
Format und in der Qualität der Vorlage (JPEG 80, 4:2:0 bzw. WebP).

Aufrufe:
    python3 scripts/stoff-naht.py pruefen [--alle-zeigen]
        misst alle Stofftexturen; Exit-Code 1, wenn eine (ohne Ausnahme) über der Schwelle liegt
    python3 scripts/stoff-naht.py messwerte
        schreibt `scripts/stoff-naht-messwerte.json` (Verhältnis + SHA-256 je Datei); daraus
        prüft `tests/stoff-naht.test.js` ohne Bilddecoder
    python3 scripts/stoff-naht.py kacheln <name> [<name> ...] [--abflachen <name,...>]
        macht die genannten Texturen kachelbar (überschreibt die Datei)
    python3 scripts/stoff-naht.py reihen <name> [...]
        Mauerwerk: Kachel aus ganzen Steinreihen neu zusammensetzen (statt Offset-Blend)

Braucht Python 3 mit Pillow und NumPy; keine Netz- oder Bilderzeugungsdienste.
"""
from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

WURZEL = Path(__file__).resolve().parent.parent
ORDNER = [
    WURZEL / 'src' / 'client' / 'assets' / 'stoff-texturen',
    WURZEL / 'src' / 'client' / 'assets' / 'stoff-texturen-neu',
]
MESSWERTE = WURZEL / 'scripts' / 'stoff-naht-messwerte.json'

#: Ab diesem Kantenverhältnis gilt eine Textur als genäht (vorher lagen die fünf aus N-28
#: zwischen 4,6 und 11,5; die höchste ungeflickte, nicht ausgenommene Textur bei 4,4).
SCHWELLE = 4.5

#: Texturen, deren Kante absichtlich hart ist oder deren Wert die Sichtprüfung widerlegt
#: (Audit terrain-spielgefuehl-2026-10-30, Abschnitt 2 „Nähte (Sicht)“). Jede Ausnahme
#: braucht einen Grund; der Test prüft, dass die Liste nicht still wächst.
AUSNAHMEN = {
    'keramik': 'Fliesenmuster: die Kachelkante ist eine gewollte Fuge',
    'metall': 'Plattenmuster mit Nieten: die Kachelkante ist eine gewollte Fuge',
    'kristall': 'flache Facetten (Innensprung < 1 Grauwert); Sichtprüfung: keine sichtbare Naht',
}

ENDUNGEN = ('.jpg', '.webp')


def helligkeit(bild: Image.Image) -> np.ndarray:
    """Mittel der drei Farbkanäle als float64 (wie die Sichtprüfung: ohne Gewichtung)."""
    return np.asarray(bild.convert('RGB'), dtype=np.float64).mean(axis=2)


def kantenverhaeltnis(bild: Image.Image) -> tuple[float, float]:
    """(waagrecht, senkrecht): Sprung über die Kachelkante / Median-Sprung im Inneren."""
    a = helligkeit(bild)
    werte = []
    for b in (a, a.T):  # erst Spalten (Naht links/rechts), dann Zeilen (Naht oben/unten)
        innen = np.abs(np.diff(b, axis=1)).mean(axis=0)
        kante = np.abs(b[:, -1] - b[:, 0]).mean()
        werte.append(float(kante / max(np.median(innen), 1e-6)))
    return werte[0], werte[1]


def alle_texturen() -> list[Path]:
    dateien = []
    for ordner in ORDNER:
        dateien += sorted(p for p in ordner.iterdir() if p.suffix in ENDUNGEN)
    return dateien


def schluessel(pfad: Path) -> str:
    return f'{pfad.parent.name}/{pfad.name}'


def finde(name: str) -> Path:
    """Name ohne Endung → Datei; `stoff-texturen-neu` zuerst (dort liegen die Biom-Texturen)."""
    for ordner in reversed(ORDNER):
        for endung in ENDUNGEN:
            p = ordner / f'{name}{endung}'
            if p.exists():
                return p
    raise SystemExit(f'Textur nicht gefunden: {name}')


# ---------------------------------------------------------------- Prüfen / Messwerte


def messen() -> list[dict]:
    zeilen = []
    for pfad in alle_texturen():
        with Image.open(pfad) as bild:
            w, s = kantenverhaeltnis(bild)
        zeilen.append({
            'datei': schluessel(pfad),
            'name': pfad.stem,
            'verhaeltnis': round(max(w, s), 3),
            'waagrecht': round(w, 3),
            'senkrecht': round(s, 3),
            'sha256': hashlib.sha256(pfad.read_bytes()).hexdigest(),
        })
    return zeilen


def pruefen(alle_zeigen: bool) -> int:
    rot = 0
    for z in sorted(messen(), key=lambda z: -z['verhaeltnis']):
        ausnahme = z['name'] in AUSNAHMEN
        ueber = z['verhaeltnis'] >= SCHWELLE
        if ueber and not ausnahme:
            rot += 1
        if ueber or alle_zeigen:
            marke = 'AUSNAHME' if (ueber and ausnahme) else ('NAHT' if ueber else 'ok')
            print(f"{z['verhaeltnis']:7.2f}  {marke:8s} {z['datei']}")
    print(f'Schwelle {SCHWELLE}: {rot} Textur(en) mit Naht.')
    return 1 if rot else 0


def messwerte_schreiben() -> None:
    daten = {
        'hinweis': 'Erzeugt von scripts/stoff-naht.py messwerte; nicht von Hand ändern.',
        'mass': 'Kantenverhältnis = Mittel |Kante rechts-links| / Median Mittel |Nachbarspalten|, max. beider Achsen',
        'schwelle': SCHWELLE,
        'ausnahmen': AUSNAHMEN,
        'texturen': messen(),
    }
    MESSWERTE.write_text(json.dumps(daten, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{MESSWERTE.relative_to(WURZEL)}: {len(daten["texturen"])} Texturen')


# ---------------------------------------------------------------- Reparatur


def kachelnd_weich(a: np.ndarray, radius: float) -> np.ndarray:
    """Gauß-Weichzeichner mit Umlauf (Faltung über die FFT ist von sich aus zyklisch)."""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kern = np.exp(-2.0 * (np.pi * radius) ** 2 * (fx ** 2 + fy ** 2))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * kern))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., k]) * kern)) for k in range(a.shape[2])], axis=2)


def abflachen(rgb: np.ndarray) -> np.ndarray:
    """Gleicht großflächige Helligkeitsverläufe (Vignette) aus; Details bleiben."""
    hell = rgb.mean(axis=2)
    tief = kachelnd_weich(hell, 48.0)
    faktor = hell.mean() / np.maximum(tief, 1.0)
    return np.clip(rgb * faktor[..., None], 0, 255)


def schnittpfad(fehler: np.ndarray) -> np.ndarray:
    """Senkrechter Pfad (eine Spalte je Zeile, Schritt ≤ 1) mit kleinster Fehlersumme, der oben
    und unten an derselben Stelle (±1) ankommt, damit er beim Kacheln geschlossen bleibt."""
    h, w = fehler.shape
    bestes, best_pfad = np.inf, None
    for start in range(0, w, 2):
        kosten = np.full(w, np.inf)
        kosten[start] = fehler[0, start]
        herkunft = np.zeros((h, w), dtype=np.int64)
        for y in range(1, h):
            links = np.concatenate(([np.inf], kosten[:-1]))
            rechts = np.concatenate((kosten[1:], [np.inf]))
            wahl = np.stack((links, kosten, rechts))
            idx = wahl.argmin(axis=0)
            herkunft[y] = np.arange(w) + idx - 1
            kosten = wahl[idx, np.arange(w)] + fehler[y]
        ziele = [x for x in (start - 1, start, start + 1) if 0 <= x < w]
        ende = min(ziele, key=lambda x: kosten[x])
        if kosten[ende] < bestes:
            bestes = kosten[ende]
            pfad = np.empty(h, dtype=np.int64)
            pfad[-1] = ende
            for y in range(h - 1, 0, -1):
                pfad[y - 1] = herkunft[y, pfad[y]]
            best_pfad = pfad
    return best_pfad


def flickmaske(gerollt: np.ndarray, quelle: np.ndarray, halb_breite: int, abstand: int) -> np.ndarray:
    """Maske (1 = ungerolltes Bild) über dem Nahtkreuz in der Mitte des gerollten Bildes."""
    n = gerollt.shape[0]
    m = n // 2
    fehler = ((gerollt - quelle) ** 2).sum(axis=2)
    fehler = kachelnd_weich(fehler, 1.5) + 1.0
    maske = np.zeros((n, n), dtype=bool)
    for f, quer in ((fehler, False), (fehler.T, True)):
        links_lo, links_hi = m - halb_breite, m - abstand
        rechts_lo, rechts_hi = m + abstand, m + halb_breite
        links = schnittpfad(f[:, links_lo:links_hi]) + links_lo
        rechts = schnittpfad(f[:, rechts_lo:rechts_hi]) + rechts_lo
        spalten = np.arange(n)[None, :]
        streifen = (spalten >= links[:, None]) & (spalten <= rechts[:, None])
        maske |= streifen.T if quer else streifen
    return maske


def laden(pfad: Path) -> tuple[str, np.ndarray]:
    with Image.open(pfad) as bild:
        return bild.format, np.asarray(bild.convert('RGB'), dtype=np.float64)


def speichern(pfad: Path, format_: str, rgb: np.ndarray) -> None:
    """Speichert im Format und in der Qualität der Vorlage und meldet Größe und neues Maß."""
    aus = Image.fromarray(np.clip(np.rint(rgb), 0, 255).astype(np.uint8), mode='RGB')
    puffer = io.BytesIO()
    if format_ == 'JPEG':
        aus.save(puffer, 'JPEG', quality=80, subsampling=2, optimize=True)
    elif format_ == 'WEBP':
        aus.save(puffer, 'WEBP', quality=80, method=6)
    else:
        raise SystemExit(f'{pfad.name}: Format {format_} nicht vorgesehen')
    vorher = pfad.stat().st_size
    pfad.write_bytes(puffer.getvalue())
    with Image.open(pfad) as bild:
        w, s = kantenverhaeltnis(bild)
    print(f'{schluessel(pfad)}: {vorher} → {pfad.stat().st_size} Bytes, Kantenverhältnis {max(w, s):.2f}')


def kacheln(pfad: Path, mit_abflachen: bool) -> None:
    """Offset-Blend mit Schnittpfad (siehe Modulkopf)."""
    format_, rgb = laden(pfad)
    n = rgb.shape[0]
    assert rgb.shape[:2] == (n, n), f'{pfad.name}: nicht quadratisch'
    if mit_abflachen:
        rgb = abflachen(rgb)
    h = n // 2
    gerollt = np.roll(rgb, (h, h), axis=(0, 1))  # Kanten in der Mitte, außen nahtlos
    quelle = rgb                                   # in der Mitte durchgehend
    maske = flickmaske(gerollt, quelle, halb_breite=n // 8, abstand=n // 40)
    weich = np.clip(kachelnd_weich(maske.astype(np.float64), 2.0), 0, 1)[..., None]
    neu = gerollt * (1 - weich) + quelle * weich
    speichern(pfad, format_, np.roll(neu, (-h, -h), axis=(0, 1)))  # Motiv zurück an seine Stelle


def reihen(pfad: Path) -> None:
    """Für Mauerwerk (waagrechte Fugen): Offset-Blend würde Steine zerschneiden. Stattdessen
    wird die Kachel aus ganzen Steinreihen neu zusammengesetzt, jeweils von Fugenmitte zu
    Fugenmitte, und senkrecht auf die Kachelhöhe gebracht (Streckung möglichst nahe 1)."""
    format_, rgb = laden(pfad)
    n = rgb.shape[0]
    zeile = rgb.mean(axis=(1, 2))
    dunkel = zeile < 0.25 * np.median(zeile)
    fugen, i = [], 0
    while i < n:  # Mitte jeder zusammenhängenden dunklen Zeilengruppe
        if dunkel[i]:
            j = i
            while j + 1 < n and dunkel[j + 1]:
                j += 1
            fugen.append((i + j + 1) // 2)
            i = j + 1
        else:
            i += 1
    if len(fugen) < 3:
        raise SystemExit(f'{pfad.name}: zu wenige Fugen gefunden ({fugen})')
    ganze = list(zip(fugen, fugen[1:]))
    basis = fugen[-1] - fugen[0]
    # Höchstens eine Reihe doppelt, und nur eine aus der Mitte: Sie grenzt dann weder an sich
    # selbst noch über die Kachelkante an die erste oder letzte Reihe (keine Stoßfugen-Säulen).
    wahl = [None] + ganze[1:-1]
    extra = min(wahl, key=lambda r: abs(basis + (r[1] - r[0] if r else 0) - n))
    teile = [rgb[fugen[0]:fugen[-1]]] + ([rgb[extra[0]:extra[1]]] if extra else [])
    stapel = np.concatenate(teile, axis=0)
    bild = Image.fromarray(np.clip(np.rint(stapel), 0, 255).astype(np.uint8), mode='RGB')
    gestreckt = np.asarray(bild.resize((n, n), Image.Resampling.LANCZOS), dtype=np.float64)
    print(f'{pfad.name}: Fugen {fugen}, {len(teile)} Teile, Streckung {n / stapel.shape[0]:.3f}')
    speichern(pfad, format_, gestreckt)


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    befehl, rest = argv[0], argv[1:]
    if befehl == 'pruefen':
        return pruefen('--alle-zeigen' in rest)
    if befehl == 'messwerte':
        messwerte_schreiben()
        return 0
    if befehl == 'kacheln':
        flach: set[str] = set()
        namen = []
        i = 0
        while i < len(rest):
            if rest[i] == '--abflachen':
                flach |= set(rest[i + 1].split(','))
                i += 2
            else:
                namen.append(rest[i])
                i += 1
        for name in namen:
            kacheln(finde(name), name in flach)
        return 0
    if befehl == 'reihen':
        for name in rest:
            reihen(finde(name))
        return 0
    print(f'Unbekannter Befehl: {befehl}', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
