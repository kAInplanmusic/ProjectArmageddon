# Zugang unter www.projectarmageddon.de — Login, Start-Knopf, Spiel

**Entscheidung des Auftraggebers (2026-11-10):** Das Spiel läuft unter **https://www.projectarmageddon.de**,
mit Login davor. Ist der Hetzner-Server aus (gelöscht), antwortet dieselbe Adresse nach dem Login mit einem
Start-Knopf (Start / Status / Not-aus); nach dem Start spielt man unter derselben Adresse. Keine
`spiel.`-Subdomain. Die Hauptdomain/apex (andere App) bleibt unberührt.

**Stand:** Bewertung und Empfehlung (Abschnitt 3). Gebaut und mock-getestet ist der Starter
(`scripts/betrieb/starter/`, Anweisung `docs/starter-installation.md`) und das Hochfahren
(`server-hochfahren.sh`, `PA_DOMAIN`, `PA_WEITERE_ORIGINS`). **Nicht gebaut:** die Dauer-Frontseite, die
den Spieltraffic unter www bedient (Weg C oder D). Nichts davon ist beim DNS-Anbieter oder bei einem
Hoster eingerichtet.

## 1. Was www dauerhaft können muss

Der Hetzner-Server wird gelöscht, wenn niemand spielt. Etwas **Dauerhaftes** muss unter www antworten:
Login, Start-Knopf, und (wenn der Server läuft) das Spiel. Der Spieltraffic ist ein WebSocket (`/ws`)
plus die Lobby-API; der Client lädt seine Dateien vom Server und verbindet sich relativ
(`src/client/konto.js`, `main.js`). Der Client hat bereits ein Feld „Server-Adresse“
(`cfg-server`, `serverUrl`) — er kann also auch gegen einen **anderen** Server als den, der ihn
ausgeliefert hat, spielen. Das Konto-System arbeitet mit Token im Kopf, nicht mit Cookies.

## 2. Die Wege im Vergleich

Preise: Hetzner-API vom 2026-11-10, brutto. Spielserver `cpx22` 0,037128 €/h; Primary IP 0,595 €/Monat;
Abbild 0,017017 €/GB/Monat. Die kleinste verfügbare Hetzner-Maschine in `fsn1`/`nbg1` heute:
**`cax11` (ARM, 2 vCPU, 4 GB, 40 GB) und `cpx02` (x86, 1 vCPU, 1 GB, 20 GB) je 7,1281 €/Monat**,
danach `cpx12` 13,6731 €/Monat.

| | A: Gateway auf „brain“ | B: DNS-Umschaltung per API | C: Mini-Gateway bei Hetzner | D: Gratis-Hoster (Netlify/Vercel/Cloudflare) |
|---|---|---|---|---|
| Idee | brain macht Login + Start + Reverse-Proxy | www zeigt nur auf den Spielserver, solange er lebt | kleiner Dauerserver: Caddy (TLS für www) + Starter + Reverse-Proxy | Hoster hält Login, Start-Funktion und die Client-Dateien; WebSocket geht direkt zum Spielserver |
| Dauerkosten | 0 € zusätzlich | 0 € | **≈ 7,13 € (cax11/cpx02) + 0,595 € IP = 7,72 €/Monat** | **0 €** (Bedingungen/Limits der Gratis-Pläne nicht geprüft) |
| Ohne Portfreigabe im Heimnetz | **nein mit fremdem DNS**: Tailscale Funnel bedient nach meinem Kenntnisstand nur `*.ts.net`-Namen (ein CNAME von www würde am TLS-Zertifikat scheitern, nicht geprüft); Cloudflare Tunnel verlangt, dass die Zone bei Cloudflare liegt (Nameserver-Wechsel der **ganzen** Domain, also auch der anderen App) | ja | ja | ja |
| Spieltraffic über | Heimanschluss (Upload!) und brain | direkt | Hetzner (gleiches Rechenzentrum möglich) | direkt zum Spielserver |
| Hauptrisiko | brain/Heimnetz aus = www tot; Latenz+Upload des Heimanschlusses für jede Partie | **API des DNS-Anbieters („Speed it“) unbekannt**, nichts erfunden; TTL-Verzögerung; bei gelöschtem Server zeigt www ins Leere (kein Start-Knopf) | ein weiterer Server zu pflegen; Login schützt den Traffic nur, wenn der Spielserver nur vom Gateway erreichbar ist | Server-Adresse im Client, Herkunftsprüfung, Versionsabgleich (unten); Spielserver ist unter seiner IP-Adresse offen |
| Geeignet? | **nein** (ohne DNS-Umzug/Portfreigabe nicht erreichbar) | nur als Zusatz | **ja, robusteste Lösung** | **ja, billigste Lösung** |

### D im Detail (Idee des Auftraggebers)

* **DNS bei fremdem Anbieter:** Netlify und Vercel genügen mit **einem CNAME** für `www` (beide nennen den Zielnamen
  im Projekt unter „Domain hinzufügen“; exakter Wert erst dort ablesbar, hier nicht erfunden). Cloudflare Pages würde für
  eine eigene Domain verlangen, dass die **ganze Zone** zu Cloudflare umzieht (Nameserver-Wechsel) — Nachteil: die
  Hauptdomain mit der anderen App ist mitbetroffen; deshalb nicht empfohlen.
* **Client-Dateien auf dem Hoster:** `dist/` (npm run build) ist statisch. Die Server-Adresse muss ohne Eingabe
  stimmen: kleine Änderung im Client (Vorgabewert für `cfg-server` aus einer Konfigurationsdatei `server.json`
  neben `index.html`, die die Start-Funktion beim Hochfahren mit der aktuellen Spieladresse füllt) — **keine**
  Änderung an Engine, Replay oder Protokoll.
* **Herkunftsprüfung:** `server-hochfahren.sh` kann `PA_WEITERE_ORIGINS=https://www.projectarmageddon.de` setzen; der Server
  (`PA_ERLAUBTE_ORIGINS`, SRV-4) nimmt Lobby-API und WebSocket dann von dort an, sein eigener Origin (sslip-Domain) bleibt gültig.
* **Mixed Content:** www ist https, die Verbindung `wss://<IP>.sslip.io/ws` ist TLS (Caddy) — kein Mixed Content.
* **Versionsabgleich:** Der Hoster-Client trägt eine Build-Kennung (`dist/version.json`), der Server liefert seine unter
  `/version.json`. Weichen sie ab, zeigt der Client „Server hat eine andere Version“ statt zu spielen. Nach jedem
  Release muss der Hoster neu veröffentlicht **und** das Abbild des Servers neu erzeugt werden (sonst Abweichung) — das
  ist der Preis gegenüber Weg C, bei dem Server und Client immer zusammen ausgeliefert werden.
* **Server aus:** Die Seite fragt den Status (Start-Funktion); ist kein Server da, zeigt sie den Start-Knopf statt eines
  Verbindungsfehlers.
* **Start-Funktion (serverlos):** Passwort-Login, signiertes Cookie, Rate-Limit, Aktionen hochfahren/status/not-aus gegen
  die Hetzner-API mit `HCLOUD_TOKEN` als **Secret des Hosters**. Die Logik dafür steht im Starter
  (`starter.mjs`) und müsste für den Hoster zustandslos umgeschrieben werden (Sitzung nur als signiertes Cookie,
  kein Arbeitsspeicher; die Skripte `server-hochfahren.sh` laufen dort nicht, die API-Aufrufe wären neu in JavaScript).
  **Nicht gebaut**, weil das ein eigener Auftrag mit einem Hoster-Konto des Auftraggebers ist.
* **Risiko D:** Der Login schützt Start und Seite, **nicht** den Spielserver: Wer `https://49-13-138-200.sslip.io`
  kennt, erreicht ihn direkt. Die Kosten sind trotzdem begrenzt (Idle-Bremse, Höchstlaufzeit, Zeitplan), aber fremde
  Spieler wären möglich. Gegenmittel: Anmeldung des Spiels (Konten) erzwingen — Entscheidung des Auftraggebers
  (PFLICHT-14, Beleg S3).

## 3. Empfehlung

1. **Wenn der Login auch das Spiel schützen soll und es sich lohnt: Weg C** — ≈ 7,72 €/Monat Dauerkosten
   (cax11 + Primary IP), zusammen mit dem Spielserver (z. B. 20 Stunden/Monat × 0,037128 € = 0,74 €) und Abbild
   (Größe siehe Abschnitt 10 in `docs/betrieb-INSTANZ.md`) **deutlich unter 25 €/Monat**. Gateway: Caddy mit TLS für
   www, der Starter für Login/Start, danach `reverse_proxy` zur Spieladresse. Der Spielserver nimmt dann nur Verbindungen
   vom Gateway an (Firewall). Server und Client kommen immer aus **einer** Version.
2. **Wenn 0 € Dauerkosten Vorrang haben: Weg D** mit den genannten Einschränkungen (Spielserver offen, Versionsabgleich).
3. **Nicht A** (ohne DNS-Umzug oder Portfreigabe nicht erreichbar, Spieltraffic über den Heimanschluss).
4. **B** nur, wenn „Speed it“ eine API anbietet — nicht geprüft; dann als Ergänzung.

Die Wahl und die Kosten-/Netzwerkentscheidung trifft der Auftraggeber; nichts davon ist gebaut oder gemietet,
und die 25 €/Monat Gesamtbudget werden mit C nicht überschritten.

## 4. DNS-Einträge (exakte Werte)

| Weg | Eintrag beim DNS-Anbieter | Wert |
|---|---|---|
| **C** | `www.projectarmageddon.de` **A** | die feste Primary-IP **des Gateways** (steht nach dem Anlegen im Bericht/`status`) |
| **E** (Spielserver ohne Gateway, nur zum Test, wenn der Server läuft) | `www.projectarmageddon.de` **A** | **`49.13.138.200`** — die reservierte Primary-IP des Spielservers; bei gelöschtem Server ist www dann **tot** (kein Start-Knopf) |
| **D** | `www.projectarmageddon.de` **CNAME** | der Zielname, den Netlify/Vercel im Projekt anzeigt (nicht erfunden) |
| alle | `projectarmageddon.de` (apex) | **unverändert** lassen |

Zum Spielserver gehört kein DNS-Eintrag: Er läuft unter `https://49-13-138-200.sslip.io` (sslip.io löst den
Namen aus der IP auf, Caddy holt das Zertifikat). Soll der Spielserver selbst unter `www` laufen (Weg E), setzt man beim
Hochfahren `PA_DOMAIN=www.projectarmageddon.de` (Workflow-Variable `PA_DOMAIN`); das setzt voraus, dass der A-Record
**vorher** auf `49.13.138.200` zeigt, sonst scheitert die Zertifikatsausstellung.

## 5. Was noch fehlt

* Entscheidung C oder D (und damit ein Gateway-Server bzw. ein Hoster-Konto).
* Für C: Gateway-Einrichtung (Caddyfile mit `forward_auth` auf den Starter, Firewall), eigener Auftrag.
* Für D: serverlose Start-Funktion, `server.json`, Versionsabgleich im Client, Klickanleitung des Hosters.
* DNS-Eintrag(e) setzt der Auftraggeber selbst; Zugang zu seinem DNS-Anbieter hat dieses Repo nicht.
