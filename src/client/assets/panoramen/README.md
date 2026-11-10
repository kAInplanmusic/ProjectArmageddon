# Panoramafotografien

Übernommener lokaler Bestand vom 9. November 2026. Die Laufzeit lädt ausschließlich
SDR (Tonemapping bereits im Bild): AVIF mit 3840 × 2160 auf großen Displays,
WebP mit 1280 × 720 auf kleinen Displays. AVIF erhält als Fallback die kleine
WebP, die kleine WebP als Fallback das UHD-AVIF.
Die ursprünglichen AVIF-Vorarbeiten bleiben gesichert, werden aber ohne abgenommene
HDR-Kette nicht ausgeliefert. Nur `*-sdr.avif` und `*-1280.webp` kommen in den Build.
Die ursprünglichen UHD-WebP bleiben als Quelle im Repo, nicht im Build.
`python3 scripts/panoramen-sdr.py` erzeugt die neuen SDR-AVIF mit Pillow 13.0.0,
Qualität 50, Speed 6. Es wird weder beschnitten noch hochskaliert.

| Kennung | Ursprung | Fotograf |
|---|---|---|
| snow_field | https://polyhaven.com/a/snow_field | Sergej Majboroda |
| factory_yard | https://polyhaven.com/a/factory_yard | Sergej Majboroda |
| small_cave | https://polyhaven.com/a/small_cave | Andreas Mischok |

Die Quellassets stehen bei Poly Haven unter CC0:
https://polyhaven.com/license (geprüft am 9. November 2026).
Die 8K-Tonemapping-JPGs sind auf den jeweiligen Assetseiten verfügbar. Die lokalen
UHD-Zuschnitte und kleinen Ableitungen wurden unverändert aus dem vorhandenen
Checkout übernommen; ein vollständiges Erzeugungsskript und die ursprünglichen
8K-Dateien lagen in den beiden untersuchten Git-Checkouts nicht vor. Deshalb wird
hier keine exakte Crop-/Encoder-Reproduzierbarkeit behauptet.

`manifest.json` hält die tatsächlich übernommenen Dateien mit SHA-256, Bytes
und Pixelmaßen fest. Die Geometrie des Spiels ist vom Foto unabhängig.

## Fotos des Auftraggebers (2026-11-10)

19 eigene Fotos des Auftraggebers, 1:1 übernommen (kein Stilwechsel, kein Hochskalieren) mit
`python3 scripts/panoramen-fotos.py QUELLORDNER`. Gezielte Zuschnitte stehen im Skript: Personen und der
Hund sind herausgeschnitten, der verzerrte Fischaugenrand entfällt, zwei Hochformate sind auf einen
Querstreifen um den Horizont gebracht. Metadaten (EXIF, GPS) werden nicht übernommen.
Stufen: `<id>-sdr.avif` in voller Auflösung, `<id>-1280.webp` mit höchstens 720 px Höhe, `<id>.webp` als
Quelle (nicht im Build). Das Bild „western_regenbogen“ ist eine Illustration, kein Foto.
Zuordnung zu den Kulissenbiomen: `FOTOS_JE_BIOM` in `src/client/panoramen.js`; jede dritte Karte eines
Bioms mit Fotos zeigt eines (Seed mod 3 = 0). Die Adresstabelle lädt erst mit der ersten Fotokulisse
(`src/client/panoramenUrls.js`).
