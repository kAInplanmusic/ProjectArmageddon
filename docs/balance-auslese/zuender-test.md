# Zündertest: Zünderwaffen und der Probeversuch +15 % `damage` (2026-10-28)

Auftrag: Der Auftraggeber vermutet, dass die Zünderwaffen zu schwach sind, und will probeweise +15 % `damage` erproben. Geprüft wurde (1) ob `npm run balance:waffen` (`scripts/waffen-balance.mjs`) Zünderwaffen fair misst, (2) was +15 % bei zwei bis drei Waffen vorher und nachher bewirkt, mehrere Seeds, in einer temporären Kopie. Im Repo wurde nichts geändert (`git status` sauber bis auf diese Auslesedateien); Kopie und Skripte lagen im Scratchpad.

Zünderwaffen = `fuseTime` > 0, im Katalog **11**: Kaktusbombe (pa_028), Pömpel (pa_029), Impulsbombe (pa_030), Splittergranate (pa_046), Handgranate (pa_047), Bananengranate (pa_048), Molotowcocktail (pa_052), Roboterbombe (pa_053), Giftwolke (pa_070), Tentakelgift (pa_073), Kosmische Wassermelone (pa_144). Fünf davon (pa_046, pa_047, pa_048, pa_052, pa_053) liegen in `heavy_ranged` und stehen auch in `heavy-tech.md`.

## 1 Ergebnis in Kürze

1. **Die Zünderwaffen sind tatsächlich schwach, aber nicht wegen ihres `damage`-Werts.** Eine armierte Granate (Aufprall, Zünder läuft) **sinkt je Takt rund 0,3 px** und explodiert nach 2 bis 5 s zwischen 11 und 82 px unter dem Aufprallpunkt. Vier der Gruppe (Splittergranate, Handgranate, Bananengranate, Roboterbombe) und die Wassermelone liegen damit **außerhalb ihres eigenen Sprengradius**; bei Kaktusbombe, Pömpel und Impulsbombe bleibt nur die Untergrenze 0,25.
2. **Das Messverfahren ist für Zünder nicht ungerecht, aber blind:** Die Zielhilfe (`aimPreview`) kennt Zünder nicht, die Ausreißerliste nimmt sie ausdrücklich aus (`findeAusreisser`: `!e.lunte`). Eine Gegenprobe mit **echten Schüssen** statt Zielhilfe (bis zu 50 Kandidaten je Entfernung) liefert dieselben Werte wie das Skript (Handgranate 10,7 gegen 10,7). Die niedrigen Werte sind also das, was der Motor tut.
3. **+15 % `damage` hilft fast nicht:** Das Ergebnis skaliert linear (Verhältnis 1,15 bei Handgranate, Splittergranate, Wassermelone), der absolute Gewinn bleibt +1,2 bis +2,2 Schaden (Handgranate 10,7 → 12,3). Der Molotowcocktail gewinnt nur +8 %, weil der Brand nicht am `damage` hängt. Keine Stufe wechselt (alle 11 Waffen bleiben in ihrer `powerTier`).
4. **Mit dem Sinken beseitigt (Kopie) steigt die Wirkung auf das Zwei- bis Fünffache:** Handgranate 10,7 → 31,3, Splittergranate 8,0 → 25,0, Wassermelone 9,9/14,9 → 54. Dann liegen Handgranate und Wassermelone im Bereich ihrer Stufe, und +15 % wäre ein Feinschritt, kein Rettungsversuch.
5. **Empfehlung:** +15 % nicht allein einführen. Erst die Armierung korrigieren (Entscheidung mit Replay-Versionsmarke, AGENTS.md §2), dann neu messen und für die Granaten der Stufe rare (Splitter-, Bananengranate, Roboterbombe, Impulsbombe, Kaktusbombe) über +15 % entscheiden. Siehe Abschnitt 6.

## 2 Misst `npm run balance:waffen` Zünderwaffen fair?

Gelesen in `scripts/waffen-balance.mjs`:

- Projektilwaffen werden über ein Gitter aus Winkel × Kraft mit `aimPreview` bewertet; die besten drei Einstellungen werden wirklich geschossen, das Maximum zählt. `aimPreview` endet beim ersten Geländetreffer und fliegt durch die Figur hindurch; es kennt weder den Halt am Aufprall noch den Zünder (`simulateFlight`, `src/engine/shooting.js`). Für Aufprallwaffen stimmt das; für Zünderwaffen ist die Bahn ab dem Aufprall falsch.
- `findeAusreisser` nimmt Selbstwirkungen und Zünderwaffen aus (Begründung im Kopf der Datei: "wären Messartefakte"). Die Zünderwaffen fehlen deshalb in jeder Ausreißerliste und in den Stufenmedianen.
- Das Skript zeigt einen Bestwert je Waffe (Ziel steht still, Gesundheit 1000, Hügelkarte, Seed aus dem Index).

Gegenprobe (eigene Messung, gleiche Karte, gleiche Aufstellung wie `aufbau`/`schiesse`): Für Handgranate, Splittergranate, Molotowcocktail und Wassermelone wurden je Seed (Versatz 0/1000/2000) und Entfernung (90/150/300 px) bis zu 50 Kandidaten wirklich geschossen: 25 mit dem kleinsten Bahnabstand der Zielhilfe und bis zu 25, deren Bahn 4 bis 45 px **vor** der Figur endet (damit auch Schüsse, die vor dem Ziel liegen bleiben). Die Wartezeit reicht bis 1500 Takte (das Skript wartet 900). Ergebnis (bester Schuss je Lauf): Handgranate 10,7 (Skript 10,7), Splittergranate 7,3 bis 8,7 (Skript 8,3), Wassermelone 14,9 (Skript 14,9), Molotowcocktail 27 bis 35,6 (Skript 32,8). Das Skript misst die Zünderwaffen also so, wie der Motor sie auswertet.

**Befund: Warum die Werte so niedrig sind.** Einzelspur (Handgranate, bester Schuss auf 150 px, Seed 0): Das Geschoss trifft die Figur und bleibt dort liegen (`fuse_armed` mehrfach je Takt), die Armierung steht aber nicht still: Die Lage wandert pro Takt um etwa 0,3 px nach unten; bei der Explosion nach 119 Takten liegt sie 29 px unter dem Ziel (Radius 24 → außerhalb → 0 Schaden). Gelesen in `projectileSystem.js`: Der Zweig `if (hit && fuseTicks > 0)` setzt Lage und Geschwindigkeit bei **jedem** Takt neu auf den Treffpunkt und nullt die Geschwindigkeit; im nächsten Takt greift die Schwerkraft wieder, die Prüfung trifft erneut (vermutlich, weil sie vom Treffpunkt aus startet; nicht weiter untersucht), und die Lage rückt 0,3 px weiter. Die Gegenprobe in Abschnitt 4 (die Neupositionierung bei bereits armierter Granate unterlassen) beseitigt das Sinken.

Sinktiefe je Waffe, gemessen mit einem Wurf auf die Hügelkarte (Winkel 0,7, Kraft 60, Entfernung 600 px, Seed des Katalogindex) als Abstand zwischen erster Armierung und Explosion:

| ID | Waffe | Kat. | Stufe | Schaden | Radius (wirksam) | Zünder | Skript-Best | Skript-Best / (Schaden × 0,7) | Sinktiefe | Abfall am Sinkpunkt | Lesart |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| pa_028 | Kaktusbombe | ranged | rare | 48 | 48 | 3 s | 20,8 | 0,62 | 43 px | 0,25 (Untergrenze) | am Rand, nur Untergrenze |
| pa_029 | Pömpel | ranged | uncommon | 32 | 30 | 2 s | 13,0 | 0,58 | 29 px | 0,25 (Untergrenze) | am Rand, nur Untergrenze |
| pa_030 | Impulsbombe | ranged | rare | 42 | 52 | 3 s | 8,5 | 0,29 | 43 px | 0,25 (Untergrenze) | am Rand, nur Untergrenze |
| pa_046 | Splittergranate | heavy_ranged | rare | 42 | 42 | 3 s | 8,3 | 0,28 | 44 px | 0 (außerhalb) | wirkt nur bei Zufallslage |
| pa_047 | Handgranate | heavy_ranged | uncommon | 61 | 24 (Mindestradius, Katalog 0) | 2 s | 10,7 | 0,25 | 36 px | 0 (außerhalb) | wirkt nur bei Zufallslage |
| pa_048 | Bananengranate | heavy_ranged | rare | 46 | 40 | 3 s | 8,0 | 0,25 | 42 px | 0 (außerhalb) | wirkt nur bei Zufallslage |
| pa_052 | Molotowcocktail | heavy_ranged | rare | 36 | 42 | 2 s | 32,8 | 1,30 (Brand) | 27 px | 0,36 | wirkt, Brand trägt |
| pa_053 | Roboterbombe | heavy_ranged | rare | 52 | 45 | 3 s | 12,4 | 0,34 | 46 px | 0 (außerhalb) | wirkt nur bei Zufallslage |
| pa_070 | Giftwolke | elemental | rare | 18 | 58 | 1 s | 35,3 | 2,80 (Gift) | 11 px | 0,81 | wirkt |
| pa_073 | Tentakelgift | elemental | rare | 32 | 44 | 2 s | 44,9 | 2,00 (Gift) | 22 px | 0,50 | wirkt |
| pa_144 | Kosmische Wassermelone | ultimate | epic | 85 | 70 | 5 s | 14,9 | 0,25 | 81 px | 0 (außerhalb) | wirkt nur bei Zufallslage |

Lesehilfe: Abfall = `max(0,25; 1 − Tiefe/Radius)` im Aufschlag (`#explode`), 0 bei Tiefe > Radius (aus dem Code gelesen); "Zufallslage" heißt: Treffer entstehen nur, wenn die Figur tiefer als der Aufprallpunkt steht (Hang) oder die Granate an ihr hinabrutscht. Radius 24 der Handgranate: Katalog 0, der Motor setzt `blastRadius || 24` (`shooting.js`). Die Tiefe wurde mit einem Wurf ohne Ziel gemessen, sie hängt von der Zünderdauer ab (rund 0,3 px je Takt, minus ein Anlauf), nicht von der Karte. Skript-Best ist der Wert des Skripts mit dem Seed des Katalogindex (`node scripts/waffen-balance.mjs`, Spalte Best), der Divisor ist der Katalogschaden mit dem Späher-Faktor 0,7 des Schützen.

Die DoT-Zünder (Molotowcocktail, Giftwolke, Tentakelgift) sind vom Sinken kaum betroffen, weil ihr Radius größer ist als die Tiefe und der Brand/Gift über Züge läuft, nicht über den Direktschaden. Das Verhältnis über 1 entsteht aus dem Brandtakt, nicht aus dem Direktschaden.

## 3 Versuchsaufbau der Probe +15 %

Temporäre Kopie des Quellbaums im Scratchpad (`src`, `scripts`, `tests`, `docs`, Katalog); Änderungen nur dort, zwei Stellen:

```diff
--- src/shared/config/weapons.js (Kopie)
-  ].map(Object.freeze)
+  ].map(w => Object.freeze((process.env.HM_FAKTOR && (w.fuseTime ?? 0) > 0) ? { ...w, damage: w.damage * Number(process.env.HM_FAKTOR) } : w))

--- src/engine/systems/projectileSystem.js (Kopie)
+      const hmArmiert = vx === 0 && vy === 0;          // vor integrateStep
       ...
       if (hit && fuseTicks > 0) {
+        if (process.env.HM_FIX && hmArmiert) continue;  // bereits armierte Granate bleibt liegen
```

Vier Bedingungen, jeweils gleiche Kandidaten und Seeds (Versatz 0/1000/2000), Entfernungen 90/150/300 px, bis zu 50 echte Schüsse je Seed und Entfernung, Schütze Späher, Ziel Gesundheit 1000:

- **A0** Ist: Kopie ohne Änderung (entspricht dem Original: Handgranate 10,7 gleich dem Skript).
- **A1** Ist plus 15 % `damage` (nur Zünderwaffen, `HM_FAKTOR=1.15`).
- **B0** Armierung korrigiert (`HM_FIX=1`), `damage` unverändert.
- **B1** Armierung korrigiert plus 15 %.

Gewählt wurden vier Waffen: Handgranate (uncommon, Radius 0), Splittergranate (rare, Splittergranate-Bauart), Molotowcocktail (rare, Brand), Kosmische Wassermelone (epic, 5 s Zünder). Bananengranate, Roboterbombe, Kaktusbombe, Pömpel, Impulsbombe, Giftwolke, Tentakelgift wurden **nicht** neu gemessen (nur Sinktiefe, Abschnitt 2).

## 4 Ergebnisse vorher und nachher

Mittelwert über drei Seeds, bester Wert je Seed und Entfernung (Schaden am Ziel, Gesundheit 1000):

| Waffe (Katalogschaden) | Entfernung | A0 Ist | A1 Ist + 15 % | B0 ohne Sinken | B1 ohne Sinken + 15 % |
|---|---:|---:|---:|---:|---:|
| Handgranate (61) | 90 px | 10,7 | 12,3 | 30,9 | 35,6 |
| Handgranate (61) | 150 px | 10,7 | 12,3 | 31,7 | 36,4 |
| Handgranate (61) | 300 px | 0 (Waffe erreicht es nicht) | 0 | 0 | 0 |
| Splittergranate (42) | 90 px | 7,7 | 9,0 | 25,1 | 28,8 |
| Splittergranate (42) | 150 px | 8,3 | 9,5 | 24,9 | 28,7 |
| Splittergranate (42) | 300 px | 3,6 | 4,3 | 16,1 | 18,6 |
| Molotowcocktail (36) | 90 px | 34,8 | 37,7 | 37,4 | 40,6 |
| Molotowcocktail (36) | 150 px | 35,2 | 38,1 | 37,5 | 40,7 |
| Molotowcocktail (36) | 300 px | 30,8 | 33,0 | 37,3 | 40,4 |
| Kosmische Wassermelone (85) | 90 px | 9,9 | 11,4 | 53,9 | 62,0 |
| Kosmische Wassermelone (85) | 150 px | 14,9 | 17,1 | 54,2 | 62,4 |
| Kosmische Wassermelone (85) | 300 px | 5,0 | 5,7 | 48,1 | 55,3 |

Über alle neun Läufe je Waffe (drei Seeds × drei Entfernungen, Nullen eingerechnet): Handgranate 7,1 → 8,2 → 20,9 → 24,0; Splittergranate 6,9 → 8,0 → 22,8 → 26,2; Molotowcocktail 33,6 → 36,3 → 37,4 → 40,6; Wassermelone 9,9 → 11,4 → 52,1 → 59,9 (A0 → A1 → B0 → B1). Verhältnisse: A1/A0 1,15 / 1,16 / 1,08 / 1,15; B0/A0 2,9 / 3,3 / 1,1 / 5,2. Treffer (Schaden > 0) in A0: Handgranate 6 von 9, Splittergranate 8 von 9, Molotowcocktail 9 von 9, Wassermelone 6 von 9; in B0: 6, 9, 9, 9. Die Zeile "300 px" der Handgranate ist 0 in allen Bedingungen, die Waffe (Katalogreichweite 313, Späher) erreicht das Ziel dort nicht.

Bezug "fairer Wert": Katalogschaden × 0,7 (Späher): Handgranate 42,7, Splittergranate 29,4, Wassermelone 59,5. B0 erreicht davon 0,74 (Handgranate), 0,85 (Splittergranate), 0,91 (Wassermelone); Molotowcocktail 25,2 Direktschaden plus Brand.

Stufenmedian des Skripts (ohne Zünder und Selbstwirkungen): common 17,8, uncommon 30,4, rare 46,5, epic 68,5. Handgranate B0 31,3 (uncommon, 1,03 des Medians), Splittergranate B0 25,0 (rare, 0,54), Wassermelone B0 54 (epic, 0,79); in A0 liegen sie bei 0,35, 0,18 und 0,22 (Audit E3).

**Leistungswert und Stufe bei +15 %** (`computePowerScore` nachgerechnet, Katalogformel; keine Stufe wechselt):

| Waffe | powerScore alt | neu (+15 %) | Stufe |
|---|---:|---:|---|
| Kaktusbombe | 109,3 | 116,42 | rare |
| Pömpel | 72,37 | 77,12 | uncommon (Schwelle rare 80) |
| Impulsbombe | 100,78 | 107,02 | rare |
| Splittergranate | 83,97 | 89,64 | rare |
| Handgranate | 63,32 | 71,56 | uncommon |
| Bananengranate | 91,44 | 97,65 | rare |
| Molotowcocktail | 92,97 | 97,83 | rare |
| Roboterbombe | 95,27 | 102,28 | rare |
| Giftwolke | 91,62 | 94,05 | rare |
| Tentakelgift | 98,01 | 102,33 | rare |
| Kosmische Wassermelone | 157,91 | 170,53 | epic |

Die Zünderwaffen stehen im Leistungswert (rare, ps 84 bis 109) deutlich höher, als sie wirken (Roboterbombe, Splittergranate, Handgranate, Bananengranate mit Rangdifferenz +81 bis +105 in `heavy-tech.md`). Mehr `damage` verstärkt diese Lücke im Score, ohne sie in der Wirkung zu schließen.

Tests in der Kopie: Mit der Korrektur laufen elf Testdateien, die Zünder oder Waffenwirkung berühren, unverändert grün (`ballistics-shared`, `event-coverage`, `reichweite-konsistenz`, `rueckstoss-richtung`, `sidegrade-maxhealth-zuender`, `waffen-animation`, `waffen-wirkung`, `weapon-damage-types`, `weapon-field-wiring`, `weapon-identity` mit 34 Tests, `wirkungsmerkmale-match`); sie prüfen Ereignisse und Reihenfolge (`fuse_armed` vor `fuse_expired`, kein Schaden beim Aufprall), keine Lage. Die gesamte Suite und die E2E-Tests wurden nicht gefahren.

## 5 Was die Zahlen nicht sagen

- Die Messung hat ein stehendes Ziel auf freier Fläche; ein bewegtes oder in Deckung stehendes Ziel verändert das Bild (Zünder sind als Flächenwaffe mit Verzögerung gedacht).
- Die Sinktiefe wurde an einem Wurf je Waffe gemessen, nicht über viele Lagen; die Abhängigkeit von Gelände (Wasser, Hang, Stoffkarte) ist ungeprüft. Auf den Hügelkarten mit den drei Seeds zeigen alle gemessenen Läufe dieselbe Richtung.
- Warum die Neupositionierung im Zweig existiert (Fallschutz an Wänden?), wurde nicht untersucht; die Korrektur wurde nur an den genannten Tests geprüft.
- `fuseIntent` / `check:fuses` wurden nicht geprüft. Die Beschreibungen von Handgranate ("prallt ab") und Bananengranate ("Splitter") stimmen mit dem Motor nicht überein (`heavy-tech.md`, Abschnitt 4).

## 6 Empfehlung

1. **+15 % `damage` jetzt nicht umsetzen.** Gewinn unter 2,2 Schaden bei Handgranate, Splittergranate und Wassermelone (A1), Molotowcocktail +8 %. Der Befund (Wirkung 0,25 bis 0,3 des Katalogwerts) kommt vom Sinken, nicht vom Schaden.
2. **Armierung korrigieren (Entscheidung des Auftraggebers).** Kleinste Änderung nach der Gegenprobe: bei bereits armierter Granate (Geschwindigkeit 0) die Lage nicht erneut setzen. Das ändert die Spielphysik und damit alte Replays; nach AGENTS.md §2 braucht es eine Versionsmarke im Replay-Kopf (Muster `config.kit`), die alten Aufzeichnungen laufen unverändert weiter. Danach `npm test`, `npm run check:docs`, betroffene E2E-Specs.
3. **Danach neu messen** (Skript um Zünder erweitern: echte Schüsse statt Zielhilfe für `lunte`-Waffen, Ausnahme in `findeAusreisser` entfernen), alle 11 Waffen, mehrere Seeds. Erwartung aus der Kopie: Handgranate und Wassermelone liegen dann im Bereich ihrer Stufe; Splitter-, Bananengranate und Roboterbombe (rare, Medianverhältnis um 0,5) sind die Kandidaten für +15 % `damage` (Splittergranate 25,0 → 28,8, ps 83,97 → 89,64, Stufe bleibt rare).
4. Handgranate: Katalogradius 0 setzt der Motor auf 24 (`blastRadius || 24`); Beschreibung ("prallt ab") und `bounces` 2 sind wirkungslos (Audit E4-7). Radius festlegen und Text angleichen, unabhängig von der Armierung.
5. Molotowcocktail, Giftwolke, Tentakelgift: nicht anfassen; sie wirken, ihr Wert hängt am Brand/Gift.

Offene Entscheidung für den Auftraggeber: Armierung korrigieren (Punkt 2) und danach über +15 % für die rare-Granaten entscheiden (Punkt 3).

## 7 Nach der Korrektur (Fassung 6)

Umgesetzt mit der Waffenfassung 6 (`WAFFEN_ZUENDER`, Standard für neue Matches). Fassung 5 und älter verhalten sich bitgleich wie vorher (Goldwerte in `tests/zuender-armierung-gold.test.js`, gemessen am Stand e26f660).

**Ursache (belegt).** `src/engine/systems/projectileSystem.js`, Zweig `if (hit && fuseTicks > 0)`: Der Treffpunkt `hit` ist der erste Abtastpunkt **im Festen** (`raycastSegment`, `src/shared/ballistics.js`). Der Zweig stellt die Granate dorthin und nullt die Geschwindigkeit. Im nächsten Takt beginnt der Strahl in dieser Zelle; `integrateStep` gibt der Geschwindigkeit wieder die Schwerkraft (`PROJECTILE_GRAVITY` 0,32 px), der erste Abtastpunkt liegt 0,32 px tiefer, ist wieder fest und wird zum neuen Treffpunkt. Je Takt rund 0,3 px Sinken, und `fuse_armed` kam in jedem Takt erneut. (Die Vermutung aus Abschnitt 2 "vermutlich, weil sie vom Treffpunkt aus startet" ist damit bestätigt.)

**Korrektur.** Neues Feld `Projectile.armiert`, gesetzt beim ersten Aufprall, nur wenn `services.match.zuenderBleibtLiegen` (Fassung ≥ 6). Eine armierte Granate wird nicht mehr bewegt und nicht mehr geprüft; sie zählt den Zünder herunter und zündet an der Aufprallstelle. Der Zünder läuft gleich lang wie vorher; `fuse_armed` kommt nur einmal.

**Messung** (`node scripts/waffen-balance.mjs --waffen=5` gegen `--waffen=6`, `messeWaffe` aus dem Skript, drei Seeds: Index + 0/1000/2000, Entfernungen 40 bis 1700 px; "Best" = höchster Schaden je Seed, Ziel steht still, Gesundheit 1000; "Nah" = Mittel über alle Entfernungen bis 300 px und alle drei Seeds, 12 Werte):

| ID | Waffe | Stufe | Best Fassung 5 (3 Seeds) | Mittel F5 | Best Fassung 6 (3 Seeds) | Mittel F6 | Faktor | Nah F5 | Nah F6 |
|---|---|---|---|---:|---|---:|---:|---:|---:|
| pa_028 | Kaktusbombe | rare | 20,8 / 24,1 / 16,8 | 20,6 | 36,1 / 37,0 / 36,9 | 36,7 | 1,78 | 12,9 | 35,6 |
| pa_029 | Pömpel | uncommon | 13,0 / 12,6 / 13,1 | 12,9 | 16,5 / 16,0 / 16,3 | 16,3 | 1,26 | 6,7 | 14,1 |
| pa_030 | Impulsbombe | rare | 8,5 / 11,9 / 11,2 | 10,5 | 24,4 / 24,9 / 24,1 | 24,5 | 2,32 | 7,5 | 23,1 |
| pa_046 | Splittergranate | rare | 8,3 / 7,5 / 7,4 | 7,7 | 23,0 / 23,6 / 23,8 | 23,5 | 3,03 | 5,0 | 21,8 |
| pa_047 | Handgranate | uncommon | 10,7 / 10,7 / 10,7 | 10,7 | 26,3 / 27,6 / 26,7 | 26,9 | 2,51 | 3,6 | 19,3 |
| pa_048 | Bananengranate | rare | 8,0 / 8,0 / 8,0 | 8,0 | 25,2 / 26,0 / 25,5 | 25,6 | 3,20 | 4,7 | 24,7 |
| pa_052 | Molotowcocktail | rare | 32,8 / 34,5 / 34,2 | 33,8 | 36,4 / 35,9 / 37,2 | 36,5 | 1,08 | 29,7 | 35,8 |
| pa_053 | Roboterbombe | rare | 12,4 / 12,2 / 9,4 | 11,3 | 30,8 / 30,2 / 29,6 | 30,2 | 2,66 | 7,5 | 27,6 |
| pa_070 | Giftwolke | rare | 35,3 / 34,9 / 34,3 | 34,8 | 33,6 / 33,8 / 33,9 | 33,8 | 0,97 | 33,2 | 33,0 |
| pa_073 | Tentakelgift | rare | 44,9 / 42,0 / 44,8 | 43,9 | 46,1 / 46,1 / 45,9 | 46,0 | 1,05 | 40,4 | 45,7 |
| pa_144 | Kosmische Wassermelone | epic | 14,9 / 14,9 / 0,0 | 9,9 | 51,9 / 51,9 / 52,6 | 52,1 | 5,25 | 3,7 | 50,6 |

Lesart: Die acht Direktschaden-Zünder gewinnen das 1,3- bis 5-Fache (Wassermelone 9,9 → 52,1, Bananengranate 8,0 → 25,6, Splittergranate 7,7 → 23,5, Handgranate 10,7 → 26,9). Molotowcocktail, Giftwolke und Tentakelgift bleiben gleich (±8 %): ihr Wert hängt am Brand/Gift, nicht an der Lage (die Giftwolke liegt 3 % darunter; die Ursache wurde nicht untersucht, vermutlich Streuung durch die andere Zündlage). Die Wassermelone in Fassung 5 hat bei Seed 2000 den Wert 0 (die Granate sank aus dem Radius), in Fassung 6 trifft sie in allen Läufen.

Verhältnis zum Stufenmedian (Skript, ohne Zünder und Selbstwirkungen, Stand Abschnitt 4: uncommon 30,4, rare 46,5, epic 68,5), Mittel F6 gegen Median: Handgranate 0,88, Pömpel 0,54, Wassermelone 0,76; rare: Kaktusbombe 0,79, Roboterbombe 0,65, Bananengranate 0,55, Impulsbombe 0,53, Splittergranate 0,51, Molotowcocktail 0,78, Giftwolke 0,73, Tentakelgift 0,99. Die Grenze "zu schwach" im Skript ist 0,5 (`ZU_SCHWACH`).

**Empfehlung zu +15 % `damage` (nicht umgesetzt).**

1. Für die meisten Zünder **nicht nötig**: Handgranate, Wassermelone, Kaktusbombe, Molotowcocktail, Giftwolke, Tentakelgift liegen im Bereich ihrer Stufe (0,73 bis 0,99), die Roboterbombe (0,65) ist vertretbar.
2. Offen bleiben **drei rare Granaten an der Schwäche-Grenze**: Splittergranate (0,51), Impulsbombe (0,53), Bananengranate (0,55), dazu der Pömpel (uncommon, 0,54). Wenn der Auftraggeber sie über 0,6 heben will, genügt +15 % `damage` genau für diese vier (Splittergranate 23,5 → rund 27, Impulsbombe 24,5 → rund 28, Bananengranate 25,6 → rund 29,5, Pömpel 16,3 → rund 18,7; der Gewinn skaliert linear, siehe Abschnitt 1 Punkt 3). Die Stufen bleiben (Abschnitt 4: `powerScore` Splittergranate 83,97 → 89,64, Pömpel 72,37 → 77,12 unter der rare-Schwelle 80). Das wäre eine neue Waffenfassung (7) wie `WAFFEN_F5_WERTE`, nicht Teil dieser Änderung.
3. Vorher die Messlücke schließen: Der Medianvergleich liegt auf Skript-Medianen ohne Zünder; `findeAusreisser` führt Zünderwaffen weiter nicht (`!e.lunte`). Mit Fassung 6 messen die Zünder fair und könnten in die Ausreißerliste aufgenommen werden.
