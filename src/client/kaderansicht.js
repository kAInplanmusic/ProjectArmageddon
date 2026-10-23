/**
 * Kader- und Hilfeansicht des Menüs.
 *
 * Beide Bäume werden aus den Configs ABGELEITET (Fraktionen, Klassen,
 * Sidegrades, Loot, Gelände): Im Markup stehen nur leere Behälter, hier
 * entstehen die Inhalte. Ausgezogen aus `main.js` am 2026-10-23, weil das
 * Zeilenbudget (C-9, `tests/zeilenbudget.test.js`) nach dem Zusammenführen der
 * beiden Linien gerissen war — der Einstiegspunkt ist seither wieder eine
 * Vermittlung zwischen Simulation, Renderer und Menü, keine Texttafel.
 *
 * @module kaderansicht
 */
import { CLASS_IDS, ARCHETYPE_IDS } from '../engine/match.js';
import { RARITY_IDS, STUFEN } from '../engine/systems/lootSystem.js';
import { NEUE_BIOME } from '../shared/config/biome-neu.js';
import { PLANET_BIOM_IDS } from '../shared/config/biome-planet.js';
import { uebersichtFuerHilfe, classCounterplay, combatProfile } from '../shared/config/classes.js';
import { COMBAT_ROLES, classOf } from '../shared/config/factions.js';
import { KISTEN_STUFEN_GEWICHT, KISTEN_MUNITION_STUFE } from '../shared/config/kisten.js';
import { START_TIERS, getClassLoadoutDetail } from '../shared/config/loadouts.js';
import { LOOT_DROP_RULES } from '../shared/config/loot.js';
import { sidegradesForClass } from '../shared/config/sidegrades.js';
import { getWeapon, WEAPONS } from '../shared/config/weapons.js';
import { TERRAIN_PRESETS, TERRAIN_AFFINITY } from '../shared/terrainGen.js';
import { zeichneTiere } from './hilfeTiere.js';
import { zeichneZerstoerungsTabelle, zeichneFeuerRegeln } from './hilfeZerstoerung.js';
import { factionsWithSprites, spriteCount, hdUrl } from './roster.js';

// ------------------------------------------------------------------ Kaderansicht

/**
 * Baut die Kader-Ansicht im Menü auf.
 *
 * Neun Fraktionen als Reiter, darunter die neun Charaktere der gewählten Fraktion
 * mit Bild, Kampfweise, Superwaffe, Biografie und Stärken/Schwächen.
 *
 * Die Bilder kommen aus `roster.js`. Fehlt eines, erscheint an seiner Stelle ein
 * Platzhalter statt eines stillen Ausfalls — bei 81 Dateien bliebe ein fehlendes
 * sonst unbemerkt.
 */
export function buildRosterView() {
  const reiter = document.getElementById('roster-tabs');
  const liste = document.getElementById('roster-list');
  const info = document.getElementById('roster-info');
  if (!reiter || !liste || !info) return;

  const fraktionen = factionsWithSprites();
  if (fraktionen.length === 0) {
    info.textContent = 'Kein Kader geladen.';
    return;
  }

  const fehlend = fraktionen.flatMap(f => f.characters).filter(c => !c.url).length;
  if (fehlend > 0) {
    // Sichtbar machen statt stillschweigend hinnehmen.
    console.warn(`Kader: ${fehlend} Bilder fehlen (${spriteCount()} geladen)`);
  }

  let gewaehlt = fraktionen[0].id;
  let gezeichnet = false;

  // Erst beim Öffnen zeichnen: Sonst hinge der Kader mit neun Bildern an jedem
  // Seitenaufruf, obwohl das Feld zugeklappt ist.
  const behaelter = document.getElementById('roster-browser');
  if (behaelter) behaelter.addEventListener('toggle', () => {
    if (behaelter.open && !gezeichnet) zeichnen();
  });

  const portraet = document.getElementById('roster-portrait');
  // Große Ansicht (220 px): nimmt das HD-Porträt, die Liste (56 px) bleibt beim 256er.
  const zeigePortraet = async (c) => {
    if (!portraet) return;
    const url = await hdUrl(c);
    if (!url) return;
    const bild = document.createElement('img');
    bild.src = url;
    bild.alt = `Porträt ${c.name}`;
    const unterschrift = document.createElement('div');
    unterschrift.textContent = c.name;
    portraet.replaceChildren(bild, unterschrift);
    portraet.hidden = false;
  };

  const zeichnen = () => {
    const fraktion = fraktionen.find(f => f.id === gewaehlt) ?? fraktionen[0];
    if (portraet) {
      portraet.hidden = true;
      portraet.replaceChildren();
    }

    info.replaceChildren();
    const kopf = document.createElement('div');
    const stark = document.createElement('b');
    stark.textContent = fraktion.name;
    kopf.append(stark, document.createTextNode(` — ${fraktion.motto}`));
    const beschreibung = document.createElement('div');
    beschreibung.textContent = fraktion.description;
    info.append(kopf, beschreibung);

    liste.replaceChildren(...fraktion.characters.map(c => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.title = 'Großes Porträt anzeigen';
      li.addEventListener('click', () => zeigePortraet(c));
      li.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          zeigePortraet(c);
        }
      });

      if (c.url) {
        const bild = document.createElement('img');
        bild.src = c.url;
        bild.alt = c.name;
        li.append(bild);
      } else {
        const ersatz = document.createElement('div');
        ersatz.className = 'r-bild-fehlt';
        ersatz.textContent = '?';
        ersatz.title = 'Bild fehlt';
        li.append(ersatz);
      }

      const text = document.createElement('div');
      text.className = 'r-text';

      const name = document.createElement('div');
      const starkName = document.createElement('span');
      starkName.className = 'r-name';
      starkName.textContent = c.name;
      const klein = document.createElement('span');
      klein.className = 'r-role';
      klein.textContent = ` ${COMBAT_ROLES[c.role]?.label ?? c.role} · ${classOf(c)}`;
      name.append(starkName, klein);

      const waffe = document.createElement('div');
      waffe.className = 'r-waffe';
      waffe.textContent = `${c.superWeapon.name}: ${c.superWeapon.description}`;

      const bio = document.createElement('div');
      bio.className = 'r-bio';
      bio.textContent = c.bio;

      const profil = document.createElement('div');
      profil.className = 'r-prof';
      profil.textContent = `+ ${c.strengths.join(' · ')}  |  − ${c.weaknesses.join(' · ')}`;

      text.append(name, waffe, bio, profil);

      /*
       * Counterplay-Zeile: gegen welche Klasse dieser Charakter stark und gegen
       * welche schwach ist.
       *
       * Die Aussage stammt aus `classCounterplay()` und damit aus denselben
       * Zahlen, die der Motor liest — nicht aus einer zweiten Tabelle. Gibt es
       * keine Gegenseite mit Vorteil, sagt die Zeile das ausdrücklich (der Scout
       * hat heute keine): Eine erfundene Zuordnung wäre eine Anzeige, die eine
       * Balance behauptet, die es nicht gibt.
       */
      const klasseDesCharakters = classOf(c);
      const beziehung = classCounterplay()[klasseDesCharakters];
      if (beziehung) {
        const cpHinweis = document.createElement('div');
        cpHinweis.className = 'r-cp';
        const teile = [];
        if (beziehung.starkGegen) {
          teile.push(`stark gegen ${beziehung.starkGegen.classId} `
            + `(${beziehung.starkGegen.wegen.join(', ')})`);
        }
        if (beziehung.schwachGegen) {
          teile.push(`schwach gegen ${beziehung.schwachGegen.classId} `
            + `(${beziehung.schwachGegen.wegen.join(', ')})`);
        }
        cpHinweis.textContent = teile.length > 0
          ? teile.join('  |  ')
          : 'keine Klasse mit Vorteil — auf keiner wirksamen Achse überlegen';
        text.append(cpHinweis);
      }

      li.append(text);
      return li;
    }));

    for (const knopf of reiter.querySelectorAll('button')) {
      knopf.setAttribute('aria-selected', String(knopf.dataset.fraktion === gewaehlt));
    }
    gezeichnet = true;
  };

  for (const fraktion of fraktionen) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'pa-tab';
    knopf.textContent = fraktion.name;
    knopf.dataset.fraktion = fraktion.id;
    knopf.setAttribute('role', 'tab');
    knopf.addEventListener('click', () => {
      gewaehlt = fraktion.id;
      zeichnen();
    });
    reiter.append(knopf);
  }

  if (behaelter?.open) zeichnen();
}

// ------------------------------------------------------------------- Hilfe

/**
 * Baut den Hilfe-Bereich im Menü auf.
 *
 * Der Nutzen steht und fällt damit, dass hier NICHTS hartkodiert ist: Alle
 * Sätze und Zahlen kommen aus `uebersichtFuerHilfe()` (Klassen, Archetypen)
 * bzw. direkt aus den Configs (Loot, Gelände). Der Entwurf
 * (docs/entwurf-onboarding-sidegrades-counterplay.md, Abschnitt A) verlangt das
 * ausdrücklich — ein Zahlenwert im Client wäre eine zweite Quelle, die bei
 * jeder Balance-Änderung mitwandern müsste.
 *
 * Die Texte selbst stehen bei ihren WERTEN: `erklaerung`-Felder in
 * `classes.js`, `loot.js` und `terrainGen.js`. Diese Funktion rendert sie nur.
 *
 * Wie `buildRosterView` wird erst beim Aufklappen gezeichnet, damit der
 * Seitenstart nicht belastet wird.
 */
export function buildHilfeView() {
  const reiter = document.getElementById('hilfe-tabs');
  const inhalt = document.getElementById('hilfe-inhalt');
  const behaelter = document.getElementById('hilfe-browser');
  if (!reiter || !inhalt) return;

  const seiten = [
    { id: 'klassen', label: 'Klassen', zeichne: zeichneKlassen },
    { id: 'sidegrades', label: 'Sidegrades', zeichne: zeichneSidegrades },
    { id: 'counterplay', label: 'Counterplay', zeichne: zeichneCounterplay },
    { id: 'loot', label: 'Loot und Seltenheiten', zeichne: zeichneLoot },
    { id: 'karte', label: 'Karte und Gelände', zeichne: zeichneKarte },
    { id: 'ton', label: 'Ton und Musik', zeichne: zeichneTon },
    { id: 'tiere', label: 'Günther und Cookie', zeichne: zeichneTiere },
  ];

  let gewaehlt = seiten[0].id;
  let gezeichnet = false;

  const zeichnen = () => {
    const seite = seiten.find(s => s.id === gewaehlt) ?? seiten[0];
    inhalt.replaceChildren();
    seite.zeichne(inhalt);
    for (const knopf of reiter.querySelectorAll('button')) {
      knopf.setAttribute('aria-selected', String(knopf.dataset.hilfe === gewaehlt));
    }
    gezeichnet = true;
  };

  for (const seite of seiten) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'pa-tab';
    knopf.textContent = seite.label;
    knopf.dataset.hilfe = seite.id;
    knopf.setAttribute('role', 'tab');
    knopf.addEventListener('click', () => {
      gewaehlt = seite.id;
      zeichnen();
    });
    reiter.append(knopf);
  }

  if (behaelter) behaelter.addEventListener('toggle', () => {
    if (behaelter.open && !gezeichnet) zeichnen();
  });

  if (behaelter?.open) zeichnen();
}

/** Kleiner Helfer: ein Element mit Textinhalt. */
function textEl(tag, text, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Zeichnet einen Wertbalken.
 *
 * Die Balkenlänge ist ein Anteil am größten Wert der Gruppe — sie zeigt also
 * das VERHÄLTNIS, nicht den Absolutwert. Die Zahl steht daneben, damit die
 * Anzeige auch ohne Balken lesbar ist (und für Screenreader, die keine Breite
 * vorlesen).
 */
function balken(container, beschriftung, wert, maxWert) {
  const zeile = document.createElement('div');
  zeile.className = 'h-wert';
  zeile.append(textEl('span', beschriftung, 'h-wert-label'));

  const spur = document.createElement('span');
  spur.className = 'h-wert-spur';
  const fuellung = document.createElement('span');
  fuellung.className = 'h-wert-fuellung';
  // Anteil begrenzt: Ein Wert über dem Maximum wäre ein Anzeigefehler, kein
  // Grund, über den Balken hinauszuzeichnen.
  const anteil = maxWert > 0 ? Math.min(1, wert / maxWert) : 0;
  fuellung.style.width = `${Math.round(anteil * 100)}%`;
  spur.append(fuellung);

  zeile.append(spur, textEl('span', wert.toFixed(2), 'h-wert-zahl'));
  container.append(zeile);
}

/** Reiter „Klassen" — die wirksamen Werte samt Archetypen und Startaufgebot. */
/**
 * Beschreibt einen Klassen- oder Archetypwert für die Auswahlliste.
 *
 * ## Warum das nötig war
 *
 * Ein User-Flow-Audit stellte fest: Die Auswahlfelder im Menü zeigten nur die
 * nackten Kennungen („scout", „brawler"). Der wirksame Unterschied ist aber
 * gross — das Leben schwankt je Klasse um Faktor 0,56 bis 1,56. Wer wählt,
 * ohne die Folge zu kennen, wählt nicht.
 *
 * ## Woher die Zahlen kommen
 *
 * Aus `combatProfile()` — der Quelle, die der Motor liest. Eine eigene Rechnung
 * hier wäre eine zweite Regel, die bei einer Balance-Änderung auseinanderliefe.
 *
 * ## Was je Achse gezeigt wird
 *
 * - **Klasse:** das wirksame Leben und den wirksamen Schaden. Beides sind
 *   Multiplikatoren auf den Grundwert.
 * - **Archetyp:** das wirksame TEMPO (Absprung- und Fluggeschwindigkeit). Der
 *   Archetyp wirkt nicht auf den Schaden — das Feld hieß früher irreführend
 *   `damage` und wurde in `launch` umbenannt.
 *
 * @param {'Klasse'|'Archetyp'} art
 * @param {string} wert - Kennung, z. B. 'scout'
 * @returns {string} Kurztext wie „Leben 0,96 · Schaden 0,70" oder „Tempo 0,64"
 */
export function beschreibeWert(art, wert) {
  // Der jeweils andere Teil bleibt auf dem Rückfallwert — die Zahlen sind
  // Eigenschaften des EINZELNEN Parameters, nicht der Kombination.
  const profil = art === 'Klasse'
    ? combatProfile(wert, ARCHETYPE_IDS[0])
    : combatProfile(CLASS_IDS[0], wert);

  const zahl = n => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '—');

  if (art === 'Klasse') {
    return `Leben ${zahl(profil.healthMultiplier)} · Schaden ${zahl(profil.damageMultiplier)}`;
  }
  return `Tempo ${zahl(profil.launchSpeedMultiplier)}`;
}

function zeichneKlassen(container) {
  const u = uebersichtFuerHilfe();

  container.append(textEl('p',
    'Drei Klassen und drei Archetypen bestimmen, wie eine Figur schießt und '
    + 'einsteckt. Gezeigt sind die WIRKSAMEN Werte — also die, die der Motor '
    + 'tatsächlich liest.', 'h-einleitung'));

  // Maßstab: der größte wirksame Wert über alle Klassen, damit die Balken
  // untereinander vergleichbar sind.
  const maxLeben = Math.max(...u.klassen.map(k => k.wirksam.leben));
  const maxSchaden = Math.max(...u.klassen.map(k => k.wirksam.schaden));

  const raster = document.createElement('div');
  raster.className = 'h-karten';
  for (const klasse of u.klassen) {
    const karte = document.createElement('div');
    karte.className = 'h-karte';
    karte.append(textEl('h3', klasse.label));
    karte.append(textEl('p', klasse.erklaerung, 'h-erklaerung'));

    balken(karte, 'Leben', klasse.wirksam.leben, maxLeben);
    balken(karte, 'Schaden', klasse.wirksam.schaden, maxSchaden);
    /*
     * Die Beweglichkeit wirkt auf den Absprung: Der Scout springt höher als die
     * anderen Klassen. Sie steht deshalb hier als Wert und nicht mehr im
     * Hinweis auf wirkungslose Dimensionen.
     */
    balken(karte, 'Beweglichk.', klasse.wirksam.beweglichkeit, 1.2);

    // Das Startaufgebot: Rolle und die konkrete Waffe.
    //
    // Fund (belegt): Der Entwurf (Abschnitt A.2) nennt `reason` eine
    // „Begründung" und verspricht daraus Textgewinn. Nachgemessen ist `reason`
    // aber ein MASCHINELL zusammengesetzter Satz:
    //
    //   "Rolle Flächenwirkung — Wahl der Klasse scout"
    //   "Bewegungsmittel — Kür der Klasse scout"
    //
    // Er wiederholt damit lediglich `roleLabel` und den Klassennamen. Ihn
    // anzuzeigen ergäbe doppelten Text („Flächenwirkung: Rolle Flächenwirkung
    // — Wahl der Klasse scout"). Gezeigt werden deshalb die beiden Angaben, die
    // tatsächlich Information tragen: die ROLLE und die konkrete WAFE.
    karte.append(textEl('h4', 'Startaufgebot'));
    const liste = document.createElement('ul');
    liste.className = 'h-liste';
    for (const platz of getClassLoadoutDetail(klasse.id)) {
      const waffe = getWeapon(platz.weaponId);
      const li = document.createElement('li');
      li.append(textEl('b', `${platz.roleLabel}: `));
      li.append(document.createTextNode(waffe?.displayName ?? platz.weaponId));
      liste.append(li);
    }
    karte.append(liste);
    raster.append(karte);
  }
  container.append(raster);

  container.append(textEl('h3', 'Archetypen'));
  const archetypRaster = document.createElement('div');
  archetypRaster.className = 'h-karten';
  for (const archetyp of u.archetypen) {
    const karte = document.createElement('div');
    karte.className = 'h-karte h-schmal';
    karte.append(textEl('h4', archetyp.label));
    karte.append(textEl('p', archetyp.erklaerung, 'h-erklaerung'));
    // Nur TEMPO und LEBEN: Der Archetyp wirkt nicht auf den Schaden (siehe
    // tests/onboarding-hilfe.test.js, „Der Archetyp wirkt als TEMPO").
    balken(karte, 'Leben', archetyp.wirksam.leben, 1.2);
    balken(karte, 'Tempo', archetyp.wirksam.tempo, 1.4);
    archetypRaster.append(karte);
  }
  container.append(archetypRaster);

  /*
   * Die Hinweise stehen ANS ENDE und sind als Hinweis gestaltet, nicht als
   * Spielwert. Der Entwurf verlangt beide ausdrücklich:
   *  - die wirkungslosen Dimensionen (sonst wirken sie wie Spielwerte),
   *  - die Kopplung (sonst ist eine Übersicht mit neun Kombinationen irreführend).
   */
  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p', u.inertHinweis));
  hinweise.append(textEl('p', u.kopplungHinweis));
  container.append(hinweise);
}

/** Reiter „Sidegrades" — was ein Sidegrade ist und welche es gibt. */
function zeichneSidegrades(container) {
  container.append(textEl('p',
    'Ein Sidegrade verstärkt eine Eigenschaft und schwächt eine andere. Es gilt '
    + 'für alle Figuren der Klasse und wird vor dem Match festgelegt — im '
    + 'laufenden Spiel lässt es sich nicht wechseln.', 'h-einleitung'));

  container.append(textEl('p',
    'Die Faktoren sind multiplikativ auf das Klassenprofil: 1,00 ist unverändert, '
    + 'über 1 verstärkt, unter 1 abgeschwächt.', 'h-erklaerung'));

  for (const klasse of CLASS_IDS) {
    container.append(textEl('h3', klasse));
    const raster = document.createElement('div');
    raster.className = 'h-karten';

    for (const eintrag of sidegradesForClass(klasse)) {
      const karte = document.createElement('div');
      karte.className = 'h-karte h-schmal';
      karte.append(textEl('h4', eintrag.label));
      karte.append(textEl('p', eintrag.erklaerung, 'h-erklaerung'));

      /*
       * Die Faktoren als Zahlentabelle, nicht als Balken: Bei einem Sidegrade
       * ist die RICHTUNG die Aussage (über oder unter 1), und dafür ist eine
       * Zahl neben der Achse lesbarer als ein Balken, dessen Maßstab erst
       * erklärt werden müsste.
       */
      const liste = document.createElement('ul');
      liste.className = 'h-liste';
      const achsen = [
        ['Leben', 'healthMultiplier'],
        ['Schaden', 'damageMultiplier'],
        ['Tempo', 'launchSpeedMultiplier'],
      ];
      for (const [beschriftung, schluessel] of achsen) {
        const wert = eintrag.modifiers[schluessel];
        const vorzeichen = wert > 1 ? '+' : (wert < 1 ? '−' : '·');
        liste.append(textEl('li',
          `${vorzeichen} ${beschriftung}: ${wert.toFixed(2)}`));
      }
      karte.append(liste);
      raster.append(karte);
    }
    container.append(raster);
  }

  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p',
    'Nur Leben, Schaden und Tempo sind wirksam — der Motor liest diese drei. '
    + 'Ein Sidegrade kann sie nach oben oder unten verschieben, aber nicht '
    + 'darüber hinaus: Jede Achse hat eine Untergrenze, damit keine '
    + 'spielunfähige Figur entsteht.'));
  container.append(hinweise);
}

/** Reiter „Counterplay" — welche Klasse gegen welche stark ist, und warum. */
function zeichneCounterplay(container) {
  container.append(textEl('p',
    'Welche Klasse gegen welche stark ist, folgt aus ihren Werten: Leben, Wucht, '
    + 'Reichweite und Beweglichkeit. Es gibt keinen versteckten Bonus — die '
    + 'Tabelle zeigt, worauf die Werte hinauslaufen, und die Wahl entscheidet.',
    'h-einleitung'));

  const beziehungen = classCounterplay();

  const raster = document.createElement('div');
  raster.className = 'h-karten';
  for (const klasse of CLASS_IDS) {
    const e = beziehungen[klasse];
    if (!e) continue;

    const karte = document.createElement('div');
    karte.className = 'h-karte';
    karte.append(textEl('h3', klasse));

    // Die Werte zuerst: Sie begründen alles Folgende.
    balken(karte, 'Leben', e.profil.leben, 1.6);
    balken(karte, 'Wucht', e.profil.wucht, 1.3);
    balken(karte, 'Reichweite', e.profil.reichweite, 1.2);
    // Die Beweglichkeit wirkt auf den Absprung — der Scout springt höher.
    balken(karte, 'Beweglichk.', e.profil.beweglichkeit, 1.2);

    const liste = document.createElement('ul');
    liste.className = 'h-liste';
    if (e.starkGegen) {
      liste.append(textEl('li',
        `stark gegen ${e.starkGegen.classId} — ${e.starkGegen.wegen.join(', ')}`));
    }
    if (e.schwachGegen) {
      liste.append(textEl('li',
        `schwach gegen ${e.schwachGegen.classId} — ${e.schwachGegen.wegen.join(', ')}`));
    }
    karte.append(liste);
    raster.append(karte);
  }
  container.append(raster);

  /*
   * Der Hinweis ist wichtiger als die Tabelle: Er erklärt, warum hier Lücken
   * stehen. Der Scout hat auf keiner wirksamen Achse einen Vorteil — das
   * auszusprechen ist ehrlicher als eine Gegenseite zu erfinden.
   */
  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p',
    'Fehlt eine Zeile „stark gegen", hat diese Klasse auf keiner wirksamen Achse '
    + 'einen Vorteil — sie ist dann durchgehend die schwächere Wahl.'));
  hinweise.append(textEl('p',
    'Die Beweglichkeit wirkt auf den Absprung: Wer beweglicher ist, springt höher '
    + 'und erreicht Stellungen, die anderen verschlossen bleiben. Sie zählt '
    + 'deshalb als eigene Achse mit.'));
  container.append(hinweise);

  container.append(textEl('h3', 'Welche Karte begünstigt wen'));
  const kartenListe = document.createElement('ul');
  kartenListe.className = 'h-liste';
  for (const [form, eintrag] of Object.entries(TERRAIN_AFFINITY)) {
    kartenListe.append(textEl('li', `${form}: ${eintrag.favorisiert} — ${eintrag.begruendung}`));
  }
  container.append(kartenListe);

  const kartenHinweis = document.createElement('div');
  kartenHinweis.className = 'h-hinweis';
  kartenHinweis.append(textEl('p',
    'Die Kartengunst ist eine Empfehlung, kein Bonus: Sie ändert keine Werte. '
    + 'Wer die begünstigte Klasse wählt, spielt ihre Stärke aus — mehr nicht.'));
  container.append(kartenHinweis);

  // Sonderbiom Planet (Geländefassung 4): eine Zeile je Art, aus der Config.
  container.append(textEl('h3', 'Planeten (Biom „Planet“)'));
  container.append(textEl('p',
    'Eine Scheibenwelt im All: ein gewölbter Planet mit Kraterkranz, Terrassen und Tunnelbögen, '
    + 'umgeben von der tödlichen Leere. Die Art zieht der Seed; im Menü unter „Biom“ ist sie auch wählbar.'));
  const planetenListe = document.createElement('ul');
  planetenListe.className = 'h-liste';
  for (const id of PLANET_BIOM_IDS) planetenListe.append(textEl('li', `${NEUE_BIOME[id].label}: ${NEUE_BIOME[id].beschreibung}`));
  container.append(planetenListe);
}

/** Reiter „Loot und Seltenheiten" — die Verteilung, in Spielerprosa. */
function zeichneLoot(container) {
  container.append(textEl('p',
    'Zu Beginn jeder Runde wirft eine Drohne Kisten ab. Was darin liegt, '
    + 'entscheidet der Match-Seed — im Replay also immer dasselbe.',
    'h-einleitung'));

  const regeln = LOOT_DROP_RULES;

  container.append(textEl('h3', 'Kisten je Rundenbeginn'));
  const kistenListe = document.createElement('ul');
  kistenListe.className = 'h-liste';
  for (const [was, anteil] of [
    ['keine Kiste', regeln.cratesPerRoundStart.none],
    ['eine Kiste', regeln.cratesPerRoundStart.one],
    ['zwei Kisten', regeln.cratesPerRoundStart.two],
    ['drei Kisten', regeln.cratesPerRoundStart.three],
  ]) {
    kistenListe.append(textEl('li', `${prozent(anteil)} — ${was}`));
  }
  container.append(kistenListe);

  container.append(textEl('h3', 'Inhalt einer Kiste'));
  const inhaltListe = document.createElement('ul');
  inhaltListe.className = 'h-liste';
  for (const [was, anteil] of [
    ['eine Waffe', regeln.contents.weapons],
    ['Nachschub (Heilung)', regeln.contents.sustain],
    ['leer', regeln.contents.empty],
    ['eine Sprengfalle', regeln.contents.trap],
  ]) {
    inhaltListe.append(textEl('li', `${prozent(anteil)} — ${was}`));
  }
  container.append(inhaltListe);

  container.append(textEl('h3', 'Seltenheiten'));
  const seltenListe = document.createElement('ul');
  seltenListe.className = 'h-liste h-seltenheiten';
  /*
   * Fünf Stufen (der Katalog, `powerTier`), Farbe nach der Kistenfarbe (`RARITY_IDS` kennt vier:
   * epic und legendary teilen Gold). Anteil und Magazin stammen aus der Kistenfassung 3.
   */
  const gesamt = Object.values(KISTEN_STUFEN_GEWICHT).reduce((a, b) => a + b, 0);
  STUFEN.forEach((stufe, i) => {
    const li = document.createElement('li');
    const punkt = document.createElement('span');
    punkt.className = 'h-farbe';
    // Farbe aus der Config, nicht im Client gewählt: dieselbe Farbe wie im
    // Spiel, sonst wichen Liste und Waffenanzeige voneinander ab.
    punkt.style.background = regeln.rarityColors[RARITY_IDS[Math.min(i, RARITY_IDS.length - 1)]] ?? '#888';
    const anzahl = WEAPONS.filter(w => w.powerTier === stufe).length;
    const magazin = KISTEN_MUNITION_STUFE[stufe];
    li.append(punkt, textEl('span',
      `${stufe} — ${prozent(KISTEN_STUFEN_GEWICHT[stufe] / gesamt)} der Waffenkisten, ${anzahl} Waffen`
      + `${magazin ? `, in der Kiste höchstens ${magazin} Schuss` : ''}`));
    seltenListe.append(li);
  });
  container.append(seltenListe);

  /*
   * Die zentrale Balance-Aussage des Spiels, die bisher NIRGENDS im Menü stand:
   * Startwaffen sind nur common/uncommon/rare. Episch und legendär gibt es
   * ausschließlich über Loot.
   */
  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p',
    `Startwaffen sind nur ${START_TIERS.join(', ')}. Epische und legendäre Waffen `
    + 'gibt es ausschließlich über Kisten — wer stärker werden will, muss sie finden.'));
  container.append(hinweise);
}

/** Reiter „Karte und Gelände" — die acht Formen mit ihrer Spielweise. */
function zeichneKarte(container) {
  container.append(textEl('p',
    'Die Geländeform bestimmt Höhen, Wasser und Höhlen — und damit, welche '
    + 'Waffen und Klassen nützen. Alle Formen haben dieselbe Fläche, nur die '
    + 'Form ist anders.', 'h-einleitung'));

  const raster = document.createElement('div');
  raster.className = 'h-karten';
  for (const [id, preset] of Object.entries(TERRAIN_PRESETS)) {
    const karte = document.createElement('div');
    karte.className = 'h-karte h-schmal';
    karte.append(textEl('h4', id));
    karte.append(textEl('p', preset.erklaerung, 'h-erklaerung'));
    // Die Kennzahlen als Beschreibung der EIGENSCHAFT, nicht als Spielwert —
    // sie sind Generatorparameter, keine Werte, die der Spieler einstellt.
    karte.append(textEl('p',
      `Höhen ${preset.amplitude} · Rauheit ${preset.roughness} · `
      + `Wasser ${preset.waterLevel}`, 'h-kennzahl'));
    raster.append(karte);
  }
  container.append(raster);
  zeichneZerstoerungsTabelle(container);
  zeichneFeuerRegeln(container);
}

/** Hilfe-Seite „Ton und Musik": Bedienung der Hintergrundmusik. */
function zeichneTon(container) {
  container.append(textEl('p',
    'Die Hintergrundmusik läuft im Menü und im Match und blendet beim Wechsel '
    + 'über. Sie startet erst nach dem ersten Klick oder Tastendruck (Regel der '
    + 'Browser). Bei Einschlägen wird sie kurz leiser, damit die Effekte tragen.', 'h-einleitung'));
  const liste = document.createElement('ul');
  liste.className = 'h-liste';
  for (const zeile of [
    'Taste M: Musik stumm/laut (nicht, solange du in ein Textfeld tippst).',
    'Schalter „Musik an/aus“ und Regler „Musik-Lautstärke“: im Menü und oben im Spiel.',
    'Die Anzeige „Läuft: …“ nennt das aktuelle Stück.',
    'Deine Einstellung bleibt im Browser gespeichert (Vorgabe: an, Lautstärke 35 %).',
    'Mit „?musik=0“ an der Adresse bleibt die Musik ganz aus.',
  ]) liste.append(textEl('li', zeile));
  container.append(liste);
  container.append(textEl('h3', 'Effekte'));
  container.append(textEl('p',
    'Schüsse, Einschläge, Treffer, Landungen und Kisten haben eigene Klänge. Sie sind '
    + 'erzeugt, nicht geladen: Jede Waffenkategorie klingt anders (Knall, Rohrdonner, '
    + 'Zischen, Feuer, Eis, Blitz, Zauber, Laser, Hieb, Wurf), große Explosionen hallen nach. '
    + 'Was weiter links oder rechts im Bild geschieht, klingt auch dort und leiser, wenn es weit weg ist.'));
  const effekte = document.createElement('ul');
  effekte.className = 'h-liste';
  for (const zeile of [
    'Taste T: Effekte an/aus (nicht beim Tippen in ein Textfeld).',
    'Schalter „Effekte an/aus“ und Regler „Effekt-Lautstärke“ stehen im Menü neben der Musik.',
    'Deine Einstellung bleibt im Browser gespeichert (Vorgabe: an, Lautstärke 80 %).',
    'Mit „?ton=0“ an der Adresse bleiben die Effekte stumm, mit „?ton=1“ erzwingst du sie.',
  ]) effekte.append(textEl('li', zeile));
  container.append(effekte);
}

/** Anteil als Prozentzahl mit dem Hinweis auf die Herkunft der Zahl. */
function prozent(anteil) {
  // Aus dem Gewicht BERECHNET, nicht abgetippt: Ändert sich die Verteilung in
  // der Config, wandert die Anzeige mit.
  return `${Math.round(anteil * 100)} %`;
}
