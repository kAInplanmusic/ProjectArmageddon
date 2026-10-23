# Gegenprüfung durch fremde Modelle — ProjectArmageddon

**Stand:** 2026-10-09 · **Zweck:** Kreuzvalidierung der Befunde aus
`01-verifizierte-befunde.md` durch unabhängige Modelle fremder Anbieter.

**Kostenrahmen:** Ausschließlich **kostenfreie Kanäle** (Pollinations). Kein bezahlter
Anbieter wurde verwendet.

---

## 1. Methode

Der kritischste Code-Abschnitt wurde **wortgleich** an mehrere Modelle geschickt, mit
einer offenen Frage — **ohne** ihnen mein Ergebnis zu nennen:

> „Analysiere diesen Ausschnitt eines WebSocket-Spielservers (Node.js, Bibliothek `ws`).
> Nenne MAXIMAL 3 konkrete Fehler oder Absturzrisiken. Je Befund eine Zeile mit Bezug
> und Begründung. Keine Einleitung, keine Zusammenfassung."

Geprüft wurde `src/server/gameServer.js` (Verbindungsaufbau `:1124-1148`,
Nachrichtenbehandlung ab `:1589`, Servererzeugung `:1106`).

**Wichtig:** Der übermittelte Ausschnitt war gekürzt (59 Zeilen). Das ist Teil des
Experiments — es zeigt, wie Modelle mit unvollständiger Lage umgehen.

---

## 2. Ergebnis

| Anbieter / Modell | Fehlender `socket.on('error')` gefunden? | Weitere Befunde |
|---|---|---|
| OpenAI · `gpt-6-astra` | **ja** | fehlendes `maxPayload` (100 MiB) |
| xAI · `grok-4.6` | **ja** | fehlendes `maxPayload`; Behauptung „Mengengrenze ohne `return`" (**widerlegt**, siehe §3) |
| Moonshot · `kimi-k3` | **ja**, als Befund 1 ausdrücklich benannt | — |

**Übereinstimmung: 3 von 3 Modellen** benennen unabhängig voneinander denselben
schwersten Fehler, zusätzlich stützen zwei davon den `maxPayload`-Befund.

Damit ist der Befund **A-1** dreifach abgesichert:
1. im Code gelesen und belegt (`gameServer.js:1130/1589/1966`, kein `error`-Listener),
2. **im Betrieb reproduziert** (4 Bytes ungültiges UTF-8 → Serverprozess beendet,
   `Unhandled 'error' event`, Exit-Code 1),
3. **von drei fremden Modellen unabhängig erkannt**.

---

## 3. Ein Fremdbefund wurde widerlegt — und das ist ein Ergebnis

Grok 4.6 behauptete:

> „`socket.on('message')`: bei `!mengenGrenze.erlaube()` nur Metrik, kein
> `return`/`close`/`terminate`; Limit wirkungslos, DoS möglich."

**Das ist falsch.** Im echten Code steht unmittelbar danach:

```js
if (mengenGrenze.verworfeneInFolge >= RATE_TRENNEN_NACH) {
  this.logger.warn('rate_limit_disconnect', 'Verbindung wegen Dauerüberlast getrennt', { … });
  socket.close(1008, 'Zu viele Nachrichten');
}
return;                                    // ← gameServer.js:1609
```

Der `message`-Handler **kehrt bei Überschreitung zurück** und trennt Dauerüberlaster
sogar (`RATE_TRENNEN_NACH`). Der Befund entstand, weil mein Ausschnitt mitten im Handler
endete — das Modell hat aus fehlender Information eine Behauptung gemacht, statt sie
zu kennzeichnen.

**Konsequenz für diesen Bericht:** Fremdmodelle sind eine gute Quelle für
**Hypothesen**, aber keine Beweisquelle. Jeder hier übernommene Befund ist am echten
Code oder durch einen Lauf belegt. Allein in diesem kleinen Test lag eine von vier
Fremdaussagen falsch.

---

## 4. Was die Gegenprüfung zusätzlich beigetragen hat

- **`maxPayload`** (von zwei Modellen unabhängig genannt) ist damit besser gestützt und
  steht als Befund **C-1a** in `01-verifizierte-befunde.md`.
- **Kein Widerspruch** zu irgendeinem meiner Befunde. Niemand hat behauptet, A-1 sei
  unproblematisch — es gab also keinen Gegenbeweis.

---

## 5. Sichtgrenzen dieser Gegenprüfung

- **Ein einziger Code-Abschnitt.** Nicht das ganze Projekt wurde gegengeprüft;
  Engine, Physik, Terrain und Client sind offen.
- **Drei Modelle, ein Anbieter-Kanal** (Pollinations). Weitere Anbieter (OpenRouter,
  DeepSeek, Google, Groq, Cerebras) sind erreichbar und noch nicht befragt.
- **Keine Wiederholung mit variierter Formulierung** — Prompt-Iteration mit mehreren
  Durchläufen und Streuungsmessung steht noch aus.
- Der `kimi-k3`-Lauf endete bei 500 Tokens mitten im zweiten Befund (`finish_reason:
  length`) — sein zweiter Punkt ist unvollständig und wird hier nicht gewertet.

---

## 6. Nächste Schritte

- [ ] Gegenprüfung auf **Engine/Physik/Terrain** ausweiten (dort ist der Bericht des
      abgebrochenen Laufs verloren gegangen)
- [ ] Zwei bis drei **Prompt-Varianten** je Modell, um Antwortstreuung sichtbar zu machen
- [ ] Weitere Anbieter einbeziehen (kostenfrei: Groq, Cerebras, Google-Freikontingent)
- [ ] Fremdbefunde grundsätzlich erst nach Verifikation übernehmen
