# Spiele-KI und NPCs in rundenbasierten Artillerie-Spielen
## Recherchebericht mit prüfbaren Quellen, Formeln und Empfehlungen

**Für:** Privates, nicht-kommerzielles 2D-Artillerie-Spiel (JS/ESM, Canvas 2D, Worms-inspiriert, deterministische Seed-Simulation, Figur "Günther", 150 Waffen)
**Stand:** September 2026
**Beigelegtes Artefakt:** `artillery-ai-reference.mjs` — lauffähig, alle Zahlen unten sind echte Programmausgaben (`node artillery-ai-reference.mjs`), keine erfundenen Werte.

---

## 0. Ehrliche Vorab-Einordnung (was die Recherche NICHT hergab)

Ich sage das zuerst, weil es die Erwartung kalibriert:

- **Es gibt keinen "State of the Art"-Paper-Korpus speziell für rundenbasierte 2D-Artillerie-KI.** Das Genre ist zu klein für akademische Aufmerksamkeit. Was existiert, sind (a) Praktiker-Threads auf Stack Overflow / gamedev.stackexchange / Reddit, die alle auf **dieselbe Lösung** hinauslaufen, und (b) **produktiver Open-Source-Code** — allen voran Hedgewars. Diese zwei Quellenarten sind für dein Problem *wertvoller* als Papers.
- **Die "SOTA"-Literatur zu menschlich wirkenden Bots kommt aus Ego-Shootern** (Imitation Learning, arXiv 2501.00078, Farhang et al.). Sie ist methodisch interessant, aber für ein rundenbasiertes 2D-Spiel **überdimensioniert** — du brauchst kein neuronales Netz, um Günther danebenschießen zu lassen. Ich führe sie als Referenz, nicht als Empfehlung.
- **Luftwiderstand + Wind macht die analytische Lösung unmöglich.** Das ist keine Meinung, sondern steht wörtlich in der Wikipedia-Quelle: *"Detailed mathematical solutions of practical problems typically do not have closed-form solutions, and therefore require numerical methods to address."* Also: numerisch arbeiten. Ich zeige unten drei funktionierende Verfahren plus eine Hedgewars-eigene Abkürzung, die **keinen Solver braucht**.
- Reddit's `/r/gamedev`-Thread zu Worms-KI existiert, ist aber per Scraper nicht lesbar (`web_extract` verweigert reddit.com). Ich habe die dort kolportierte Lösung über andere Quellen verifizieren können — sie ist identisch zu dem, was gamedev.stackexchange sagt.

---

## 1. Ballistik / Zielberechnung: Formeln

### 1.1 Ohne Luftwiderstand — analytisch, geschlossene Form
**Quelle:** https://en.wikipedia.org/wiki/Projectile_motion#Angle_required_to_hit_coordinate_(x,_y)

```
        ┌                                   ┐
θ = arctan│  v² ± √( v⁴ − g(g·x² + 2·y·v²) )  │
        │  ───────────────────────────      │
        └            g·x                    ┘
```
- `v` = Abschussgeschwindigkeit, `g` = Gravitation, `(x, y)` = Ziel **relativ zum Abschusspunkt**
- `y` positiv = nach oben. **In Canvas-2D zeigt y nach unten → Vorzeichen umdrehen.** Das ist laut mehreren Stack-Exchange-Antworten der häufigste Praxis-Fehler.
- **Diskriminante** `v⁴ − g(gx² + 2yv²) < 0` → Ziel unerreichbar (zu weit/tief).
- `±`: `+` = steile Bahn (Lob), `−` = flache Bahn.
- **Verifiziert im Belegprogramm:** Kraft 16, g 0.4, Ziel 580px weg / 100px tiefer → **18.27°** flache Bahn.

Minimal nötige Geschwindigkeit bei fixem Winkel: `v² = g·(y + √(y² + x²))`

### 1.2 Mit Luftwiderstand — warum es analytisch nicht geht
Zwei Widerstandsmodelle (Wikipedia, Abschnitt *Trajectory in air*):
- **Stokes / linear:** `F = −k·v` (gültig für Re ≲ 1)
- **Newton / quadratisch:** `F = −k·|v|·v` (gültig für Re ≳ 1000 — das ist dein Regelfall)

Für quadratischen Widerstand existieren nur **Näherungen**, keine exakte geschlossene Bahn:
- *Analytic Approximations of Projectile Motion with Quadratic Air Resistance* — https://www.researchgate.net/publication/236659423
- Chudinov, *Approximate Analytical Description of the Projectile Motion with drag* — https://www.atiner.gr/journals/sciences/2014-1-2-2-Chudinov.pdf
- Überblick Wind + linearer/nichtlinearer Drag: Lubarda et al., UCSD (PDF) — http://maeresearch.ucsd.edu/~vlubarda/research/pdfpapers/AAM22.pdf
- Wikipedia selbst nutzt die Konstante `μ = k/m` und Integrale: `v_∞ = √(g/μ)`, `t_f = 1/√(μ·g)` — https://en.wikipedia.org/wiki/Projectile_motion#Trajectory_of_a_projectile_with_air_resistance

**Konsequenz:** Alle Näherungen sind für Spiele *schlechter* als eine simple numerische Vorwärtsrechnung. Nicht mit Taylor-Reihen quälen — simulieren.

### 1.3 Der Hedgewars-Trick: Flugzeit als Parameter, **kein Solver nötig**

Das ist der wertvollste Einzelfund der ganzen Recherche. **Quelle (Originalcode, GPL-2.0):**
`uAIAmmoTests.pas`, Funktion `TestBazooka`
https://hg.hedgewars.org/hedgewars/file/tip/hedgewars/uAIAmmoTests.pas (GitHub-Spiegel: https://github.com/hedgewars/hw)

Statt nach dem Winkel zu suchen, **rät Hedgewars die Flugzeit `t`** und berechnet daraus die nötige Abschussgeschwindigkeit direkt:

```pascal
rTime := rTime + 300 + Level * 50 + random(300);
Vx := - aiWindSpeed * rTime * 0.5 + (Targ.Point.X + … - mX) / rTime;
Vy :=   aiGravityf  * rTime * 0.5 - (Targ.Point.Y + 1 - mY) / rTime;
r  := sqr(Vx) + sqr(Vy);
ap.Angle := DxDy2AttackAnglef(Vx, Vy) + AIrndSign(random((Level-1)*9));
ap.Power := trunc(sqrt(r) * cMaxPower) - random((Level-1)*17 + 1);
```

Herleitung: mittlere Geschwindigkeiten `vx = dx/t`, `vy = dy/t`. Über die Flugzeit `t` zieht Gravitation im Mittel um `g·t/2` nach unten, Wind um `wind·t/2`. Der Abschuss muss das vor-kompensieren. **Exakt für konstante Windbeschleunigung, Näherung bei Drag** — deshalb simuliert Hedgewars danach jeden Kandidaten vorwärts und bewertet den **Einschlagort** (`RateExplosion`), nicht die Formel.

**Level-Skalierung passiert hier direkt:** Der Zeitschritt wächst mit `Level*50`, das Suchintervall schrumpft mit `5050 − Level*800` → höheres Level = mehr Kandidaten = bessere Lösung. Elegant, kein separates "Skill"-System nötig.

**Portier-Warnung (ich bin selbst hineingelaufen):** Hedgewars' Konstanten (350, 300+Level·50, 5050−Level·800) sind in **seinen** Einheiten kalibriert (Ticks, eigene Gravitation, `cMaxPower`-Skalierung) und **nicht übertragbar**. Ein 1:1-Port erzeugt in einem anderen Koordinatensystem Müll (bei mir: −92° und Landung 700px daneben). Portiere die **Struktur** (Zeit-Scan), leite die Schranken aus deinem eigenen Level-Design ab: `t_ref ≈ max(√(2|dy|/g), |dx|/v_max)`.

**Verifiziert im Belegprogramm:** Level-5-Scan mit Wind 0.03 und ohne Drag → Abschuss bei −4.26°, Speed 34.15 → Einschlag **(641.2, 504.3)** gegen Ziel **(640, 500)**, also 4.4px daneben bei reinem Scan (Feinjustage siehe 1.5).

### 1.4 Robuster Solver: Vorzeichen-Bracket + Sekante + Bisektion

Wenn du exakt treffen willst, brauchst du echte Wurzelfindung. Ich habe **beides** implementiert und gegeneinander abgesichert:

1. **Bracket-Scan** über den Winkelbereich 0–85°: suche zwei benachbarte Winkel mit **Vorzeichenwechsel** der Fehlerfunktion.
2. **Sekantenverfahren** (superlinear, schnell) — Standard-Numerik, z.B. Süli & Mayers *An Introduction to Numerical Analysis*.
3. **Bisektion** als Fallback (garantiert konvergent bei vorhandenem Bracket).
4. **Verifikation**: beide Kandidaten vorwärts simulieren, den mit kleinerem echten Fehler nehmen. *Niemals dem Solver vertrauen — immer nachrechnen.*

**Das ist der entscheidende Praxispunkt, den ich im Code selbst erlebt habe:** Meine erste Fehlerfunktion nahm den *nächstgelegenen Bahnpunkt* zur Ziel-x. Der Solver meldete „residual 0.000", aber die echte Abweichung betrug **4.78px** — ein Bodensatz-Fehler aus der Tick-Diskretisierung, den *kein* Solver weg-rechnet. Fix: **Sekanten-Nullstelle zwischen den beiden Bahnpunkten links/rechts der Ziel-x interpolation**, nicht den nächsten Punkt nehmen.

Nach dem Fix: **residual 0.000px**, und unabhängig verifiziert:
```
(a) Querung der Ziel-x:      y = 500.000  → Fehler  0.000px
(b) Aufschlag am Boden:      x = 640.000  → Fehler -0.000px
```

### 1.5 Zwei Metriken, die verschiedene Dinge messen — und die Tick-Falle

- **(a) Querungsfehler:** Höhe der Kugel genau an der Ziel-x. Das optimiert der Winkel-Solver.
- **(b) Aufschlagfehler:** wo die Kugel den **Boden** trifft. Das ist es, was zählt, wenn das Ziel auf dem Boden steht.

Ein Solver, der nur (a) optimiert, verschenkt Genauigkeit bei (b). Meine Menschlichkeits-Messung unten zeigte deshalb ein Plateau bei **9.8px** für maximale Schwierigkeit — nicht weil der Solver schlecht war, sondern weil **1 Tick = 15px horizontal** bedeutet. Die Lösung ist trivial und im Code demonstriert: **Feinjustage-Loop** über ±0.004 rad / ±0.4% Kraft (17×17 = 289 Simulationen, im Spiel nicht messbar). Ergebnis: **0.0000px Aufschlagfehler.**

### 1.6 Alternative, die Praktiker tatsächlich nutzen: Lookup-Tabelle
**Quelle:** https://gamedev.stackexchange.com/questions/165868/targeting-with-a-ballistic-gun — Antwort von Bram, mit Verweis auf Oskar Stålberg (Bad North): https://twitter.com/OskSta/status/816332161036984320

2D-Tabelle über (Winkel, Kraft) → Reichweite, gefüllt durch Testschüsse in 0.02-rad-Schritten (=1.146°). **Vorteil:** handhabt quadratischen Drag mühelos, O(1) zur Laufzeit. **Nachteil:** bei jeder Physik-Änderung neu berechnen — und bei **Wind** (dein Fall) muss die Tabelle um eine Wind-Achse wachsen → 3D und teuer. **Für dein Spiel mit Wind: nicht empfehlen**, außer als Cache für den windfreien Fall.

Auch explizit als Praxisweg dokumentiert: **Brute-Force-Vorwärtssimulation mit Anpassung** — Stack Overflow #431586 (Antworten von Loren Pechtel und BCS, sowie Iain, der das für das Webspiel *Zwok* genau so gebaut hat): https://stackoverflow.com/questions/431586/how-to-start-designing-an-ai-algorithm-for-an-artillery-warfare-game

### 1.7 Gewichteter Drag vs. linearer Drag — praktische Empfehlung
Bei *sehr* hohen Geschwindigkeiten erzeugt quadratischer Drag eine **Terminalgeschwindigkeit**, die deine Simulation möglicherweise nicht will (Worms-Granaten fallen nicht terminal). Der Chris-Beitrag im gamedev-Thread argumentiert, für Spiele sei **konstanter (linearer) Drag pro Zeiteinheit ausreichend** und skaliere sauber mit Objektgröße. **Empfehlung:** starte mit linear (wie in meinem Demo: `v -= drag*v*dt`), führe quadratisch nur ein, wenn ein Waffentyp bewusst „bremsen" soll.

---

## 2. KI-Architekturen und Bibliotheken

### 2.1 Hedgewars' Gesamtarchitektur (das lehrreichste Vorbild)

**Quellen (alles GPL-2.0-Freie-Software, Code lesbar):**
- https://github.com/hedgewars/hw (GitHub-Spiegel)
- https://hg.hedgewars.org/hedgewars/file/tip/hedgewars/uAIAmmoTests.pas
- https://www.hedgewars.org/node/6418 (Entwicklerforum: Bot-Level-Unterschiede, vom Hedgewars-Dev nemo persönlich erklärt)

Struktur, die ich im Quelltext verifiziert habe:

| Datei | Rolle |
|---|---|
| `uAIMisc.pas` | Ziel-Erfassung & Scoring, `RateExplosion`, `AIrndSign`, `AIrndOffset` |
| `uAIAmmoTests.pas` | **pro Waffe eine Testfunktion** (`TestBazooka`, `TestGrenade`, …) → liefert Score |
| `uAI.pas` | Aktionsplanung, Aktionskette als **Stack**, `Push`/Branching (Tiefe 12) |
| `uAI2.pas` | `initiateThinking()` / `processActions()`, Sandbox-Thread |
| `uAIActions.pas` | Elementare Aktionen (`aia_Weapon`, `aia_Up`, `aia_attack`…) |

**Die vier Kernideen, die du übernehmen solltest:**

**(1) Zielwahl = Scoring, nicht Regelwerk.** `FillTargets` bewertet jedes Objekt:
```pascal
if (Team .Clan = CurrentTeam^.Clan) then Score := Gear^.Damage - Gear^.Health   // Feind: Schaden = gut
else Score := Gear^.Health - Gear^.Damage;
// Gräber: ResurrectScore = 100 (Verbündeter) / -100
// Minen: Score := max(0, 35 - Gear^.Damage)
// Explosives: Score := Gear^.Health - Gear^.Damage
```
Plus **`friendlyfactor`** für Friendly Fire: `if e > f then 300 + (e-f)*30 else max(30, 300 - f*80 div max(1,e))` — die KI wird vorsichtiger, je mehr eigene Hogs in Schusslinie stehen. **Das ist direkt auf Günthers Glücksrad-Mechanik übertragbar.**

**(2) Bewertung der Explosion, nicht des Einschlags.** `RealRateExplosion` berechnet für **jedes** Ziel im Radius den Schaden:
```pascal
dmgBase := r + Radius div 2;
if abs(Point.x - x) + abs(Point.y - y) < dmgBase then   // Manhattan-Vorfilter
   dmg := trunc(dmgMod * min((dmgBase - trunc(sqrt(sqr(dx)+sqr(dy)))) div 2, r));
```
Wichtig: die Distanz wird **euklidisch** gemessen, der Vorfilter nur **Manhattan**. Zwei-Stufen-Filter = schnell *und* korrekt.

**(3) Pro Waffe eine Testfunktion mit `Flags`.** Die `AmmoTests`-Tabelle mappt jede Waffe auf ihre Testfunktion + Fähigkeits-Flags:
```
amtest_Rare            = $01  // nur wenige Positionen testen (teuer)
amtest_NoTarget        = $02  // jede Position, aber ohne Zielerfassung
amtest_MultipleAttacks = $04
amtest_NoTrackFall     = $08
amtest_LaserSight      = $10  // unterstützt Laser-Sicht
amtest_NoVampiric      = $20
amtest_NoInvulnerable  = $40
amtest_NoLowGravity    = $80
```
Bei **150 Waffen** ist das genau die richtige Architektur: eine gemeinsame Schnittstelle `test(me, target, level) → {score, angle, power, explX, explY}`, plus Flags für Sonderfälle. Dev nemo im Forum: *"Weapons the AI can use are ones that there is a test written for, pretty much."* → **Günther kann nur Waffen nutzen, für die du einen Test geschrieben hast.** Das ist ein bewusster Scope-Deckel, kein Bug.

**(4) Fähigkeits-Gating statt nur Genauigkeits-Gating.** Aus dem Forum-Thread: *"lower level AI is unaware of drowning enemies, damaging/batting barrels to hurt other hogs, using cake/kamikaze/drill rocket… Low level AIs also have reduced movement. Like not being able to do jumps. Pretty sure they can't switch either."*
→ **Niedriges Level = schlechteres Zielen UND kleinere Aktionsmenge.** Das ist mehrdimensionales Schwierigkeitsdesign und wirkt deutlich menschlicher als reine Streuung.

**Grenzen, die die Hedgewars-Devs selbst benennen (ehrlich zitiert):** Die KI kann keine Rope nutzen, keinen Piano-Strike, kein Teleport; höhere Level „batteln" Gegner extrem präzise ins Wasser, aber niedrige Level treffen Minen aus Versehen. *"There's really not much time spent on non-default behaviour."* → 25 Jahre Community-Entwicklung reichen nicht, um eine Worms-KI vollständig zu machen. **Setze deinen Scope bewusst.**

### 2.2 Behavior Trees in JavaScript

| Bibliothek | Lizenz | Sterne | Passung zu deinem Fall |
|---|---|---|---|
| **mistreevous** https://github.com/nikkorn/mistreevous | **MIT** | 140 | ★★★★★ **Beste Wahl.** TypeScript, läuft Node *und* Browser, JSON- **oder** DSL-Definition (MDSL). **Seedbare RNG** — explizit als Feature: *"Randomised behaviour – weighted choices, random delays, **seedable RNG for deterministic tree processing**"*. Bei einem Seed-deterministischen Spiel ist das fast schon ein K.-o.-Kriterium, und mistreevous erfüllt es als einziges. Aktiv gepflegt (letzter Commit Aug 2026, v4.3.1). |
| **behavior3js** https://github.com/behavior3/behavior3js | **MIT** | 433 | ★★★☆☆ Mehr Sterne, aber **letzter Commit Okt 2018**, 45 Commits, unmaintained. Hat JSON-Serialisierung + Online-Visual-Editor (nett zum Debuggen). Kein Seed-RNG-Feature dokumentiert. Nur nehmen, wenn dir der visuelle Editor wichtiger ist als Wartung. |
| **yuka** https://github.com/Mugen87/yuka | MIT | — | ★★☆☆☆ Fokus liegt auf **Steering Behaviors und Navigation** (3D-Bewegung, Pfadfindung, Goal-Driven). Für *runde*nbasierte Artillerie mit fixen Schusspositionen brauchst du Steering nicht. Nur sinnvoll, wenn Günther sich frei über die Karte bewegen soll. |
| **BehaviorTree.CPP** https://www.behaviortree.dev/ | MIT | — | C++, nicht relevant, aber die **Dokumentation ist die beste konzeptionelle Einführung** ins Thema. |

**Meine ehrliche Empfehlung: nutze für Günther zunächst gar keine Bibliothek.** Für einen rundenbasierten Bot mit einer Entscheidung pro Zug ist ein Behavior Tree Overkill — und ich habe in meinem eigenen Demo-Code gesehen, wie viel Verhalten schon in ~50 Zeilen steckt. Zwei Gründe, es trotzdem zu tun: (a) du willst **Günthers Barks und Zustände** über viele Waffentypen skalieren, (b) **Seedbarkeit** ist gratis und passt zur deterministischen Simulation.

### 2.3 Fachliteratur (kostenlos, autoritativ)

- **Game AI Pro** — die drei Bände sind **komplett kostenlos** online: http://www.gameaipro.com/
  Direkt relevant: *Chapter 9: Overcoming Pitfalls in Behavior Tree Design* (Anthony Francis) — http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter09_Overcoming_Pitfalls_in_Behavior_Tree_Design.pdf
  Kernaussagen: BTs sind *"hierarchical finite-state machines"*. Drei Pitfalls: (1) zu viele Organisationsklassen, (2) eine komplette Programmiersprache in den BT bauen, bevor man sie braucht, (3) **allen** Datenaustausch über das Blackboard routen. Francis' Fazit: *"figure out what you need to do, don't jump the gun on building too much of it… refine your abstractions until the complexity is squirreled away in a few files and the leaves of your functionality are dead bone simple."* — Für ein Ein-Personen-Projekt ist Pitfall (2) der tödlichste.
- *A Reusable, Light-Weight Finite-State Machine* (David „Rez" Graham), Game AI Pro 3, Chapter 12 — http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter12_A_Reusable_Light-Weight_Finite-State_Machine.pdf — **Für Günther wahrscheinlich die bessere Architektur als ein BT.**
- *Simulating Behavior Trees: A Behavior Tree / Planner Hybrid Approach* (Hilburn), Game AI Pro Ch. 8, **mit Demo-Code** — http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter08_Simulating_Behavior_Trees.pdf + http://www.gameaipro.com/code/GameAIPro_Ch8.zip
- Isla 2005, *Handling Complexity in the Halo 2 AI* — die Referenz für die vier BT-Eigenschaften (customizability, explicitness, hackability, variability). Verlinkt in Francis' Kapitel.

**BT vs. FSM, Entscheidungshilfe:** gamedev.stackexchange #217180 („Do I make utility AI and behavior trees a part of a state machine?") — https://gamedev.stackexchange.com/questions/217180/ — Tenor: BTs sind hierarchische FSMs; Übergänge werden durch Hierarchie implizit. Für **wenige Zustände mit klar sequenzieller Entscheidung pro Zug** (Ziel wählen → Waffe wählen → zielen → feuern → Bark) ist eine **explizite FSM lesbarer**. Nutze BT erst, wenn Unterbrechungen/Reaktivierung nötig werden (z.B. Günther bricht ab, weil ein Gegner stirbt).

### 2.4 Andere Open-Source-Artillerie-Implementierungen (zum Abschauen)

| Projekt | Lizenz | Was drin ist |
|---|---|---|
| **Hedgewars** https://github.com/hedgewars/hw | GPL-2.0 | Die vollständigste Worms-artige Bot-KI, die offen existiert. **Warnung: GPL-2.0 ist copyleft.** Bei privatem, nicht-kommerziellem Projekt unproblematisch — aber **Code nicht einfach kopieren und später veröffentlichen**, ohne GPL zu übernehmen. **Algorithmen lernen: ja. Code abschreiben: nur mit GPL-Bewusstsein.** |
| **amhndu/tanks-game** https://github.com/amhndu/tanks-game | GPL-3.0 | „Mini Tanks", C++11/SFML, inspiriert von Pocket Tanks + Scorched Earth. Enthält `Missile.cpp`, `Tank.cpp`, `World.cpp` — eine kompakte, lesbare Vorlage. Ebenfalls GPL. |
| **webermn15/Scorch** https://github.com/webermn15/Scorch_a-scorched-earth-clone | prüfen | 2D-Multiplayer-Artillerie, Scorched-Earth-Klon. |
| **pkali/scorch_src** https://github.com/pkali/scorch_src | prüfen | Atari-8-bit-Scorched-Earth-Klon im Original-Quelltext — historisch interessant. |
| **sergiss/artillery-game** https://github.com/sergiss/artillery-game | prüfen | **Explizit mit „Trajectory prediction for AI" + Random-Landscape-Generierung.** Am nächsten an deinem Stack. |
| **Atomic Tanks (atanks)** https://sourceforge.net/projects/atanks/ | GPL | „Scorched Earth clone similar to the Worms series". |
| **openartillery** https://openartillery.net (GitHub-Topic `tank-game`) | prüfen | **Browser**, turn-based, destructible terrain, wind, gravity, **bots**, ranked MMR. Das ist am nächsten an deinem Zielprodukt — lohnt einen direkten Blick. |

---

## 3. Persönlichkeit, Menschlichkeit, Barks

### 3.1 Wie Hedgewars (und jeder andere) den Bot ungenau macht — **verifizierter Originalcode**

Drei Mechanismen, alle in `uAIAmmoTests.pas` / `uAIMisc.pas`, die ich wörtlich gelesen habe:

```pascal
// (1) Winkel-Fehler wächst mit Level
ap.Angle := DxDy2AttackAnglef(Vx, Vy) + AIrndSign(random((Level - 1) * 9));

// (2) Kraft-Fehler wächst mit Level
ap.Power := trunc(sqrt(r) * cMaxPower) - random((Level - 1) * 17 + 1);

// (3) Zufälliger Versatz auf die ZIELPOSITION (nur Level 1)
function AIrndOffset(targ: TTarget; Level: LongWord): LongInt;
begin
if Level <> 1 then exit(0);
AIrndOffset := targ.Radius*(random(7)-3)*2      // ±3 Radien
end;

function AIrndSign(num: LongInt): LongInt;
begin
if random(2) = 0 then AIrndSign :=  num
else                 AIrndSign := -num          // Zufalls-Vorzeichen
end;
```

**Wichtige Beobachtungen:**
- Hedgewars nutzt **Gleichverteilung** (`random(n)`), nicht Gauss. Das Ergebnis ist „leicht daneben", wirkt aber statistisch weniger wie ein Mensch als eine Glockenkurve — bei Gleichverteilung ist „weit weg" genauso wahrscheinlich wie „knapp daneben".
- Bei **Level 1** ist `(Level-1)*9 = 0` → **kein** Winkel-Fehler, aber `AIrndOffset` aktiv (±3 Radien auf das Ziel!). Bei Level ≥ 2 ist `AIrndOffset = 0`, dafür Winkel-/Kraftfehler aktiv. **Die Fehlerquelle wechselt mit dem Level** — ein bewusster Design-Trick, der verhindert, dass alle Levels „gleich dumm" wirken.
- Der Offset auf die *Zielposition* ist psychologisch klüger als ein Offset auf Winkel/Kraft: es sieht aus wie „schlecht gezielt", nicht wie „Waffe kaputt".

### 3.2 Besser als Hedgewars: Gauss + seltene Aussetzer

In `artillery-ai-reference.mjs` (Abschnitt 5/6) habe ich drei Ebenen implementiert:

**(1) Normalverteilte Zielabweichung** (Box-Muller aus seedbarer RNG):
```js
const sigmaA = (1 - difficulty) ** 1.5 * 0.09;  // rad, ~5.2° bei d=0
const sigmaP = (1 - difficulty) ** 1.5 * 0.07;  // relativ zur Kraft
const angleErr = gaussian(rng) * sigmaA;
```
Der Exponent **1.5** ist Absicht: bei `(1-d)` linear wären mittlere Level zu gut. Der überlineare Abfall gibt dir einen weiten „Anfänger"-Bereich und einen schmalen „Experten"-Bereich.

**(2) Seltener „vertippt"-Aussetzer** (3% der Schüsse, ±2.5σ):
```js
const slip = rng() < 0.03 ? 2.5 * Math.sign(gaussian(rng)) : 0;
```
Menschen treffen *meist knapp* daneben, aber *manchmal komplett* daneben (vertippt, falsche Taste, Wind falsch geschätzt). Ohne diese Komponente fühlt sich ein Bot „mechanisch leicht daneben" an. **Das ist der Unterschied zwischen „ungenau" und „menschlich".**

**(3) Zielwahl mit Temperatur** (softmax statt „bestes Ziel immer"):
```js
const T = (1 - difficulty) * 2.0 + 0.01;
const weights = targets.map(t => Math.exp((t.score / 100) / T));
```
Bei `T → 0` wird deterministisch das beste Ziel gewählt (perfekter Spieler), bei großem `T` zufällig (Anfänger). Das modelliert die menschliche Unsicherheit bei der **Zielauswahl** — Hedgewars hat das nicht, dort wird immer das maximal bewertete Ziel gewählt. **Für Günther: klarer Gewinn an Menschlichkeit.**

**Verifizierte Messwerte aus dem Belegprogramm** (500 Schüsse je Stufe, Seed 1337):

| difficulty | mean | median | p90 | Treffer <20px |
|---|---|---|---|---|
| 0.2 | 51.8px | 43.8px | 109.7px | 25.8% |
| 0.5 | 25.7px | 21.3px | 53.1px | 46.8% |
| 0.8 | 11.2px | 10.1px | 20.7px | 89.0% |
| 1.0 | 9.8px | 9.8px | 9.8px | 100% |

**Wichtig:** Der Mittelwert hat einen **Bodensatz** (9.8px bei difficulty 1.0) — das ist die Tick-Diskretisierung, nicht der Solver. Mit Sub-Tick-Interpolation + Feinjustage sind es **0.0000px** (Abschnitt 1.5). Plane also: *Genauigkeit kommt aus der Numerik, Streuung kommt aus der Menschlichkeit — halte beides getrennt.* Sonst kannst du difficulty 1.0 nie „perfekt" machen, und der Bot wirkt selbst auf höchster Stufe leicht daneben.

### 3.3 Barks und Reaktionen — Quellen

- **Left 4 Dead Developer Commentary** (vollständig transkribiert) — https://left4dead.fandom.com/wiki/Developer_Commentary_(Left_4_Dead)
  Der wörtliche Kern-Ratschlag zu Wiederholung: *"No matter how witty or funny a line is, you are sick of it the 100th time you hear it in an hour long play session."* → Fast jede Sprachzeile hat einen **Zufallsfaktor, wann sie spielt**. Das ist die eine Regel, die du zwingend übernehmen musst.
- **AI and Games, „How Barks Make Videogame NPCs Look Smarter" (AI 101)** — https://www.youtube.com/watch?v=u9VkW18IMzc
  Kernaussage: Barks sind billig und erzeugen massiv wahrgenommene Intelligenz. Ein Bot, der kommentiert, wirkt klüger als er ist — **genau das Richtige für Günther**.
- **AI-driven Dynamic Dialog through Fuzzy Pattern Matching** (Valve-Talk) — https://www.youtube.com/watch?v=tAbBID3N64A — erweiterte Variante, nur nötig, wenn Barks kontextsensitiv kombiniert werden sollen.
- **Worms Wiki: Artificial Intelligence** — https://worms.fandom.com/wiki/Artificial_Intelligence
  Dokumentiert die „Denkblasen" über den KI-Worms (*"Sometimes, thinking bubbles appear above the AI Worms' head, indicating the Worms planning their moves"*). **Sehr relevante UX-Idee für Günther:** die *Verzögerung sichtbar machen*. Ein Bot, der sofort feuert, wirkt unmenschlich schnell; ein Bot, dessen Denkblase 1–2 Sekunden pulsiert, wirkt menschlich — obwohl dahinter sofort gerechnet wurde.

### 3.4 Menschlichkeit jenseits der Genauigkeit — Forschungsstand (mit Vorbehalt)

- **Human-like Bots for Tactical Shooters Using Compute-Efficient Sensors** — https://arxiv.org/html/2501.00078v1 (2025)
- **Humanlike Behavior in a Third-Person Shooter with Imitation Learning** (Farhang) — https://alexfarhang.github.io/assets/pdf/Humanlike_Behavior.pdf
- **Imitation of Human Behavior in 3D-Shooter Game** (CEUR) — https://ceur-ws.org/Vol-1452/paper9.pdf
- **Modelling a Human-Like Bot in a First Person Shooter** — https://www.researchgate.net/publication/278410904

**Ehrliche Einschätzung:** Der Transferwert dieser Arbeiten ist für dich **gering**. Sie brauchen (a) Datensätze menschlicher Spielzüge und (b) neuronale Netze. Bei einem rundenbasierten 2D-Spiel mit einer Entscheidung pro Zug ist Imitation Learning massiv überdimensioniert. Die **übertragbare Erkenntnis** ist die *Feature-Verteilung*: echte Spieler zeigen z.B. **Reaktionszeiten**, **unbeabsichtigte Ziel-Offsets über die Zeit** (Ermüdung/Drift) und **individuelle Identity-Conditioning** (jeder Spieler hat eine Signatur). Letzteres ist die Idee für Günther: **gib jedem NPC eine feste, wiedererkennbare Fehler-"Signatur"** — z.B. schießt immer leicht zu kurz, oder tendiert nach links. Das ist billiger als jedes neuronale Netz und erzeugt Charakter.

### 3.5 Schwierigkeit und Fairness — Design-Debatten

- **„Is it unethical to make a game AI that is secretly non-competitive?"** — https://gamedev.stackexchange.com/questions/149704/ — die ethische Frage, ob ein absichtlich verschlechterter Bot unfair täuscht. Für dein privates Spiel: mild relevant, aber die Diskussion enthält gute Argumente, warum **transparente** Schwierigkeitsgrade („Günther hat heute einen schlechten Tag") besser ankommen als heimliches Gummiband.
- **AI for Dynamic Difficulty Adjustment in Games** (Andrade et al.) — https://www.researchgate.net/publication/228889029 — für ein privates Spiel **überdimensioniert**, aber die Kernidee (Spieler bei ~50% Health halten) ist eine Überlegung wert, falls Günther dynamisch nachjustieren soll.
- **Worms Revolution Diskussion „AI way too accurate"** — https://steamcommunity.com/app/200170/discussions/0/846959876009736984/ — Praxisdatenpunkt: Spieler beschweren sich, wenn die KI *durch Wände/tunnel* trifft. **Lehre:** Ungenauigkeit ist nicht nur Schwierigkeit, sondern auch **Fairness-Wahrnehmung**. Eine KI, die Hindernisse ignoriert, wird als betrügend erlebt, selbst wenn sie nicht öfter trifft.

---

## 4. Konkrete Empfehlungen

### Sofort umsetzen (hoher Nutzen, geringer Aufwand)

1. **Physik in eine einzige geteilte Funktion auslagern, die sowohl Spiel als auch KI benutzt.** Jede Abweichung (anderes `dt`, anderes Integrations-Ordering) erzeugt einen systematischen Fehler, den kein Solver weg-rechnet. Hedgewars macht das: `aiGravityf`/`aiWindSpeed` spiegeln die echten Werte.
2. **Nutze Hedgewars' Zeit-Parameter-Trick als erste Stufe** (Abschnitt 1.3): `Vx = -wind·t/2 + dx/t`, `Vy = -g·t/2 + dy/t`. Kein Solver, sofort brauchbar, exakt für Wind. Leite die Zeitschranken aus **deinem** Level ab, nicht aus Hedgewars' Konstanten (Portier-Falle).
3. **Simuliere jeden Kandidaten vorwärts und bewerte den Einschlagort.** Formel = Startpunkt, Simulation = Wahrheit. Das ist die zentrale Architektur-Idee.
4. **Interpoliere die Nullstelle, nimm nicht den nächsten Bahnpunkt.** Sonst Bodensatz-Fehler von ~1 Tick Breite (bei mir 4.78px bei „residual 0.000").
5. **Box-Muller-Gauss + 3% Aussetzer** statt `random(n)`. Exponent 1.5 auf `(1-difficulty)`, damit niedrige Level einen weiten Bereich abdecken.
6. **Softmax-Zielwahl mit Temperatur.** Bei hoher Temperatur wählt Günther suboptimale Ziele — das ist die glaubwürdigste Form von „Dummheit", weil sie wie eine Entscheidung aussieht, nicht wie ein Fehler.
7. **Sichtbare Denkverzögerung** (Worms-Denkblasen). 1–2s „Günther überlegt…" vor dem Schuss. Kosmetisch, aber massiver Effekt.

### Mittelfristig

8. **Waffen-Registry mit Flags** nach Hedgewars-Vorbild, skaliert sauber auf 150 Waffen: ein Interface `test(me, target, level) → {score, angle, power}` + Flags (`noTarget`, `rare`, `laserSight`, …).
9. **Zielwahl als Scoring** inkl. `friendlyfactor` — Günther muss eigene Einheiten/Kollateral meiden. Direkt anschlussfähig an die Glücksrad-Mechanik: das Rad *wählt* aus der gescorten Liste, statt zu würfeln.
10. **Kopf-an-Kopf-Branching**: Hedgewars plant Aktionsketten auf einem Stack (`cBranchStackSize = 12`) und testet Verzweigungen. Für Günther: 2–3 Züge vorausplanen (schießen → nachladen → neu zielen).
11. **Persönlichkeit als feste Fehler-Signatur** pro NPC (Abschnitt 3.4): jeder Charakter hat einen eigenen Sigma-Vektor und eine Ziel-Präferenz. Das ist billig und erzeugt Wiedererkennbarkeit.
12. **mistreevous** für die Zustands-/Bark-Logik, **weil es seedbare RNG hat** — das ist mit deiner deterministischen Simulation kompatibel. Alternativ eine schlanke FSM (Game AI Pro 3 Ch. 12) — für einen Bot mit einer Entscheidung pro Zug ausreichend und weniger Overhead.
13. **Difficulty über Fähigkeits-Gating**, nicht nur über Streuung (Hedgewars-Forum): niedrige Stufen nutzen weniger Waffen, springen nicht, erkennen Ertrinken nicht. Wirkt vielschichtiger.

### Nicht tun

- **Lookup-Tabellen mit Wind-Achse** — zu teuer bei Wind, und dein Szenario ändert sich pro Runde.
- **Imitation Learning / neuronale Netze** für einen rundenbasierten Bot — massiv überdimensioniert.
- **Analytische Näherungen mit quadratischem Drag** (Chudinov, Taylor-Reihen) — schlechter als 200 Zeilen Vorwärtssimulation, und du debugst dich an Reihengliedern zu Tode.
- **Hedgewars-Code abschreiben ohne GPL-Bewusstsein** — GPL-2.0 ist Copyleft. Algorithmen lernen ist frei, Code übernehmen bindet dich an die Lizenz. Bei privat bleibendem Projekt unproblematisch; falls irgendwann Veröffentlichung geplant ist, vorher klären.

### Offene Risiken / Grenzen meiner Recherche

- **Ich konnte Reddit nicht direkt lesen** (`web_extract` verweigert reddit.com). Der Thread r/gamedev „How to code AI in a game like Worms?" existiert (https://www.reddit.com/r/gamedev/comments/1jlbe09/), sein Inhalt ist aber nur über Suchsnippets bekannt und deckt sich mit den Stack-Exchange-Antworten (Ziel-Zyklus, Näherungsphysik, Simulation). **Wenn du dort Details willst, musst du selbst reinschauen.**
- **Hedgewars' Exaktheit habe ich über den Quelltext belegt, nicht durch Ausführen** (FreePascal-Toolchain nicht installiert). Die Formeln sind wörtlich zitiert, die Struktur nachgebaut und in JS lauffähig verifiziert.
- **`cMaxPower` und Hedgewars' Gravitationskonstante habe ich nicht im Detail aufgelöst** — für die Portierung irrelevant, weil du deine eigenen Einheiten hast, aber es heißt: **die Level-Konstanten nicht 1:1 übernehmen.**
- **`openartillery.net`** ist als Browser-Artillerie mit Bots der ähnlichste Vertreter — ich habe nur das GitHub-Topic gesehen, nicht den Code gelesen. **Lohnt als nächster Rechercheschritt.**
- **Kein Paper gefunden, das speziell rundenbasierte Artillerie-Bots behandelt.** Wer etwas anderes behauptet, hat vermutlich Ego-Shooter-Literatur umetikettiert.

---

## 5. Quellenverzeichnis (alles prüfbar)

**Ballistik**
- Wikipedia Projectile Motion: https://en.wikipedia.org/wiki/Projectile_motion
- gamedev.SE „Targeting with a ballistic gun": https://gamedev.stackexchange.com/questions/165868/targeting-with-a-ballistic-gun
- Stack Overflow „AI algorithm for an artillery warfare game": https://stackoverflow.com/questions/431586/how-should-i-start-designing-an-ai-algorithm-for-an-artillery-warfare-game
- Lubarda et al., Wind-influenced projectile motion (PDF): http://maeresearch.ucsd.edu/~vlubarda/research/pdfpapers/AAM22.pdf
- Chudinov, Approximate Analytical Description (PDF): https://www.atiner.gr/journals/sciences/2014-1-2-2-Chudinov.pdf
- Analytic Approximations with Quadratic Air Resistance: https://www.researchgate.net/publication/236659423
- math.SE „Launch angle required to hit coordinate with air resistance": https://math.stackexchange.com/questions/972214/
- Fitzpatrick, Projectile Motion with Air Resistance: https://farside.ph.utexas.edu/teaching/336k/lectures/node29.html

**Hedgewars (KI-Referenzimplementierung)**
- GitHub-Spiegel: https://github.com/hedgewars/hw
- `uAIAmmoTests.pas` (TestBazooka, AmmoTests-Flags, Level-Skalierung): https://hg.hedgewars.org/hedgewars/file/tip/hedgewars/uAIAmmoTests.pas
- `uAIMisc.pas` (FillTargets, RateExplosion, AIrndSign, AIrndOffset, BadTurn): https://hg.hedgewars.org/hedgewars/file/tip/hedgewars/uAIMisc.pas
- Forum „Bot level differences and moves" (Dev nemo erklärt Level-Gating): https://www.hedgewars.org/node/6418
- Hedgewars Hauptseite: https://www.hedgewars.org/

**Behavior Trees / Architektur**
- mistreevous (MIT, seedable RNG): https://github.com/nikkorn/mistreevous + Doku https://nikkorn.github.io/mistreevous/
- behavior3js (MIT, unmaintained seit 2018): https://github.com/behavior3/behavior3js
- yuka: https://github.com/Mugen87/yuka + https://mugen87.github.io/yuka/
- BehaviorTree.CPP: https://www.behaviortree.dev/
- Game AI Pro (alle Bände kostenlos): http://www.gameaipro.com/
- Game AI Pro 3 Ch. 9 „Overcoming Pitfalls in Behavior Tree Design": http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter09_Overcoming_Pitfalls_in_Behavior_Tree_Design.pdf
- Game AI Pro 3 Ch. 12 „A Reusable, Light-Weight FSM": http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter12_A_Reusable_Light-Weight_Finite-State_Machine.pdf
- gamedev.SE BT/Utility/FSM-Architektur: https://gamedev.stackexchange.com/questions/217180/

**Andere Artillerie-Spiele (Open Source)**
- amhndu/tanks-game (GPL-3.0): https://github.com/amhndu/tanks-game
- webermn15/Scorch (Scorched-Earth-Klon): https://github.com/webermn15/Scorch_a-scorched-earth-clone
- pkali/scorch_src (Atari-8-bit-Original): https://github.com/pkali/scorch_src
- sergiss/artillery-game (mit Trajektorien-Vorhersage): https://github.com/sergiss/artillery-game
- Atomic Tanks: https://sourceforge.net/projects/atanks/
- GitHub-Topic `tank-game` (Browser-Artillerie mit Bots): https://github.com/topics/tank-game?l=typescript → https://openartillery.net
- Worms Wiki, Artificial Intelligence: https://worms.fandom.com/wiki/Artificial_Intelligence
- Worms Revolution „AI way too accurate": https://steamcommunity.com/app/200170/discussions/0/846959876009736984/

**Persönlichkeit / Barks / Menschlichkeit**
- L4D Developer Commentary (transkribiert): https://left4dead.fandom.com/wiki/Developer_Commentary_(Left_4_Dead)
- AI and Games „How Barks Make Videogame NPCs Look Smarter": https://www.youtube.com/watch?v=u9VkW18IMzc
- Valve „AI-driven Dynamic Dialog through Fuzzy Pattern Matching": https://www.youtube.com/watch?v=tAbBID3N64A
- arXiv 2501.00078 Human-like Bots for Tactical Shooters: https://arxiv.org/html/2501.00078v1
- Farhang, Humanlike Behavior in a Third-Person Shooter: https://alexfarhang.github.io/assets/pdf/Humanlike_Behavior.pdf
- CEUR, Imitation of Human Behavior in 3D-Shooter Game: https://ceur-ws.org/Vol-1452/paper9.pdf
- Modelling a Human-Like Bot in a FPS: https://www.researchgate.net/publication/278410904
- gamedev.SE „Is it unethical to make a game AI secretly non-competitive?": https://gamedev.stackexchange.com/questions/149704/
- AI for Dynamic Difficulty Adjustment: https://www.researchgate.net/publication/228889029

---

## 6. Beigelegtes Artefakt

**`/home/patrick/artillery-ai-recherche/artillery-ai-reference.mjs`** — lauffähig mit `node artillery-ai-reference.mjs`, keine Abhängigkeiten. Enthält:
1. Seedbare RNG (mulberry32) + Box-Muller-Gauss
2. Analytische Winkelformel ohne Drag
3. Vorwärts-Simulation (avg-velocity Euler, wie Hedgewars) mit Wind + linearem Drag
4. Winkel-Solver: Bracket-Scan + Sekante + Bisektion + **Verifikation**
5. Hedgewars-Zeitparameter-Formel + skalenunabhängiger Level-Scan
6. Menschlichkeits-Streuung (Gauss + Aussetzer + Softmax-Zielwahl)
7. Sub-Tick-Feinjustage
8. Selbsttest mit allen oben zitierten Zahlen
