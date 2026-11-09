# Hymnen: Steuerung und Hörabnahme (A14, A15)

Stand: 2026-11-09 · Branch `bg/praesentation` · Quelle: `docs/fraktions-optik-audit-2026-11-08.md`
(Zeilen A14/A15)

Dieses Blatt hält fest, wie die Fraktionshymnen heute gesteuert werden (A14), was
die neun Dateien messbar hergeben (A15) und was offen bleibt. **An den
Musikdateien wurde nichts geändert** — die Messung ist eine Abnahme des
Vorhandenen, keine Neuproduktion.

## 1. A14 — Kaderreiter an der Hymnensteuerung

### Weg

```
Kaderreiter (kaderansicht.js)  ──┐
Fraktionsfeld im Menü (main.js) ─┼─► Musik.waehleHymne(id)
                                 │        ├─ setzeHymne(id)   (Wahl, Zustand)
                                 │        └─ freigeben()      (Geste, Bus)
                                 └─► Hymne klingt über den Musik-Bus
```

- `buildRosterView({ hymneWaehlen })` reicht die Fraktions-ID des angeklickten
  Reiters weiter (`hymneWaehlen?.(fraktion.id)`). Ohne Rückruf bleibt der Kader
  reine Anzeige — die Ansicht ist auch ohne Musik benutzbar.
- `Musik.waehleHymne(id)` ist der **Gesten-Weg**: Wahl setzen und Wiedergabe aus
  derselben Geste freigeben. Beides getrennt aufzurufen wäre falsch — die
  Freigabe braucht eine Nutzergeste, und der Reiterklick ist eine.
- Das Fraktionsfeld im Menü geht denselben Weg (`change` = Geste). Damit gibt es
  **eine** Stelle, die über Start und Überblendung entscheidet, statt zweier
  Pfade mit leicht verschiedenen Regeln.
- Der Kader ist und bleibt reine Anzeige: Er ändert **nicht** die Fraktion für
  das Match. Das tut weiterhin nur das Fraktionsfeld.

### Was die Steuerung zusichert

| Zusage (A14) | Umsetzung | Nachweis |
|---|---|---|
| 1–2 s Überblendung | `UEBERBLENDUNG_S = 2`, Ein- und Ausblenden gleich lang | `tests/hymnen-steuerung.test.js`: Rampenzeit 2 s auf beiden Seiten |
| Kein Neustart bei derselben Fraktion | `setzeHymne` bricht bei unveränderter Wahl ab, bevor irgendetwas geladen wird | derselbe Klick: `starts`, `ueberblendungen`, `currentTime` und `src` unverändert |
| Nutzergeste | kein Ton vor `freigeben()`; `waehleHymne` gibt in derselben Geste frei | Test „Hymne erklingt erst mit der Geste"; im Browser: synthetischer Klick (`element.click()`) startet nichts, echter Mausklick schon |
| Stummschaltung | `setzeAn(false)` pausiert; die Wahl bleibt gespeichert und setzt beim Einschalten fort (kein Neustart) | Test „bei Musik aus …" + Browser: `an:false → hymn: xeno, spielt:false → an:true → hymn-xeno, starts unverändert` |
| Höchstens eine Hymne | Zwei-Slot-Wiedergabe mit Kreuzblende | Test: nach der Blende genau ein `paused:false` |

### Zwei Fehler, die bei der Anbindung auffielen (behoben)

1. **Mehrfachstart durch Mehrfach-Gesten.** `freigeben()` war nicht
   wiedereintrittsfest: `#gestartet` wurde erst nach `await starte()` gesetzt.
   Ein Klick erreicht aber `pointerup`- und `click`-Hörer, seit A14 zusätzlich
   die Fraktionswahl — im Browser waren es **fünf Starts und fünf Busse** für
   einen Klick (die Hymne lief mehrfach übereinander, entsprechend lauter).
   Jetzt wird die laufende Freigabe geteilt (`#freigabe`).
2. **Wahl gegen Stummschaltung verloren.** `#setzeFort` nahm jedes laufende
   Menüstück an, auch wenn inzwischen eine Hymne gewählt war; beim Einschalten
   lief weiter die alte Menümusik. Außerdem zählte ein `AbortError` (Pause
   während des Ladens) als Dateifehler und warf die Hymne weg. Beides behoben
   (`#passtZumWunsch`, `istAbbruch`), beide Fälle haben einen Test.

### Im Browser geprüft (Vite `:5199`, `?musik=1`, echter Mausklick)

| Schritt | `hymne` | `id` | `starts` | `überblendungen` | `spielt` |
|---|---|---|---|---|---|
| Reiter „pixel" | `pixel` | `hymne-pixel` | 2 (1× Menümusik der ersten Geste, 1× Hymne) | 1 | ja |
| derselbe Reiter erneut | `pixel` | `hymne-pixel` | 2 | 1 | ja |
| Reiter „undead" | `undead` | `hymne-undead` | 3 | 2 | ja |
| stumm | `xeno` | `hymne-xeno` | unverändert | unverändert | nein |
| wieder an | `xeno` | `hymne-xeno` | unverändert | unverändert | ja |

Der eine Zwischenstart bei der allerersten Geste ist gewollt: Die
Autoplay-Regel startet die Menümusik an der ersten Geste, der Reiterklick
blendet unmittelbar darauf zur Hymne über. Danach ist jeder Wechsel genau ein
Start.

## 2. A15 — Hörabnahme der neun Dateien

### Verfahren

Gemessen mit `ffmpeg` (EBU R128, `ebur128=peak=true`), `silencedetect` und
PCM-Auswertung (RMS je Fenster) auf den Dateien in
`src/client/assets/music/fraktionen/`. Alle Dateien: MP3, 48 kHz, Stereo,
96,5–115,1 kbit/s. Reproduzierbar mit:

```bash
ffmpeg -i <datei>.mp3 -af ebur128=peak=true -f null -
ffmpeg -i <datei>.mp3 -af silencedetect=noise=-50dB:d=0.05 -f null -
```

Eine **subjektive** Hörprüfung (Klangbild, Instrumentierung, „passt zur
Fraktion") ist damit nicht ersetzt — sie steht unter „offen".

### Messwerte

| Fraktion | Dauer s | I LUFS | LRA LU | TP dBTP | Stille Anfang ms | RMS 1. s | RMS letzte 0,25 s |
|---|---:|---:|---:|---:|---:|---:|---:|
| beasts | 33,4 | −15,3 | 2,2 | −1,8 | 51 | −24,8 | −28,3 |
| datacult | 72,0 | −15,2 | 5,7 | −1,1 | 97 | −18,4 | −41,7 |
| machina | 72,0 | −14,8 | 4,2 | −1,0 | 91 | −24,0 | −51,8 |
| pirates | 30,1 | −15,4 | 1,5 | −2,1 | 60 | −46,4 | −37,4 |
| pixel | 22,1 | −14,5 | 1,9 | −1,7 | 51 | −19,7 | −31,7 |
| rodentia | 77,0 | −15,0 | 4,8 | −1,2 | 81 | −19,6 | −55,9 |
| shinobi | 48,1 | −14,5 | 4,1 | −0,8 | 87 | −20,6 | −17,6 |
| undead | 74,8 | −14,1 | 2,9 | −1,2 | 91 | −20,3 | −60,6 |
| xeno | 72,2 | −15,3 | 6,2 | −0,7 | 88 | −24,0 | −27,8 |

### Bewertung

- **Lautheit:** 14,1 bis 15,4 LUFS integriert — 1,3 dB Streuung über neun
  Stücke. Das ist innerhalb der üblichen Streaming-Toleranz und braucht keine
  Nachbearbeitung. Die Musik läuft zusätzlich über den Musik-Regler (Vorgabe
  0,35) und den Limiter des Mischers; die 1,3 dB sind also relativ, nicht absolut.
- **Spitzen:** True Peak −0,7 bis −2,1 dBTP. Keine Übersteuerung, kein
  Inter-Sample-Clipping; mindestens 0,7 dB Luft zum Vollausschlag.
- **Anfang:** 51–97 ms Stille (Encoder-Delay plus gewollter Ansatz). Die ersten
  250 ms liegen zwischen −19 und −53 dB RMS — kein Stück beginnt mit einem
  Schlag ins Ohr. Der Spieler blendet ohnehin ein (0,4 s beim ersten Stück, 2 s
  im Wechsel), der Anfang ist damit sauber.
- **Schluss:** Hier sind die Dateien **nicht** gleich. machina, rodentia und
  undead laufen in den letzten 250 ms auf −52 bis −61 dB aus (weiches Ende),
  datacult auf −42 dB. beasts, pixel, pirates, shinobi und xeno enden auf
  −17 bis −37 dB, also **auf Pegel** — ein harter Schnitt wäre dort hörbar.
- **Loopfähigkeit:** Keine Datei ist nass loopbar; die Enden sind komponierte
  Schlüsse, keine Nahtstellen. Der Spieler restartet deshalb nicht nass,
  sondern blendet 2 s vor dem Ende in den nächsten Durchlauf über
  (`#beiZeit` → `#spieleNaechstes`). Damit ist der Loop sauber, kostet aber
  die letzten ≤ 2 s jedes Durchlaufs. Für Menü-Hymnen ist das vertretbar; für
  einen Sieg-Jingle wäre es falsch (siehe unten).
- **Verschiedene Längen sind kein Fehler.** 22,1 s (pixel) bis 77,0 s
  (rodentia) sind gewollt; die Steuerung hängt nicht an einer festen Länge,
  sondern liest `duration` und fällt auf die Manifest-Dauer zurück, falls die
  Metadaten noch fehlen.

## 3. Sieg-Jingle — Anforderung, nicht gebaut

A15 verlangt einen **eigenen** Sieg-Jingle von 4–8 s, damit nicht jede Hymne im
Match dauernd neu startet. Stand heute:

- Im Match klingt **keine** Hymne: `setzeStimmung('match')` setzt die Wahl auf
  `null`, die Hymne klingt über das Match-Stück aus. Damit ist der zweite Teil
  der Anforderung (kein Dauer-Neustart) bereits erfüllt und getestet.
- Ein Jingle existiert **nicht** — weder Datei noch Manifest-Eintrag noch
  Abspielweg. Er wurde bewusst nicht erfunden: Eine 4–8-s-Datei wäre neue
  Musik, und Musikdateien zu ändern war ausgeschlossen.
- Wenn die Datei vorliegt, ist der Anschluss klein: ein Feld
  `sieg: { datei, dauer }` im Hymnen-Manifest, ein `spieleJingle()` neben
  `waehleHymne()`, das **einmal** startet (kein `ended`-Nachschlag, kein Loop),
  die Musik für die Dauer duckt und danach in die Match-Stimmung
  zurückblendet. Der Messmaßstab für die Datei steht oben: −15 LUFS ±1 dB,
  TP ≤ −1 dBTP, Anfang < 100 ms Stille, Ende auf Pegel ist hier erlaubt
  (der Jingle endet, er loopt nicht).

## 4. Offen

1. **Subjektive Hörprüfung** der neun Hymnen (Klangbild, Wiedererkennbarkeit,
   Passung zur Fraktion) durch einen Menschen — diese Abnahme ist messtechnisch,
   nicht ästhetisch.
2. **Sieg-Jingle 4–8 s** als eigene Datei plus Anschluss (Abschnitt 3).
3. Optional: `beasts`, `pirates`, `shinobi` und `xeno` enden auf Pegel. Solange
   nur überblendet wird, ist das folgenlos; wer je nass loopen will, braucht
   dort ein 2–3 s längeres Ausfaden oder eine neu geschnittene Naht.
