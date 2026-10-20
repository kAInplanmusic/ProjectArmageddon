/**
 * Bereitschaftsprüfung der E2E-Umgebung (läuft NACH dem `webServer` der Konfiguration).
 *
 * Playwright wartet beim `webServer` nur, bis die URL antwortet — und meldet bei einem
 * Fehlschlag lediglich „Timed out waiting from config.webServer". Das sagt nicht, WAS fehlt.
 * Diese Prüfung fragt aktiv nach dem Spiel selbst (Startseite UND Einstiegsmodul) und nennt
 * bei Misserfolg Adresse, Grund und den Ausweg über `PA_PORT`.
 */
const FRIST_MS = 30_000;

async function antwortet(url) {
  const antwort = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} für ${url}`);
  return antwort;
}

export default async function globalSetup(config) {
  const basis = config.projects[0]?.use?.baseURL ?? config.use?.baseURL;
  if (!basis) throw new Error('E2E-Umgebung: keine baseURL konfiguriert (playwright.config.mjs).');

  const ende = Date.now() + FRIST_MS;
  let grund = 'keine Antwort';
  while (Date.now() < ende) {
    try {
      await antwortet(new URL('/', basis).href);
      await antwortet(new URL('/src/client/main.js', basis).href);
      return;
    } catch (fehler) {
      grund = fehler?.cause?.code ?? fehler?.message ?? String(fehler);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error(
    `E2E-Umgebung: Der Dev-Server unter ${basis} ist nicht erreichbar (${grund}).\n`
    + `Belegt ein fremder Prozess den Port? Dann auf einen freien Port ausweichen: PA_PORT=<Port> npx playwright test\n`
    + 'Ohne PA_PORT startet Playwright selbst `npm run dev` auf Port 5173 (ein schon laufender Server dort wird mitbenutzt).',
  );
}
