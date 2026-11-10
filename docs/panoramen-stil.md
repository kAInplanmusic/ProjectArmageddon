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


## Vier Hintergrundarten je Bild (Stand 2026-11-10)

Je Panorama gibt es `<name>_<art>.webp` (1920x1080, WebP) mit `art` = `hell` (Tag), `dunkel` (Nacht), `hoehle`
(Blick aus einer Hoehle, Gesteinsrahmen) und `ragnarok` (endzeitlich, Glut und Asche); gleiche Bedeutung wie
`STIMMUNGEN` in `config/backdrops.js` und `backdrops-neu`. Es gibt keine `_h`-Dateien (Hochkant 768x1344 bei den
Biom-Kulissen); sie wurden nicht verlangt und fehlen. Erzeugt mit `scripts/panoramen-4arten.py` (Together
`openai/gpt-image-2`, Referenz = das gemalte Panorama, Methode wie oben). `hell` wurde bei 14 Tagbildern und `dunkel`
bei 4 Nachtbildern aus dem vorhandenen Bild uebernommen, alles andere neu erzeugt.

### Zuordnung zu Biomen (`panoramen-stil/zuordnung.json`)

Annahmen: Die Fotos zeigen mitteleuropaeische Landschaft; nur wenige der 20 Biome passen wirklich. Zuordnung nach
Motiv und Stimmung, schwache Zuordnungen sind als solche begruendet. Bilder ohne Sonderbiom (Wiesen, Felder, Himmel)
sind nur der klassischen Kulissenfamilie (`config/backdrops.js`) zugeordnet, nicht erzwungen einem der 20 Biome.

| Bild | Biome (SSOT-Kennung) | Kulissenfamilie | Begruendung |
|---|---|---|---|
| `alpendorf_herbst` | burg | alpine | Berghang mit Holzhaeusern und Nadelwald; Burgfelsen/Bergfestung als schwache Naehe |
| `baum_wegegabelung` | keins | open | Wiesenlandschaft mit Weg, kein Sonderbiom passt |
| `baum_weitblick` | keins | open | Wiese mit Einzelbaum und Fernsicht |
| `bergsee` | kristallarchipel | alpine | Klarer tuerkiser Bergsee mit Wasserflaeche; kuehle Eis-/Inselstimmung (schwach) |
| `birke_gemaelde` | kristallwald | forest | Dunkler, nebliger Birkenwald; Uralter Wald |
| `feldweg_morgen` | keins | open | Felder und Feldweg |
| `fluss_goldhaus` | surreal | fantasy | Goldener Wuerfelbau am Fluss unter Wolken, ungewoehnliche Architektur |
| `gewitter_abendrot` | dimensionsriss | open | Violett-rosa Plasma-aehnlicher Himmel ueber dunkler Linie |
| `halbmond_huegel` | kristallwald | forest | Dunkler bewaldeter Huegel mit Halbmond |
| `herbstbaeume_dunst` | keins | forest | Herbstbaeume im Dunst auf Wiese |
| `herbstwiese` | keins | forest | Herbstbaeume mit tiefer Sonne |
| `huegelweide` | keins | open | Huegelweide mit Wald, Weg |
| `klondike_schnee` | eiswueste | alpine | Verschneites Holzdorf am Hang |
| `nachtstadt_lichter` | fabrik | urban | Stadtlichter bei Nacht im Tal |
| `nachtstadt_tal` | fabrik | urban | Stadtlichter bei Nacht im Tal |
| `nachtstadt_tal_2` | fabrik | urban | Stadtlichter bei Nacht im Tal |
| `nachtstrasse_sw` | schrott, fabrik | noir | Leere Nachtstrasse mit Laterne und Haus, Noir-Stimmung |
| `nebelmorgen_scheune` | keins | open | Morgennebel mit Baeumen und Haus |
| `palmenstrand_fluss` | riff | island | Palmen, Sandstrand und Wasser |
| `rosa_abend` | keins | open | Abendhimmel mit Haeusersilhouetten |
| `rosa_glut_feld` | keins | open | Gluehendes Abendrot ueber Feld und Waldkante |
| `schaefchenwolken` | keins | open | Wolkenhimmel ueber Wiese |
| `schnee_alpendorf` | eiswueste | alpine | Schneelandschaft mit Berg und Alpendorf |
| `schneegarten` | eiswueste | alpine | Verschneite Baeume und Garten |
| `schotterweg_horizont` | duenen | open | Karge trockene Ebene mit Horizont; Wuestenaehnlich (schwach) |
| `sonne_ueber_wald` | keins | forest | Sonnenuntergang ueber Waldkante |
| `sonnenaufgang_zaun` | keins | open | Sonnenaufgang ueber Zaun und Wiese |
| `sonnenstrahlen_felder` | keins | open | Lichtstrahlen ueber Wiese |
| `sonnenuntergang_feld` | duenen | open | Goldene Weite mit tiefer Sonne, wuestenaehnlich (schwach) |
| `stadt_morgenrot` | fabrik | urban | Flache Industrie-/Stadtdaecher im Morgenrot |
| `strand_ebbe` | riff | island | Strand bei Ebbe, Wasser und Himmel |
| `western_regenbogen` | duenen | western | Western-Stadt im Abendlicht (gemalte Fassung); Wuestenstadt |
