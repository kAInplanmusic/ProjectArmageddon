# Sicherheit vor öffentlicher Erreichbarkeit (REL-2, DEP-3)

**Stand 2026-11-09. Das ist eine Anforderungs- und Prüfliste, kein Betrieb.**
Es ist keine Instanz gemietet, es läuft kein Proxy, es gibt keine echten
Zertifikate und keine Geheimnisse in diesem Repo (AGENTS.md §5). Geprüft sind
die Vorlagen und der Servercode; die Schritte am Knoten sind
**Betreiberaktionen** und bleiben offen, bis ihre Ausgabe in
`docs/betrieb-INSTANZ.md` steht.

Reihenfolge ist bindend (REL-2, DEP-3): **erst Firewall, dann TLS, dann die
Anmeldeentscheidung, dann öffentlich.** Wer 443 öffnet, bevor die Firewall
steht, hat einen offenen Port ohne zweite Schicht.

| # | Schritt | Im Repo vorbereitet | Lokal geprüft | Offen am Knoten |
|---|---|---|---|---|
| 1 | Firewall | `deploy/firewall.nft` | `tests/betrieb-absicherung.test.js` (Regeln + nft-Syntax) | einspielen, `nft list ruleset`, Gegenprobe Port 3000 |
| 2 | TLS-Reverse-Proxy | `deploy/Caddyfile.beispiel` | `tests/betrieb-absicherung.test.js` (Header, Upstream, `/ws`, `/healthz`) | Domain/DNS, `caddy validate`, Zertifikat, `wss://` |
| 3 | Anmeldung | Konten im Server (`src/server/konto.js`); Zugangssperre als Betreiberentscheidung | `tests/konto-http.test.js`, `tests/proxy-adresse.test.js` | Entscheidung + ggf. `basic_auth` |
| 4 | Ratenbegrenzung | `src/server/gameServer.js`, `src/server/rateLimit.js`, `src/server/clientAdresse.js` | `tests/server-haertung-audit.test.js`, `tests/proxy-adresse.test.js`, `tests/betrieb-absicherung.test.js` | Grenzen bestätigen, Proxy-Vertrauen setzen, 429/503 gegenprüfen |

---

## 1. Firewall

**Anforderung.** Von außen erreichbar sind nur `22/tcp` (SSH, gebremst),
`80/tcp` (nur ACME-Prüfung/Umleitung) und `443/tcp` (TLS-Proxy). Der Spielport
`3000/tcp` ist **zu**; der Server lauscht auf `127.0.0.1` (`HOST=127.0.0.1`),
die Firewall ist die zweite Schicht, falls jemand `HOST` ändert.

**Vorlage.** `deploy/firewall.nft` (nftables): eingehend `policy drop`, Loopback
offen, `established,related` erlaubt, ICMP, SSH mit `limit rate 6/minute burst 4
packets`, Ports `{ 80, 443 }`, alles andere verworfen und gezählt. Ausgehend
erlaubt. Keine Adressen, keine Geheimnisse.

**Lokal prüfen:**

```bash
nft -c -f deploy/firewall.nft        # Syntax; ohne Rechte ggf. unshare -rn davor
PA_ZUGPAUSE_SEKUNDEN=0 node --test tests/betrieb-absicherung.test.js
```

**Am Knoten (Betreiber):**

```bash
sudo nft -c -f deploy/firewall.nft
sudo install -m 600 deploy/firewall.nft /etc/nftables.conf
sudo systemctl enable --now nftables
sudo nft list ruleset                                  # Ausgabe → INSTANZ §3a
# Gegenprobe von AUSSEN (nicht vom Knoten selbst):
nc -zv <knoten-ip> 3000                                # erwartet: refused / timeout
nc -zv <knoten-ip> 443                                 # erwartet: offen
```

**Achtung.** `flush ruleset` entfernt auch Docker-Regeln. Auf einem Knoten mit
`deploy/compose.yaml` vorher `nft list ruleset` lesen und die Docker-Ketten
übernehmen. Hat der Anbieter eine Cloud-Firewall, dort dieselben drei Ports
setzen — sie wirkt auch, wenn nftables aus ist.

**Nachweis:** `nft list ruleset` und die Gegenprobe in
`docs/betrieb-INSTANZ.md`, Abschnitt 3a. Eine Datei im Repo ist kein laufender
Dienst.

---

## 2. TLS (Reverse-Proxy)

**Anforderung.** Öffentlich ist ausschließlich `https://<DOMAIN>`; Caddy
terminiert TLS auf 443 und reicht Oberfläche, `/api` und `/ws` an
`127.0.0.1:3000` durch. Kein Spielverkehr über `http://`, kein offener
Node-Port.

**Vorlage.** `deploy/Caddyfile.beispiel`:

- Site-Adresse `{$PA_DOMAIN}`, ACME-Kontakt `{$PA_ACME_EMAIL}` — beides
  Platzhalter, vom Betreiber gesetzt, nie im Repo;
- TLS über Let's Encrypt (Caddy holt und erneuert selbst; **keine**
  Zertifikatsdateien im Repo, kein `tls internal`);
- ein Upstream: `reverse_proxy 127.0.0.1:3000` mit `stream_close_delay 5m`
  (WebSocket-Upgrades reicht Caddy ohne Zusatz durch, lange Partien werden
  nicht gekappt);
- HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy,
  Permissions-Policy, COOP, `-Server`;
- CSP **nur als Report-Only** (`connect-src 'self' wss://{$PA_DOMAIN}`,
  `frame-ancestors 'none'`) — scharf erst nach einer Probe ohne Verstöße;
- `/healthz` außen `404`; API-Körper ≤ 16 KB; Kompression nur für Text;
  `/assets/*` lange Cache-Zeit, `/` und `/version.json` `no-cache`;
- Admin-Endpunkt `localhost:2019`.

**Lokal prüfen:**

```bash
PA_ZUGPAUSE_SEKUNDEN=0 node --test tests/betrieb-absicherung.test.js
```

(`caddy validate` läuft lokal nicht — Caddy ist nicht installiert. Die Prüfung
ist statisch: Direktiven, Header, Upstream, Klammern. Das ist ausdrücklich
**kein** Ersatz für `caddy validate` am Knoten.)

**Am Knoten (Betreiber):**

```bash
# Voraussetzung: DNS A/AAAA von <DOMAIN> zeigt auf den Knoten, 80+443 offen.
sudo install -m 644 deploy/Caddyfile.beispiel /etc/caddy/Caddyfile
sudo systemctl edit caddy       # Environment=PA_DOMAIN=<DOMAIN> PA_ACME_EMAIL=<kontakt>
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

curl -sSI https://<DOMAIN>/ | grep -iE 'HTTP/|strict-transport|x-content-type|x-frame'
curl -sS -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/healthz   # 404
node scripts/release/smoke.mjs --url https://<DOMAIN> --aussen --version <v> --gitsha <sha>
```

Passend in `/etc/projectarmageddon/betrieb.env`:

```
PA_ERLAUBTE_ORIGINS=https://<DOMAIN>
PA_EIGENER_ORIGIN=https://<DOMAIN>
PA_VERTRAUTE_PROXYS=127.0.0.1,::1
```

Ohne die ersten beiden nimmt der Server Lobby-API und WebSocket von jedem
Origin an (SRV-4). Ohne `PA_VERTRAUTE_PROXYS` zählt das Lobby-Limit alle
Spieler als `127.0.0.1` — dann ist es ein gemeinsames Limit für den ganzen
Server.

**Nachweis:** `curl`-Kopfzeilen, `wss`-Handshake aus `smoke.mjs --aussen`,
Zertifikatslaufzeit in `docs/betrieb-INSTANZ.md`, Abschnitt 3a.

---

## 3. Anmeldung (Zugang)

**Ist-Zustand (ehrlich).** Konten sind gebaut: Registrierung, Anmeldung,
scrypt (`N=16384, r=8, p=1`, 16-Byte-Salz, `timingSafeEqual`), Sitzungstoken,
Löschen, Rangliste. Sie sind **freiwillig**: Wer die Seite erreicht, kann ohne
Konto eine Lobby anlegen, beitreten und spielen. Es gibt also **keine
Zugangssperre**. Das ist eine Produktentscheidung, keine Lücke, die der Code
allein schließen darf (die Oberfläche kennt keinen Zwangs-Login).

**Drei zulässige Wege — einer muss vor 443 entschieden und dokumentiert sein:**

1. **Bewusst offen** mit den Grenzen aus Abschnitt 4. Dann in
   `docs/betrieb-INSTANZ.md` festhalten: „öffentlich ohne Konten, Limits
   aktiv, Beobachtung über Logs". Nur vertretbar, solange die Last klein ist.
2. **Geschlossene Testgruppe** per HTTP-Basic-Auth im Proxy. Das ist die
   kürzeste Sperre ohne Client-Änderung:

   ```caddyfile
   {$PA_DOMAIN} {
       basic_auth {
           testgruppe <HASH aus `caddy hash-password`>
       }
       # … restliche Direktiven wie in deploy/Caddyfile.beispiel
   }
   ```

   Der Hash wird auf dem Knoten erzeugt (`caddy hash-password --plaintext …`)
   und **nie** eingecheckt. Achtung: Basic-Auth gilt auch für `/ws`, der
   Browser fragt einmal und verwendet die Zugangsdaten weiter.
3. **Kontenpflicht** — braucht einen eigenen Auftrag: Serverprüfung beim
   Anlegen/Beitreten, Clientführung, Datenschutz. Im Code heute **nicht**
   vorhanden.

**Rate-Limits der Konten** (schon vorhanden, `src/server/konto.js`): 10
Anmeldeversuche je Name und 40 je IP in 15 Minuten, 20 Registrierungen je IP in
15 Minuten. Seit 2026-11-09 zählt die IP hinter einem **vertrauten** Proxy den
letzten `X-Forwarded-For`-Eintrag (`clientAdresse`, wie beim Lobby-Limit) —
vorher traf die IP-Bremse hinter Caddy alle Spieler gemeinsam. Test:
`tests/betrieb-absicherung.test.js`.

**Nachweis:** Entscheidung + gewählter Weg in `docs/betrieb-INSTANZ.md`
(Abschnitt 1/3a), bei Basic-Auth zusätzlich `curl -sI https://<DOMAIN>/` →
`401` ohne Zugangsdaten.

---

## 4. Ratenbegrenzung

**Anforderung.** Anlegen von Lobbys, Nachrichten je Verbindung und
Kontozugriffe sind begrenzt; die Grenzen greifen auch hinter dem Proxy je
Absender.

| Grenze | Standard | Wirkung | Ort |
|---|---|---|---|
| `PA_LOBBYS_PRO_MINUTE` | 30 | neue Lobbys je Adresse und Minute, darüber **429** | `gameServer.js#createErlaubt` |
| `PA_MAX_LOBBYS` | 500 | gleichzeitige Lobbys, darüber **503** | `gameServer.js` |
| `PA_LOBBY_LEER_MS` | 900000 | Lobby ohne Verbindung wird samt Sitzung entfernt | `gameServer.js#pruneLobbies` |
| Nachrichten je Verbindung | 30/s, Stoß 60 | darüber verworfen, Trennung bei Überhang 600 | `rateLimit.js` |
| WebSocket-Nachricht | 64 KiB | darüber Trennung (`maxPayload`) | `gameServer.js` |
| Steuernachricht | 512 Byte | darüber 400/Ablehnung | `src/shared/validation.js` |
| HTTP-Lobby-Körper | 8 KiB (Server), 16 KB (Caddy) | darüber 400 | `gameServer.js`, `Caddyfile.beispiel` |
| Konten | 10/Name, 40/IP, 20 Registrierungen/IP je 15 min | darüber 429 | `konto.js` |

**Was ein 429/503 NICHT tut:** eine Lobby anlegen. Das ist durch Tests
festgehalten (`tests/betrieb-absicherung.test.js`,
`tests/server-haertung-audit.test.js`). Der Anlege-Verlauf ist auf 5000
Adressen begrenzt und verschenkt beim Aufräumen kein Kontingent
(`#createVerlaufBeschneiden`, Audit 2026-10-29).

**Betreiberaufgaben:**

- `PA_VERTRAUTE_PROXYS=127.0.0.1,::1` setzen (sonst ein gemeinsames Limit für
  alle). Bei Compose die Docker-Brücke eintragen (`docs/deploy-plan.md` §11).
- `PA_LOBBYS_PRO_MINUTE` und `PA_MAX_LOBBYS` bestätigen oder bewusst ändern.
- Gegenprobe von außen: mehr als 30 Lobbys in einer Minute erzeugen →
  irgendwann **429**; mehr als `PA_MAX_LOBBYS` offen halten → **503**.
- **Nicht begrenzt:** gleichzeitige WebSocket-Verbindungen je IP. Gegenmittel
  ist eine Proxy-/Firewall-Regel (nftables `ct count` je Quelladresse,
  Cloud-WAF oder Caddy-Modul) — am Knoten messen und einstellen, nicht raten.
  Solange das fehlt, ist die Verbindungsflut ein offener Punkt, kein
  behaupteter Schutz.

---

## 5. Betreiber-Checkliste (Auszug aus `docs/deploy-plan.md` §14)

- [ ] Firewall aktiv, `nft list ruleset` dokumentiert, Port 3000 von außen zu
- [ ] Cloud-Firewall (falls vorhanden) mit 22/80/443
- [ ] DNS zeigt auf den Knoten; 80/443 erreichbar
- [ ] `caddy validate` grün, Zertifikat gültig, HSTS/nosniff im Kopf
- [ ] `/healthz` von außen 404, `wss://…/ws` verbindet (`smoke.mjs --aussen`)
- [ ] `PA_ERLAUBTE_ORIGINS`, `PA_EIGENER_ORIGIN`, `PA_VERTRAUTE_PROXYS` gesetzt
- [ ] Anmeldeentscheidung getroffen und begründet (offen / Basic-Auth / Kontenpflicht)
- [ ] 429/503-Gegenprobe gemacht
- [ ] `systemctl list-timers projectarmageddon-idle.timer` + Marker-Nachweis
      in `docs/betrieb-INSTANZ.md` §3 (DEP-4, AGENTS.md §5)

## 6. Was hier geprüft ist — und was nicht

**Lokal geprüft (Code/Tests):** Regeln und Syntax der Firewall-Vorlage,
Direktiven und Header der Caddy-Vorlage, Anlege-Limit je Adresse und
Gesamtdeckel, 429 ohne Lobby, Proxy-Adresse für Lobby- und Konto-Bremse,
systemd-Vorlagen (`tests/systemd-vorlagen.test.js`).

**Nicht geprüft (nur am Knoten möglich):** `nftables` wirklich geladen,
`caddy validate` und Let's Encrypt, DNS, Firewall des Anbieters, echte
`wss`-Verbindung, Anschluss der systemd-Units (Benutzer, Rechte, Pfade).
Was nicht geprüft ist, wird hier nicht als erledigt geführt.
