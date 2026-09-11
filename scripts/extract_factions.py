#!/usr/bin/env python3
"""Schneidet die 81 Charaktere aus den neun Fraktionsbögen.

Aufbau der Bögen: 1024x1024, 3x3 Raster. Zeile = Klasse (Schwert/Bogen/Stab),
je Zeile drei Charaktere. Jede Kachel trägt unten den Namen und oben links ein
Klassensymbol. Der Hintergrund ist ein GEMALTES Schachbrett (kein Alpha).

Verfahren je Kachel:
  1. Hintergrundfarben aus dem Bildrand bestimmen (zwei Schachbretttöne).
  2. Größte Zusammenhangskomponente = die Figur.
  3. Alle Komponenten behalten, die sich mit ihr VERTIKAL überschneiden — das
     sind Beiwerk wie schwebende Kugeln oder ein Begleiter. Verworfen werden
     dadurch der Name (darunter) und das Klassensymbol (darüber).
  4. Zuschneiden auf den Inhalt, Rand freistellen, auf 256 px normieren.

Ergebnis: src/client/assets/characters/<fraktion>/<zeile><spalte>_<name>.png
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "assets" / "fraktionen"
ZIEL = ROOT / "src" / "client" / "assets" / "characters"

# Zielgröße der Porträts (quadratisch, die Figur wird eingepasst).
ZIEL_KANTE = 256
# Toleranz beim Hintergrundvergleich (Summe der Kanalabweichungen).
#
# Die Schachbretter sind weichgezeichnet: Zwischen den beiden Tönen liegen viele
# Zwischenwerte. Mit einer festen, kleinen Toleranz galten diese Zwischenwerte als
# Inhalt und bildeten ein NETZ über die ganze Kachel — die Figur verschmolz damit
# zu einer Komponente, die alles umspannte, und der Zuschnitt enthielt auch den
# Namen. Die Toleranz wächst deshalb mit dem Abstand der beiden Töne.
# Höhere Werte verschlucken helle Stellen der Figuren (bei 30 bleibt die größte
# Fläche erhalten), niedrigere lassen die weichen Schachbrettkanten stehen.
TOLERANZ = 30

# Seitenlänge eines Schachbrettfelds (Pixel). Wird je Bogen gemessen, das ist nur
# der Rückfallwert.
PERIODE_STANDARD = 20
# Kleinste Fläche einer Komponente, damit sie als Inhalt zählt (Rauschgrenze).
MIN_FLAECHE = 24
# Rand, der vor der Auswertung abgeschnitten wird.
#
# Jede Kachel trägt einen dünnen Rahmen. Berührt er die Figur (bei manchen Bögen
# der Fall), verschmelzen beide zu EINER Komponente, deren Rahmen die ganze Kachel
# umspannt — der Zuschnitt enthielte dann auch den Namen. Der Rahmen liegt bei
# etwa 10 bis 14 px, deshalb wird großzügig beschnitten.
RAHMEN_INSET = 18


def hintergrund_toene(bild: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Bestimmt die beiden Schachbretttöne aus dem Bildrand.

    Über den gesamten Rand sammeln und die zwei häufigsten, ausreichend
    verschiedenen Farben nehmen. Ein Vergleich benachbarter Pixel reicht NICHT:
    An den Kanten liegen Zwischentöne, und die Auswahl trifft dann zweimal
    denselben Ton.
    """
    hoehe, breite, _ = bild.shape
    rand = np.concatenate([
        bild[0:3, :, :].reshape(-1, 3),
        bild[-3:, :, :].reshape(-1, 3),
        bild[:, 0:3, :].reshape(-1, 3),
        bild[:, -3:, :].reshape(-1, 3),
    ])
    haeufig = Counter(map(tuple, rand)).most_common(40)
    erster = np.array(haeufig[0][0], dtype=float)
    zweiter = None
    for farbe, _ in haeufig[1:]:
        kandidat = np.array(farbe, dtype=float)
        if np.abs(kandidat - erster).sum() > 12:
            zweiter = kandidat
            break
    if zweiter is None:
        zweiter = erster
    return erster, zweiter


def hintergrundmaske(bild: np.ndarray, ton1: np.ndarray, ton2: np.ndarray,
                     toleranz: float = TOLERANZ) -> np.ndarray:
    """true, wo der Pixel dem Hintergrund zuzurechnen ist.

    Die weichen Kanten des Schachbretts werden NICHT über die Toleranz entfernt,
    sondern über `aeusserer_hintergrund`: Sie hängen mit dem Rand zusammen und
    fallen dort weg. Eine große Toleranz würde stattdessen helle Fell- und
    Rüstungsteile ausstanzen.
    """
    a = bild.astype(float)
    d1 = np.abs(a - ton1).sum(axis=2)
    d2 = np.abs(a - ton2).sum(axis=2)
    return np.minimum(d1, d2) < toleranz


def aeusserer_hintergrund(eng: np.ndarray, weit: np.ndarray) -> np.ndarray:
    """Nur der Hintergrund, der vom Kachelrand aus erreichbar ist.

    Zwei Masken, und das ist der Kern:

    `weit` (großzügige Toleranz) enthält auch die weichgezeichneten Kanten des
    Schachbretts. Über sie wird geflutet, denn sonst wären die einzelnen
    Schachfelder durch die Kanten voneinander ISOLIERT — nur der Randring wäre
    erreichbar, und die Schachbretter im Inneren gälten als Figur (bei manchen
    Bögen 69 % der Kachel).

    `eng` (Toleranz 30) bestimmt, was am Ende tatsächlich freigestellt wird. Eine
    große Toleranz würde helle Fell- und Rüstungsteile ausstanzen; Stellen
    innerhalb der Figur sind über `weit` nicht mit dem Rand verbunden und bleiben
    deshalb erhalten.
    """
    hoehe, breite = weit.shape
    erreichbar = np.zeros_like(weit, dtype=bool)
    stapel: list[tuple[int, int]] = []

    for x in range(breite):
        for y in (0, hoehe - 1):
            if weit[y, x] and not erreichbar[y, x]:
                erreichbar[y, x] = True
                stapel.append((y, x))
    for y in range(hoehe):
        for x in (0, breite - 1):
            if weit[y, x] and not erreichbar[y, x]:
                erreichbar[y, x] = True
                stapel.append((y, x))

    while stapel:
        y, x = stapel.pop()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < hoehe and 0 <= nx < breite \
                    and weit[ny, nx] and not erreichbar[ny, nx]:
                erreichbar[ny, nx] = True
                stapel.append((ny, nx))
    return eng & erreichbar


def periode_ermitteln(kern: np.ndarray, ton1: np.ndarray) -> int:
    """Seitenlänge der Schachbrettfelder aus der ersten Zeile messen."""
    zeile = kern[0].astype(float)
    nah = np.abs(zeile - ton1).sum(axis=1) < 40
    wechsel = [x for x in range(1, len(nah)) if nah[x] != nah[x - 1]]
    if len(wechsel) < 4:
        return PERIODE_STANDARD
    abstaende = np.diff(wechsel)
    # Kurze Ausreißer (Kantenrauschen) verwerfen.
    gefiltert = [int(a) for a in abstaende if 6 <= a <= 60]
    if not gefiltert:
        return PERIODE_STANDARD
    return int(np.median(gefiltert)) or PERIODE_STANDARD


def hintergrund_ueber_zellen(kern: np.ndarray, ton1: np.ndarray, ton2: np.ndarray) -> np.ndarray:
    """Hintergrund über ganze Schachbrettfelder bestimmen.

    Warum nicht pixelweise: Zwischen den beiden Tönen liegen zahllose weiche
    Zwischenwerte. Pixelweise bleibt ein dünnes NETZ dieser Zwischenwerte stehen,
    das die ganze Kachel durchzieht — Figur und Namenszeile hängen dann als eine
    Komponente zusammen und der Zuschnitt umfasst alles.

    Über Zellen verschwindet das Netz mit: Ein Feld, das überwiegend aus
    Hintergrundfarben besteht, wird GANZ freigestellt. Felder, die die Figur
    schneiden, werden weiterhin pixelweise behandelt, damit an der Silhouette
    nichts abgeschnitten wird.
    """
    hoehe, breite = kern.shape[0], kern.shape[1]
    nah = hintergrundmaske(kern, ton1, ton2, TOLERANZ)
    periode = periode_ermitteln(kern, ton1)
    maske = np.zeros_like(nah)

    for y0 in range(0, hoehe, periode):
        for x0 in range(0, breite, periode):
            y1, x1 = min(y0 + periode, hoehe), min(x0 + periode, breite)
            feld = nah[y0:y1, x0:x1]
            if feld.size == 0:
                continue
            if feld.mean() > 0.8:
                # Reines Hintergrundfeld: ganz freistellen, auch die Kantenwerte.
                maske[y0:y1, x0:x1] = True
            else:
                maske[y0:y1, x0:x1] = feld
    return maske


def oeffnen(maske: np.ndarray, runden: int = 1) -> np.ndarray:
    """Morphologisches Öffnen (Erosion, dann Dilatation) mit 3x3-Kern.

    Nötig gegen das NETZ: Die weichgezeichneten Kanten des Schachbretts liegen
    zwischen den beiden Hintergrundtönen und gelten deshalb als Inhalt. Dieses
    Netz ist nur ein bis zwei Pixel breit und durchzieht die ganze Kachel — Figur
    und Namenszeile hängen dadurch als EINE Komponente zusammen, und der
    Zuschnitt umfasste stets die ganze Kachel.

    Das Öffnen entfernt dünne Strukturen und lässt kompakte Flächen stehen. Die
    Dilatation gibt der Figur ihren Rand zurück.
    """
    kern = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]

    def verschieben(m: np.ndarray, dy: int, dx: int) -> np.ndarray:
        # Mit False auffüllen statt zu rotieren: Ein Umlauf würde gegenüber-
        # liegende Ränder verbinden und den Rand zu Inhalt machen.
        return np.pad(m, 1, constant_values=False)[1 + dy:1 + dy + m.shape[0],
                                                  1 + dx:1 + dx + m.shape[1]]

    m = maske
    for _ in range(runden):
        m = np.logical_and.reduce([verschieben(m, dy, dx) for dy, dx in kern])
    for _ in range(runden):
        m = np.logical_or.reduce([verschieben(m, dy, dx) for dy, dx in kern])
    return m


def komponenten(maske: np.ndarray) -> list[tuple[int, tuple[int, int, int, int]]]:
    """Zusammenhangskomponenten (8er-Nachbarschaft) mit Fläche und Rahmen.

    Eigene Umsetzung statt scipy: Das Projekt soll ohne zusätzliche
    Abhängigkeiten bauen, und eine Tiefensuche auf 341x341 Pixeln ist schnell
    genug.
    """
    hoehe, breite = maske.shape
    besucht = np.zeros_like(maske, dtype=bool)
    ergebnis: list[tuple[int, tuple[int, int, int, int]]] = []

    for sy in range(hoehe):
        for sx in range(breite):
            if not maske[sy, sx] or besucht[sy, sx]:
                continue
            stapel = [(sy, sx)]
            besucht[sy, sx] = True
            flaeche = 0
            oben = unten = sy
            links = rechts = sx
            while stapel:
                y, x = stapel.pop()
                flaeche += 1
                if y < oben:
                    oben = y
                if y > unten:
                    unten = y
                if x < links:
                    links = x
                if x > rechts:
                    rechts = x
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < hoehe and 0 <= nx < breite \
                                and maske[ny, nx] and not besucht[ny, nx]:
                            besucht[ny, nx] = True
                            stapel.append((ny, nx))
            if flaeche >= MIN_FLAECHE:
                ergebnis.append((flaeche, (links, oben, rechts, unten)))
    return ergebnis


def figur_ausschnitt(kachel: np.ndarray) -> tuple[tuple[int, int, int, int], np.ndarray] | None:
    """Rahmen und Alphamaske der Figur in einer Kachel.

    Die Figur ist die GRÖSSTE Zusammenhangskomponente. Ihr Rahmen wird NICHT
    erweitert, solange weitere Teile dazukommen — sonst schaukelt sich das auf:
    Ein Buchstabe am unteren Bildrand berührt die Figur knapp, der Rahmen wächst
    nach unten, der nächste Buchstabe passt hinein, und am Ende steht der ganze
    Name mit im Bild.

    Beiwerk (schwebende Kugeln, Begleiter) wird über seine GRÖSSE mitgenommen:
    mindestens 4 % der Figurenfläche. Buchstaben liegen deutlich darunter und
    fallen damit heraus — unabhängig davon, ob der Name über oder unter der Figur
    steht (beides kommt in den Bögen vor).
    """
    hoehe, breite = kachel.shape[0], kachel.shape[1]
    I = RAHMEN_INSET
    kern = kachel[I:hoehe - I, I:breite - I]

    ton1, ton2 = hintergrund_toene(kern)
    hg = hintergrund_ueber_zellen(kern, ton1, ton2)
    inhalt = ~hg

    gefunden = komponenten(inhalt)
    if not gefunden:
        return None

    kern_flaeche = kern.shape[0] * kern.shape[1]
    groesste_flaeche, (f_links, f_oben, f_rechts, f_unten) = max(gefunden, key=lambda k: k[0])
    if groesste_flaeche < kern_flaeche * 0.02:
        # Zu wenig Inhalt: Hier stimmt die Hintergrunderkennung nicht.
        return None

    schwelle = groesste_flaeche * 0.04
    links, oben, rechts, unten = f_links, f_oben, f_rechts, f_unten
    for flaeche, (l, o, r, u) in gefunden:
        if flaeche < schwelle:
            continue
        # Nur, was sich mit der Figur überschneidet.
        if u < f_oben or o > f_unten:
            continue
        # Rahmenträge aussortieren: Fläche winzig gegenüber dem umspannten Kasten.
        kasten = max(1, (r - l) * (u - o))
        if flaeche / kasten < 0.2 and (r - l) > kern.shape[1] * 0.7:
            continue
        links = min(links, l)
        oben = min(oben, o)
        rechts = max(rechts, r)
        unten = max(unten, u)

    rand = 2
    links = max(0, links - rand) + I
    oben = max(0, oben - rand) + I
    rechts = min(breite - 1, rechts + rand) + I
    unten = min(hoehe - 1, unten + rand) + I

    alpha = np.zeros((hoehe, breite), dtype=np.uint8)
    alpha[I:hoehe - I, I:breite - I] = np.where(inhalt, 255, 0)
    rahmen = textrand_entfernen(kachel, alpha, (links, oben, rechts + 1, unten + 1))
    return rahmen, alpha


def ist_textzeile(rgb_zeile: np.ndarray, sicht: np.ndarray) -> bool:
    """Erkennt eine Zeile, die aus Buchstaben besteht.

    Buchstaben sind eine Folge KURZER dunkler Striche mit hellen Lücken dazwischen.
    Ein Stück Figur hat dagegen wenige, lange dunkle Läufe. Nötig, weil der Name
    bei manchen Bögen die Figur berührt und dann mit ihr zu EINER Komponente
    verschmilzt — über Komponenten allein ist er dort nicht mehr abzutrennen.
    """
    dunkel = (rgb_zeile.mean(axis=1) < 100) & sicht
    if dunkel.sum() < len(dunkel) * 0.06:
        return False

    laeufe = 0
    kurze = 0
    drin = False
    laenge = 0
    for wert in dunkel:
        if wert:
            if not drin:
                laeufe += 1
                drin = True
                laenge = 1
            else:
                laenge += 1
        elif drin:
            if laenge <= 40:
                kurze += 1
            drin = False
    return laeufe >= 8 and kurze >= 6


def textrand_entfernen(kachel: np.ndarray, alpha: np.ndarray, rahmen: tuple[int, int, int, int],
                       max_anteil: float = 0.16) -> tuple[int, int, int, int]:
    """Schneidet Namenszeilen vom oberen und unteren Rand des Zuschnitts ab.

    Gesucht wird ein BLOCK von mindestens zwei Textzeilen innerhalb des Rand-
    bereichs — nicht eine einzelne Zeile am äußersten Rand. Über der Namenszeile
    liegt oft noch ein Streifen freigestellter Fläche; ein Abbruch bei der ersten
    Nicht-Textzeile hätte die Suche dort sofort beendet.
    """
    links, oben, rechts, unten = rahmen
    hoehe_gesamt = unten - oben
    grenze = max(3, int(hoehe_gesamt * max_anteil))

    def rand_kuerzen(von_oben: bool) -> int:
        """Liefert den neuen Rand, wenn dort ein Textblock liegt."""
        treffer = []
        for i in range(grenze):
            y = (oben + i) if von_oben else (unten - 1 - i)
            if not (oben <= y < unten):
                break
            if ist_textzeile(kachel[y, links:rechts], alpha[y, links:rechts] > 0):
                treffer.append(i)
        if len(treffer) < 2:
            return oben if von_oben else unten
        tiefster = max(treffer)
        neu = (oben + tiefster + 1) if von_oben else (unten - 1 - tiefster)
        # Nicht zu viel wegnehmen: Es muss eine Figur übrig bleiben.
        if von_oben and (unten - neu) < hoehe_gesamt * 0.5:
            return oben
        if not von_oben and (neu - oben) < hoehe_gesamt * 0.5:
            return unten
        return neu

    oben = rand_kuerzen(True)
    unten = rand_kuerzen(False)
    return (links, oben, rechts, unten)


def einpassen(bild: Image.Image, kante: int) -> Image.Image:
    """Setzt die Figur mittig in ein quadratisches Bild der Zielgröße."""
    b, h = bild.size
    faktor = min(kante / b, kante / h)
    neu = bild.resize((max(1, round(b * faktor)), max(1, round(h * faktor))), Image.LANCZOS)
    leinwand = Image.new("RGBA", (kante, kante), (0, 0, 0, 0))
    leinwand.paste(neu, ((kante - neu.width) // 2, (kante - neu.height) // 2))
    return leinwand


def main() -> int:
    from namen import FRAKTIONEN  # type: ignore[import-not-found]

    ZIEL.mkdir(parents=True, exist_ok=True)
    gesamt = 0
    fehler: list[str] = []

    for nr, (fraktion, eintraege) in enumerate(FRAKTIONEN.items(), start=1):
        quelldatei = QUELLE / f"team {nr}.png"
        if not quelldatei.exists():
            fehler.append(f"{quelldatei.name} fehlt")
            continue

        bogen = np.asarray(Image.open(quelldatei).convert("RGB"))
        th, tw = bogen.shape[0] // 3, bogen.shape[1] // 3
        ordner = ZIEL / fraktion
        ordner.mkdir(parents=True, exist_ok=True)

        for (zeile, spalte, dateiname) in eintraege:
            kachel = bogen[zeile * th:(zeile + 1) * th, spalte * tw:(spalte + 1) * tw]
            ausschnitt = figur_ausschnitt(kachel)
            if ausschnitt is None:
                fehler.append(f"{fraktion}/{dateiname}: keine Figur gefunden")
                continue

            (links, oben, rechts, unten), alpha = ausschnitt
            rg = kachel[oben:unten, links:rechts].astype(np.uint8)
            a = alpha[oben:unten, links:rechts]
            bild = Image.fromarray(np.dstack([rg, a]), mode="RGBA")
            bild = einpassen(bild, ZIEL_KANTE)
            bild.save(ordner / f"{dateiname}.png", optimize=True)
            gesamt += 1

    print(f"{gesamt} Charaktere geschrieben nach {ZIEL.relative_to(ROOT)}")
    if fehler:
        print(f"{len(fehler)} Fehler:")
        for f in fehler:
            print("  " + f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
