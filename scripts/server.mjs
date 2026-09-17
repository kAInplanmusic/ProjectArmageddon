#!/usr/bin/env node
/**
 * Einstiegspunkt für den eigenständigen Server.
 *
 * ## Warum diese Datei existiert
 *
 * `src/server/gameServer.js` bringt `startServer()` mit — und der Kommentar
 * darüber verweist auf „siehe npm run server". **Dieses Skript gab es nicht.**
 * Der Server war also betriebsreif gebaut (Port, Log-Level, Persistenz alle über
 * Umgebungsvariablen steuerbar), aber es fehlte der Weg, ihn zu starten.
 *
 * ## Aufruf
 *
 *     npm run server                 # Standard: Port 3000, nur lokal erreichbar
 *     PORT=8080 npm run server       # anderer Port
 *     HOST=0.0.0.0 npm run server    # von außen erreichbar (siehe Warnung)
 *
 * ## Umgebungsvariablen
 *
 * | Variable | Wirkung | Standard |
 * |---|---|---|
 * | `PORT` | TCP-Port | `3000` |
 * | `HOST` | Bindeadresse | `127.0.0.1` |
 * | `LOG_LEVEL` | `debug`…`error` | `info` |
 * | `LOG_FORMAT` | `json` oder `pretty` | `json` |
 * | `PA_PERSISTENCE` | `off` schaltet das Speichern ab | an |
 * | `PA_STATE_PATH` | Ablage der Lobby-Daten | `.pa-state/lobbies.json` |
 *
 * ## Warum `HOST` standardmäßig `127.0.0.1` ist
 *
 * Der Server hat **keine Anmeldung und keine Verschlüsselung**. Wer ihn auf
 * `0.0.0.0` bindet, macht ihn für jeden im Netz erreichbar — im offenen Netz
 * also für jeden überhaupt. Für einen echten Betrieb gehört davor ein
 * Reverse-Proxy mit TLS und Authentifizierung (siehe `docs/betrieb.md`).
 * Der Standard ist deshalb die sichere Seite.
 *
 * ## Würdevoller Abschluss
 *
 * `SIGINT` und `SIGTERM` werden abgefangen: Der Server speichert den Zustand
 * und schließt die Verbindungen, statt mitten im Schreiben abzubrechen. Ohne
 * das verlöre ein Neustart die laufenden Lobbys.
 */
import { startServer } from '../src/server/gameServer.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const statePath = process.env.PA_STATE_PATH ?? '.pa-state/lobbies.json';

/*
 * Die Prüfung der Bindeadresse steht VOR dem Start: Ein Server, der auf allen
 * Schnittstellen lauscht, ohne dass es jemand merkt, ist ein offenes Tor.
 */
if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
  console.warn('');
  console.warn('  ⚠  Der Server bindet auf "%s" — er ist damit von außen erreichbar.', host);
  console.warn('     Es gibt KEINE Anmeldung und KEINE Verschlüsselung.');
  console.warn('     Für einen echten Betrieb gehört ein Reverse-Proxy mit TLS davor.');
  console.warn('     Siehe docs/betrieb.md, Abschnitt "Sicherheit".');
  console.warn('');
}

/*
 * Die Signal-Handler werden VOR dem Start registriert.
 *
 * FUND (belegt): Sie standen am Dateiende, also NACH dem `await startServer()`.
 * Damit gab es ein Zeitfenster, in dem ein Signal den Prozess tötete, ohne dass
 * ein Handler ihn auffangen konnte — kein Speichern, keine Meldung.
 *
 * Gemessen (drei Läufe, Signal direkt nach der Startmeldung):
 *
 *     Lauf 1: exit=0,    Zustandsdatei vorhanden
 *     Lauf 2: exit=null, KEINE Datei        ← Prozess lief weiter
 *     Lauf 3: exit=null, KEINE Datei
 *
 * Praktische Folge: Wer den Server kurz nach dem Start stoppt (Strg+C,
 * `systemctl stop`, ein Container-Stop), verliert den Zustand — genau der Fall,
 * den diese Handler verhindern sollen.
 *
 * Jetzt steht `let laufend = null` vorher, und `beende()` prüft, ob der Server
 * überhaupt schon steht.
 */
let laufend = null;



process.on('SIGINT', () => beende('SIGINT'));
process.on('SIGTERM', () => beende('SIGTERM'));

try {
  const ergebnis = await startServer({ port, host, statePath });
  laufend = ergebnis.server;

  console.log(`ProjectArmageddon-Server läuft auf http://${host}:${port}`);
  console.log(`  Wiederhergestellt: ${ergebnis.restored ? 'Zustand geladen' : 'keine gespeicherten Lobbys'}`);
  console.log(`  Persistenz: ${process.env.PA_PERSISTENCE === 'off' ? 'AUS' : statePath}`);
  console.log(`  Beenden mit Strg+C.`);
} catch (fehler) {
  /*
   * Der häufigste Fehler beim Start ist ein belegter Port. Er wird im Klartext
   * gemeldet — eine rohe Ausnahme („EADDRINUSE") hilft niemandem.
   */
  if (fehler?.code === 'EADDRINUSE') {
    console.error(`Port ${port} ist bereits belegt.`);
    console.error('  Entweder den belegenden Prozess beenden oder einen anderen Port wählen:');
    console.error(`  PORT=8080 npm run server`);
  } else if (fehler?.code === 'EACCES') {
    console.error(`Keine Berechtigung für Port ${port}. Ports unter 1024 brauchen erhöhte Rechte.`);
  } else {
    console.error('Der Server konnte nicht starten:', fehler?.message ?? fehler);
  }
  process.exit(1);
}

/** Fährt den Server geordnet herunter. */
async function beende(signal) {
  console.log(`\n${signal} empfangen — speichere Zustand und schließe Verbindungen …`);
  try {
    /*
     * `close()` erledigt die ganze Reihenfolge: Persistenz anhalten, Zustand
     * sichern, Sitzungen beenden, Sockets schließen. Ein zweiter Aufruf von
     * `stopPersistence()` hier wäre doppelt — und ein doppelter Weg ist genau
     * die Falle, die dieses Projekt an mehreren Stellen behoben hat.
     */
    await laufend?.close?.();
    console.log('Beendet.');
    process.exit(0);
  } catch (fehler) {
    console.error('Fehler beim Beenden:', fehler?.message ?? fehler);
    process.exit(1);
  }
}

