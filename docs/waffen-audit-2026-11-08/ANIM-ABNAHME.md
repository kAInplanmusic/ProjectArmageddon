# Abnahme der 26 Waffen-Zusatzanimationen (BAL-10)

Stand: 09.11.2026 · Branch `bg/bal-10` · Ergänzung zu [ANIM-GATING.md](ANIM-GATING.md) und [BERICHT.md](BERICHT.md)

## Ergebnis

Geprüft wurden alle 26 Blätter aus `src/client/assets/weapon-sprites/anim/` gegen sechs Kriterien je Blatt: 8 Frames, Alpha, Identität, Richtung, Bewegung und Rolle. Ergebnis: **0 produktfreigegeben**, **1 datenabgenommen**, **25 abgelehnt**. Produktpfad bleibt gesperrt (`freigabe.produktpfad: false`, `ANIM_FREIGABE` leer).

Kein Blatt erfüllt die Produktkriterien, weil die Browserabnahme W20 ohne Rendereranschluss nicht durchgeführt wurde und 9 Blätter einen eingebrannten Effekt tragen (W17; pa_121 zusätzlich). Die Datenabnahme ist deshalb bewusst keine Produktfreigabe.

- Datenabgenommen: pa_065
- Produktfreigegeben: —

## Verfahren

`python3 tools/waffen-anim-abnahme.py` liest das Manifest, zerlegt jedes WebP in 8 Zellen (4×2, 256 px) und misst pixelbasiert. Die Motiv- und Rollenurteile sind eine Sichtprüfung der 8 Frames je Blatt; sie stehen getrennt als `SICHT` im Skript. Alle Zahlen stehen maschinenlesbar in [anim-abnahme-messung.json](anim-abnahme-messung.json).

Schwellen: sichtbares Alpha > 16; zwei Frames gelten ab 0,03 mittlerer RGB-Differenz (64 px, 2 px Weichzeichnung) als verschieden; Schleife geschlossen bei F7→F0 ≤ 0,045; Richtung stabil bei Hauptachsen-Streuung ≤ 15°; mindestens 6 unterscheidbare Frames; ortsfeste Rollen dürfen maximal 0,10 Zellbreiten driften, `wurf` braucht ≥ 20° Drehung. Identität ist ein Motivurteil plus Sichtprüfung aller acht Frames; Histogramm-Korrelation und Silhouetten-IoU sind Stützmessungen (auffällig unter 0,85 bzw. 0,45). Das alte Feld `schwere` bleibt der Grob-Befund aus dem ersten Audit; maßgeblich ist `pruefung` je Blatt.

## Übersicht

| ID | Waffe | Rolle | 8 Frames | Alpha | Identität | Richtung | Bewegung | Rolle | Effekt | Abnahme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pa_032 | Raketenrucksack | ruecken | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 3) | ok (σ 10°) | **nein** (8 F, Loop 0.149) | **nein** | ok | **abgelehnt** |
| pa_038 | Rakete | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 1°) | **nein** (3 F, Loop 0.051) | ok | **eingebrannt** | **abgelehnt** |
| pa_044 | Phönixschlag | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 2°) | **nein** (1 F, Loop 0.015) | ok | **eingebrannt** | **abgelehnt** |
| pa_048 | Bananengranate | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 0°) | **nein** (1 F, Loop 0.009) | ok | ok | **abgelehnt** |
| pa_049 | Bumerang | wurf | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 10°) | **nein** (8 F, Loop 0.110) | **nein** | ok | **abgelehnt** |
| pa_053 | Roboterbombe | welt | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 1,5) | ok (σ 13°) | **nein** (8 F, Loop 0.093) | ok | ok | **abgelehnt** |
| pa_061 | Feuerdämon | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 1) | **nein** (σ 17°) | **nein** (3 F, Loop 0.030) | ok | **eingebrannt** | **abgelehnt** |
| pa_065 | Meteorbrocken | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 4°) | ok (8 F, Loop 0.040) | ok | **eingebrannt** | **datenabgenommen** |
| pa_073 | Tentakelgift | welt | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 4°) | **nein** (3 F, Loop 0.026) | **nein** | ok | **abgelehnt** |
| pa_112 | Düsenrucksack | ruecken | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 6°) | **nein** (8 F, Loop 0.132) | **nein** | ok | **abgelehnt** |
| pa_114 | Gleitschirm | ruecken | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 6°) | **nein** (8 F, Loop 0.132) | **nein** | ok | **abgelehnt** |
| pa_115 | Wächterstatue | beschwoerung | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 0°) | **nein** (1 F, Loop 0.006) | ok | ok | **abgelehnt** |
| pa_118 | Feuerwesen | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 1,3,7) | ok (σ 1°) | **nein** (4 F, Loop 0.052) | ok | **eingebrannt** | **abgelehnt** |
| pa_121 | Raketenfaust | hand | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 0°) | **nein** (2 F, Loop 0.020) | ok | **eingebrannt** | **abgelehnt** |
| pa_122 | Endlosschleife | selbst | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 4,7) | ok (σ 9°) | **nein** (7 F, Loop 0.198) | **nein** | ok | **abgelehnt** |
| pa_132 | Alte Dame | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 0) | **nein** (σ 18°) | **nein** (8 F, Loop 0.157) | ok | ok | **abgelehnt** |
| pa_133 | Fliegendes Superschaf | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 1°) | **nein** (4 F, Loop 0.049) | ok | ok | **abgelehnt** |
| pa_134 | Luftangriff | flug | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 2°) | **nein** (4 F, Loop 0.033) | ok | **eingebrannt** | **abgelehnt** |
| pa_135 | Meteorregen | flug | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 0,1,4,5) | ok (σ 1°) | **nein** (5 F, Loop 0.078) | ok | **eingebrannt** | **abgelehnt** |
| pa_136 | Bohrkopfrakete | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 4°) | **nein** (3 F, Loop 0.121) | ok | **eingebrannt** | **abgelehnt** |
| pa_141 | Astralkrieger | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 2°) | **nein** (8 F, Loop 0.066) | ok | ok | **abgelehnt** |
| pa_142 | Leerenritter | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 2,6) | ok (σ 8°) | **nein** (8 F, Loop 0.046) | ok | ok | **abgelehnt** |
| pa_143 | Astralross | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 1,6) | ok (σ 1°) | **nein** (4 F, Loop 0.020) | ok | ok | **abgelehnt** |
| pa_144 | Kosmische Wassermelone | flug | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | **nein** (σ 25°) | **nein** (7 F, Loop 0.110) | ok | ok | **abgelehnt** |
| pa_147 | Weltendrache | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | **nein** (σ 28°) | **nein** (7 F, Loop 0.163) | ok | ok | **abgelehnt** |
| pa_148 | Feuerschild | selbst | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 9°) | **nein** (8 F, Loop 0.069) | **nein** | ok | **abgelehnt** |

## Einzelbefunde

### pa_032 — Raketenrucksack

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.73%, Rechteckhintergrund —.
- **Identität:** nicht ok — blauer geflügelter Käfer/Krebs statt Raketenrucksack; F3 zeigt eine gespreizte Flügelpose und bricht die Silhouette; Histogramm min. 0.90, IoU min. 0.54, Brüche [3].
- **Richtung:** ok — Streuung 9.9°, Nettoweg 0.052 Zellbreiten, Resultante 0.13.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.1304, Schleife F7→F0 0.1488.
- **Rolle:** nicht ok — Flügelwesen, kein am Rücken getragenes Objekt; Drehsumme 71.8°, Ortsdrift 0.052.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage: Rucksack mit zwei Düsen unten, Flamme separat.

### pa_038 — Rakete

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.73%, Rechteckhintergrund —.
- **Identität:** ok — orange Rakete, Motiv trifft die Waffe; Histogramm min. 0.99, IoU min. 0.90, Brüche —.
- **Richtung:** ok — Streuung 0.6°, Nettoweg 0.035 Zellbreiten, Resultante 0.29.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0220, Schleife F7→F0 0.0508.
- **Rolle:** ok — Projektil im Flug, stabile Achse; Drehsumme 4.1°, Ortsdrift 0.035.
- **Effekt:** nicht ok — Triebwerksflamme fest im Blatt (W17).
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Flamme als eigene Ebene trennen und 6+ unterscheidbare Frames erzeugen.

### pa_044 — Phönixschlag

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.83%, Rechteckhintergrund —.
- **Identität:** ok — brennender Phönix, Motiv trifft den Phönixschlag; Histogramm min. 1.00, IoU min. 0.97, Brüche —.
- **Richtung:** ok — Streuung 1.5°, Nettoweg 0.002 Zellbreiten, Resultante 0.26.
- **Bewegung:** nicht ok — 1 unterscheidbare Frames, mittlere Differenz 0.0130, Schleife F7→F0 0.0150.
- **Rolle:** ok — Projektil im Flug, Flügelform konstant; Drehsumme 10.5°, Ortsdrift 0.002.
- **Effekt:** nicht ok — Feuer in Flügeln und Körper eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Flügelschlag neu animieren; Feuer als eigene Ebene.

### pa_048 — Bananengranate

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.66%, Rechteckhintergrund —.
- **Identität:** ok — Bananengranate mit Zünder, Motiv trifft die Waffe; Histogramm min. 0.99, IoU min. 0.98, Brüche —.
- **Richtung:** ok — Streuung 0.1°, Nettoweg 0.000 Zellbreiten, Resultante 0.35.
- **Bewegung:** nicht ok — 1 unterscheidbare Frames, mittlere Differenz 0.0087, Schleife F7→F0 0.0093.
- **Rolle:** ok — Projektil im Flug, Silhouette konstant; Drehsumme 0.8°, Ortsdrift 0.000.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: bewegung, browser.
- **Nächster Schritt:** Rotation und Splitter ergänzen; acht echte Phasen statt Standbild.

### pa_049 — Bumerang

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.70%, Rechteckhintergrund —.
- **Identität:** nicht ok — orange Bombe mit grauen Flügeln statt Bumerang; Histogramm min. 0.97, IoU min. 0.66, Brüche —.
- **Richtung:** ok — Streuung 10.5°, Nettoweg 0.018 Zellbreiten, Resultante 0.08.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0917, Schleife F7→F0 0.1104.
- **Rolle:** nicht ok — keine Drehachse, keine Rückkehrbewegung erkennbar; Drehsumme 106.5°, Ortsdrift 0.018.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Bumerang mit sichtbarer Rotation und Rückflugpose.

### pa_053 — Roboterbombe

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 1.00%, Rechteckhintergrund —.
- **Identität:** nicht ok — Holzwagen mit Mäusen statt Roboterbombe; F1/F5 wechseln Aufbau und Aufsatz; Histogramm min. 0.91, IoU min. 0.51, Brüche [1, 5].
- **Richtung:** ok — Streuung 13.2°, Nettoweg 0.038 Zellbreiten, Resultante 0.13.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0967, Schleife F7→F0 0.0929.
- **Rolle:** ok — Weltobjekt am Boden, Rollenzuordnung plausibel; Drehsumme 90.6°, Ortsdrift 0.038.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Roboterbombe mit Zünder und Explosionsphase.

### pa_061 — Feuerdämon

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.73%, Rechteckhintergrund —.
- **Identität:** nicht ok — brennender Dämon, Motiv trifft den Feuerdämon; F1 ist eine gelbe Feuerblase ohne Körper; Histogramm min. 0.20, IoU min. 0.95, Brüche [1].
- **Richtung:** nicht ok — Streuung 17.3°, Nettoweg 0.009 Zellbreiten, Resultante 0.22.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0445, Schleife F7→F0 0.0305.
- **Rolle:** ok — beschworene Figur mit eigener Standpose; Drehsumme 186.8°, Ortsdrift 0.009.
- **Effekt:** nicht ok — Flamme an Händen und Körper eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, effekt, browser.
- **Nächster Schritt:** F1 ersetzen, Flamme trennen, mindestens sechs Körperphasen.

### pa_065 — Meteorbrocken

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.84%, Rechteckhintergrund —.
- **Identität:** ok — Steinmeteor, Motiv trifft den Meteorbrocken; Histogramm min. 0.99, IoU min. 0.79, Brüche —.
- **Richtung:** ok — Streuung 4.4°, Nettoweg 0.012 Zellbreiten, Resultante 0.30.
- **Bewegung:** ok — 8 unterscheidbare Frames, mittlere Differenz 0.0800, Schleife F7→F0 0.0396.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 39.2°, Ortsdrift 0.012.
- **Effekt:** nicht ok — gelber Schweif fest im Blatt (W17).
- **Abnahme: datenabgenommen** — Gründe: effekt, browser.
- **Nächster Schritt:** Schweif als eigene Ebene trennen, dann W20 im Renderer.

### pa_073 — Tentakelgift

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.80%, Rechteckhintergrund —.
- **Identität:** nicht ok — grüner zweibeiniger Dinosaurier statt Tentakelgift; Histogramm min. 1.00, IoU min. 0.74, Brüche —.
- **Richtung:** ok — Streuung 3.5°, Nettoweg 0.016 Zellbreiten, Resultante 0.02.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0333, Schleife F7→F0 0.0261.
- **Rolle:** nicht ok — Kreatur, kein abgelegtes Weltobjekt; Drehsumme 32.2°, Ortsdrift 0.016.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Tentakelgift als Weltobjekt mit Giftwolke.

### pa_112 — Düsenrucksack

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.57%, Rechteckhintergrund —.
- **Identität:** nicht ok — blau geflügeltes Flugwesen statt Düsenrucksack; Histogramm min. 0.63, IoU min. 0.68, Brüche —.
- **Richtung:** ok — Streuung 6.2°, Nettoweg 0.022 Zellbreiten, Resultante 0.25.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0906, Schleife F7→F0 0.1325.
- **Rolle:** nicht ok — Flügelwesen, kein getragenes Rückenobjekt; Drehsumme 50.1°, Ortsdrift 0.022.
- **Effekt:** ok — keine eingebrannte Flamme; Düsen gehören zur Silhouette.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Eigene Vorlage Düsenrucksack; Dublette zu pa_114 auflösen (W06).

### pa_114 — Gleitschirm

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.57%, Rechteckhintergrund —.
- **Identität:** nicht ok — dasselbe blau geflügelte Flugwesen wie pa_112, kein Gleitschirm; Histogramm min. 0.63, IoU min. 0.68, Brüche —.
- **Richtung:** ok — Streuung 6.2°, Nettoweg 0.022 Zellbreiten, Resultante 0.25.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0906, Schleife F7→F0 0.1325.
- **Rolle:** nicht ok — Flügelwesen, kein Schirm mit Kappe und Leinen; Drehsumme 50.1°, Ortsdrift 0.022.
- **Effekt:** ok — kein Schirm, kein eigener Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Eigene Vorlage Gleitschirm mit Kappe, Leinen und Startpose.

### pa_115 — Wächterstatue

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.39%, Rechteckhintergrund —.
- **Identität:** ok — Giraffenstatue, als Wächterstatue motivnah; Histogramm min. 1.00, IoU min. 0.93, Brüche —.
- **Richtung:** ok — Streuung 0.2°, Nettoweg 0.000 Zellbreiten, Resultante 0.17.
- **Bewegung:** nicht ok — 1 unterscheidbare Frames, mittlere Differenz 0.0171, Schleife F7→F0 0.0065.
- **Rolle:** ok — beschworene Statue, Rollenzuordnung plausibel; Drehsumme 2.3°, Ortsdrift 0.000.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: bewegung, browser.
- **Nächster Schritt:** Idle-Bewegung oder bewusst prozedural; Standbild ist keine Animation.

### pa_118 — Feuerwesen

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.85%, Rechteckhintergrund —.
- **Identität:** nicht ok — grauer Humanoid mit Feuerball, Motiv nah am Feuerwesen; Körper dreht zwischen Vorder- und Rückansicht, Feuerball bleibt starr; Histogramm min. 0.60, IoU min. 0.75, Brüche [1, 3, 7].
- **Richtung:** ok — Streuung 1.2°, Nettoweg 0.003 Zellbreiten, Resultante 0.15.
- **Bewegung:** nicht ok — 4 unterscheidbare Frames, mittlere Differenz 0.0452, Schleife F7→F0 0.0516.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung plausibel; Drehsumme 9.2°, Ortsdrift 0.003.
- **Effekt:** nicht ok — Feuerball fest in der Hand (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, effekt, browser.
- **Nächster Schritt:** Körperhaltung durchgehend gleich, Feuerball als eigene Ebene.

### pa_121 — Raketenfaust

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.57%, Rechteckhintergrund —.
- **Identität:** ok — Clownfaust mit Raketenantrieb, Motiv trifft die Raketenfaust; Histogramm min. 1.00, IoU min. 0.96, Brüche —.
- **Richtung:** ok — Streuung 0.2°, Nettoweg 0.005 Zellbreiten, Resultante 0.27.
- **Bewegung:** nicht ok — 2 unterscheidbare Frames, mittlere Differenz 0.0267, Schleife F7→F0 0.0199.
- **Rolle:** ok — gehaltene Waffe, Faust als Wirkspitze plausibel; Drehsumme 1.9°, Ortsdrift 0.005.
- **Effekt:** nicht ok — Düsenflamme am Arm eingebrannt.
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Rückstoßphasen und Düsenflamme trennen, sechs echte Frames.

### pa_122 — Endlosschleife

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.67%, Rechteckhintergrund —.
- **Identität:** nicht ok — rosa Flügelwesen; F4/F7 sind Unendlichkeitszeichen; F4 und F7 ersetzen den Körper durch ein Symbol; Histogramm min. 0.49, IoU min. 0.67, Brüche [4, 7].
- **Richtung:** ok — Streuung 9.1°, Nettoweg 0.138 Zellbreiten, Resultante 0.47.
- **Bewegung:** nicht ok — 7 unterscheidbare Frames, mittlere Differenz 0.1480, Schleife F7→F0 0.1977.
- **Rolle:** nicht ok — Kreatur, keine Aura oder Schild am Träger; Drehsumme 369.6°, Ortsdrift 0.138.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Endlosschleife als Aura/Symbol ohne Körperbruch.

### pa_132 — Alte Dame

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.56%, Rechteckhintergrund —.
- **Identität:** nicht ok — Alte Dame nur in F0, danach ein geflügeltes Wesen; harter Motivwechsel zwischen F0 und F1; Histogramm min. 0.59, IoU min. 0.60, Brüche [0].
- **Richtung:** nicht ok — Streuung 18.4°, Nettoweg 0.042 Zellbreiten, Resultante 0.19.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.1226, Schleife F7→F0 0.1572.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung für F1-F7 plausibel; Drehsumme 118.8°, Ortsdrift 0.042.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, browser.
- **Nächster Schritt:** Eine Figur über alle acht Frames; F0 nicht als Ruhepose verwenden.

### pa_133 — Fliegendes Superschaf

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.74%, Rechteckhintergrund —.
- **Identität:** ok — geflügeltes Schaf mit Cape, Motiv trifft das Superschaf; Histogramm min. 0.96, IoU min. 0.95, Brüche —.
- **Richtung:** ok — Streuung 0.8°, Nettoweg 0.013 Zellbreiten, Resultante 0.19.
- **Bewegung:** nicht ok — 4 unterscheidbare Frames, mittlere Differenz 0.0419, Schleife F7→F0 0.0494.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 6.6°, Ortsdrift 0.013.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: bewegung, browser.
- **Nächster Schritt:** Vier zusätzliche unterscheidbare Flügel-/Beinphasen und Loop schließen.

### pa_134 — Luftangriff

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.51%, Rechteckhintergrund —.
- **Identität:** nicht ok — brauner Flugkörper ohne Bezug zum Luftangriff; Histogramm min. 0.26, IoU min. 0.76, Brüche —.
- **Richtung:** ok — Streuung 1.8°, Nettoweg 0.040 Zellbreiten, Resultante 0.14.
- **Bewegung:** nicht ok — 4 unterscheidbare Frames, mittlere Differenz 0.0386, Schleife F7→F0 0.0331.
- **Rolle:** ok — Projektil im Flug, Rollenzuordnung technisch plausibel; Drehsumme 16.3°, Ortsdrift 0.040.
- **Effekt:** nicht ok — Flamme am Heck eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, effekt, browser.
- **Nächster Schritt:** Neue Vorlage mit erkennbarer Luftangriffsszene, Flamme trennen.

### pa_135 — Meteorregen

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.69%, Rechteckhintergrund —.
- **Identität:** nicht ok — Meteor, Motiv trifft den Meteorregen; F0/F1/F4/F5 zeigen fast nur Flamme, F2/F3/F6/F7 Gestein; Histogramm min. 0.75, IoU min. 0.81, Brüche [0, 1, 4, 5].
- **Richtung:** ok — Streuung 1.3°, Nettoweg 0.046 Zellbreiten, Resultante 0.25.
- **Bewegung:** nicht ok — 5 unterscheidbare Frames, mittlere Differenz 0.0551, Schleife F7→F0 0.0783.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 8.7°, Ortsdrift 0.046.
- **Effekt:** nicht ok — Feuerschweif eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, effekt, browser.
- **Nächster Schritt:** Gestein in allen Frames halten, Schweif als eigene Ebene.

### pa_136 — Bohrkopfrakete

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.51%, Rechteckhintergrund —.
- **Identität:** ok — Bohrkopfrakete, Motiv trifft die Waffe; Histogramm min. 0.99, IoU min. 0.80, Brüche —.
- **Richtung:** ok — Streuung 3.5°, Nettoweg 0.085 Zellbreiten, Resultante 0.19.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0820, Schleife F7→F0 0.1205.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 31.9°, Ortsdrift 0.085.
- **Effekt:** nicht ok — Flamme und Rauchfahne eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Drei fehlende Phasen ergänzen, Loop schließen, Effekt trennen.

### pa_141 — Astralkrieger

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.64%, Rechteckhintergrund —.
- **Identität:** nicht ok — einfacher blauer Humanoid statt Astralkrieger; Histogramm min. 0.65, IoU min. 0.56, Brüche —.
- **Richtung:** ok — Streuung 1.5°, Nettoweg 0.045 Zellbreiten, Resultante 0.25.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0609, Schleife F7→F0 0.0663.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung plausibel; Drehsumme 12.6°, Ortsdrift 0.045.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Astralkrieger mit Rüstung und Waffe; Loop schließen.

### pa_142 — Leerenritter

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.83%, Rechteckhintergrund —.
- **Identität:** nicht ok — blauer Cartoon-Zauberer statt Leerenritter; F2/F6 setzen eine türkise Energiebasis, die sonst fehlt; Histogramm min. 0.75, IoU min. 0.58, Brüche [2, 6].
- **Richtung:** ok — Streuung 8.5°, Nettoweg 0.015 Zellbreiten, Resultante 0.17.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0864, Schleife F7→F0 0.0464.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung plausibel; Drehsumme 60.2°, Ortsdrift 0.015.
- **Effekt:** ok — Energiebasis wechselt, kein Dauer-Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Leerenritter; Basis und Loop vereinheitlichen.

### pa_143 — Astralross

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.50%, Rechteckhintergrund —.
- **Identität:** nicht ok — gepanzertes Pferd, als Astralross motivnah; F1/F6 sind ausgewaschen und verlieren den Kontrast; Histogramm min. 0.56, IoU min. 0.89, Brüche [1, 6].
- **Richtung:** ok — Streuung 0.6°, Nettoweg 0.004 Zellbreiten, Resultante 0.20.
- **Bewegung:** nicht ok — 4 unterscheidbare Frames, mittlere Differenz 0.0761, Schleife F7→F0 0.0196.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung plausibel; Drehsumme 6.0°, Ortsdrift 0.004.
- **Effekt:** ok — Glühen im Panzer, kein separater Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Kontrast in F1/F6 reparieren und vier echte Bewegungsphasen ergänzen.

### pa_144 — Kosmische Wassermelone

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.80%, Rechteckhintergrund —.
- **Identität:** nicht ok — geflügeltes Vogelwesen mit Melonenkopf statt Wassermelone; Histogramm min. 0.51, IoU min. 0.55, Brüche —.
- **Richtung:** nicht ok — Streuung 24.7°, Nettoweg 0.049 Zellbreiten, Resultante 0.11.
- **Bewegung:** nicht ok — 7 unterscheidbare Frames, mittlere Differenz 0.0799, Schleife F7→F0 0.1102.
- **Rolle:** ok — Projektil im Flug, Rollenzuordnung technisch plausibel; Drehsumme 185.7°, Ortsdrift 0.049.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Wassermelone; Richtung über alle Frames stabil halten.

### pa_147 — Weltendrache

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.62%, Rechteckhintergrund —.
- **Identität:** nicht ok — rosa geflügeltes Schwein statt Weltendrache; Histogramm min. 0.70, IoU min. 0.70, Brüche —.
- **Richtung:** nicht ok — Streuung 27.9°, Nettoweg 0.044 Zellbreiten, Resultante 0.24.
- **Bewegung:** nicht ok — 7 unterscheidbare Frames, mittlere Differenz 0.1123, Schleife F7→F0 0.1630.
- **Rolle:** ok — beschworene Kreatur, Rollenzuordnung plausibel; Drehsumme 237.1°, Ortsdrift 0.044.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Weltendrache; Drehung im Zyklus vermeiden.

### pa_148 — Feuerschild

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.73%, Rechteckhintergrund —.
- **Identität:** nicht ok — blaues geflügeltes Tier statt Feuerschild; Histogramm min. 0.83, IoU min. 0.48, Brüche —.
- **Richtung:** ok — Streuung 9.2°, Nettoweg 0.035 Zellbreiten, Resultante 0.16.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0999, Schleife F7→F0 0.0691.
- **Rolle:** nicht ok — Kreatur, keine Aura oder Schild am Träger; Drehsumme 56.0°, Ortsdrift 0.035.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Feuerschild als Aura; Loop schließen.

## Prüfung

```
python3 tools/waffen-anim-abnahme.py     # Messung und Bericht neu erzeugen
node tests/waffen-anim-abnahme.test.js   # Abnahme, Manifest und Lader
node tests/waffen-anim-gating.test.js    # bestehende Sperre
```

Der Test prüft nicht die Sichturteile nach, sondern ihre Spur: jedes Manifestfeld muss zur Messung passen, jeder Ablehnungsgrund muss ein fehlgeschlagenes Kriterium sein, und der Lader darf auch mit einer manipulierten Freigabeliste kein abgelehntes Blatt laden. Ein synthetischer Vollbeleg zeigt als Gegenprobe, dass der Lader bei erfüllten Kriterien tatsächlich öffnet.
