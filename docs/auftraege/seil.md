# Auftrag: Seil — das Ninja Rope aus Worms, eins zu eins

*Stand: 2026-10-29 · Status: **nichts gebaut.** Vorgabe des Auftraggebers: gleiche Physik, gleiche Handhabung wie
Worms. Eigene Ausdenkereien (Pendelmodell, Messskript, Tastenvorschläge) sind verworfen und gelöscht.*

## 1. Was belegt ist (Quellen: Worms Knowledge Base `worms2d.info/BattyRope`, Worms Wiki Fandom)

- Das Ninja Rope ist ein Bewegungswerkzeug: Es wird an einen Punkt geschossen und zieht die Figur dorthin.
- **Maximale Länge je Kraftstufe** (Worms Armageddon): Stufe 1 = 294–297 px, 2 = 336–339, 3 = 378–381,
  4 = 420–423, 5 = 462–465 (unbegrenzte Neuwürfe).
- **Neu schwingen:** Mit der Feuertaste lösen, in der Luft erneut feuern, ohne weitere Munition. Wer den Boden
  berührt, verliert nicht genutzte Neuwürfe. Stufe 1 = 1 Schuss, 2 und 3 = 2, 4 = 3, 5 = unbegrenzt.
- **Handhabung:** Feuertaste schießt; Pfeiltasten ziehen bzw. geben Schwung; Feuertaste löst das Seil.
- **Waffen vom Seil:** Jede Waffe außer Nahkampf und Selbstmordbomber ist einsetzbar; Auswahl und Enter feuert.
  Bomben (Dynamit, Mine) lassen sich mit der Sprungtaste im Schwung fallen lassen.
- Kürzeres Seil = stärkerer Schwung (Worms Wiki, „Tips & Tricks“).
- Rope Knocking (anderen Wurm durch Anrempeln bewegen) existiert; Voreinstellung offline aus.

## 2. Was NICHT belegt ist — und deshalb nicht erfunden wird

Die Zahlen, die das Gefühl ausmachen, standen in keiner erreichbaren Quelle (die Seiten mit den Physikdaten sind
für mich gesperrt; Worms Armageddon ist nicht quelloffen):

- Geschwindigkeit, mit der das Seil verkürzt/verlängert wird,
- Beschleunigung des Schwungs durch die Pfeiltasten,
- Dämpfung, Schwerkraft im Verhältnis zu den Figuren, Verhalten beim Wickeln um Gelände,
- Abwurfwinkel des Seils (die Tabelle nennt 45° bzw. 90° als größtes Zielfenster je Stufe, gemessen von senkrecht
  nach oben),
- Fallschaden beim Loslassen.

**Ohne diese Werte ist „eins zu eins“ nicht herstellbar.** Möglichkeiten, sie zu bekommen: Messung an einer
installierten Worms-Armageddon-Version (Replays oder Einzelbildmessung) durch den Auftraggeber, oder eine
Quelle mit den Konstanten. Erst dann wird gebaut.

## 3. Einbau (am Code geprüft)

| Baustein | Fundstelle |
|---|---|
| Versionsmarke im Replay-Kopf | `config/bewegung.js`, `config/zugregeln.js`, `replay.js`, `match.js:610` |
| Figurenbewegung | `systems/bewegungSystem.js`, `characterSystem.js`, `physicsSystem.js` |
| Festes Gelände | `engine/boden.js` (`bodenNaheHoehe`, `isSolid`) |
| Zugregeln | `systems/zugSystem.js` |
| Eingaben, Server | `replay.js` (`kind`), `shared/validation.js`, `server/gameServer.js` |
| Menü | Waffenmenü mit Kategorien und Untermenü (Auftraggeber: Seil dort wählbar); Katalog nur über `scripts/build-weapon-catalog.mjs` |
| Zeilenbudget | `match.js` ≤ 2790 Zeilen (jetzt 2638) |

Regeln: keine Wanduhr/`Math.random` in `engine`/`shared`; alte Replays bit-identisch (Versionsmarke); Server prüft
jede Eingabe.
