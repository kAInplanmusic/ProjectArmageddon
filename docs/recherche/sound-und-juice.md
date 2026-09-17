# Recherche: Sound, Animation & Game Feel für Browser-Artillerie-Spiel

Ziel: privates (nicht-kommerzielles) rundenbasiertes 2D-Artillerie-Spiel, JS/ESM, Canvas 2D, Web Audio geplant, Worms-inspiriert. 150 Waffen, prozedurale Kulissen, Explosionen, Wasser, Wind.

Alle Lizenzen wurden an der Quelle geprüft (Stand: Recherche-Datum). Bei Sounds ist die Lizenz das entscheidende Kriterium.

---

## 1. Prozeduraler Sound mit Web Audio API (der wichtigste Teil)

**Kern-Idee:** Explosion = Burst aus weißem Rauschen, durch Tiefpass gefiltert, mit schnellem exponentiellen Ausklang. Das ist die Standard-Antwort aus der Community und technisch korrekt.

### 1.1 Referenz-Artikel (alle geprüft, frei zugänglich)

| Quelle | Was drin steht | Lizenz/Zugang |
|---|---|---|
| [MDN: Advanced techniques — Creating and sequencing audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques) | **Die beste Einzelquelle.** Oszillator + Wavetable (`PeriodicWave`), Gain-Hüllkurven (`setValueAtTime`/`linearRampToValueAtTime`), Rausch-Buffer-Erzeugung + `BiquadFilterNode`, Scheduling, Schritt-Sequencer. Vollständiger Code. | MDN-Inhalte: CC-BY-SA 2.5 (Doku). Code-Beispiele im Repo [mdn/webaudio-examples](https://github.com/mdn/webaudio-examples): **CC0-1.0** — d.h. Code frei übernehmbar, auch ohne Attribution. |
| [MDN: Web Audio API (Hauptindex)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | Referenz für alle Nodes. | s.o. |
| [sonoport.github.io — Synthesising Sounds with Web Audio](https://sonoport.github.io/synthesising-sounds-webaudio.html) | Vollständige Kick/Snare/Hi-Hat-Synthese mit Code. **Direkt übertragbar auf Explosionen** (Kick = Pitch-Sweep 120Hz→~0 + Gain-Decay; Snare = Rausch-Burst + Highpass + Body-Oszillator). Enthält das klassische Muster: alles in eine `play…()`-Funktion packen, weil Oszillatoren nur einmal start/stop können. | Blog-Artikel, kein explizites Lizenzstatement — als Lehrmaterial nutzen, Code-Muster nachbauen statt 1:1 kopieren. |
| [Chris Lowis: Synthesis with the Web Audio API — Envelopes](https://chrislowis.co.uk/2013/06/17/synthesis-web-audio-api-envelopes) | ADSR-Hüllkurven über `AudioParam` — Fundament für alle Waffensounds. | Artikel, gleiche Vorsicht. |
| [Stack Overflow: How To Make an Explosion Sound with JS + Web Audio](https://stackoverflow.com/questions/62920067/how-to-make-an-explosion-sound-with-javascript-and-web-audio-api-synthesizer) | Kurz und richtig: „Explosions are a sudden burst of low-pass filtered white noise that gradually fades away." | SO-Inhalte: CC-BY-SA 4.0. |
| [Joe Sullivan: Synthesizing Hi-Hats with Web Audio](http://joesul.li/van/synthesizing-hi-hats/) | 6 Square-Oszillatoren mit Frequenzverhältnissen `[2, 3, 4.16, 5.43, 6.79, 8.21]` + Bandpass → metallisches Klirren. **Perfekt für Schrapnell/Trümmer-Sounds.** | Artikel. |
| [noisehack.com: Generate Noise with Web Audio API](http://noisehack.com/generate-noise-web-audio-api/) | Weiß/Braun/Rosa Rauschen — braunes Rauschen klingt für Explosionen „fetter" als weißes. | Artikel. |
| [Sound on Sound: Synth Secrets](http://www.soundonsound.com/sos/allsynthsecrets.htm) | Die theoretische Referenz für Synthese (von Tone.js selbst als Inspiration verlinkt). | Artikel. |
| [reddit r/proceduralgeneration: Procedurally Generated Gunshot Sounds in the Web Audio API](https://www.reddit.com/r/proceduralgeneration/comments/4r1sxq/procedurally_generated_gunshot_sounds_in_the_web/) | Diskussion + Ansatz: weißes Rauschen generieren, dann Transformationen. | Reddit-Thread (Zugriff via Browser; web_extract wird von Reddit blockiert). |
| [reddit r/GameAudio: How do you create gun sounds?](https://www.reddit.com/r/GameAudio/comments/pnc2mg/how_do_you_create_gun_sounds/) | Praxis-Konsens: „Gunshot sounds are mostly just a pop with reverb" — Transiente + tief gefilterter Body + Synth-Layer. | Reddit-Thread. |
| [reddit r/javascript: Synthesizing WWII aircraft engine sounds entirely in Web Audio](https://www.reddit.com/r/javascript/comments/1scuvh8/synthesizing_wwii_aircraft_engine_sounds_entirely/) | Beweis, dass mehrschichtige Echtzeit-Synthese im Browser praxistauglich ist (mehrere akustische Layer). | Reddit-Thread. |

### 1.2 Konkrete Codebausteine

**Rausch-Buffer (Basis für jede Explosion):**
```js
function makeNoiseBuffer(ctx, seconds = 1) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // braunes Rauschen = tiefer, "fetter" -> besser für Explosionen
    d[i] = last = (last + 0.02 * white) / 1.02;
    d[i] *= 3.5;
  }
  return buf; // einmal erzeugen, für alle Explosionen wiederverwenden
}
```

**Explosion prozedural (Lowpass + exponentieller Decay + Pitch-Sweep):**
```js
function explosion(ctx, { gain = 1, size = 1, t = ctx.currentTime } = {}) {
  const noise = ctx.createBufferSource();
  noise.buffer = sharedNoiseBuffer;          // s.o., geteilt

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800 / size, t);
  lp.frequency.exponentialRampToValueAtTime(60, t + 0.45 * size); // Aufräumen nach unten = "Rumms"

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.008);          // harter Attack
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 * size);   // langer Ausklang

  // Sub-Bass "Bauch" der Explosion
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120 / size, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 0.35 * size);
  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.9 * gain, t);
  subEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 * size);

  noise.connect(lp).connect(env).connect(ctx.destination);
  sub.connect(subEnv).connect(ctx.destination);

  noise.start(t); noise.stop(t + 0.6 * size);
  sub.start(t);   sub.stop(t + 0.5 * size);
}
```
`size` variieren (0.6–1.6) und `playbackRate` minimal randomisieren → 150 Waffen klingen nicht gleich.

**Waffe/Schuss (klassisches Rezept):**
```js
function gunshot(ctx, { pitch = 1, t = ctx.currentTime } = {}) {
  // Attack-Transiente (das "Pop")
  const n = ctx.createBufferSource(); n.buffer = sharedNoiseBuffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.8, t);
  e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  n.connect(hp).connect(e).connect(ctx.destination);
  n.start(t); n.stop(t + 0.1);

  // Body/Schlag
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(300 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(60 * pitch, t + 0.06);
  const oe = ctx.createGain();
  oe.gain.setValueAtTime(0.5, t);
  oe.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(oe).connect(ctx.destination);
  o.start(t); o.stop(t + 0.15);
}
```

**„Cartoon"-Pitch (Worms-Ästhetik):** `playbackRate` auf 0.7–1.4 randomisieren, plus leichte Verstimmung → derselbe Sound klingt nie identisch. Für Quatsch-Waffen: `type: 'square'` + schneller Frequenz-Sweep nach oben.

**Performance-Regeln (wichtig bei 150 Waffen + vielen Explosionen):**
- AudioContext **einmal** erzeugen und wiederverwenden (Chrome limitiert auf ~6 Contexts).
- Rausch-Buffer **einmal** bauen, nicht pro Schuss (`Math.random()` über 1 Mio. Samples pro Frame kills den Frame).
- Nodes werden nach `stop()` automatisch freigegeben — kein manuelles Cleanup nötig.
- Autoplay-Policy: `ctx.resume()` erst im ersten User-Interaction-Handler.
- Alles mit `ctx.currentTime` schedulen, nicht mit `setTimeout`.
- Bei sehr vielen gleichzeitigen Sounds: `DynamicsCompressorNode` als Master-Limiter einziehen, sonst clippt es.

### 1.3 Fertige Mini-Synth-Lösung: ZzFX (⭐ Top-Empfehlung)

- **Repo:** https://github.com/KilledByAPixel/ZzFX
- **Lizenz:** **MIT** (Copyright (c) 2019 Frank Force) — verifiziert im [LICENSE-File](https://github.com/KilledByAPixel/ZzFX/blob/master/LICENSE). Voll nutzbar, auch kommerziell.
- **Größe:** `ZzFXMicro.js` ist **~1 KB** (der Kern ist ein einziger minifizierter Ausdruck, sichtbar im README).
- **Was es macht:** Erzeugt beliebige Sounds aus einem Array aus ~20 Zahlen (`[volume, randomness, frequency, attack, sustain, release, shape, …]`). Keine Dateien, keine Downloads.
- **Editor:** https://killedbyapixel.github.io/ZzFX/ — Soundparameter live drehen und den Code-Array herauskopieren.
- **Musik-Variante:** [ZzFXM von Keith Clark](https://github.com/keithclark/ZzFXM) — Mini-Musikgenerator auf ZzFX-Basis. Lizenz prüfen (Repo hat eigene Lizenz).
- **Aufwand:** ~20 Minuten bis zum ersten eigenen Sound. Ideal, um 150 Waffensounds zu parametrisieren (`ZzFX(...)` mit variierten Zahlen).
- **Einschränkung ehrlich gesagt:** ZzFX ist ein *Chiptune/Arcade-Synth*, kein High-Fidelity-Klang. Für einen Worms-Look ist das eher ein Vorteil. Wenn du „echten" Kino-Bombast willst, reicht ZzFX nicht — dann Kombination aus ZzFX (UI/Quatsch) + Web-Audio-Handarbeit (Explosionen) + optional CC0-Samples (Kapitel 2).

---

## 2. Freie Soundquellen MIT geprüften Lizenzen

| Quelle | Lizenz | Attribution | Kommerziell | Aufwand | Ehrliche Einschätzung |
|---|---|---|---|---|---|
| **[Kenney.nl Audio](https://kenney.nl/assets/category:Audio)** — u.a. [Impact Sounds](https://kenney.nl/assets/impact-sounds) (130 Files), [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) (70), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [UI Audio](https://kenney.nl/assets/ui-audio), [RPG Audio](https://kenney.nl/assets/rpg-audio), [Digital Audio](https://kenney.nl/assets/digital-audio), [Voiceover Pack (Fighter)](https://kenney.nl/assets/voiceover-pack-fighter) (45 Voice-Files) | **CC0 1.0** (auf jeder Seite ausgewiesen, verifiziert) | **Nein** | **Ja** | Minuten | **Die sauberste Quelle überhaupt.** CC0 = Public Domain, keine Fußangel möglich. Das Voiceover-Pack ist interessant für Worms-artige Sprüche. Klanglich bewusst „gamey"/einfach — passt zum Stil. |
| **[OpenGameArt — The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)** | **CC0** (verifiziert: „Our team holds CC0 NO RIGHTS RESERVED… may be used without royalty or credit") | Nein (erbeten) | Ja | Download ~194 MB (7z) | Echte, hochwertige Schussaufnahmen (AK47, Pistolen, Gewehre, Schrot). **Lizenzlich perfekt.** Achtung: die Original-Website (freefirearmsfx.com) ist **tot**, Links in den Kommentaren sind teilweise archiviert — Datei direkt von OpenGameArt ziehen. |
| **[OpenGameArt — 2 High Quality Explosions](https://opengameart.org/content/2-high-quality-explosions)** (Michel Baradari) | **CC-BY 3.0** (verifiziert auf der Seite) | **JA** — Name in Credits | Ja | 410 KB | Gute Explosionen. **Lizenzfalle: CC-BY verlangt Namensnennung** — bei privatem Projekt harmlos, aber du brauchst einen Credits-Screen. |
| **[OpenGameArt — 9 explosion sounds](https://opengameart.org/content/9-explosion-sounds)** | **CC-BY-SA 3.0** | JA + **ShareAlike** | Ja | klein | ⚠️ **ShareAlike ist eine Falle**: Abwandlungen müssen unter derselben Lizenz stehen. Für ein Spiel meist unkritisch (Sound bleibt separater Asset), aber unschön. **Besser meiden, es gibt CC0-Alternativen.** |
| **[OpenGameArt — Synthesized explosion](https://opengameart.org/content/synthesized-explosion)** (qubodup) | **CC0** | Nein | Ja | klein | CC0-Alternative zur obigen. |
| **[OpenGameArt — 100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx)**, [75 CC0 breaking/falling/hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx), [100 CC0 metal and wood SFX](https://opengameart.org/content/100-cc0-metal-and-wood-sfx) | **CC0** | Nein | Ja | Minuten | Solide CC0-Packs für Impact, Trümmer, Holz/Metall. Klangqualität schwankt (teils Handy-Aufnahmen). |
| **[Sonniss #GameAudioGDC Bundle](https://sonniss.com/gameaudiogdc/)** (aktuell: [GDC 2026 Bundle](https://gdc.sonniss.com/), 7.47 GB+) | Eigene **„Unlimited User License"**, Version 2.0, gültig ab 27.08.2026 ([Volltext](https://sonniss.com/gdc-bundle-license/)) | **Nein** | **Ja** | Groß (GB-Downloads), aber alle Jahrgänge seit 2015 noch da | **Professionelle Qualität, riesige Auswahl.** Lizenz geprüft: weltweit, nicht-exklusiv, royalty-free, unbegrenzte Projekte, Änderungen erlaubt, kein Attribution nötig. **Einschränkungen (wichtig!):** (a) Dateien dürfen **nicht** als Sounds weitergegeben/verkauft werden (kein Asset-Pack-Vertrieb); (b) **ausdrücklich verboten: Nutzung zum KI-Training**; (c) Nutzung nur „synchronisiert in einem Projekt" — reine Sound-Weitergabe verboten. Für ein privates Browser-Spiel absolut unproblematisch. |
| **[Freesound.org](https://freesound.org/)** | **Pro Sound unterschiedlich** (CC0, CC-BY, CC-BY-NC, Sampling+) | hängt ab | hängt ab | Suchaufwand | **Größte Bibliothek (>700.000 Sounds), aber Lizenz-Roulette.** Immer nach **CC0** filtern. ⚠️ **Fallen:** (1) `CC-BY-NC` verbietet kommerzielle Nutzung — bei privatem Projekt OK, aber wenn später doch YouTube-Monetarisierung o.ä. kommt, ist es vorbei. (2) **Sampling+** verbietet teils die Verwendung in Spielen/Musik. (3) Manche Uploads sind illegal hochgeladenes fremdes Material — das Risiko trägt der Nutzer, nicht Freesound. (4) Es gibt Fälle, wo die Beschreibung „bitte credit" sagt, die Lizenz aber CC0 ist — CC0 gewinnt, Crediting ist dann freiwillig. |
| **[ZapSplat](https://www.zapsplat.com/)** — [Standard License](https://www.zapsplat.com/license-type/standard-license/) | Eigene Lizenz: Basiskonto = kostenlos, unbegrenzt, privat + kommerziell (nur MP3, Downloadlimits) | **JA — „ZapSplat" muss genannt werden** | Ja | Account nötig | Brauchbar, aber **Attribution ist Pflicht** und die Lizenz ist proprietär (kann sich ändern). Für ein „sauberes" Projekt der unattraktivste Kandidat — es gibt CC0-Alternativen ohne Bedingungen. |

### Lizenzfallen — ehrlich zusammengefasst
1. **CC-BY vs. CC0:** CC-BY ist *keine* Freibrief-Lizenz — Namensnennung ist Pflicht. Bei 50 Sounds aus 50 Quellen wird das ein Credits-Albtraum. **Filtere konsequent auf CC0.**
2. **CC-BY-SA (ShareAlike):** kann auf abgeleitete Werke „anstecken". Bei separaten Sound-Assets meist unkritisch, aber unnötiges Risiko — es gibt CC0-Pendants.
3. **CC-BY-NC:** „Non-Commercial". Ein privates Spiel ist OK, aber **jede Monetarisierung** (Werbung, Spenden-Build, YouTube-Video mit Ads) bricht die Lizenz. Wenn irgendwann kommerziell geplant → CC0-only.
4. **Freesound-Sampling+ / proprietäre Lizenzen:** Bedingungen können Nutzung in Spielen einschränken.
5. **Sonniss:** genial für Qualität, aber **Kein-Weitervertrieb** und **KI-Trainingsverbot**. Für eigene Nutzung im Spiel: einwandfrei.
6. **Fertige „Worms-Sounds" aus dem Internet:** Die Original-Samples sind **urheberrechtlich geschützt** (Team17, Komponist/Sound-Designer Bjørn Lynne). Sie für ein privates Spiel zu verwenden ist faktisch nie verfolgt worden, aber **rechtlich nicht sauber** und widerspricht der Aufgabenstellung („soll sauber sein"). Nachbauen der Ästhetik > Klauen der Dateien.

---

## 3. Worms-Sound-Ästhetik — was sie ausmacht

**Fakten (belegt):**
- Musik + Soundeffekte + Voice-Editing/Processing von **Worms (1995)** stammen von **Bjørn Arild Lynne** (Norwegen, Demoscene-Handle „Dr. Awesome", später Team17) — [Wikipedia: Bjørn Lynne](https://en.wikipedia.org/wiki/Bj%C3%B8rn_Lynne). Er war zuvor Tracker-Musiker auf dem Amiga (MOD-Format). Das erklärt den Sound-Charakter.
- Original-Soundtrack (Worms 2 1998, Worms Armageddon 1999) ist offiziell veröffentlicht — [Bandcamp: Worms Armageddon OST](https://drawesome.bandcamp.com/album/worms-armageddon-original-game-soundtrack). **Nicht frei nutzbar.**
- Interview zur Entstehung: [BJØRN LYNNE Interview — The Making of Worms (YouTube)](https://www.youtube.com/watch?v=_tsYGHZVqQM). Seine Website: https://lynnemusic.com/, Shockwave-Sound: https://www.shockwave-sound.com/ (er betreibt heute einen Royalty-Free-Musikdienst — falls du Musik brauchst, ist das eine legale Bezahlquelle).
- Wormsongs-Übersicht: https://worms.fandom.com/wiki/Wormsongs

**Was die Ästhetik tatsächlich ausmacht (Ableitung aus den Techniken):**
1. **Tracker-Erbe:** Kurze, gesampelte Sounds mit hoher Transiente und *Pitch-Variation pro Trigger*. Kein Sample klingt zweimal gleich → das ist der Kern. Mit Web Audio trivial: `playbackRate` randomisieren.
2. **Absurde Kontraste:** Hochkomische, cartooneske Sounds für tödliche Waffen (Bananenbombe, Superschaf, heilige Handgranate). Der Humor entsteht durch die *Diskrepanz* zwischen niedlich und brutal. Für dein Spiel: Waffennamen + Sound-Klarheit müssen die Pointe tragen.
3. **Stimmen mit Processing:** Die Worms sprechen in hoher, verfremdeter Piepsstimme. **Rezept zum Nachbauen mit Web Audio:** aufgenommenes/CC0-Sprachsample nehmen, `playbackRate` auf 1.4–1.8 hochziehen, durch `BiquadFilterNode` (bandpass) + leichten `WaveShaperNode` → fertig ist die Worms-Stimme. Kombinierbar mit [Kenney Voiceover Pack (Fighter)](https://kenney.nl/assets/voiceover-pack-fighter) (CC0!).
4. **Trockene Einzelsounds statt Dauerbett:** Worms hat keine durchgehende Musik in Aktion — es ist *still*, und dann *knallt* ein Sound umso mehr. **Das ist ein Unterschätzter Game-Feel-Trick: Stille macht Impact.** Bei Artillerie: vor dem Schuss kurz Musik/Sound senken, beim Treffer voll rein.
5. **Übertreibung + Verzögerung:** Explosion → kurze Stille → Trümmer prasseln nach → Wurm-Platsch → Kommentar-Spruch. **Sequenz statt Einzel-Ereignis** ist der Worms-Flow.

---

## 4. Juice / Game-Feel-Techniken

### 4.1 Kanonische Quellen (prüfbar)

| Quelle | Inhalt | Zugang |
|---|---|---|
| **[„Juice it or lose it" — Martin Jonasson & Petri Purho (GDC Europe 2012)](https://www.youtube.com/watch?v=Fy0aCDmgnxg)** | **Die Referenz.** 607k Views. Kapitel: Juiciness (0:00), Tweening (5:34), Particles (9:37). Kernsatz: „A juicy game feels alive and responds to everything you do — tons of cascading action and response for minimal user input." | YouTube, frei |
| **[GitHub: grapefrukt/juicy-breakout](https://github.com/grapefrukt/juicy-breakout)** | **Vollständiger Quellcode** des Talks (Haxe/AS3, aber die Techniken sind sprachunabhängig). Enthält u.a. einen **„freezer" — stoppt das Spiel komplett für wichtige Ereignisse** (= Hit-Stop, Commit-Message: „Added freezer to stop game entirely for important events"). | **Zlib-Lizenz** (verifiziert im LICENSE) — extrem permissiv, nutzbar. 684 ⭐ |
| [GDC Vault: Juice It or Lose It (Session)](https://www.gdcvault.com/play/1016487/juice-it-or-lose) | Offizielle Session-Aufzeichnung. | GDC Vault (ggf. Account) |
| [Game Developer: „Video: Indies, resist the urge to 'juice it or lose it'"](https://www.gamedeveloper.com/design/video-indies-resist-the-urge-to-juice-it-or-lose-it-) | **Wichtige Gegenposition:** zu viel Juice zerstört Immersion. | frei |
| [egmatic.com: How to Make Your Game Feel Good](https://egmatic.com/blog/how-to-make-your-game-feel-good) | Konkrete Zahlen: **Hit-Stop 40–80 ms**, Screen-Shake skalieren nach Ereignis, Squash-and-Stretch. Warnung: „Shake and flash on everything → motion sickness." | frei |
| [reddit r/gamedev: Ideas to juice up my game](https://www.reddit.com/r/gamedev/comments/24k7qv/ideas_to_juice_up_my_game/) / [What are your go-to methods for 'juicing'?](https://www.reddit.com/r/gamedev/comments/u75rh/juice_it_or_loose_it_how_to_make_a_game_feel/) | Community-Praxis, viele konkrete Beispiele. | Reddit |
| [GameAnalytics: Squeezing more juice out of your game design](https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design) | „Juice muss die Kernmechanik verstärken" — nicht blind anwenden. | frei |
| [YouTube-Playlist: Fave Game Talks (Juice and Game Feel)](https://www.youtube.com/playlist?list=PL2gEO25pE6dqsPxgajrZSuqutgzZSjnk5) | Sammlung weiterer Talks. | frei |

### 4.2 Hit-Stop — konkrete Zahlen aus der Praxis

Belege: [reddit r/gamedev: How to properly do a freeze-frame / hit-stun](https://www.reddit.com/r/gamedev/comments/5dfdr6/how_to_properly_do_a_freezeframe_hitstun/), [Why does hitstop in my game feel so bad?](https://www.reddit.com/r/gamedev/comments/1uxokz1/why_does_hitstop_in_my_game_feel_so_bad/), [r/IndieDev: The difference hit-freeze makes](https://www.reddit.com/r/IndieDev/comments/c7h1ao/the_difference_hitfreeze_makes/)

- **25–30 ms** = sicherer Startwert für normale Treffer.
- **100 ms** ≈ absolutes Maximum für einen „fetten" Treffer.
- **Kritisch aus dem Thread:** *„if the freeze is the only signal on that frame the brain reads it as lag"* → **Hit-Stop MUSS von einem lauten Sound + Partikel-Burst + Screen-Shake begleitet werden**, sonst wirkt er als Ruckler. Das ist der häufigste Fehler.
- **Implementierung:** nicht `timeScale` global ändern, sondern einen `hitStopTimer`; solange > 0 wird die Physik-/Animations-Update übersprungen, Rendering läuft weiter. Für Artillerie: kurzer Freeze im Moment des Einschlags + Vollbild-Blitz.

### 4.3 Squash & Stretch, Tweening, Easing

- **Squash-and-Stretch:** Beim Landen horizontal stauchen / vertikal strecken, beim Springen umgekehrt. Funktioniert auch auf Nicht-Charakteren: Explosionen kurz „aufblähen", Trümmer stauchen.
- **Easing-Funktionen (frei nutzbare Referenzen):**
  - [Robert Penner's Easing Functions](http://www.robertpenner.com/easing/) (der Klassiker, im Talk verlinkt)
  - [sol.gfxile.net/interpolation](https://sol.gfxile.net/interpolation/) (visuell, direkt im Talk verlinkt)
  - [easings.net](https://easings.net/) — beste interaktive Übersicht
- **12 Principles of Animation** (im Talk als Quelle genannt): Squash/Stretch, Anticipation, Follow-Through, Exaggeration, Timing.
- **Wichtig für Artefakte:** *Anticipation* — vor dem Schuss kurz zurückziehen, dann losschießen. Worms nutzt das ständig.

### 4.4 Screen-Shake (richtig gemacht)

- Amplitude **skaliert mit Ereignisgröße** (Pistole ≠ Rakete) — Beleg: egmatic.com.
- **Abklingkurve statt Konstante:** `shake *= 0.9` pro Frame, dann hart auf 0.
- **Nicht auf alles anwenden** — sonst Motion Sickness (egmatic, GameAnalytics).
- **Rotation-Shake** (kleine Winkeländerung) wirkt deutlich intensiver als reine Translation. Vorsicht: bei Canvas 2D heißt das `ctx.rotate()` um den Canvas-Mittelpunkt.
- Für Artillerie: Kamera folgt dem Projektil (Smooth Follow), beim Einschlag Shake + Zoom-Punch (kurz auf 1.05 skalieren).

### 4.5 Partikel / Canvas-2D-Animation für Explosionen, Rauch, Trümmer, Wasser

**Technik-Empfehlungen (Canvas 2D, ohne Bibliothek):**
1. **Objekt-Pooling statt Allokation.** Bei Explosionen mit 200+ Partikeln pro Frame ist GC der Feind. Partikel-Arrays vorab anlegen und recyceln — hält die Framerate stabil (dein Ziel: „hammer flüssig").
2. **Explosion in Phasen (der Worms-Flow):**
   - Phase 1 (0–80 ms): Weißer Vollbild-Blitz (`globalCompositeOperation = 'lighter'`), 1 Frame.
   - Phase 2 (0–400 ms): Feuerball — Kreise mit `radialGradient`, alpha fadend, Größe exponentiell schrumpfend.
   - Phase 3 (200–1200 ms): Rauch — langsam aufsteigende, wachsende, halbtransparente Kreise, `globalAlpha` niedrig, Farbe Grau→Transparent. **Rauch macht Explosionen erst glaubwürdig.**
   - Phase 4: Trümmer — kleine Polygone/Kreise mit Gravitation + Rotation + Bounce, prasseln nach.
   - Phase 5: Einschlagkrater ins Terrain „backen" (nicht pro Frame neu berechnen).
3. **Wasser:** Zwei bewährte Ansätze:
   - **Heightmap-Wellen** (beste Wahl für Seitenansicht): Array von Höhenwerten, Nachbar-Kopplung mit Dämpfung → Wellen breiten sich physikalisch korrekt aus, kosten fast nichts. Klassiker-Tutorial: [Easy Dynamic 2D Water (reddit r/gamedev)](https://www.reddit.com/r/gamedev/comments/y8l1d/easy_dynamic_2d_water/) — Wellen + Splashes, ideal für Einschläge ins Wasser.
   - **Ripple-Buffer** (Draufsicht): [Water ripple FX with Canvas and JavaScript — Almeros](https://code.almeros.com/water-ripple-canvas-and-javascript/) — zwei 2D-Arrays, Swap pro Frame, basierend auf [Hugo Elias' Water Tutorial (Archiv)](https://web.archive.org/web/20160418004149/http://freespace.virgin.net/hugo.elias/graphics/x_water.htm).
   - Für Einschlag-Splashes: Partikel-Burst mit Aufwärts-Geschwindigkeit + Gravitation, plus kurzzeitig verstärkte Wellenamplitude an der Einschlagstelle.
4. **Performance-Tricks Canvas 2D:**
   - `requestAnimationFrame` mit festem Timestep für Physik, variabler Schritt nur fürs Rendering.
   - Statische Ebenen (Kulisse) auf **OffscreenCanvas** vorrendern, nur die dynamische Ebene pro Frame zeichnen.
   - `ctx.save()`/`restore()` sparsam, `ctx.translate/rotate` statt Neuberechnung von Koordinaten.
   - Kein `shadowBlur` pro Partikel (sehr teuer!) — stattdessen vorgebackene Gradient-Sprites als `drawImage`.
5. **Referenztutorial:** [2D Particle System — nintervik (GitHub Pages)](https://nintervik.github.io/2D-Particle-System/) — Schritt-für-Schritt von Null zu Feuer- und Raucheffekt.

---

## 5. Bibliotheken (alle Lizenzen geprüft)

| Bibliothek | Zweck | Lizenz (verifiziert) | Größe | Bewertung für dein Projekt |
|---|---|---|---|---|
| **[ZzFX](https://github.com/KilledByAPixel/ZzFX)** | Sound-Synthese aus Zahlen-Arrays | **MIT** | ~1 KB (Micro-Version) | ⭐⭐⭐⭐⭐ **Beste Wahl für Waffensounds.** Keine Dateien, kein Lizenzrisiko, passt zur Worms-Ästhetik. |
| **[Howler.js](https://github.com/goldfire/howler.js)** | Audio-Playback (Dateien) | **MIT** ([LICENSE.md](https://github.com/goldfire/howler.js/blob/master/LICENSE.md), Copyright James Simpson / GoldFire Studios) | **7 KB gzip** | ⭐⭐⭐⭐ Wenn du Samples (CC0) nutzt: Audio-Sprites, Format-Fallbacks (WebM/MP3/OGG), 3D-Panning, globales Mute/Volume in einer Zeile. **Nicht für Synthese** (kann es nicht). 25,3k ⭐. |
| **[Tone.js](https://github.com/Tonejs/Tone.js)** | Web-Audio-Synthese + Scheduling + Effektketten | **MIT** ([LICENSE.md](https://github.com/Tonejs/Tone.js/blob/dev/LICENSE.md)) | deutlich größer (Framework) | ⭐⭐⭐⭐ Wenn du **musikalisch** denkst (Noten, BPM, Transport) oder Effektketten brauchst. Für einzelne SFX überdimensioniert (die Vergleichsquelle nennt es „overkill" für SFX). 14,7k ⭐, aktiv (v15.5.42, Sept 2026). |
| **[tsParticles](https://github.com/tsparticles/tsparticles)** | Partikeleffekte (Renderer inkl. Canvas) | **MIT** ([LICENSE](https://github.com/tsparticles/tsparticles/blob/main/LICENSE), Matteo Bruni) | modular, je nach Bundle | ⭐⭐⭐ Für Hintergrund-Effekte gut. **Für präzise Spiel-Partikel (Kollision mit Terrain, Trümmer-Physik) eher ungeeignet** — dafür eigenes Pool-System. 9k ⭐, 83k Dependents, sehr aktiv. |
| **[GSAP](https://gsap.com/)** | Tweening/Animation | **Standard „No Charge" License** ([Volltext](https://gsap.com/community/standard-license/), eff. 30.04.2025) | ~23 KB gzip (core) | ⭐⭐ **Wichtige Einschränkung:** *Nicht* Open Source (kein OSI). Kostenlos für praktisch alles inkl. kommerziell (FAQ: „Can I really use GSAP in commercial projects without paying anything? Yes, really!"), **aber** „Prohibited Uses" = Tools, die visuelles Animations-Bauen ohne Code anbieten (Webflow-Konkurrenz). Ein Spiel ist unproblematisch. **Für Canvas 2D würde ich trotzdem pures Easing nutzen** — GSAP animiert DOM/Objekte, nicht Canvas-Pixel; der Nutzen bei einem Canvas-Spiel ist gering. |
| **[Motion (framer-motion)](https://motion.dev/)** | DOM/JS-Animation | **MIT** | — | Alternative zu GSAP, MIT-lizenziert, aber ebenfalls DOM-orientiert. |
| **[MDN webaudio-examples](https://github.com/mdn/webaudio-examples)** | Lerncode | **CC0-1.0** | — | ⭐⭐⭐⭐ Kopiervorlagen ohne jede Lizenzsorge. |

> Hinweis: Vor Version 2025 war GSAP für manche Plugins Club-Mitgliedschaft-pflichtig — seit der Übernahme durch Webflow sind **alle** Plugins (SplitText, MorphSVG) kostenlos. Bei älteren Tutorials kann diese Info veraltet sein.

---

## 6. Konkrete Empfehlungen mit Aufwand

### Phase 1 — Prozeduraler Sound (½ Tag, kein Download, keine Lizenzfragen)
1. Rausch-Buffer + `explosion()` + `gunshot()` wie in §1.2 implementieren (~80 Zeilen). Das deckt sofort alle Explosionen und Standardschüsse ab.
2. **ZzFX** einbinden (1 KB, MIT), Editor nutzen, um 10–20 „Signature-Sounds" zu finden (Bounce, Whistle, Splash, Quatsch-Waffen, UI). Über `playbackRate`/Parameter pro Trigger randomisieren.
3. **Voice-Processing-Kette** für Sprüche: `playbackRate 1.5` + Bandpass + WaveShaper. Quelle: [Kenney Voiceover Pack (Fighter), CC0](https://kenney.nl/assets/voiceover-pack-fighter).
4. Master-Kette: `GainNode` → `DynamicsCompressorNode` → Destination. Verhindert Clipping bei Salven.

### Phase 2 — Juice (1 Tag, größter Effekt pro Aufwand)
In dieser Reihenfolge umsetzen — jede Stufe einzeln testen:
1. **Hit-Stop** (25–30 ms Normal, 60–100 ms fett) — **aber nur zusammen mit lautem Sound + Partikel-Burst**, sonst wirkt es als Lag.
2. **Screen-Shake** skaliert + mit Abklingfaktor ≤ 0.9/Frame, plus kurzer Zoom-Punch.
3. **Vollbild-Blitz** bei Einschlag (1 Frame, `globalCompositeOperation='lighter'`).
4. **Easing überall** — nichts in diesem Spiel darf linear sein. `easings.net` als Referenz.
5. **Anticipation** vor dem Schuss (Waffe zieht kurz zurück).
6. **Kamera-Follow** mit Trägheit für das Projektil.

### Phase 3 — Partikel & Wasser (1–2 Tage)
1. **Partikel-Pool** von Anfang an (nicht nachrüsten — Performance).
2. Explosion in 5 Phasen (§4.5.2) — Rauch ist der wichtigste, am häufigsten unterschätzte Teil.
3. **Wasser-Heightmap** mit Nachbar-Kopplung; Einschlag → Wellenimpuls + Splash-Partikel (Tutorial: r/gamedev „Easy Dynamic 2D Water").
4. Statische Kulissen auf OffscreenCanvas vorrendern → „hammer flüssig".

### Phase 4 — Optional: Samples für Extra-Qualität
Falls prozeduraler Sound nicht reicht:
- **Primär:** [Kenney](https://kenney.nl/assets/category:Audio) + [OpenGameArt CC0](https://opengameart.org/content/cc0-sound-effects) — CC0, null Risiko.
- **Für Kino-Qualität:** [Sonniss GDC Bundle](https://gdc.sonniss.com/) (Lizenz geprüft, Nutzung im Spiel erlaubt, kein Weitervertrieb, kein KI-Training).
- **Meiden:** CC-BY-SA-Packs, Freesound-Nicht-CC0, ZapSplat (Attribution-Pflicht).
- **Nie:** Original-Worms-Samples.

### Aufwand-Übersicht

| Maßnahme | Aufwand | Wirkung | Lizenzrisiko |
|---|---|---|---|
| Prozeduraler Explosions-/Schusssound (§1.2) | 2–4 h | Sehr hoch | **Keines** (Null) |
| ZzFX einbinden | 1 h | Hoch | Keines (MIT) |
| Hit-Stop + Shake + Flash | 3–4 h | **Sehr hoch** | Keines |
| Easing/Anticipation | 2–4 h | Hoch | Keines |
| Partikel-Pool + 5-Phasen-Explosion | 1 Tag | Sehr hoch | Keines |
| Wasser-Heightmap | 4–6 h | Hoch (Atmosphäre) | Keines |
| Sonniss-Bundle sichten | 2 h + Download | Mittel-Hoch, aber Download-Größe | Gering (Lizenz geprüft) |
| Kenney-CC0-Packs | 1 h | Mittel | **Keines** |

**Fazit:** Für dieses Spiel ist die prozedurale Web-Audio-Route (ZzFX + eigenes `explosion()`/`gunshot()`) klar die beste Wahl: **keine Downloads, keine Lizenzfragen, kleinster Code, passt perfekt zur Worms-Ästhetik** — und die Randomisierung pro Trigger ist genau der Mechanismus, der den Worms-Sound ausmacht. Samples nur als Ergänzung, dann ausschließlich CC0.
