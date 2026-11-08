# Waffen-Audit vom 08.11.2026

- [Vollständiger Bericht mit allen 150 Einzelprüfungen](BERICHT.md)
- [Visueller HTML-Bericht](index.html): ganzen Ordner herunterladen und lokal öffnen.
- einzelbefunde-150.json: individuelle visuelle Befunde und maschinelle Marker.
- datenstand-f15.json: Quelle, Grundkatalog, aktuelle Fassung, Effekte und Spritezuordnung.
- bildmessungen.json: Maße, Alphaabdeckung, Hashes und Atlasgrenzen.
- erstaktionsprobe-150.json: Ergebnis eines Schuss-/Anwendungsstarts je Waffe.
- radius-kontrollprobe.json: reproduzierter Schadensunterschied mit Radius 24 gegen Radius 0.
- weapons-*.jpg: alle statischen Vergleichsbögen (grün=Griff, rot=Wirkspitze).
- weapon-animations-*.jpg: Sichtübersichten aller 26 zusätzlichen Animations-Sheets.

Kostenfreie Belegprobe vom Repository-Hauptverzeichnis:

```bash
PA_ZUGPAUSE_SEKUNDEN=0 node tools/waffen-radius-beleg.mjs
```

Keine Modellaufrufe. Keine Änderung des Spielcodes. Die Probe ruft denselben Explosionspfad mit tatsächlichen Spawnparametern kontrolliert auf; sie ist kein vollständiger Kollisionsspieltest.
