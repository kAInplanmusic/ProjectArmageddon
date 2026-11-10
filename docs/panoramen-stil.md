# Panoramen im Kulissenstil (panoramen-stil)

Die Fotos des Auftraggebers aus `src/client/assets/panoramen` liegen zusätzlich in einer gemalten Fassung im
Stil der Biom-Kulissen (`src/client/assets/backdrops-neu`) vor: `src/client/assets/panoramen-stil/<name>.webp`
(1920x1080, WebP). Die Originale bleiben unverändert; die Laufzeit-Einbindung ist (Stand 2026-11-10) nicht
umgestellt.

## Erzeugung

`scripts/panoramen-stil.py` (Prompt als Konstante `PROMPT`). Modell Together `openai/gpt-image-2` mit
`reference_images` (raw-GitHub-URL der Fotodatei auf `main`, die Datei muss gepusht sein). Der Schlüssel
`TOGETHER_API_KEY` kommt nur aus der Umgebung.

- Together liefert mit Referenzbild immer 1024x1024 (`size` wird ignoriert). Der Prompt verlangt, alles Wichtige in
  das mittlere 16:9-Band zu legen; daraus wird 1024x576 geschnitten und per Lanczos plus leichtem Schärfen auf
  1920x1080 skaliert (nie gestreckt). Die Schärfe entspricht deshalb nur 1024 px Breite.
- Ausgenommen: `factory_yard`, `small_cave`, `snow_field` (PolyHaven).
- Aufruf: `python3 scripts/panoramen-stil.py [--parallel 4] [--neu] [NAME ...]`; `--liste` zeigt die 36 Quellen.

## Ergebnis (36 Fotos, 36 erste Versuche ok)

32 übernommen, 4 verworfen, weil die Szene verfälscht wurde (Motiv erfunden): `abendrot_silhouette` (See und Weg
dazugemalt), `moosboden_wald` (Bergsee-Ausblick statt Moosboden), `nachtstrasse_boden` (Hügelkette, See und
Mond-Laterne erfunden), `maisfeld_sw` (See und Hügel dazugemalt). Nicht erneut erzeugt, weil dieselben Motive mit
diesem Prompt wieder abweichen würden; für sie bleibt das Original.

Bedingt brauchbar (Komposition erkennbar, Details leicht verändert): `schotterweg_horizont` (Sonne und Ferne
ergänzt), `nachtstadt_lichter` (Wasserfläche ergänzt), `feldweg_morgen`, `halbmond_huegel`. Geprüft wurde nur
visuell per Kontaktbogen (links Original, rechts neu), nicht im Spiel.
