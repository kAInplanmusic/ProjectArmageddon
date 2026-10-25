# Sprite-Sheets erzeugen (Werkzeuge)

Schlüssel nur aus der Umgebung (`REPLICATE_API_TOKEN`, `KIE_API_KEY`), nie in Dateien.

- `prompts.py`: Eingabetexte für `WALK`, `AKTION`, `ZUSTAND` (4×2 Raster, grüner Hintergrund, ohne Waffe).
- `rep.py` (Replicate) und `kie.py` (kie.ai): `rep_gen(prompt, seitenbild, ausgabe)` / `gen(...)`.
- `batch3.py`: Serie über alle Seitenbilder in `src/client/assets/characters-side/` (Ausgabe `roh3/`, abbrechen bei leerem Konto).
- `schneide.py`: schneidet die 8 Zellen, stellt frei (Grün-Maske, Gitterlinien-Filter), skaliert gemeinsam und setzt die Füße auf y=240 (`blatt(pfad, mehr=True)`). Ruft am Ende `streifen-entfernen.py` auf.
- `streifen-entfernen.py`: räumt Gitterstriche nach, die der Filter nicht erwischt hat — ein Strich, der durch die Figur läuft, überlebt die Öffnung. Befund SPR-5: 11 Zellen in 3 Blättern. `--trocken` zeigt nur, ohne `--trocken` schreibt es und kontrolliert sich selbst: `python3 scripts/sprites-erzeugen/streifen-entfernen.py --trocken`
- Danach `python3 scripts/sprite-sheets-klassifizieren.py`.
Pfade in den Skripten beim Einsatz anpassen. Anleitung und Fallen: MASTERDOTO, „Übergabe und Fahrplan", Abschnitt 4.
- `stil-pass.py`: Stil-Pass auf FERTIGEN Figuren (2026-10-25): `--raeumen` (Splitter/Nadelstiche), `--neon` (Farbzug in die Fraktionslinie, SPR-4), `--randlicht` (Aussenkante aufhellen, SPR-6). Immer erst `--trocken`; jeder Lauf gibt VORHER/NACHHER aus. Standard und `characters-hd` teilen sich den Pass.
