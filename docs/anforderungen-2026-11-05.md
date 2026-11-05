# Anforderungen 2026-11-05 (zweiter Auftrag)

*Auftraggeber-Nachricht vom 2026-11-05, wörtlich in Stichpunkten; darunter der
Ist-Stand im Code, die Entscheidungen des Agenten und die Arbeitspakete.
Diese Datei ergänzt `docs/plan-produktion.md`; die Einzelliste bleibt
`docs/TODO-SSOT.md`.*

## 1. Der Auftrag

1. **Zugzeit** kommt nicht von 20 s: klein **30 s**, mittel **40 s**, groß **50 s**.
2. **Keine Bots.**
3. **2–6 Spieler**: 1v1, 2v2, 3v3, 2v2v2 und jeder gegen jeden.
4. **Kartenformate**: 24/9, 9/24, 16/9, 9/16, 4/3, 3/4, 1/1.
5. **9 Fraktionen** mit je **9 individuellen Einheiten** in **3 Klassen**
   (ausgeglichen): 1 Nahkampf, 1 Fernkampf, 1 Magier/Okkultist.
6. **Günther** verteilt überwiegend gute Perks/Boni — **mindestens 30**
   individuelle Perks/spaßige Dinge/Boni.
7. **Cookie** verteilt eher schlechte Mali/uncoole Ereignisse — **30**
   individuelle Punkte (z. B. weniger Zugzeit, etwas beim Berühren).
8. Jede Einheit bekommt **1 der 150 Waffen von Start an**, zusätzlich zu den
   **8 Standard-Startwaffen** (Bazooka, Baseballschläger, Gewehr, Schlag,
   Perk, Granate, Mine, Ninjaseil).
9. **Waffenkategorien im Dropdown** unterscheidbar gekennzeichnet (Farbe,
   Schimmer oder Hintergrund): Nahkampf, Fernkampf, Lenkwaffen, Perks, Magie,
   Abwehr, automatische Waffen — 150 Waffen insgesamt, mit **Seltenheitsstufen
   und Drop-Werten**.
10. **Login** (nur Benutzername + Passwort), wenn der Server läuft.
11. **Historische Liste** mit Bestwerten (meiste Schüsse, beste/schlechteste KD,
    meiste Siege …).
12. **Lobby**: max **6 Plätze**, spielbar ab 2; danach Modus- und Kartengrößen-
    wahl (nur was mit der Spielerzahl möglich ist), dann Biomwahl (20 Biome).
13. **Jede Karte individuell, keine zweimal.**

## 2. Ist-Stand (gemessen im Code, 2026-11-05)

| Punkt | Heute | Lücke |
| :-- | :-- | :-- |
| Zugzeit | `MATCH_RULES.turnTimers`: 30 s bei ≤ 2, **20 s bei ≤ 4**, 15 s darüber; zusätzlich fest `15000` in `getTurnDurationForPlayerCount` (`src/engine/systems/turnSystem.js:155`) | Zugzeit hängt an der Spielerzahl, nicht an der Kartengröße. 20 s ist genau der 4-Spieler-Wert. |
| Kartenmaße | `MAP_SIZES` (`src/engine/match.js:135`): 4 Stufen, alle **16:9**, Hochformat als gedrehte Kopie. `mapGroesseFuerSpieler`: ≤ 2 klein, ≤ 8 mittel, ≤ 12 groß | Kein 24:9, 4:3, 1:1. Nur zwei Ausrichtungen. Größe folgt der Spielerzahl statt der Wahl. |
| Spielerzahl | `teams × playersPerTeam`, Obergrenze `MAX_LOBBY_FIGURES = 40` | Kein Modus „jeder gegen jeden"; 6 Spieler nur als Teamform denkbar. |
| Fraktionen/Einheiten | 9 × 9 = 81 (`src/shared/config/factions.js`) | Vorhanden. Klassen sind 3 (`scout/heavy/artillery`) + 3 Archetypen — **nicht** Nahkampf/Fernkampf/Magier je Fraktion. |
| Günther | Glücksrad mit gewichteten Aktionen (`GUENTHER_WHEEL`), Feinschliff-Fassung 3 | Keine 30 benannten Perks/Boni. |
| Cookie | Hunger/Wut/Pflege/Spielen, Fassung 3 | Keine 30 benannten Mali/Ereignisse. |
| Startwaffen | 4 Rollen je Klasse (`loadouts.js`), nur `common`–`rare` | Keine 8 Standardwaffen, keine zusätzliche Katalogwaffe je Einheit. |
| Waffen | 150 in 8 Kategorien (`melee, ranged, heavy_ranged, elemental, magic, tech, utility, ultimate`), `powerTier` common–legendary | Kategorien passen nicht zum geforderten Dropdown; keine Farbkennung im Menü. |
| Login/Rangliste | nicht gebaut (Welle 1 A im Plan) | Komplett offen. |
| Karten-Einmaligkeit | Zufallsseed je Match | Keine Prüfung gegen frühere Karten. |

## 3. Entscheidungen des Agenten

| Punkt | Entscheidung | Warum |
| :-- | :-- | :-- |
| Zugzeit | **Kartengröße bestimmt die Zugzeit**: klein 30 s, mittel 40 s, groß 50 s. Die Spielerzahl beeinflusst sie nicht mehr. Eine ausdrückliche Angabe (`turnDurationMs`) schlägt weiter alles. | Wunsch wörtlich; größere Karte = längere Wege = mehr Bedenkzeit. |
| Größenstufen | Drei wählbare Stufen `klein/mittel/gross`; `krieg` bleibt als Altstufe lesbar (Replays), wird im Menü nicht mehr angeboten. | 30/40/50 s braucht genau drei Stufen. |
| Formate | Alle sieben als **Seitenverhältnis** einer Fläche: `24:9`, `9:24`, `16:9`, `9:16`, `4:3`, `3:4`, `1:1`. Je Stufe dieselbe **Fläche** (klein 1280×720 = 921 600 px), nur anders geschnitten: 24:9 → 1568×588 (+0,04 %), 4:3 → 1108×831, 1:1 → 960×960. | Gleiche Fläche = gleiche Waffenreichweiten, nur andere Sicht. Alte 16:9-Maße bleiben bitgleich. |
| Spielerzahl/Modi | 2–6 Spieler, feste Modi: **1v1 (2)**, **2v2 (4)**, **3v3 (6)**, **2v2v2 (6)**, **Jeder gegen jeden (2–6)**. Die Lobby zeigt nur die Modi, die mit der gewählten Spielerzahl gehen. | Wunsch wörtlich; nichts Unmögliches anbieten. |
| Fraktionsklassen | Die 9 Einheiten je Fraktion werden **3×3** auf Nahkampf/Fernkampf/Magie verteilt; die Klasse bestimmt Startlastout und Profil. Die bisherigen Klassen `scout/heavy/artillery` bleiben als **Archetyp** erhalten (Rolle innerhalb der Klasse), damit alte Replays und Profile weiterlaufen. | Kein Bruch der 81 Figuren; Klassen werden fachlich, Archetyp bleibt Feinheit. |
| Perks/Mali | Günther: **30 benannte Perks** (positiv, teils schräg), Cookie: **30 benannte Mali/Ereignisse** (negativ, teils gemein). Beide als Datenliste mit Wahrscheinlichkeit und Marke (Günther-Fassung 4, Cookie-Fassung 4). | Wunsch wörtlich, und Daten statt Sonderfälle im Code. |
| Startwaffen | Jede Einheit: die **8 Standardwaffen** (Bazooka `pa_037`, Baseballschläger `pa_001`, Gewehr `pa_056`, Schlag `pa_012` Katana, Perk = Klassen-Perk, Granate `pa_047`, Mine `pa_127`, Ninjaseil) **plus eine** Katalogwaffe aus `common`–`rare` je Einheit, deterministisch aus dem Startkit gezogen. | „1 der 150 von Start an" ohne die Grundausstattung zu entwerten. |
| Dropdown-Kategorien | Sieben Anzeigekategorien über den acht Katalogkategorien: Nahkampf (`melee`), Fernkampf (`ranged`, `heavy_ranged`), Lenkwaffen (`heavy_ranged` mit Zielsuche/Anflug), Perks (`utility`), Magie (`magic`, `elemental`), Abwehr (Schilde/Bunker), automatische Waffen (`tech` mit Salve/Autoziel). Jede Gruppe bekommt eine Farbe + Schimmer im Menü. | Wunsch wörtlich; Katalog bleibt eine Quelle, Anzeige leitet ab. |
| Karten-Einmaligkeit | Der Server führt je Lobby einen **Kartenschlüssel** (Geländefassung, Biom, Form, Größe, Seed) und lehnt eine Wiederholung innerhalb der letzten 500 Karten ab (Ringpuffer in `persistence.js`). | „keine zweimal" ohne wachsenden Speicher. |

## 4. Arbeitspakete

| Paket | Inhalt | Berührt | Abhängig von |
| :-- | :-- | :-- | :-- |
| **A1 Zugzeit** | `MATCH_RULES`/`getTurnDurationForPlayerCount` → Zugzeit aus Kartengröße (30/40/50); Lobby und HUD lesen dieselbe Quelle; Tests | `shared/config/match.js`, `engine/systems/turnSystem.js`, `server/lobby.js`, `client/hud.js` | — |
| **A2 Kartenformate** | Sieben Seitenverhältnisse je Stufe bei gleicher Fläche; Auswahlfeld „Form" in Lobby/Menü; Altformate bleiben lesbar | `engine/match.js` (`MAP_SIZES`, `mapSizeFor`), `server/lobby.js`, `client` Menü, Replay-Kopf | A1 |
| **B Lobby** | 6 Plätze, Modi (1v1/2v2/3v3/2v2v2/FFA), Filter nach Spielerzahl, Größe + Form + Biom nacheinander, Vorschau | `server/lobby.js`, `client/main.js`, `index.html` | A2 |
| **C Konto** | Login (Name + Passwort, scrypt), Sitzungstoken, SQLite/JSON-Speicher, Bestenliste mit Bestwerten (Schüsse, K/D, Siege, Schaden), Konto löschen, Admin-Passwort-Skript | `server/`, neu `server/konto.js`, `server/bestenliste.js`, UI | — |
| **D Günther/Cookie** | 30 Perks (Günther-Fassung 4), 30 Mali (Cookie-Fassung 4), Wirkung im Motor, Anzeige im HUD, Replay-Marke | `shared/config/guenther.js`, `cookie.js`, `engine/systems/guentherSystem.js`, `client` | — |
| **E Startwaffen** | 8 Standardwaffen + 1 Katalogwaffe je Einheit, deterministisch, Startkit-Grenze `common`–`rare` | `shared/config/loadouts.js`, `engine/match.js`, Tests | — |
| **F Waffenmenü** | Sieben Anzeigekategorien mit Farbe/Schimmer, Reihenfolge im Dropdown, Seltenheits- und Drop-Wert sichtbar | `client`, `shared/config/waffenKategorien.js` | E |
| **G Karten-Einmaligkeit** | Ringpuffer der letzten 500 Kartenschlüssel, Ablehnung mit Neuziehen | `server/persistence.js`, `server/lobby.js` | A2 |

Reihenfolge (höchstens drei Agenten gleichzeitig, wie `plan-produktion.md` §2):
**Welle A:** A1+A2, C, D → **Welle B:** B, E, G → **Welle C:** F und Rest.

## 5. Zwei Entscheidungen, die ich selbst treffe

1. **FFA-Wertung**: Beim „jeder gegen jeden" zählt der letzte Überlebende als
   Sieger, alle anderen als Niederlage. So ist die Bestenliste in allen Modi
   vergleichbar und Elo braucht keinen Sonderfall.
2. **Cookie-Mali „weniger Zugzeit"**: verkürzt die Zugzeit der **betroffenen
   Figur** um 20 % (nicht des ganzen Zuges). Der Mali hängt damit an der
   Figur, die ihn bekommen hat, und trifft nicht die Mitspieler.

