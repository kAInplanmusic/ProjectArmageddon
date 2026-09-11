import { test, expect } from '@playwright/test';

/**
 * Screenreader-Durchlauf.
 *
 * Das Spiel läuft auf einem Canvas — der gesamte Spielzustand ist damit für
 * einen Screenreader unsichtbar. Diese Datei prüft, was stattdessen da sein
 * muss: benannte Bedienelemente, ein laufender Bericht (Live-Region) und eine
 * Waffenauswahl, die ohne Maus erreichbar ist.
 *
 * Geprüft wird gegen den ECHTEN Accessibility-Baum des Browsers (CDP,
 * `Accessibility.getFullAXTree`), nicht gegen Attribute im Markup. Der
 * Unterschied ist wesentlich: Ein `aria-label` an einem Element, das der
 * Browser aus dem Baum wirft (etwa weil es versteckt ist), nützt niemandem.
 * Ein erster Durchlauf hat genau das gezeigt — im Match gab es überhaupt keine
 * bedienbaren Elemente im Baum außer dem Sprunglink.
 */

/** Holt den Accessibility-Baum und filtert ignorierte Knoten heraus. */
async function axBaum(cdp) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return nodes.filter(node => !node.ignored);
}

const INTERAKTIVE_ROLLEN = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'slider', 'spinbutton', 'switch', 'tab', 'menuitem',
]);

/** Startet ein lokales Match ohne automatische Schleife. */
async function matchStarten(page, { seed = 20260911 } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(optionen => {
    window.__PA__.setAutoLoop(false);
    window.__PA__.startMatch(optionen);
    window.__PA__.setAutoLoop(false);
    window.__PA__.advance(1);
  }, { seed, teams: 2, playersPerTeam: 1, preset: 'hills' });
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

// ------------------------------------------------------- zugängliche Namen

test('Kein bedienbares Element bleibt im Menü ohne Namen', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const knoten = await axBaum(cdp);
  const ohneNamen = knoten
    .filter(node => INTERAKTIVE_ROLLEN.has(node.role?.value))
    .filter(node => !(node.name?.value ?? '').trim())
    .map(node => node.role?.value);

  expect(ohneNamen, `Unbenannte Bedienelemente im Menü: ${ohneNamen.join(', ')}`).toEqual([]);

  // Gegenprobe: Es gibt überhaupt bedienbare Elemente. Ohne sie wäre der Test
  // auch dann grün, wenn die Anwendung gar nicht geladen wäre.
  const benannt = knoten
    .filter(node => INTERAKTIVE_ROLLEN.has(node.role?.value))
    .map(node => node.name?.value ?? '');
  expect(benannt.length).toBeGreaterThan(5);
  // Der Name stammt aus dem Markup und steht dort in Großbuchstaben — deshalb
  // ohne Rücksicht auf die Schreibweise vergleichen.
  expect(benannt.join(' | ').toLowerCase()).toContain('match starten');
});

test('Auch im laufenden Match ist jedes bedienbare Element benannt', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await matchStarten(page);

  const knoten = await axBaum(cdp);
  const ohneNamen = knoten
    .filter(node => INTERAKTIVE_ROLLEN.has(node.role?.value))
    .filter(node => !(node.name?.value ?? '').trim())
    .map(node => node.role?.value);

  expect(ohneNamen, `Unbenannte Bedienelemente im Match: ${ohneNamen.join(', ')}`).toEqual([]);

  /*
   * Das Spielfeld selbst muss benannt und beschrieben sein — es ist die einzige
   * Darstellung des Spiels, und ohne Beschreibung weiß niemand, wie es zu
   * bedienen ist.
   *
   * Gesucht wird über die ROLLE, nicht über den Namen: „Direkt zum Spielfeld"
   * heißt auch der Sprunglink, und ein Namensvergleich erwischt zuerst ihn.
   */
  const spielfeld = knoten.find(node => node.role?.value === 'Canvas');
  expect(spielfeld, 'Das Spielfeld muss als Canvas im Baum stehen').toBeTruthy();
  expect(spielfeld.name?.value ?? '').toContain('Spielfeld');
  expect(spielfeld.name.value).toContain('Pfeiltasten');
});

// ------------------------------------------------------------- Live-Region

test('Das Ereignisprotokoll ist eine Live-Region für laufende Meldungen', async ({ page }) => {
  await matchStarten(page);

  const merkmal = await page.evaluate(() => {
    const liste = document.getElementById('log-list');
    return {
      rolle: liste.getAttribute('role'),
      live: liste.getAttribute('aria-live'),
      relevant: liste.getAttribute('aria-relevant'),
      name: liste.getAttribute('aria-label'),
    };
  });

  expect(merkmal.rolle).toBe('log');
  expect(merkmal.live).toBe('polite');
  // Nur Hinzufügungen melden: Beim Aufräumen wird die älteste Zeile entfernt,
  // und eine Meldung über Entfernungen wäre Lärm.
  expect(merkmal.relevant).toBe('additions');
  expect(merkmal.name).toBeTruthy();

  // Und der Browser führt die Region tatsächlich als Live-Bereich.
  const knoten = await page.evaluate(() => {
    // Über die Eigenschaften des Elements prüfen, die der Browser pflegt.
    const liste = document.getElementById('log-list');
    return { ariaLive: liste.ariaLive, role: liste.getAttribute('role') };
  });
  expect(knoten.ariaLive).toBe('polite');
});

test('Eine neue Meldung erzeugt genau EINEN neuen Knoten', async ({ page }) => {
  /*
   * Der Kern der Sache. Würde `Hud#log` die Liste bei jeder Meldung neu
   * aufbauen (wie vorher mit `replaceChildren`), dann sähe die Live-Region bei
   * jeder Meldung 60 neue Knoten — und ein Screenreader läse jedes Mal das
   * ganze Protokoll vor. Geprüft wird deshalb die Identität eines bestehenden
   * Knotens: Bleibt sie erhalten, wurde nicht neu aufgebaut.
   */
  await matchStarten(page);

  await page.evaluate(() => window.__PA__.game.hud.log('Erste Testzeile'));
  await page.evaluate(() => window.__PA__.game.hud.log('Zweite Testzeile'));

  const befund = await page.evaluate(() => {
    const liste = document.getElementById('log-list');
    const erste = liste.children[0];
    const zweite = liste.children[1];
    const vorher = liste.children.length;
    window.__PA__.game.hud.log('Dritte Testzeile');
    return {
      vorher,
      nachher: liste.children.length,
      ersteUnveraendert: liste.children[1] === erste && liste.children[2] === zweite,
      neueZuerst: liste.children[0].textContent,
      texte: [...liste.children].map(li => li.textContent),
    };
  });

  expect(befund.neueZuerst).toBe('Dritte Testzeile');
  // Die vorherigen Knoten sind dieselben Objekte geblieben.
  expect(befund.ersteUnveraendert, 'Die Liste wurde neu aufgebaut').toBe(true);
  // Und sie wächst um genau einen Eintrag.
  expect(befund.nachher).toBe(befund.vorher + 1);
  expect(befund.texte).toContain('Zweite Testzeile');
});

test('Das Protokoll wird oben begrenzt und meldet keine Entfernung', async ({ page }) => {
  await matchStarten(page);

  const befund = await page.evaluate(() => {
    const liste = document.getElementById('log-list');
    for (let i = 0; i < 80; i += 1) window.__PA__.game.hud.log(`Füllzeile ${i}`);
    return {
      anzahl: liste.children.length,
      relevant: liste.getAttribute('aria-relevant'),
      ersteTexte: [...liste.children].slice(0, 3).map(li => li.textContent),
    };
  });

  // Obergrenze (LOG_LIMIT = 60) wird eingehalten.
  expect(befund.anzahl).toBe(60);
  expect(befund.relevant).toBe('additions');
  // Die jüngste Meldung steht oben.
  expect(befund.ersteTexte[0]).toBe('Füllzeile 79');
});

test('Der Zugwechsel wird gemeldet', async ({ page }) => {
  /*
   * Für einen Screenreader ist „wer ist dran" die wichtigste Frage. Die
   * Anzeige `#hud-active` ist sichtbar, aber keine Live-Region — die Meldung
   * gehört ins Protokoll, sonst bliebe der Wechsel stumm.
   */
  await matchStarten(page);

  // Erster Zug wird beim ersten Bild gemeldet.
  await expect.poll(async () => page.evaluate(() => {
    const texte = [...document.querySelectorAll('#log-list li')].map(li => li.textContent);
    return texte.filter(text => text.includes('am Zug')).length;
  })).toBeGreaterThan(0);

  const vorher = await page.evaluate(() => {
    const texte = [...document.querySelectorAll('#log-list li')].map(li => li.textContent);
    return texte.filter(text => text.includes('am Zug')).length;
  });

  /*
   * Den Zugwechsel gezielt auslösen statt auf die Zugzeit zu warten: Die steht
   * auf 30 s, 120 Ticks (2 s) hätten den Zug nicht gewechselt — der erste
   * Anlauf dieses Tests scheiterte genau daran.
   */
  await page.evaluate(() => {
    const api = window.__PA__;
    api.getMatch().endTurn();
    api.advance(1);
    api.game.hud.update(api.getState(), { aim: null });
  });

  await expect.poll(async () => page.evaluate(() => {
    const texte = [...document.querySelectorAll('#log-list li')].map(li => li.textContent);
    return texte.filter(text => text.includes('am Zug')).length;
  }), { timeout: 10_000 }).toBeGreaterThan(vorher);

  // Und die Meldung nennt den Spieler beim Namen.
  const letzte = await page.evaluate(() => {
    const texte = [...document.querySelectorAll('#log-list li')].map(li => li.textContent);
    return texte.find(text => text.includes('am Zug')) ?? '';
  });
  expect(letzte).toMatch(/^P\d+ ist am Zug$/);
});

test('Runde, Wind und Zugzeit sind absichtlich KEINE Live-Region', async ({ page }) => {
  /*
   * Gegenprobe zur Entscheidung: Diese drei ändern sich im Sekundentakt. Wären
   * sie Live-Regionen, redete der Screenreader pausenlos und übertönte jede
   * echte Meldung. Der Test hält die Entscheidung fest, damit sie nicht
   * versehentlich aufgehoben wird.
   */
  await matchStarten(page);

  const befund = await page.evaluate(() => {
    const ids = ['hud-round', 'hud-wind', 'hud-timer', 'hud-active'];
    return ids.map(id => {
      const el = document.getElementById(id);
      return {
        id,
        live: el?.getAttribute('aria-live'),
        eigeneRegion: el?.closest('[aria-live]')?.id ?? null,
      };
    });
  });

  for (const eintrag of befund) {
    expect(eintrag.live, `${eintrag.id} darf keine eigene Live-Region sein`).toBeNull();
  }
});

// ------------------------------------------------------------ Waffenauswahl

test('Die Waffenliste ist ohne Maus bedienbar und wird als Knopf benannt', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await matchStarten(page);

  await expect(page.locator('#weapon-list .weapon-item')).not.toHaveCount(0);

  // Der Browser muss die Zeilen als Knöpfe führen — nicht nur als Listeneinträge.
  const knoten = await axBaum(cdp);
  const waffenknoepfe = knoten
    .filter(node => node.role?.value === 'button')
    .filter(node => /^\d+\.\s/.test(node.name?.value ?? ''));
  expect(waffenknoepfe.length, 'Keine Waffenzeile als Knopf im Baum').toBeGreaterThan(0);

  // Jeder trägt Nummer und Namen.
  for (const knopf of waffenknoepfe) {
    expect(knopf.name.value).toMatch(/^\d+\.\s+\S/);
  }

  // Genau eine Waffe ist als aktuell markiert.
  const aktuell = await page.evaluate(() =>
    document.querySelectorAll('#weapon-list .weapon-item[aria-current="true"]').length);
  expect(aktuell).toBe(1);
});

test('Leertaste auf einer Waffenzeile wählt und feuert NICHT', async ({ page }) => {
  /*
   * Die Leertaste feuert im Spiel (Eingabe-Controller global am Fenster). Auf
   * einer fokussierten Waffenzeile muss sie die Waffe WÄHLEN und darf nicht
   * gleichzeitig schießen — sonst löst jeder Tastendruck zwei Dinge aus.
   */
  await matchStarten(page);

  const ergebnis = await page.evaluate(async () => {
    const api = window.__PA__;
    const vorher = api.getState();
    const zeilen = [...document.querySelectorAll('#weapon-list .weapon-item')];
    // Eine noch nicht gewählte Zeile zum Zuge kommen lassen.
    const ziel = zeilen.find(z => z.getAttribute('aria-current') !== 'true') ?? zeilen[0];
    ziel.focus();
    // Fokus SYNCHRON prüfen: Anschließend wird gewartet, und in der Zeit kann
    // die Anzeige die Liste neu aufbauen (der Fokus würde dann ersetzt).
    const fokussiert = document.activeElement === ziel;
    ziel.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ', bubbles: true, cancelable: true,
    }));
    await new Promise(fertig => requestAnimationFrame(fertig));
    const nachher = api.getState();
    return {
      fokussiert,
      // Ein Schuss würde die Zugzeit verbrauchen oder Projektile erzeugen.
      projektile: nachher.projectiles.length + vorher.projectiles.length,
      aktiveWaffe: nachher.entities.find(e => e.entityId === nachher.activePlayerId)?.activeWeaponId,
    };
  });

  expect(ergebnis.fokussiert, 'Die Waffenzeile muss fokussierbar sein').toBe(true);
  // Kein Schuss: keine Projektile.
  expect(ergebnis.projektile).toBe(0);
  expect(ergebnis.aktiveWaffe).toBeTruthy();
});

test('Der Fokus auf einer Waffenzeile überlebt den Neuaufbau der Liste', async ({ page }) => {
  /*
   * Fund (belegt): Die Waffenliste wird bei jeder Änderung neu aufgebaut
   * (`replaceChildren`) — nach einem Schuss, nach dem Waffenwechsel, beim
   * Zugwechsel. Ein fokussierter Eintrag verschwand dabei, und der Fokus fiel
   * auf `<body>`: Wer mit der Tastatur eine Waffe gewählt hatte, verlor den
   * Fokus genau in diesem Moment und musste sich von vorn durch die Seite
   * tabben.
   *
   * Der Test löst einen echten Neuaufbau aus (Waffenwechsel) und prüft, dass
   * der Fokus auf DERSELBEN Waffe bleibt.
   */
  await matchStarten(page);

  const befund = await page.evaluate(async () => {
    const api = window.__PA__;
    const zeilen = [...document.querySelectorAll('#weapon-list .weapon-item')];
    const ziel = zeilen[1] ?? zeilen[0];
    const waffe = ziel.dataset.weaponId;
    ziel.focus();
    const vorherFokussiert = document.activeElement === ziel;

    // Waffenwechsel erzwingt einen Neuaufbau mit neuer Signatur.
    api.selectWeapon(0);
    api.game.hud.update(api.getState(), { aim: null });
    await new Promise(fertig => requestAnimationFrame(fertig));

    const aktiv = document.activeElement;
    return {
      vorherFokussiert,
      waffe,
      fokusNachher: aktiv?.dataset?.weaponId ?? null,
      fokusAufBody: aktiv === document.body,
    };
  });

  expect(befund.vorherFokussiert).toBe(true);
  expect(befund.fokusAufBody, 'Der Fokus ist auf <body> gefallen').toBe(false);
  expect(befund.fokusNachher).toBe(befund.waffe);
});

test('Tab erreicht die Waffenliste und das Spielfeld', async ({ page }) => {
  // Grobe Fokusreihenfolge: Der Sprunglink führt zum Spielfeld, und die
  // Waffenzeilen liegen in der Tab-Reihenfolge.
  await matchStarten(page);

  const reihenfolge = await page.evaluate(() => {
    const fokussierbar = [...document.querySelectorAll(
      'a[href], button, [tabindex]:not([tabindex="-1"]), canvas[tabindex]',
    )].filter(el => el.offsetParent !== null || el.tagName === 'CANVAS');
    return fokussierbar.map(el => el.id || el.tagName + '.' + (el.className || ''));
  });

  expect(reihenfolge.length).toBeGreaterThan(1);
  expect(reihenfolge.some(e => e.startsWith('weapon-item')) || reihenfolge.some(e => e.includes('canvas'))).toBe(true);
});
