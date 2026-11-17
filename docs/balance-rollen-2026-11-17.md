# Balancing je Rolle, Wiederholung im Menümodus (2026-11-17, QV-1)

Wiederholung von `docs/balance-rollen-2026-11-12.md` mit **einer** Änderung: Die Partien starten wie das Menü
mit autonomer Karte (`kartentyp: 'autonom'`, `src/shared/config/menueStart.js`). Der Lauf vom 12.11. startete ohne
`kartentyp`; dort gibt es kein Stofffeld, und das Biom hat keine Spielwirkung (Nachweis unten).
Keine Spielregel und kein Spielwert geändert. Nur Messung (Abschnitte 1 bis 3), Lesart getrennt (Abschnitt 4).

## 1 Nachweis

| Punkt | Wert |
|---|---|
| Aufruf | `node scripts/balance-rollen.mjs --stufe=standard --parallel=3 --ausgabe=docs/balance-rollen-2026-11-17.json` |
| Stand | `main` 7cfe72a1 plus QV-1 (Commit 2b8ebca0). Die Rohdatei meldet 2 ungespeicherte Dateien in `src`: `src/client/main.js` und `src/shared/config/menueStart.js`, beide nur Client bzw. Konstante, Engine unverändert |
| Laufzeit | 13 min 2 s (2 Kerne, 3 Prozesse) |
| Seeds, Karten, Bots | wie am 12.11. (Abschnitt 1 dort), also auch dieselben Grenzen: 6 wiederverwendete Seeds je Paarung, ein Bot für alle Rollen, keine Menschen |
| Rohdaten | `docs/balance-rollen-2026-11-17.json`, Feld `kartentyp` je Partie |

Gegenprobe zum Modus (Engine direkt, 2026-11-17): 21 Biom-Wahlen, Seed 20261111 und 4242, Bot-Duell 24:9 groß.
Ohne `kartentyp`: 1 Verlauf von 21 bei beiden Seeds. Mit `autonom`: 6 bzw. 7 verschiedene Verläufe von 21.
Gesichert durch `tests/messung-wie-menue.test.js`.

## 2 Klassen (Fassung 3), Bot statisch, 108 Partien

| Rolle | Siegrate 12.11. | Siegrate 17.11. | 95 %-Intervall 17.11. | Schaden/Zug 17.11. | Trefferquote | Ertrinken an Toden 12.11. → 17.11. |
|---|---:|---:|---|---:|---:|---|
| nahkampf | 50 % | 39 % | 25–55 % | 2,16 | 18 % | 81 % → 12 % |
| fernkampf | 50 % | 39 % | 25–55 % | 3,08 | 18 % | 69 % → 15 % |
| okkultist | 50 % | 72 % | 56–84 % | 3,76 | 24 % | 53 % → 7 % |

Erster Zug gewinnt in Spiegelduellen 59 % (95 %: 46–71 %, n = 54).

## 3 Weitere Module (17.11.)

| Modul | Partien | Befund |
|---|---:|---|
| Bot vorrückend | 36 | nahkampf 33 %, fernkampf 58 %, okkultist 58 %; Intervalle überlappen breit |
| Biome (klassisch, vulkan, eiswueste, schrott) | 48 | nahkampf 19 % (7–43 %), fernkampf 88 % (64–96 %), okkultist 44 % (23–67 %); n = 16 je Rolle |
| Alte Kombinationen (Fassung 2) | 180 | Spanne 12 % (scout/brawler) bis 72 % (heavy/occultist) |
| Reichweite | Rechnung | unverändert (reine Wurfweitenrechnung, nicht vom Kartenmodus abhängig) |

## 4 Lesart (keine Regeländerung)

- **Korrektur zum 12.11.:** „53–81 % der Tode durch Ertrinken“ war eine Eigenschaft der Einheitskarte ohne
  `kartentyp`, nicht des Spiels, das das Menü startet. Im Menümodus sind es 7–15 %. Abschnitt 7 Punkt 6 und die
  Biomzahlen des Berichts vom 12.11. gelten nicht.
- **Neues Signal:** Der Okkultist gewinnt im statischen Bot-Duell 72 %; das Intervall (56–84 %) schließt 50 % aus.
  Das ist ein Bot-Ergebnis mit wiederverwendeten Seeds, kein Spielerurteil, aber das erste Klassensignal, das
  über dem Rauschen liegt.
- **Biome trennen Rollen jetzt sichtbar** (fernkampf 88 % gegen nahkampf 19 % auf vier Biomen), bei n = 16 je Rolle
  aber nur als Hinweis lesbar.
- **Vorschlag:** Vor einer Klassenänderung die Stufe `breit` im Menümodus laufen lassen (mehr unabhängige Seeds) und
  mit Menschen gegenprüfen (QV-4 im Ratsbericht). Erst dann Werte drehen, mit Versionsmarke nach AGENTS.md §2.
