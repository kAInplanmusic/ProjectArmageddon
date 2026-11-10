# Abnahme der 26 Waffen-Zusatzanimationen (BAL-10)

Stand: 09.11.2026 · Branch `bg/bal-10` · Ergänzung zu [ANIM-GATING.md](ANIM-GATING.md) und [BERICHT.md](BERICHT.md)

## Ergebnis

Geprüft wurden alle 26 Blätter aus `src/client/assets/weapon-sprites/anim/` gegen sechs Kriterien je Blatt: 8 Frames, Alpha, Identität, Richtung, Bewegung und Rolle. Ergebnis: **0 produktfreigegeben**, **0 datenabgenommen**, **26 abgelehnt**. Produktpfad bleibt gesperrt (`freigabe.produktpfad: false`, `ANIM_FREIGABE` leer).

Kein Blatt erfüllt die Produktkriterien, weil die Browserabnahme W20 ohne Rendereranschluss nicht durchgeführt wurde und 9 Blätter einen eingebrannten Effekt tragen (W17; pa_121 zusätzlich). Die Datenabnahme ist deshalb bewusst keine Produktfreigabe.

- Datenabgenommen: —
- Produktfreigegeben: —

## Verfahren

`python3 tools/waffen-anim-abnahme.py` liest das Manifest, zerlegt jedes WebP in 8 Zellen (4×2, 256 px) und misst pixelbasiert. Die Motiv- und Rollenurteile sind eine Sichtprüfung der 8 Frames je Blatt; sie stehen getrennt als `SICHT` im Skript. Alle Zahlen stehen maschinenlesbar in [anim-abnahme-messung.json](anim-abnahme-messung.json).

Schwellen: sichtbares Alpha > 16; zwei Frames gelten ab 0,03 mittlerer RGB-Differenz (64 px, 2 px Weichzeichnung) als verschieden; Schleife geschlossen bei F7→F0 ≤ 0,045; Richtung stabil bei Hauptachsen-Streuung ≤ 15°; mindestens 6 unterscheidbare Frames; ortsfeste Rollen dürfen maximal 0,10 Zellbreiten driften, `wurf` braucht ≥ 20° Drehung. Identität ist ein Motivurteil plus Sichtprüfung aller acht Frames; Histogramm-Korrelation und Silhouetten-IoU sind Stützmessungen (auffällig unter 0,85 bzw. 0,45). Das alte Feld `schwere` bleibt der Grob-Befund aus dem ersten Audit; maßgeblich ist `pruefung` je Blatt.

## Übersicht

| ID | Waffe | Rolle | 8 Frames | Alpha | Identität | Richtung | Bewegung | Rolle | Effekt | Abnahme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pa_032 | Raketenrucksack | ruecken | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 3) | ok (σ 1°) | **nein** (1 F, Loop 0.013) | **nein** | ok | **abgelehnt** |
| pa_038 | Rakete | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 0°) | **nein** (4 F, Loop 0.092) | ok | **eingebrannt** | **abgelehnt** |
| pa_044 | Phönixschlag | flug | 8/8 ok | 8/8 Ecken ok | ok | **nein** (σ 45°) | **nein** (5 F, Loop 0.010) | ok | **eingebrannt** | **abgelehnt** |
| pa_048 | Bananengranate | flug | 8/8 ok | 8/8 Ecken ok | ok | **nein** (σ 55°) | **nein** (8 F, Loop 0.152) | ok | ok | **abgelehnt** |
| pa_049 | Bumerang | wurf | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | **nein** (σ 42°) | **nein** (8 F, Loop 0.085) | **nein** | ok | **abgelehnt** |
| pa_053 | Roboterbombe | welt | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 1,5) | ok (σ 2°) | **nein** (2 F, Loop 0.010) | ok | ok | **abgelehnt** |
| pa_061 | Feuerdämon | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 1) | **nein** (σ 17°) | ok (8 F, Loop 0.043) | ok | **eingebrannt** | **abgelehnt** |
| pa_065 | Meteorbrocken | flug | 8/8 ok | 8/8 Ecken ok | ok | **nein** (σ 25°) | **nein** (8 F, Loop 0.058) | ok | **eingebrannt** | **abgelehnt** |
| pa_073 | Tentakelgift | welt | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 7°) | **nein** (8 F, Loop 0.062) | **nein** | ok | **abgelehnt** |
| pa_112 | Düsenrucksack | ruecken | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 3°) | **nein** (3 F, Loop 0.058) | **nein** | ok | **abgelehnt** |
| pa_114 | Gleitschirm | ruecken | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 6°) | **nein** (7 F, Loop 0.059) | **nein** | ok | **abgelehnt** |
| pa_115 | Wächterstatue | beschwoerung | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 3°) | **nein** (2 F, Loop 0.015) | ok | ok | **abgelehnt** |
| pa_118 | Feuerwesen | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 1,3,7) | ok (σ 1°) | **nein** (4 F, Loop 0.052) | ok | **eingebrannt** | **abgelehnt** |
| pa_121 | Raketenfaust | hand | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 4°) | **nein** (7 F, Loop 0.061) | ok | **eingebrannt** | **abgelehnt** |
| pa_122 | Endlosschleife | selbst | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 4,7) | ok (σ 5°) | **nein** (8 F, Loop 0.097) | **nein** | ok | **abgelehnt** |
| pa_132 | Alte Dame | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 0) | ok (σ 2°) | **nein** (4 F, Loop 0.027) | ok | ok | **abgelehnt** |
| pa_133 | Fliegendes Superschaf | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 7°) | **nein** (6 F, Loop 0.072) | ok | ok | **abgelehnt** |
| pa_134 | Luftangriff | flug | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 8°) | **nein** (3 F, Loop 0.039) | ok | **eingebrannt** | **abgelehnt** |
| pa_135 | Meteorregen | flug | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 0,1,4,5) | **nein** (σ 58°) | ok (7 F, Loop 0.026) | ok | **eingebrannt** | **abgelehnt** |
| pa_136 | Bohrkopfrakete | flug | 8/8 ok | 8/8 Ecken ok | ok | ok (σ 0°) | **nein** (1 F, Loop 0.018) | ok | **eingebrannt** | **abgelehnt** |
| pa_141 | Astralkrieger | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | ok (σ 1°) | **nein** (8 F, Loop 0.062) | ok | ok | **abgelehnt** |
| pa_142 | Leerenritter | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv, Bruch 2,6) | ok (σ 1°) | **nein** (3 F, Loop 0.063) | ok | ok | **abgelehnt** |
| pa_143 | Astralross | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Bruch 1,6) | ok (σ 1°) | **nein** (4 F, Loop 0.020) | ok | ok | **abgelehnt** |
| pa_144 | Kosmische Wassermelone | flug | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | **nein** (σ 28°) | ok (7 F, Loop 0.025) | ok | ok | **abgelehnt** |
| pa_147 | Weltendrache | beschwoerung | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | **nein** (σ 29°) | **nein** (5 F, Loop 0.036) | ok | ok | **abgelehnt** |
| pa_148 | Feuerschild | selbst | 8/8 ok | 8/8 Ecken ok | **nein** (Motiv) | **nein** (σ 30°) | **nein** (6 F, Loop 0.078) | **nein** | ok | **abgelehnt** |

## Einzelbefunde

### pa_032 — Raketenrucksack

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.49%, Rechteckhintergrund —.
- **Identität:** nicht ok — blauer geflügelter Käfer/Krebs statt Raketenrucksack; F3 zeigt eine gespreizte Flügelpose und bricht die Silhouette; Histogramm min. 1.00, IoU min. 0.94, Brüche [3].
- **Richtung:** ok — Streuung 1.0°, Nettoweg 0.002 Zellbreiten, Resultante 0.52.
- **Bewegung:** nicht ok — 1 unterscheidbare Frames, mittlere Differenz 0.0119, Schleife F7→F0 0.0128.
- **Rolle:** nicht ok — Flügelwesen, kein am Rücken getragenes Objekt; Drehsumme 7.7°, Ortsdrift 0.002.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage: Rucksack mit zwei Düsen unten, Flamme separat.

### pa_038 — Rakete

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.32%, Rechteckhintergrund —.
- **Identität:** ok — orange Rakete, Motiv trifft die Waffe; Histogramm min. 0.99, IoU min. 0.64, Brüche —.
- **Richtung:** ok — Streuung 0.3°, Nettoweg 0.011 Zellbreiten, Resultante 0.15.
- **Bewegung:** nicht ok — 4 unterscheidbare Frames, mittlere Differenz 0.0394, Schleife F7→F0 0.0917.
- **Rolle:** ok — Projektil im Flug, stabile Achse; Drehsumme 1077.6°, Ortsdrift 0.011.
- **Effekt:** nicht ok — Triebwerksflamme fest im Blatt (W17).
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Flamme als eigene Ebene trennen und 6+ unterscheidbare Frames erzeugen.

### pa_044 — Phönixschlag

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.70%, Rechteckhintergrund —.
- **Identität:** ok — brennender Phönix, Motiv trifft den Phönixschlag; Histogramm min. 0.99, IoU min. 0.61, Brüche —.
- **Richtung:** nicht ok — Streuung 44.6°, Nettoweg 0.004 Zellbreiten, Resultante 0.05.
- **Bewegung:** nicht ok — 5 unterscheidbare Frames, mittlere Differenz 0.0902, Schleife F7→F0 0.0103.
- **Rolle:** ok — Projektil im Flug, Flügelform konstant; Drehsumme 693.1°, Ortsdrift 0.004.
- **Effekt:** nicht ok — Feuer in Flügeln und Körper eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: richtung, bewegung, effekt, browser.
- **Nächster Schritt:** Flügelschlag neu animieren; Feuer als eigene Ebene.

### pa_048 — Bananengranate

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.29%, Rechteckhintergrund —.
- **Identität:** ok — Bananengranate mit Zünder, Motiv trifft die Waffe; Histogramm min. 0.97, IoU min. 0.47, Brüche —.
- **Richtung:** nicht ok — Streuung 55.0°, Nettoweg 0.097 Zellbreiten, Resultante 0.17.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0797, Schleife F7→F0 0.1521.
- **Rolle:** ok — Projektil im Flug, Silhouette konstant; Drehsumme 126.9°, Ortsdrift 0.097.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: richtung, bewegung, browser.
- **Nächster Schritt:** Rotation und Splitter ergänzen; acht echte Phasen statt Standbild.

### pa_049 — Bumerang

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.25%, Rechteckhintergrund —.
- **Identität:** nicht ok — orange Bombe mit grauen Flügeln statt Bumerang; Histogramm min. 1.00, IoU min. 0.23, Brüche —.
- **Richtung:** nicht ok — Streuung 41.6°, Nettoweg 0.177 Zellbreiten, Resultante 0.22.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0784, Schleife F7→F0 0.0846.
- **Rolle:** nicht ok — keine Drehachse, keine Rückkehrbewegung erkennbar; Drehsumme 438.7°, Ortsdrift 0.177.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Bumerang mit sichtbarer Rotation und Rückflugpose.

### pa_053 — Roboterbombe

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.37%, Rechteckhintergrund —.
- **Identität:** nicht ok — Holzwagen mit Mäusen statt Roboterbombe; F1/F5 wechseln Aufbau und Aufsatz; Histogramm min. 1.00, IoU min. 0.86, Brüche [1, 5].
- **Richtung:** ok — Streuung 1.9°, Nettoweg 0.002 Zellbreiten, Resultante 0.14.
- **Bewegung:** nicht ok — 2 unterscheidbare Frames, mittlere Differenz 0.0298, Schleife F7→F0 0.0100.
- **Rolle:** ok — Weltobjekt am Boden, Rollenzuordnung plausibel; Drehsumme 16.7°, Ortsdrift 0.002.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Roboterbombe mit Zünder und Explosionsphase.

### pa_061 — Feuerdämon

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.76%, Rechteckhintergrund —.
- **Identität:** nicht ok — brennender Dämon, Motiv trifft den Feuerdämon; F1 ist eine gelbe Feuerblase ohne Körper; Histogramm min. 1.00, IoU min. 0.79, Brüche [1].
- **Richtung:** nicht ok — Streuung 16.8°, Nettoweg 0.009 Zellbreiten, Resultante 0.21.
- **Bewegung:** ok — 8 unterscheidbare Frames, mittlere Differenz 0.0691, Schleife F7→F0 0.0426.
- **Rolle:** ok — beschworene Figur mit eigener Standpose; Drehsumme 128.3°, Ortsdrift 0.009.
- **Effekt:** nicht ok — Flamme an Händen und Körper eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, effekt, browser.
- **Nächster Schritt:** F1 ersetzen, Flamme trennen, mindestens sechs Körperphasen.

### pa_065 — Meteorbrocken

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.30%, Rechteckhintergrund —.
- **Identität:** ok — Steinmeteor, Motiv trifft den Meteorbrocken; Histogramm min. 0.98, IoU min. 0.89, Brüche —.
- **Richtung:** nicht ok — Streuung 25.1°, Nettoweg 0.004 Zellbreiten, Resultante 0.16.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0610, Schleife F7→F0 0.0580.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 183.0°, Ortsdrift 0.004.
- **Effekt:** nicht ok — gelber Schweif fest im Blatt (W17).
- **Abnahme: abgelehnt** — Gründe: richtung, bewegung, effekt, browser.
- **Nächster Schritt:** Schweif als eigene Ebene trennen, dann W20 im Renderer.

### pa_073 — Tentakelgift

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 1.04%, Rechteckhintergrund —.
- **Identität:** nicht ok — grüner zweibeiniger Dinosaurier statt Tentakelgift; Histogramm min. 1.00, IoU min. 0.85, Brüche —.
- **Richtung:** ok — Streuung 6.6°, Nettoweg 0.004 Zellbreiten, Resultante 0.02.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0617, Schleife F7→F0 0.0622.
- **Rolle:** nicht ok — Kreatur, kein abgelegtes Weltobjekt; Drehsumme 358.1°, Ortsdrift 0.004.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Tentakelgift als Weltobjekt mit Giftwolke.

### pa_112 — Düsenrucksack

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.52%, Rechteckhintergrund —.
- **Identität:** nicht ok — blau geflügeltes Flugwesen statt Düsenrucksack; Histogramm min. 1.00, IoU min. 0.97, Brüche —.
- **Richtung:** ok — Streuung 2.7°, Nettoweg 0.010 Zellbreiten, Resultante 0.28.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0280, Schleife F7→F0 0.0576.
- **Rolle:** nicht ok — Flügelwesen, kein getragenes Rückenobjekt; Drehsumme 24.6°, Ortsdrift 0.010.
- **Effekt:** ok — keine eingebrannte Flamme; Düsen gehören zur Silhouette.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Eigene Vorlage Düsenrucksack; Dublette zu pa_114 auflösen (W06).

### pa_114 — Gleitschirm

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 1.00%, Rechteckhintergrund —.
- **Identität:** nicht ok — dasselbe blau geflügelte Flugwesen wie pa_112, kein Gleitschirm; Histogramm min. 1.00, IoU min. 0.80, Brüche —.
- **Richtung:** ok — Streuung 6.5°, Nettoweg 0.017 Zellbreiten, Resultante 0.20.
- **Bewegung:** nicht ok — 7 unterscheidbare Frames, mittlere Differenz 0.0467, Schleife F7→F0 0.0589.
- **Rolle:** nicht ok — Flügelwesen, kein Schirm mit Kappe und Leinen; Drehsumme 42.4°, Ortsdrift 0.017.
- **Effekt:** ok — kein Schirm, kein eigener Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Eigene Vorlage Gleitschirm mit Kappe, Leinen und Startpose.

### pa_115 — Wächterstatue

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.48%, Rechteckhintergrund —.
- **Identität:** ok — Giraffenstatue, als Wächterstatue motivnah; Histogramm min. 1.00, IoU min. 0.84, Brüche —.
- **Richtung:** ok — Streuung 2.8°, Nettoweg 0.006 Zellbreiten, Resultante 0.12.
- **Bewegung:** nicht ok — 2 unterscheidbare Frames, mittlere Differenz 0.0390, Schleife F7→F0 0.0150.
- **Rolle:** ok — beschworene Statue, Rollenzuordnung plausibel; Drehsumme 34.7°, Ortsdrift 0.006.
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
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.27%, Rechteckhintergrund —.
- **Identität:** ok — Clownfaust mit Raketenantrieb, Motiv trifft die Raketenfaust; Histogramm min. 0.99, IoU min. 0.80, Brüche —.
- **Richtung:** ok — Streuung 3.7°, Nettoweg 0.012 Zellbreiten, Resultante 0.33.
- **Bewegung:** nicht ok — 7 unterscheidbare Frames, mittlere Differenz 0.0471, Schleife F7→F0 0.0608.
- **Rolle:** ok — gehaltene Waffe, Faust als Wirkspitze plausibel; Drehsumme 24.9°, Ortsdrift 0.012.
- **Effekt:** nicht ok — Düsenflamme am Arm eingebrannt.
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Rückstoßphasen und Düsenflamme trennen, sechs echte Frames.

### pa_122 — Endlosschleife

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.88%, Rechteckhintergrund —.
- **Identität:** nicht ok — rosa Flügelwesen; F4/F7 sind Unendlichkeitszeichen; F4 und F7 ersetzen den Körper durch ein Symbol; Histogramm min. 0.99, IoU min. 0.81, Brüche [4, 7].
- **Richtung:** ok — Streuung 4.8°, Nettoweg 0.021 Zellbreiten, Resultante 0.30.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0518, Schleife F7→F0 0.0966.
- **Rolle:** nicht ok — Kreatur, keine Aura oder Schild am Träger; Drehsumme 16.1°, Ortsdrift 0.021.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Endlosschleife als Aura/Symbol ohne Körperbruch.

### pa_132 — Alte Dame

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.60%, Rechteckhintergrund —.
- **Identität:** nicht ok — Alte Dame nur in F0, danach ein geflügeltes Wesen; harter Motivwechsel zwischen F0 und F1; Histogramm min. 1.00, IoU min. 0.81, Brüche [0].
- **Richtung:** ok — Streuung 1.7°, Nettoweg 0.011 Zellbreiten, Resultante 0.15.
- **Bewegung:** nicht ok — 4 unterscheidbare Frames, mittlere Differenz 0.0390, Schleife F7→F0 0.0272.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung für F1-F7 plausibel; Drehsumme 20.2°, Ortsdrift 0.011.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Eine Figur über alle acht Frames; F0 nicht als Ruhepose verwenden.

### pa_133 — Fliegendes Superschaf

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.48%, Rechteckhintergrund —.
- **Identität:** ok — geflügeltes Schaf mit Cape, Motiv trifft das Superschaf; Histogramm min. 1.00, IoU min. 0.78, Brüche —.
- **Richtung:** ok — Streuung 6.8°, Nettoweg 0.007 Zellbreiten, Resultante 0.28.
- **Bewegung:** nicht ok — 6 unterscheidbare Frames, mittlere Differenz 0.0867, Schleife F7→F0 0.0718.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 695.8°, Ortsdrift 0.007.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: bewegung, browser.
- **Nächster Schritt:** Vier zusätzliche unterscheidbare Flügel-/Beinphasen und Loop schließen.

### pa_134 — Luftangriff

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.37%, Rechteckhintergrund —.
- **Identität:** nicht ok — brauner Flugkörper ohne Bezug zum Luftangriff; Histogramm min. 1.00, IoU min. 0.66, Brüche —.
- **Richtung:** ok — Streuung 8.5°, Nettoweg 0.024 Zellbreiten, Resultante 0.11.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0384, Schleife F7→F0 0.0393.
- **Rolle:** ok — Projektil im Flug, Rollenzuordnung technisch plausibel; Drehsumme 351.2°, Ortsdrift 0.024.
- **Effekt:** nicht ok — Flamme am Heck eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, effekt, browser.
- **Nächster Schritt:** Neue Vorlage mit erkennbarer Luftangriffsszene, Flamme trennen.

### pa_135 — Meteorregen

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.26%, Rechteckhintergrund —.
- **Identität:** nicht ok — Meteor, Motiv trifft den Meteorregen; F0/F1/F4/F5 zeigen fast nur Flamme, F2/F3/F6/F7 Gestein; Histogramm min. 0.99, IoU min. 0.67, Brüche [0, 1, 4, 5].
- **Richtung:** nicht ok — Streuung 58.1°, Nettoweg 0.008 Zellbreiten, Resultante 0.09.
- **Bewegung:** ok — 7 unterscheidbare Frames, mittlere Differenz 0.0827, Schleife F7→F0 0.0257.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 312.7°, Ortsdrift 0.008.
- **Effekt:** nicht ok — Feuerschweif eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, effekt, browser.
- **Nächster Schritt:** Gestein in allen Frames halten, Schweif als eigene Ebene.

### pa_136 — Bohrkopfrakete

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.26%, Rechteckhintergrund —.
- **Identität:** ok — Bohrkopfrakete, Motiv trifft die Waffe; Histogramm min. 1.00, IoU min. 0.97, Brüche —.
- **Richtung:** ok — Streuung 0.2°, Nettoweg 0.002 Zellbreiten, Resultante 0.33.
- **Bewegung:** nicht ok — 1 unterscheidbare Frames, mittlere Differenz 0.0197, Schleife F7→F0 0.0181.
- **Rolle:** ok — Projektil im Flug, Achse stabil; Drehsumme 2.0°, Ortsdrift 0.002.
- **Effekt:** nicht ok — Flamme und Rauchfahne eingebrannt (W17).
- **Abnahme: abgelehnt** — Gründe: bewegung, effekt, browser.
- **Nächster Schritt:** Drei fehlende Phasen ergänzen, Loop schließen, Effekt trennen.

### pa_141 — Astralkrieger

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 1.45%, Rechteckhintergrund —.
- **Identität:** nicht ok — einfacher blauer Humanoid statt Astralkrieger; Histogramm min. 1.00, IoU min. 0.83, Brüche —.
- **Richtung:** ok — Streuung 1.3°, Nettoweg 0.019 Zellbreiten, Resultante 0.23.
- **Bewegung:** nicht ok — 8 unterscheidbare Frames, mittlere Differenz 0.0624, Schleife F7→F0 0.0622.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung plausibel; Drehsumme 12.4°, Ortsdrift 0.019.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Astralkrieger mit Rüstung und Waffe; Loop schließen.

### pa_142 — Leerenritter

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.82%, Rechteckhintergrund —.
- **Identität:** nicht ok — blauer Cartoon-Zauberer statt Leerenritter; F2/F6 setzen eine türkise Energiebasis, die sonst fehlt; Histogramm min. 1.00, IoU min. 0.73, Brüche [2, 6].
- **Richtung:** ok — Streuung 1.4°, Nettoweg 0.038 Zellbreiten, Resultante 0.38.
- **Bewegung:** nicht ok — 3 unterscheidbare Frames, mittlere Differenz 0.0293, Schleife F7→F0 0.0631.
- **Rolle:** ok — beschworene Figur, Rollenzuordnung plausibel; Drehsumme 15.7°, Ortsdrift 0.038.
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
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.32%, Rechteckhintergrund —.
- **Identität:** nicht ok — geflügeltes Vogelwesen mit Melonenkopf statt Wassermelone; Histogramm min. 0.96, IoU min. 0.92, Brüche —.
- **Richtung:** nicht ok — Streuung 28.5°, Nettoweg 0.003 Zellbreiten, Resultante 0.12.
- **Bewegung:** ok — 7 unterscheidbare Frames, mittlere Differenz 0.0822, Schleife F7→F0 0.0250.
- **Rolle:** ok — Projektil im Flug, Rollenzuordnung technisch plausibel; Drehsumme 240.1°, Ortsdrift 0.003.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, browser.
- **Nächster Schritt:** Neue Vorlage Wassermelone; Richtung über alle Frames stabil halten.

### pa_147 — Weltendrache

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.74%, Rechteckhintergrund —.
- **Identität:** nicht ok — rosa geflügeltes Schwein statt Weltendrache; Histogramm min. 1.00, IoU min. 0.70, Brüche —.
- **Richtung:** nicht ok — Streuung 28.7°, Nettoweg 0.019 Zellbreiten, Resultante 0.13.
- **Bewegung:** nicht ok — 5 unterscheidbare Frames, mittlere Differenz 0.0496, Schleife F7→F0 0.0363.
- **Rolle:** ok — beschworene Kreatur, Rollenzuordnung plausibel; Drehsumme 303.2°, Ortsdrift 0.019.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, browser.
- **Nächster Schritt:** Neue Vorlage Weltendrache; Drehung im Zyklus vermeiden.

### pa_148 — Feuerschild

- **Frames:** 8/8 belegt, leere Frames —, Randanschluss —.
- **Alpha:** 8/8 Ecken transparent, Halbsaum 0.38%, Rechteckhintergrund —.
- **Identität:** nicht ok — blaues geflügeltes Tier statt Feuerschild; Histogramm min. 1.00, IoU min. 0.94, Brüche —.
- **Richtung:** nicht ok — Streuung 29.8°, Nettoweg 0.012 Zellbreiten, Resultante 0.02.
- **Bewegung:** nicht ok — 6 unterscheidbare Frames, mittlere Differenz 0.0539, Schleife F7→F0 0.0775.
- **Rolle:** nicht ok — Kreatur, keine Aura oder Schild am Träger; Drehsumme 202.9°, Ortsdrift 0.012.
- **Effekt:** ok — kein eingebrannter Effekt.
- **Abnahme: abgelehnt** — Gründe: identitaet, richtung, bewegung, rolle, browser.
- **Nächster Schritt:** Neue Vorlage Feuerschild als Aura; Loop schließen.

## Prüfung

```
python3 tools/waffen-anim-abnahme.py     # Messung und Bericht neu erzeugen
node tests/waffen-anim-abnahme.test.js   # Abnahme, Manifest und Lader
node tests/waffen-anim-gating.test.js    # bestehende Sperre
```

Der Test prüft nicht die Sichturteile nach, sondern ihre Spur: jedes Manifestfeld muss zur Messung passen, jeder Ablehnungsgrund muss ein fehlgeschlagenes Kriterium sein, und der Lader darf auch mit einer manipulierten Freigabeliste kein abgelehntes Blatt laden. Ein synthetischer Vollbeleg zeigt als Gegenprobe, dass der Lader bei erfüllten Kriterien tatsächlich öffnet.
