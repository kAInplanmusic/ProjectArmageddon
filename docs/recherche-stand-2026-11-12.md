# Recherche-Stand 2026-11-12

**Erstellt:** 2026-11-12

## offArtillery.net

- **GitHub Topic gesucht:** `projectarmageddon`
- **Ergebnis:** Repository existiert, aber die angeforderten Assets (Foam-Lines, Oil-Slick, Wasser-Heightmap, Partikel-Pool) sind nicht als separates Projekt verfügbar
- **Status:** ❌ Nicht nutzbar für Wasser-Optik

## Reddit

- **Erläuterung:** Reddit-Beiträge sind nicht öffentlich lesbar ohne Account, und die Botschafts-App erlaubt keinen Web-Scraping-Zugriff
- **Status:** ❌ Nicht lesbar

## Sonniss GDC

- **Lizenz geprüft:** Asset-Paket von Sonniss erschienen auf der GDC-Sammlung
- **Nutzbarkeit:** Kommerzielle Nutzung erlaubt, aber Assets müssen selbst eingebunden werden
- **Status:** ✅ **Nutzbar** – Asset-Paket kann lokal referenziert werden

## Kenney CC0/OGA

- **Verfügbarkeit:** Vollständige Sammlung auf itch.io und opengameart.org
- **Lizenz:** CC0 1.0 Universal (Public Domain)
- **Nutzbar:** Ja, für alle 15 Comic-Filter-Texturen
- **Status:** ✅ **Nutzfähig** – 15 Foto-Texturen als Comic-Filter (N-32)

## ZzFX / Voice-Kette

- **ZzFX:** Mikro-Soundgenerator (377 Bytes), bereits in `src/shared/zzfx.js` vorhanden
- **Voice-Kette:** Sound-Design-Pool für Tiere-Balance
- **Status:** ✅ Integriert

## Wasser-Heightmap / Partikel-Pool

- **Heightmap:** Für dynamische Wasser-Oberflächen (Wellen, Schaumkappen)
- **Partikel-Pool:** Für Spritzer, Schlängel, Blätter
- **Quelle:** Eigenes generatives System in `src/shared/terrainKomposition.js`
- **Status:** ✅ **Eigenentwicklung** – Passt zum Projekt, keine externe Quelle nötig

## Zusammenfassung

| Quelle | Nutzbar | Bemerkung |
|--------|---------|-----------|
| openartillery.net | ❌ | GitHub-Topic, keine Assets gefunden |
| Reddit | ❌ | Nicht ohne Account lesbar |
| Sonniss GDC | ✅ | Kommerzielle Nutzung möglich |
| Kenney CC0/OGA | ✅ | 15 Foto-Texturen für Comic-Filter |
| ZzFX | ✅ | Bereits integriert |
| Wasser-Heightmap | ✅ | Eigen-Implementierung |
| Partikel-Pool | ✅ | Eigen-Implementierung |