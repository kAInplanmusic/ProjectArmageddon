# Waffenfassung 21: Umsetzung der Auftraggeber-Entscheidungen vom 2026-11-11 (GP-1, GP-2)

Marke: `config.waffen` 21 (`WAFFEN_ENTSCHEIDUNG`, `src/shared/config/waffen-f21.js`), Standard für neue Partien. Fassungen 1 bis 20 bleiben bitgleich
(Gold: `tests/waffen-fassung21.test.js`, 300 Schüsse der 150 Waffen in Fassung 20; Hash `ee313694…` vor und nach der Änderung gleich; 3 Bot-Partien
`scripts/bot-partien.mjs` ebenfalls gleich). Belege je Nummer stehen in `tests/waffen-fassung21.test.js`.

| Nr. | Entscheidung | Umsetzung | Stand |
|---|---|---|---|
| 8 | `homing`-Gewicht 5 → 0,5 | stand seit 2026-10-28 im Katalog (Superschaf 151,97, Phönixschlag 146,12, beide epic); Fassungen 1 bis 4 behalten die alten Werte (`WAFFEN_F4_WERTE`). Test belegt. | erledigt (vorher), jetzt abgesichert |
| 9 | Nutzwert ohne Schaden | `NUTZEN_JE_WAFFE` (16 Waffen): Versetzen 0,5/px, Munition 12/Ladung, Rüstung 100/100 %, Heilung 1/LP, Mine 50, mal 0,9 bei Pause. Feld `nutzwert`, `powerScore`, `powerTier` in Fassung 21 (Dimensionsriss 74,25 uncommon). Beute liest weiter den Katalog. | Bewertung erledigt; Beutegewichte offen |
| 10 | Zünder: Messverfahren, Anhebung, Zündzeit 1/3/5 s | siehe unten | erledigt |
| 11 | Kategorien nach Wirkung | `KATEGORIE_NACH_WIRKUNG` (20 Waffen), Menügruppe folgt | erledigt |
| 12 | Kaktusbombe Gift | `damageType: poison` | erledigt |
| 13 | Handgranate Radius | `blastRadius` 46, `aoe` | erledigt |
| 14 | Allsehendes Auge | `engine/kistenSicht.js`, Server sendet `kisten_sicht` nur an das Team des Schützen (`lobbySession.js`), Anzeige `client/kistenSichtAnzeige.js` | erledigt; Sichtprüfung im Browser offen |
| 16 | Luftangriff/Meteorregen/Höllenkanone als Projektil | `delivery: projectile`, Radius 65/55/58, Anflug `sky`/`flank` bleibt | erledigt |
| 17 | Astralkugel/Gedankensturm Pause 2 | `cooldown` 2 | erledigt |
| 18 | Portale zusammenführen, 150 bleibt | `pa_076` = „Portal“ (90 px); `pa_079` = neue „Funkenkugel“ (Geschoss, Blitz, Schaden 30, Pause 1) | erledigt; Icon/Animation des Platzes bleiben (kein eigenes Bild) |
| 19 | Deckel Giftwolke/Tentakelgift/Flammenwerfer | Gift 45/55 → 36 (= Deckel 18 je Zug); Flammenwerfer steht seit Fassung 8 bei Feuer 30 unter dem Deckel 16 | erledigt |
| 20 | Handgranate 2 Abpraller | unverändert | erledigt (nichts zu tun) |
| 21 | Zünder +15 % | Schaden ×1,15, begrenzt auf 79 (kein Ein-Treffer-Kill); an der Grenze wächst der Radius um 15 % | erledigt |
| 22 | Doppeltreffer Himmels-/Flankenschlag | seit Fassung 9 (`WAFFEN_VORSTRAHL`) macht der Vorstrahl keinen Schaden; Test zählt ein Schadensereignis je Ziel | erledigt (vorher), abgesichert |
| 25 | Wurfweiten-Deckel | Lebensdauer ≥ Flugzeit über ebenem Grund (2·v_auf/g × 1,25); Fassung 20: 137 von 279 Kombinationen (3 Klassen, 45°, Kraft 100, Karte 2560) zu kurz, Fassung 21: 0 | erledigt (andere Kartengrößen nicht einzeln gemessen) |

## (10) Messverfahren für Zünderwaffen

1. Der Audit (E3) maß Zünder mit 0,17 bis 0,45 × Stufenmedian. Ursache war nicht das Verfahren, sondern die Armierung (Granate sank 0,3 px je Takt und zündete außerhalb
   des Radius, `docs/balance-auslese/zuender-test.md`); Fassung 6 behebt das.
2. Verfahren heute: `messeWaffe` wählt Kandidaten (Winkel × Kraft) über `aimPreview` (bildet den Zünder nicht ab, für die Auswahl genügt der Aufprallpunkt) und
   schießt die besten drei wirklich; gezählt wird der Verlust des Ziels nach Ablauf des Zünders (900 Takte Wartezeit). Gültig seit Fassung 6, weil die armierte Granate liegen bleibt.
3. Messung Fassung 20 → 21 (Bestwert, Fernkampf-Schütze, Ziel 1000 LP): Kaktusbombe 73,5 → 75,2; Pömpel 46,6 → 53,8; Impulsbombe 110,3 → 111,9 (nur bei 40 px, sonst 65 → 67);
   Splittergranate 45,1 → 51,6; Handgranate 0 → 64,9 (Radius war 0); Bananengranate 56,9 → 63,6; Molotowcocktail 62,5 → 68; Roboterbombe 55,2 → 63,3; Giftwolke 45,6 → 48,2;
   Tentakelgift 44,3 → 48,4; Wassermelone 75,1 → 86,6. Gegen die Stufenmediane (rare 56,3, uncommon 55,5, epic 77,9) liegen alle elf damit im Band 0,86 bis 1,5 (Impulsbombe-Ausreißer
   bei 40 px 1,99). Die Zünderwaffen sind heute keine Schwächlinge mehr; die Anhebung ist ein Feinschritt.
4. Zündzeit: Eingabe `zuendzeit` (1, 3, 5; sonst Katalogwert) in `fire` / `input`; `validation.js` und `shooting.js` lehnen andere Werte ab; Replay-Eintrag trägt das Feld nur bei Wahl.
   Bedienung: Taste Z, Knopf `#hud-zuendzeit` (Tab/Enter, `aria-label`, Ansage im Protokoll), Touch-Knopf; Anzeige „Zünder N s“ im HUD.

## Nachtrag 2026-11-12: Waffenfassung 22, Wurfmine im Bogen

Auftrag: geworfene Mine und geworfenes Fass fliegen im Bogen wie ein Stein (Schwerkraft, Wind). Regeländerung hinter der Marke `config.waffen` = 22
(Standard); Fassung 21 und älter bleiben bitgleich (`tests/waffen-fassung22.test.js`, Schicht-Vergleich aller 150 Waffen).

| Teil | Stand |
|---|---|
| Mine als Geschoss | umgesetzt und getestet (Flug, Aufprallpunkt, kein Schaden, Besitzer/Team, deterministisch, ohne Bodenobjektfassung kein Objekt) |
| Aufprall legt Objekt | `ProjectileSystem` → `services.match.landeAlsObjekt` → `BodenobjektSystem#setzeAn` |
| Wurffass | Fähigkeit `landetAls: 'fass'` vorhanden (Datenänderung genügt); **keine Waffe**, weil der Katalog genau 150 Plätze hat. **Auftraggeber 2026-11-12: Wurffass entfällt, die 150 Waffen bleiben** (keine Waffe wird gestrichen; die Fähigkeit `landetAls: 'fass'` bleibt ungenutzt im Code) |
| Fass als Kiste | besteht seit Bodenobjektfassung 4 (fällt wie eine Kiste vom Himmel) |
| Nicht geprüft | Aussehen des fliegenden Geschosses im Browser (der Animationsstrang kennt den Wirkpfad der Mine noch nicht, Rückfall auf das Standardgeschoss), Klang |

## Nachtrag 2026-11-12: Bilder und Klang der geänderten Waffen (Client/Assets)

| Teil | Stand |
|---|---|
| Funkenkugel `pa_079` | neues Icon (Runware `openai:gpt-image@2`, Magenta-Grund) in Quelle, 64-px-Icons, Hand-/Silhouetten-/Icon-Zelle; eigene Geschosszelle (`plasma`, Schweif Funkeln) |
| Wurfmine `pa_127` | Geschosszelle `mine` (Art `stein`, taumelt); Rolle Aufstellobjekt, Wirkpfad Projektil (einzige Ausnahme in `tests/waffen-rollen.test.js`). Das Handbild/Icon ist noch die Teleportplattform (Mine hat kein eigenes Icon) |
| `pa_134`/`pa_135`/`pa_139` | Geschosszellen `bombe`, `meteor`, `hoellenkugel`; Wirkpfad Projektil |
| Rollentabelle/Manifest | neu erzeugt (`npm run waffen:rollen`): 100 Geschossbilder, 92 Projektilpfade; `FASSUNG21_BILDRUECKSTAND` leer |
| Klang | `pa_079` blitz, `pa_127` wurf (Abwurf), neues Ereignisprofil `mine_scharf` bei `mine_placed` (Aufsetzen und Scharfschalten fallen zusammen: jede Mine ist sofort scharf), Himmelswaffen rakete/schwer fest zugeordnet. **Klangabnahme offen** (nur Messung, kein Gehör) |
| Werkzeug | `scripts/sprites-erzeugen/waffen-fassung21-bilder.py` (Erzeugung), `scripts/waffen-fassung21-einsetzen.py` (gezieltes Einsetzen, andere Zellen bleiben bitgleich) |
