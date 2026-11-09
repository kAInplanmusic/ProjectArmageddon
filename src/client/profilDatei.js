import { sicherungAlsText } from '../shared/identity.js';

/**
 * Schreibt eine Profilsicherung als Datei — der Ausweg aus „nur im Browser".
 *
 * ENTSCHEIDUNG (2026-09-20): Es gibt keine Serverkonten (kein Personenbezug,
 * keine Anmeldung, keine Speicherfrist zu überwachen). Der reale Schaden war
 * aber der Verlust bei einem Browserwechsel. Die Datei löst genau den, ohne
 * ein Konto zu brauchen.
 *
 * Ausgelagert aus `main.js`, damit die Klasse unter ihrem Zeilenbudget bleibt;
 * die Funktion braucht nur Profil, Dokument und den HUD-Log.
 *
 * @param {{document: Document, profil: object, hud?: {log: Function}}} optionen
 * @returns {{ok: boolean, text: string|null, fehler: string|null}}
 */
export function sichereProfilDatei({ document, profil, hud }) {
  try {
    const text = sicherungAlsText(profil.toJSON(), {
      erstelltAm: new Date().toISOString(),
    });
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anker = document.createElement('a');
    anker.href = url;
    anker.download = 'projectarmageddon-profil.json';
    document.body.append(anker);
    anker.click();
    anker.remove();
    // Erst nach dem Klick freigeben: sonst kann der Download leer ankommen.
    URL.revokeObjectURL(url);
    hud?.log('Profilsicherung heruntergeladen', 'active');
    return { ok: true, text, fehler: null };
  } catch (error) {
    hud?.log(`Sicherung fehlgeschlagen: ${error.message}`, 'danger');
    return { ok: false, text: null, fehler: error.message };
  }
}
