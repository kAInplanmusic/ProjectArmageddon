# Hunter-Nachzug — der Werkzeugstand: ein MCP-Server, der seine eigene Veraltung meldet

**Rolle:** Worker A (O10) — Selbst-Erklärung des Audit-MCP
**Stand:** 2026-09-27 · **Arbeitsort:** `tools/audit-mcp/**` (nur dort geschrieben)
**Belegpflicht:** jede Zahl unten stammt aus einem Zugriff dieses Durchgangs; die
Befehle stehen wörtlich daneben.

---

## 0. Das Problem, in einer Zeile

Ein MCP-Server ist ein **langlaufender Prozess**: er lädt `lib/**` und
`server.mjs` EINMAL und antwortet danach mit dem Code von vor seiner eigenen
Reparatur — mit voller Überzeugung. Belegt in
`docs/hunter-tools.md:26-40` und `tools/audit-mcp/README.md:105-134`:
`audit_events` meldete **43 / 27 undokumentiert** (alter Prozess) gegen
**47 / 0** (frische CLI). Die 27 „Befunde" haben einen ganzen Arbeitsdurchgang
gekostet und waren kein Produktmangel.

Bisher war die Antwort auf dieses Problem ein **Vorsatz** („nach jeder Änderung
neu starten"). Jetzt ist sie eine **Messung**, die an jeder Antwort hängt.

---

## 1. Was gebaut wurde

### 1.1 `lib/stand.mjs` — der Code-Fingerabdruck

- Beim Prozessstart (Modulauswertung) wird über **`tools/audit-mcp/lib/*.mjs` +
  `server.mjs`** je Datei ein SHA-256 gebildet und daraus ein Gesamtfingerabdruck
  (`sha256` über die sortierten `datei hash`-Zeilen).
- Die Dateiliste ist **keine feste Aufzählung**: eine neu hinzugekommene
  `lib/*.mjs` ändert den Fingerabdruck (gemessen, siehe §3 Fall 3).
- **Fail-safe:** eine unlesbare Datei ist eine **Abweichung**, nie ein
  Gleichstand. Wer den Stand nicht messen kann, meldet „NICHT messbar" — der
  lautere Fehler, dieselbe Regel wie beim Doppelregel-Freispruch.
- Gemessen wird über **8 Dateien**: `lib/bericht.mjs`, `lib/dynamisch.mjs`,
  `lib/gates.mjs`, `lib/katalog.mjs`, `lib/repo.mjs`, `lib/stand.mjs`,
  `lib/statisch.mjs`, `server.mjs` (Ausgabe von `audit_stand.fingerabdruckUeber`).

### 1.2 Der Fingerabdruck an JEDER Antwort (`werkzeugStand`)

Zentral in `server.mjs` (`mitStand()`), an der einen Stelle, durch die alle
Werkzeugantworten laufen — kein Werkzeug kann ihn vergessen. Er steht auf drei
Wegen am Ergebnis:

1. als Feld `werkzeugStand` **im JSON-Ergebnis** (maschinell lesbar),
2. als `_meta.werkzeugStand` am MCP-Result (protokollkonform),
3. als **zusätzlicher Textblock am Anfang** der Antwort — aber nur, wenn der
   Prozess veraltet ist, dann im Wortlaut:

   ```
   ⚠ Dieser Server läuft mit altem Code — Neustart nötig
   ```

Zusätzlich nennt der `initialize`-Handschlag seinen Stand
(`serverInfo.stand.{hash,prozessStart}`) und `--liste` den Stand der antwortenden
Instanz.

```json
"werkzeugStand": {
  "hash": "8e51335c…",            // Fingerabdruck DIESES Prozesses
  "prozessStart": "2026-09-27T01:42:00.611Z",
  "dateienGehasht": 8,
  "platteHash": "8e51335c…",      // was JETZT auf der Platte liegt
  "veraltet": false,
  "urteil": "läuft mit dem Code, der jetzt auf der Platte liegt"
}
```

### 1.3 Werkzeug `audit_stand` — Prozess gegen Platte

Stellt beide Stände gegenüber und nennt bei Abweichung **Datei für Datei**,
warum:

| Feld | Bedeutung |
|---|---|
| `abweichung` | `true`, sobald irgendetwas nicht stimmt |
| `geaendert` | Datei mit `prozessSha256` vs. `platteSha256` |
| `neuAufDerPlatte` | `lib/*.mjs`, die der Prozess nie geladen hat |
| `nurImProzess` | Datei, die geladen wurde und jetzt fehlt |
| `unlesbar` | Datei(en), die auf einer der beiden Seiten nicht lesbar war (`{datei, seite, fehler}`) |
| `meldung` / `meldungAscii` | die Warnung im Wortlaut (+ ASCII-Fassung, weil eine Warnung, die nur als „läuft" ankommt, keine Warnung ist) |
| `regel`, `neustart` | die Regel und der Befehl (`node tools/audit-mcp/server.mjs` · in Hermes: Verbindung trennen und neu aufbauen) |

### 1.4 Die zwei Gegenproben (Exit-Code 1, sobald eine Erwartung verletzt ist)

```bash
node tools/audit-mcp/probe-stand.mjs            # 10 Erwartungen, alle erfüllt
node tools/audit-mcp/probe-checks-messwert.mjs  # 6 Erwartungen, alle erfüllt
```

`probe-stand.mjs` startet den Server als **echten MCP-Prozess** (stdio,
JSON-RPC) auf einer **Kopie** unter `/tmp` (`tools/audit-mcp` kopiert, `src`,
`tests`, `scripts` verlinkt — der echte Baum wird für die Probe nicht angefasst)
und ändert dann Dateien **unter** dem laufenden Prozess.

---

## 2. Reparatur: der tote Messwert des `checks`-Gates

**Ursache (gelesen, nicht geraten):** `lib/gates.mjs` suchte in der
`checks`-Ausgabe nach `OK|FEHLGESCHLAGEN`. `scripts/checks.mjs:81-86` druckt aber

```
ok   check:docs                383 ms  Zahlen in der Doku
FEHL check:docs                383 ms  Zahlen in der Doku
21 Gates in 66.3 s | fehlgeschlagen: 0
```

Also 0 Treffer — das Gate meldete `kennzahlen = {"zeilen": 0}`. Gemessen mit
einem echten Lauf **vor** der Reparatur:

```bash
node tools/audit-mcp/server.mjs --ruf audit_gates '{"welche":["checks"],"timeoutMs":300000}'
# → VORHER kennzahlen: [{ "gate": "checks", "kennzahlen": { "zeilen": 0 }, "ok": true, "exitCode": 0 }]
```

**Was jetzt gelesen wird:** Gate-Zeilen der Form
`^(ok|FEHL)\s+<skript>\s+<dauer> ms` — der Zwang auf **Skriptname + Millisekunden**
schließt die Klartext-Ausgabe eines fehlgeschlagenen Werkzeugs aus, die darunter
steht und selbst „FEHL" enthalten kann. Dazu die **Summenzeile** als
unabhängige Gegenprobe; weichen Zählung und Summe ab, steht ein `hinweis` im
Ergebnis. Findet die Regex **gar nichts**, ist das ein Befund über das Format
(`hinweis`: „NICHT lesbar … Die Zahlen sind damit nicht gemessen — nicht null").
Ein leerer Messwert ist keine Null, sondern eine kaputte Messung.

### Beleg: echter Lauf NACH der Reparatur

```bash
node tools/audit-mcp/server.mjs --ruf audit_gates '{"welche":["checks"],"timeoutMs":300000}'
```

```json
{
  "gate": "checks", "ok": false, "exitCode": 1,
  "kennzahlen": {
    "zeilen": 21,
    "bestanden": 20,
    "fehlgeschlagen": 1,
    "fehlgeschlageneWerkzeuge": ["check:docs"],
    "gatesLautSumme": 21,
    "dauerSekunden": 61.4,
    "fehlgeschlagenLautSumme": 1
  }
}
```

Zählung (1) und Summenzeile (1) stimmen überein. Der reparierte Messwert hat
sofort etwas gefunden, was vorher unsichtbar war: `check:docs` ist in diesem
Lauf **rot** („README: 28 E2E-Spezifikationen — wirklich 30"). Diese Rötung
stammt **nicht** aus diesem Arbeitsort — sie kommt aus parallel laufender
Arbeit an `tests/e2e/` / Root-`README.md` (um 03:34 lief `npm run checks` noch
mit 21/0 durch, um 03:50 mit 20/1). Der Messwert ist echt; das Urteil über
`check:docs` gehört dem Worker, der die E2E-Spezifikationen hinzufügt.

---

## 3. Belegausgabe `probe-stand.mjs` (Auszug, vollständig: 10/10 OK)

```
OK   1a) Handschlag nennt den Fingerabdruck des antwortenden Codes
     GEMESSEN: hash = 8e51335c7c914bac… (64 Zeichen) · prozessStart = 2026-09-27T01:41:51.078Z
OK   1b) audit_stand, unberührter Baum → KEINE Abweichung
     GEMESSEN: abweichung = false · geaendert = [] · unlesbar = []
OK   1c) Jede Werkzeugantwort trägt `werkzeugStand` (hier: audit_status)
     GEMESSEN: nutzlast.werkzeugStand.hash = 8e51335c… · _meta vorhanden = true · veraltet = false
OK   1d) Auch ein Fehlerergebnis trägt den Fingerabdruck (Textpfad, kein JSON)
     GEMESSEN: isError = true · _meta vorhanden = true · enthält werkzeugStand = true
OK   2a) Geänderte lib/gates.mjs → LAUTE Meldung im Wortlaut
     GEMESSEN: abweichung = true · Meldung im Wortlaut = true · ASCII = true · geaendert = ["lib/gates.mjs"]
OK   2b) Der Fingerabdruck steht auch am Telegramm dieser Antwort …
     GEMESSEN: veraltet = true · prozessHash8e51335c ≠ platteHash23936c50
               Kopfblock = "⚠ Dieser Server läuft mit altem Code — Neustart nötig"
OK   2c) Auch ein ANDERES Werkzeug im veralteten Prozess warnt an seiner eigenen Antwort
     GEMESSEN: veraltet = true
OK   3) Neu hinzugekommene lib/*.mjs → Abweichung
     GEMESSEN: neuAufDerPlatte = ["lib/zz-probe-neu.mjs"]
OK   4) Unlesbare Datei bei sonst identischem Baum → Abweichung, NICHT „gleich"
     GEMESSEN: vorher = false · nachher = true · unlesbar = ["lib/repo.mjs(jetzt,EACCES)"]
OK   5) Frischer Prozess auf dem GEÄNDERTEN Baum → wieder „gleicher Code"
     GEMESSEN: abweichung = false · alter Prozesshash = 8e51335c7c91 · neuer = b98fc9666888
```

Fall 4 ist der wichtigste: `chmod 000` auf **eine** Datei bei sonst identischem
Baum, und der Prozess sagt **nicht** „gleich", sondern nennt die Datei, die
Seite (`jetzt`) und den Grund (`EACCES`).

---

## 4. Was ein Nutzer jetzt tun kann

```bash
# Läuft der antwortende Prozess mit dem Code, der auf der Platte liegt?
node tools/audit-mcp/server.mjs --ruf audit_stand

# Was antwortet überhaupt? (Werkzeuge + Fingerabdruck der Instanz)
node tools/audit-mcp/server.mjs --liste

# Gegenproben (Exit 1 bei verletzter Erwartung)
node tools/audit-mcp/probe-stand.mjs
node tools/audit-mcp/probe-checks-messwert.mjs
```

Im MCP-Betrieb genügt ein Blick in **jede** Antwort: steht dort
`werkzeugStand.veraltet: true`, gilt das Ergebnis als verdächtig, und der Server
muss neu gestartet werden. Der Aufruf `audit_stand` liefert zusätzlich die
Datei, die den Unterschied macht.

---

## 5. Offen / nicht in diesem Auftrag

- **Grün ist keine Wahrheit über „alt".** Ein veralteter Prozess kann zufällig
  dieselben Zahlen liefern (z. B. wenn nur `bericht.mjs` geändert wurde). Der
  Fingerabdruck misst **Identität des Codes**, nicht die Richtigkeit jeder
  Aussage — er ist eine notwendige, keine hinreichende Prüfung.
- **`check:docs` rot** (28 vs. 30 E2E-Spezifikationen) stammt aus paralleler
  Arbeit; siehe §2.
- Ein **Neustart des produktiven MCP-Prozesses in Hermes** ist Teil dieses
  Nachzugs: solange der Knoten `audit` nicht neu verbunden ist, läuft er weiter
  ohne `audit_stand` und ohne `werkzeugStand`.
