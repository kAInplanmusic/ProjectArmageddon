# Sprite-Sheets erzeugen (Werkzeuge)

Schlüssel nur aus der Umgebung (`REPLICATE_API_TOKEN`, `KIE_API_KEY`), nie in Dateien.

- `prompts.py`: Eingabetexte für `WALK`, `AKTION`, `ZUSTAND` (4×2 Raster, grüner Hintergrund, ohne Waffe).
- `rep.py` (Replicate) und `kie.py` (kie.ai): `rep_gen(prompt, seitenbild, ausgabe)` / `gen(...)`.
- `batch3.py`: Serie über alle Seitenbilder in `src/client/assets/characters-side/` (Ausgabe `roh3/`, abbrechen bei leerem Konto).
- `schneide.py`: schneidet die 8 Zellen, stellt frei (Grün-Maske, Gitterlinien-Filter), skaliert gemeinsam und setzt die Füße auf y=240 (`blatt(pfad, mehr=True)`).
- Danach `python3 scripts/sprite-sheets-klassifizieren.py`.
Pfade in den Skripten beim Einsatz anpassen. Anleitung und Fallen: MASTERDOTO, „Übergabe und Fahrplan", Abschnitt 4.
