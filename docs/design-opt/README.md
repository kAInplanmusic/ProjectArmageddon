# Design-opt – vollständige Untersuchung vom 08.11.2026

Dieser Branch enthält sämtliche Änderungen des Fraktionsentwurfs und die vollständigen Analyseergebnisse.

- [Ausführlicher Bericht: alle 81 Figuren, bestehende Biografien, 22 Aufgaben, Architektur und Aufwand](../fraktions-optik-audit-2026-11-08.md)
- [Visueller HTML-Bericht](index.html): zum lokalen Betrachten diesen Ordner vollständig herunterladen und index.html im Browser öffnen.
- Neun JPG-Vergleichsbögen: pro Fraktion alle neun Figuren mit Porträt, Seitenansicht und allen vier Sprite-Sheetarten.
- originale.jpg: Übersicht der neun ursprünglichen Fraktionsbögen.
- kulissen.jpg: repräsentative Übersicht bestehender Hintergründe.
- katalog.json: geprüfte Namen, Fraktionen, Klassen und Biografien.
- charakter-optik-befunde.json: Einzelbefunde aller 81 Figuren.
- asset-statistik.json und musik-statistik.json: gemessener Assetbestand und Hymnenmetadaten.
- fallow.json: strukturelle Prüfung der Änderungen vor dem ersten Commit.

Die neun Embleme/Banner liegen unter src/client/assets/fraktionszeichen; die Schrift- und Kaderintegration liegt im Client.

Prüfung: 2.416 Unit-Tests, check:docs, Produktionsbuild und ESLint der betroffenen JavaScript-Dateien bestanden. Browser-E2E wegen der Ausführungsumgebung nicht abgenommen. Figuren-Neuproduktion, 4K und HDR sind dokumentierte Folgearbeiten; dieser Branch behauptet keine fertige Umsetzung davon. Main bleibt unverändert.
