/**
 * Replay-Steuerung im Menü: Dateiauswahl, Knöpfe, Tempo und Stellenregler.
 *
 * ## Was hier drin ist
 *
 * Die Verdrahtung der Wiedergabe-Bedienung. Die Dateiauswahl liest die
 * Aufzeichnung im Browser (FileReader) — es wird nichts hochgeladen. Eine
 * Aufzeichnung enthält nur Seed und Eingaben, also wenige Kilobyte.
 *
 * ## Warum ausgezogen
 *
 * Die Verdrahtung ist reine DOM-Arbeit ohne Spielzustand; sie stand in
 * `main.js` mitten zwischen Match-Start, Netzwerk und Anzeige. Zusammen mit dem
 * Zeilenbudget (`tests/zeilenbudget.test.js`) gehört sie in eine eigene Datei:
 * Wer die Bedienung ändert, muss dann nicht durch 4000 Zeilen Spielsteuerung.
 *
 * ## Verhältnis zu `main.js`
 *
 * Das Modul importiert `main.js` NICHT. Es bekommt das Spielobjekt und ruft
 * dessen öffentliche Wege (`loadReplayDocument`, `replayAction`, `replaySeek`);
 * Statusanzeige und Protokoll kommen als Rückrufe herein. Das Verhalten ist
 * unverändert: dieselben Elemente, dieselben Ereignisse, dieselbe Reihenfolge.
 *
 * @module client/replayBedienung
 */

/**
 * Verdrahtet die Replay-Steuerung im Menü.
 *
 * @param {object} spiel - Spielinstanz aus `main.js`
 * @param {object} [optionen]
 * @param {Document} [optionen.dokument]
 * @param {(zusatz?: string|null) => void} [optionen.setzeStatus] - Statuszeile der Wiedergabe
 * @param {(text: string, art: string) => void} [optionen.melde] - Protokoll (HUD)
 */
export function bindeReplayBedienung(spiel, {
  dokument = globalThis.document,
  setzeStatus = () => {},
  melde = () => {},
} = {}) {
  const datei = dokument?.getElementById?.('replay-file');
  datei?.addEventListener('change', async () => {
    const gewaehlt = datei.files?.[0];
    if (!gewaehlt) return;
    try {
      const text = await gewaehlt.text();
      if (await spiel.loadReplayDocument(JSON.parse(text))) {
        setzeStatus(`Geladen: ${gewaehlt.name}`);
      }
    } catch (error) {
      setzeStatus(`Konnte die Aufzeichnung nicht lesen: ${error.message}`);
      melde(`Replay nicht lesbar: ${error.message}`, 'danger');
    }
  });

  dokument?.getElementById?.('replay-toggle')?.addEventListener('click', () => spiel.replayAction('toggle'));
  dokument?.getElementById?.('replay-restart')?.addEventListener('click', () => spiel.replayAction('restart'));
  dokument?.getElementById?.('replay-back')?.addEventListener('click', () => spiel.replayAction('step', -60));
  dokument?.getElementById?.('replay-forward')?.addEventListener('click', () => spiel.replayAction('step', 60));

  const tempo = dokument?.getElementById?.('replay-speed');
  tempo?.addEventListener('input', () => {
    spiel.replaySpeed = Number(tempo.value) || 1;
    const anzeige = dokument.getElementById('replay-speed-value');
    if (anzeige) anzeige.textContent = `${spiel.replaySpeed}×`;
    setzeStatus();
  });

  /*
   * Der Stellenregler springt. Das Neuberechnen kostet Rechenzeit, deshalb
   * passiert es erst beim Loslassen (`change`) und nicht bei jeder Bewegung
   * (`input`) — sonst würde beim Ziehen hundertmal neu gespult.
   */
  dokument?.getElementById?.('replay-seek')?.addEventListener('change', () => {
    if (!spiel.replayPlayer) return;
    const anteil = Number(dokument.getElementById('replay-seek').value) / 1000;
    spiel.replaySeek(Math.round(anteil * spiel.replayPlayer.totalTicks));
  });
}

export default { bindeReplayBedienung };
