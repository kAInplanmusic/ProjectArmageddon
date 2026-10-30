#!/usr/bin/env python3
"""
Figurenblaetter neu erzeugen (SPR-1/3/7, Auftrag 2026-10-25).

Erzeugt Animationsblaetter (WALK/AKTION/ZUSTAND) neu aus den Seitenbildern
`src/client/assets/characters-side/<fraktion>/<figur>.png` ueber die vorhandenen
Generatoren `kie.py` (kie.ai) und `rep.py` (Replicate) und die Prompts aus
`prompts.py`. Geschrieben wird NUR in das Zielverzeichnis — die ausgelieferten
Blaetter unter `src/client/assets/` werden erst nach Sichtung und Zuschnitt
(`schneide.py`) ersetzt.

Schluessel kommen ausschliesslich aus der Umgebung (KIE_API_KEY,
REPLICATE_API_TOKEN, TOGETHER_API_KEY). Dieses Werkzeug liest, druckt und speichert keine Keys.

Aufruf:
    # Pilot: eine Figur, ein Blatt, beide Anbieter
    python3 scripts/sprites-erzeugen/neu-erzeugen.py --ziel /tmp/pa-neu --pilot

    # Volle Runde: alle sechs Figuren, drei Blaetter, beide Anbieter
    python3 scripts/sprites-erzeugen/neu-erzeugen.py --ziel /tmp/pa-neu --anbieter beide

    # Nur ein Anbieter (kie, rep oder tog = Together AI, FLUX.1 Kontext pro)
    python3 scripts/sprites-erzeugen/neu-erzeugen.py --ziel /tmp/pa-neu --anbieter kie
    TOGETHER_API_KEY=... python3 scripts/sprites-erzeugen/neu-erzeugen.py --ziel /tmp/pa-neu --anbieter tog --pilot
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

HIER = Path(__file__).resolve().parent
PROJEKT = HIER.parent.parent
sys.path.insert(0, str(HIER))

import prompts  # noqa: E402

# Die sechs gemeldeten Figuren (SPR-1/3 = belegter Defekt, SPR-7 = Sichtung)
FIGUREN = [
    ("datacult", "11_synapse-streamer"),
    ("pixel", "11_pyrowand-a"),
    ("datacult", "20_buffer-flow-swarm"),
    ("datacult", "21_hyper-link-hound"),
    ("undead", "00_bone-racker-karl"),
    ("undead", "12_vessel-plague-skull"),
]
BLAETTER = [("walk", prompts.WALK), ("aktion", prompts.AKTION), ("zustand", prompts.ZUSTAND)]


def seitenbild(fraktion, figur):
    return PROJEKT / "src/client/assets/characters-side" / fraktion / f"{figur}.png"


def erzeuge_kie(prompt, quelle, ziel):
    from kie import upload, gen
    url = upload(str(quelle), ziel.stem + ".png")
    ergebnis = gen(prompt, url, str(ziel))
    return ergebnis


def erzeuge_tog(prompt, quelle, ziel):
    from tog import tog_gen
    return tog_gen(prompt, str(quelle), str(ziel))


def erzeuge_rep(prompt, quelle, ziel):
    from rep import rep_gen
    ergebnis = rep_gen(prompt, str(quelle), str(ziel))
    return ergebnis


ANBIETER = {"kie": erzeuge_kie, "rep": erzeuge_rep, "tog": erzeuge_tog}


def main():
    p = argparse.ArgumentParser(description="Figurenblaetter neu erzeugen")
    p.add_argument("--ziel", required=True, help="Zielverzeichnis fuer die Rohblaetter")
    p.add_argument("--anbieter", default="beide", choices=["kie", "rep", "tog", "beide"])
    p.add_argument("--figuren", default="", help="Komma-Liste fraktion/figur (leer = alle)")
    p.add_argument("--blaetter", default="", help="Komma-Liste walk,aktion,zustand (leer = alle)")
    p.add_argument("--pilot", action="store_true", help="nur eine Figur, ein Blatt, alle Anbieter")
    p.add_argument("--trocken", action="store_true", help="nur den Plan ausgeben")
    args = p.parse_args()

    figuren = FIGUREN
    blaetter = BLAETTER
    if args.figuren:
        gewaehlt = {t.strip() for t in args.figuren.split(",") if t.strip()}
        # Beliebige Figuren als fraktion/figur zulassen (nicht nur die sechs Standardfiguren).
        figuren = [tuple(t.split("/", 1)) for t in sorted(gewaehlt) if "/" in t] or \
            [f for f in FIGUREN if f[1] in gewaehlt]
    if args.blaetter:
        gewaehlt = {t.strip() for t in args.blaetter.split(",") if t.strip()}
        blaetter = [b for b in BLAETTER if b[0] in gewaehlt]
    if args.pilot:
        figuren = figuren[:1]
        blaetter = blaetter[:1]

    anbieter = list(ANBIETER) if args.anbieter == "beide" else [args.anbieter]
    ziel = Path(args.ziel)
    if not args.trocken:
        ziel.mkdir(parents=True, exist_ok=True)

    auftraege = []
    for fraktion, figur in figuren:
        quelle = seitenbild(fraktion, figur)
        if not quelle.exists():
            print(f"FEHLT Seitenbild: {quelle}", flush=True)
            continue
        for blatt, prompt in blaetter:
            for a in anbieter:
                auftraege.append((fraktion, figur, blatt, prompt, quelle, a))

    print(f"Auftraege: {len(auftraege)} (Figuren {len(figuren)}, Blaetter {len(blaetter)}, "
          f"Anbieter {anbieter})", flush=True)
    if args.trocken:
        for fraktion, figur, blatt, _p, quelle, a in auftraege:
            print(f"  {fraktion}/{figur} {blatt} ueber {a} <- {quelle.name}", flush=True)
        return

    fehler = 0
    beginn = time.time()
    for i, (fraktion, figur, blatt, prompt, quelle, a) in enumerate(auftraege, 1):
        datei = ziel / f"{fraktion}__{figur}__{blatt}__{a}.png"
        if datei.exists() and datei.stat().st_size > 2000:
            print(f"[{i}/{len(auftraege)}] uebersprungen (vorhanden): {datei.name}", flush=True)
            continue
        t0 = time.time()
        try:
            ergebnis = ANBIETER[a](prompt, quelle, datei)
        except Exception as fehler_obj:  # Netz, Kontingent, Modell
            fehler += 1
            print(f"[{i}/{len(auftraege)}] FEHLER {datei.name}: {fehler_obj}", flush=True)
            continue
        dauer = time.time() - t0
        if isinstance(ergebnis, str) and (ergebnis.startswith("FEHLER") or ergebnis.startswith("ERR")
                                          or ergebnis == "Timeout"):
            fehler += 1
            print(f"[{i}/{len(auftraege)}] ANBIETER-MELDUNG {datei.name}: {ergebnis} ({dauer:.0f}s)", flush=True)
            continue
        groesse = datei.stat().st_size if datei.exists() else 0
        print(f"[{i}/{len(auftraege)}] ok {datei.name} ({groesse} B, {dauer:.0f}s)", flush=True)

    protokoll = {
        "zeit": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "auftraege": len(auftraege),
        "fehler": fehler,
        "dauerSekunden": round(time.time() - beginn),
        "ziel": str(ziel),
        "anbieter": anbieter,
        "figuren": [f"{f}/{n}" for f, n in figuren],
        "blaetter": [b for b, _ in blaetter],
        "dateien": sorted(f.name for f in ziel.glob("*.png")),
    }
    (ziel / "protokoll.json").write_text(json.dumps(protokoll, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"fertig: {len(auftraege) - fehler} ok, {fehler} Fehler, {protokoll['dauerSekunden']}s", flush=True)


if __name__ == "__main__":
    main()
